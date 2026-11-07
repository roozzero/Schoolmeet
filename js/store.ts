import { ActivityLogItem, DatabaseState } from './types';
import { formatPersianDateTime } from './validation';

const SESSION_STUDENT_ID_KEY = 'scoolmeet_active_student_id_v1';
const SESSION_ROLE_KEY = 'scoolmeet_active_role_v1';

/**
 * Configure API Base URL from Vite `.env` (`VITE_API_BASE_URL=/api`).
 */
const rawEnvBase = (
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || '/api'
).trim();
export const API_BASE_URL = rawEnvBase.replace(/\/+$/, '') || '/api';

let memoryDbCache: DatabaseState | null = null;
let serverTimeOffsetMs = 0;
const syncListeners: Array<(state: DatabaseState) => void> = [];

/**
 * Return authoritative current timestamp in milliseconds (synchronized with backend server clock)
 */
export function getAuthoritativeNowMs(): number {
  return Date.now() + serverTimeOffsetMs;
}

/**
 * Subscribe to backend MySQL state synchronization events
 */
export function onDbStateSynced(listener: (state: DatabaseState) => void): void {
  syncListeners.push(listener);
}

/**
 * Get or set the currently logged-in user role ('admin' | 'student' | '')
 */
export function getActiveUserRole(): 'admin' | 'student' | '' {
  try {
    const val = sessionStorage.getItem(SESSION_ROLE_KEY) || '';
    if (val === 'admin' || val === 'student') return val;
    return '';
  } catch {
    return '';
  }
}

export function setActiveUserRole(role: 'admin' | 'student' | ''): void {
  try {
    if (!role) {
      sessionStorage.removeItem(SESSION_ROLE_KEY);
    } else {
      sessionStorage.setItem(SESSION_ROLE_KEY, role);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getActiveStudentSessionId(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_STUDENT_ID_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setActiveStudentSessionId(studentId: number): void {
  try {
    if (!studentId) {
      sessionStorage.removeItem(SESSION_STUDENT_ID_KEY);
    } else {
      sessionStorage.setItem(SESSION_STUDENT_ID_KEY, String(studentId));
    }
    if (memoryDbCache) {
      memoryDbCache.activeStudentId = studentId;
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Empty structural state before MySQL backend responds.
 * Does NOT contain any demo students, demo classes, or hardcoded admin credentials.
 */
function createEmptyState(): DatabaseState {
  return {
    admin: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      roleTitle: '',
      bio: '',
      password: '',
      avatarUrl: '',
    },
    activeStudentId: getActiveStudentSessionId(),
    classes: [],
    students: [],
    gradebookSessions: [],
    gradebookEntries: [],
    assignments: [],
    submissions: [],
    resources: [],
    announcements: [],
    tickets: [],
    activities: [],
    settings: {
      platformName: 'پلتفرم آموزشی اسکول میت',
      academicYear: '۱۴۰۵–۱۴۰۶',
      allowNewRegistrations: true,
      requireAdminApproval: true,
      maxUploadSizeMb: 15,
      supportPhone: '',
    },
  };
}

function buildStateHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const role = getActiveUserRole();
  const studentId = getActiveStudentSessionId();
  if (role) {
    headers['X-User-Role'] = role;
  }
  if (studentId > 0) {
    headers['X-Student-Id'] = String(studentId);
  }
  return headers;
}

/**
 * Synchronize application state from the Node.js + MySQL backend (`GET /api/state`)
 */
export async function syncStateFromBackend(): Promise<DatabaseState> {
  try {
    const response = await fetch(`${API_BASE_URL}/state`, {
      method: 'GET',
      headers: buildStateHeaders(),
    });

    if (response.status === 403 || response.status === 401) {
      // Student is pending approval, rejected, or unauthorized
      if (getActiveUserRole() === 'student') {
        setActiveUserRole('');
        setActiveStudentSessionId(0);
      }
      return loadDbState();
    }

    if (!response.ok) {
      return loadDbState();
    }

    const data = await response.json();
    if (typeof data?.serverNowMs === 'number') {
      serverTimeOffsetMs = data.serverNowMs - Date.now();
    }

    if (data?.success && data?.state) {
      const currentActiveStudentId =
        getActiveStudentSessionId() ||
        memoryDbCache?.activeStudentId ||
        data.state.activeStudentId ||
        0;

      const merged: DatabaseState = {
        ...createEmptyState(),
        ...data.state,
        activeStudentId: currentActiveStudentId,
      };
      memoryDbCache = merged;
      syncListeners.forEach((cb) => cb(merged));
      return merged;
    }
  } catch {
    // Fallback to in-memory state if backend is unreachable
  }
  return loadDbState();
}

/**
 * Load current state from memory (populated from MySQL via `syncStateFromBackend`).
 * Never uses `localStorage` as a substitute for MySQL persistence.
 */
export function loadDbState(): DatabaseState {
  if (!memoryDbCache) {
    memoryDbCache = createEmptyState();
  }
  const sessionStId = getActiveStudentSessionId();
  if (sessionStId > 0) {
    memoryDbCache.activeStudentId = sessionStId;
  }
  return memoryDbCache;
}

/**
 * Save state to memory and persist to the Node.js + MySQL backend (`POST /api/state`).
 * Returns a promise that resolves after the MySQL write completes and re-syncs state from MySQL.
 */
export async function persistDbState(state: DatabaseState): Promise<{
  success: boolean;
  message: string;
}> {
  memoryDbCache = state;
  if (state.activeStudentId) {
    setActiveStudentSessionId(state.activeStudentId);
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildStateHeaders(),
    };
    const response = await fetch(`${API_BASE_URL}/state`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ state }),
    });
    const data = await response.json();
    if (!response.ok || !data?.success) {
      return {
        success: false,
        message: data?.message || 'خطا در ذخیره‌سازی تغییرات در پایگاه داده MySQL.',
      };
    }
    await syncStateFromBackend();
    return {
      success: true,
      message: data.message || 'تغییرات با موفقیت در پایگاه داده ذخیره گردید.',
    };
  } catch {
    return {
      success: false,
      message: 'خطا در برقراری ارتباط با سرور Node.js جهت ذخیره‌سازی در MySQL.',
    };
  }
}

export function saveDbState(state: DatabaseState): void {
  void persistDbState(state);
}

/**
 * Re-fetch clean state from MySQL backend (never seeds demo data)
 */
export function resetDbState(): DatabaseState {
  const empty = createEmptyState();
  memoryDbCache = empty;
  void syncStateFromBackend();
  return empty;
}

/**
 * Upload a file to `/api/upload` using XMLHttpRequest to support real-time upload progress (0% to 100%)
 * and files larger than 1 MB.
 */
export function uploadFileWithProgress(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{
  success: boolean;
  fileName?: string;
  fileUrl?: string;
  fileSize?: string;
  message?: string;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve({
        success: false,
        message: 'خطا در خواندن فایل انتخاب‌شده از سیستم شما.',
      });
    };
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/upload`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && response.success) {
            if (onProgress) onProgress(100);
            resolve({
              success: true,
              fileName: response.fileName || file.name,
              fileUrl: response.fileUrl,
              fileSize: response.fileSize,
              message: response.message,
            });
          } else {
            resolve({
              success: false,
              message: response.message || 'خطا در آپلود فایل در سرور.',
            });
          }
        } catch {
          resolve({
            success: false,
            message: 'پاسخ سرور هنگام آپلود فایل معتبر نبود.',
          });
        }
      };

      xhr.onerror = () => {
        resolve({
          success: false,
          message: 'خطای شبکه هنگام ارسال فایل به سرور.',
        });
      };

      xhr.send(
        JSON.stringify({
          fileName: file.name,
          dataUrl,
        })
      );
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Append a new activity log entry and optionally persist immediately
 */
export function logAdminActivity(
  state: DatabaseState,
  title: string,
  detail: string,
  category: ActivityLogItem['category'],
  skipSave = false
): void {
  state.activities.unshift({
    id: Date.now(),
    title,
    detail,
    timeAgo: formatPersianDateTime(new Date()),
    category,
  });
  if (state.activities.length > 35) {
    state.activities = state.activities.slice(0, 35);
  }
  if (!skipSave) {
    saveDbState(state);
  }
}
