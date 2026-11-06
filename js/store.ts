import { DatabaseState, StudentRecord } from './types';

export const DB_STORAGE_KEY = 'scoolmeet_mysql_clean_state_v8';

/**
 * Clean Initial State (No Demo Students, No Demo Records, No Hardcoded Passwords)
 * Actual records are loaded and synchronized with MySQL (`scoolmeet_db`).
 */
const INITIAL_DB_STATE: DatabaseState = {
  admin: {
    firstName: 'مدیر',
    lastName: 'سامانه',
    phone: '',
    email: '',
    roleTitle: 'مدیر و مدرس ارشد',
    bio: '',
    password: '',
    avatarUrl: '',
  },
  activeStudentId: 0,
  classes: [
    {
      code: '901',
      title: 'کلاس ۹۰۱',
      gradeLevel: '',
      instructorName: '',
      capacity: 30,
      roomOrLink: '',
      scheduleSummary: '',
      description: '',
    },
    {
      code: '902',
      title: 'کلاس ۹۰۲',
      gradeLevel: '',
      instructorName: '',
      capacity: 30,
      roomOrLink: '',
      scheduleSummary: '',
      description: '',
    },
    {
      code: '903',
      title: 'کلاس ۹۰۳',
      gradeLevel: '',
      instructorName: '',
      capacity: 30,
      roomOrLink: '',
      scheduleSummary: '',
      description: '',
    },
  ],
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
    platformName: 'اسکول میت | ScoolMeet',
    academicYear: '۱۴۰۵-۱۴۰۶',
    allowNewRegistrations: true,
    requireAdminApproval: true,
    maxUploadSizeMb: 25,
    supportPhone: '',
  },
};

export const API_BASE_URL: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

let backendSyncInitialized = false;
let memoryState: DatabaseState | null = null;
const stateListeners: Array<() => void> = [];

const ACTIVE_STUDENT_KEY = 'scoolmeet_active_student_id';
const ACTIVE_ROLE_KEY = 'scoolmeet_active_user_role';
let serverClockOffsetMs = 0;

export function getAuthoritativeNowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export function setActiveUserRole(role: 'admin' | 'student' | ''): void {
  if (typeof window === 'undefined') return;
  try {
    if (role) {
      window.sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
    } else {
      window.sessionStorage.removeItem(ACTIVE_ROLE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export function getActiveUserRole(): 'admin' | 'student' | '' {
  if (typeof window === 'undefined') return '';
  try {
    const val = window.sessionStorage.getItem(ACTIVE_ROLE_KEY);
    if (val === 'admin' || val === 'student') return val;
  } catch {
    // Ignore
  }
  if (typeof document !== 'undefined') {
    if (
      !document
        .getElementById('student-workspace-view')
        ?.classList.contains('view-hidden')
    ) {
      return 'student';
    }
    if (
      !document
        .getElementById('admin-workspace-view')
        ?.classList.contains('view-hidden')
    ) {
      return 'admin';
    }
  }
  return '';
}

export function setActiveStudentSessionId(studentId: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (studentId > 0) {
      window.localStorage.setItem(ACTIVE_STUDENT_KEY, String(studentId));
    } else {
      window.localStorage.removeItem(ACTIVE_STUDENT_KEY);
    }
  } catch {
    // Ignore
  }
}

export function getActiveStudentSessionId(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.localStorage.getItem(ACTIVE_STUDENT_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Subscribe to backend state synchronization events so active Admin/Student views
 * automatically re-render as soon as MySQL state arrives without needing page reloads.
 */
export function onDbStateSynced(listener: () => void): void {
  stateListeners.push(listener);
}

function notifyStateListeners(): void {
  for (const fn of stateListeners) {
    try {
      fn();
    } catch {
      // Ignore individual listener errors
    }
  }
}

/**
 * Write state to localStorage safely by stripping any legacy huge base64 strings (>100KB)
 * while keeping all server `/uploads/...` URLs intact so localStorage quota never overflows.
 */
function writeLocalStorageSafe(state: DatabaseState): void {
  if (typeof window === 'undefined') return;
  if (state.activeStudentId > 0) {
    setActiveStudentSessionId(state.activeStudentId);
  }
  try {
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    try {
      const compact: DatabaseState = {
        ...state,
        resources: (state.resources || []).map((r) => ({
          ...r,
          fileDataUrl:
            r.fileDataUrl && r.fileDataUrl.startsWith('data:') && r.fileDataUrl.length > 80000
              ? undefined
              : r.fileDataUrl,
        })),
        assignments: (state.assignments || []).map((a) => ({
          ...a,
          attachmentDataUrl:
            a.attachmentDataUrl &&
            a.attachmentDataUrl.startsWith('data:') &&
            a.attachmentDataUrl.length > 80000
              ? undefined
              : a.attachmentDataUrl,
        })),
        submissions: (state.submissions || []).map((s) => ({
          ...s,
          fileDataUrl:
            s.fileDataUrl && s.fileDataUrl.startsWith('data:') && s.fileDataUrl.length > 80000
              ? undefined
              : s.fileDataUrl,
        })),
      };
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // In-memory state remains authoritative
    }
  }
}

/**
 * Pull latest records from Node.js + MySQL backend (/api/state) into memory & local cache
 */
export async function syncStateFromBackend(): Promise<DatabaseState> {
  const current = loadDbState();
  try {
    const res = await fetch(`${API_BASE_URL}/state`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return current;
    const json = (await res.json()) as {
      success?: boolean;
      serverNowMs?: number;
      data?: Partial<DatabaseState>;
    };
    if (typeof json.serverNowMs === 'number' && json.serverNowMs > 0) {
      serverClockOffsetMs = json.serverNowMs - Date.now();
    }
    if (json.success && json.data) {
      const sessionStId = getActiveStudentSessionId();
      const merged: DatabaseState = {
        ...current,
        ...json.data,
        activeStudentId:
          sessionStId ||
          current.activeStudentId ||
          Number(json.data.activeStudentId || 0),
        admin: {
          ...current.admin,
          ...(json.data.admin || {}),
          password: '',
        },
        settings: {
          ...current.settings,
          ...(json.data.settings || {}),
        },
        classes: Array.isArray(json.data.classes)
          ? json.data.classes
          : current.classes,
        students: Array.isArray(json.data.students)
          ? json.data.students
          : current.students,
        assignments: Array.isArray(json.data.assignments)
          ? json.data.assignments
          : current.assignments,
        submissions: Array.isArray(json.data.submissions)
          ? json.data.submissions
          : current.submissions,
        resources: Array.isArray(json.data.resources)
          ? json.data.resources
          : current.resources,
        announcements: Array.isArray(json.data.announcements)
          ? json.data.announcements
          : current.announcements,
        tickets: Array.isArray(json.data.tickets)
          ? json.data.tickets
          : current.tickets,
        gradebookSessions: Array.isArray(json.data.gradebookSessions)
          ? json.data.gradebookSessions
          : current.gradebookSessions,
        gradebookEntries: Array.isArray(json.data.gradebookEntries)
          ? json.data.gradebookEntries
          : current.gradebookEntries,
      };
      memoryState = merged;
      writeLocalStorageSafe(merged);
      notifyStateListeners();
      return merged;
    }
  } catch {
    // Ignore when offline
  }
  return current;
}

export function loadDbState(): DatabaseState {
  if (!backendSyncInitialized && typeof window !== 'undefined') {
    backendSyncInitialized = true;
    void syncStateFromBackend();
  }
  if (memoryState) {
    const sessionStId = getActiveStudentSessionId();
    if (sessionStId && !memoryState.activeStudentId) {
      memoryState.activeStudentId = sessionStId;
    }
    return memoryState;
  }
  try {
    const raw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(DB_STORAGE_KEY)
        : null;
    if (!raw) {
      const fresh = JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
      fresh.activeStudentId = getActiveStudentSessionId();
      memoryState = fresh;
      writeLocalStorageSafe(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    const hydrated: DatabaseState = {
      ...INITIAL_DB_STATE,
      ...parsed,
      activeStudentId:
        getActiveStudentSessionId() || Number(parsed.activeStudentId || 0),
      admin: {
        ...INITIAL_DB_STATE.admin,
        ...(parsed.admin || {}),
        password: '',
      },
      settings: {
        ...INITIAL_DB_STATE.settings,
        ...(parsed.settings || {}),
      },
    };
    memoryState = hydrated;
    return hydrated;
  } catch {
    const fallback = JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
    memoryState = fallback;
    return fallback;
  }
}

/**
 * Awaited persistence to Node.js + MySQL backend (`POST /api/state`).
 * Throws an Error if the backend rejects the operation or fails to save to MySQL,
 * ensuring callers never display false success messages.
 */
export async function persistDbState(
  state: DatabaseState
): Promise<{ success: boolean; message: string }> {
  memoryState = state;
  writeLocalStorageSafe(state);

  if (typeof window === 'undefined') {
    return { success: true, message: 'ذخیره شد.' };
  }

  const role = getActiveUserRole();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (role) {
    headers['X-User-Role'] = role;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/state`, {
      method: 'POST',
      headers,
      body: JSON.stringify(state),
    });
  } catch {
    throw new Error('خطا در برقراری ارتباط با سرور Node.js و پایگاه داده MySQL.');
  }

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    serverNowMs?: number;
    message?: string;
    students?: StudentRecord[];
  };

  if (typeof json.serverNowMs === 'number' && json.serverNowMs > 0) {
    serverClockOffsetMs = json.serverNowMs - Date.now();
  }

  if (!res.ok || !json.success) {
    // Re-sync from backend so optimistic in-memory mutations are rolled back
    await syncStateFromBackend();
    throw new Error(
      json.message || 'خطا در ذخیره‌سازی اطلاعات در پایگاه داده MySQL.'
    );
  }

  if (Array.isArray(json.students)) {
    state.students = json.students;
    memoryState = state;
    writeLocalStorageSafe(state);
  }

  notifyStateListeners();
  return {
    success: true,
    message: json.message || 'اطلاعات در پایگاه داده MySQL ذخیره شد.',
  };
}

/**
 * Synchronous wrapper for legacy callers; triggers persistDbState in background.
 * Prefer `await persistDbState(state)` for all interactive user operations.
 */
export function saveDbState(state: DatabaseState): void {
  void persistDbState(state).catch(() => {
    // Handled by syncStateFromBackend rollback
  });
}

export function resetDbState(): void {
  memoryState = null;
  try {
    window.localStorage.removeItem(DB_STORAGE_KEY);
  } catch {
    // Ignore storage issues
  }
}

export function logAdminActivity(
  state: DatabaseState,
  title: string,
  detail: string,
  category: 'student' | 'assignment' | 'ticket' | 'announcement',
  skipAutoSave = false
): void {
  state.activities.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    title,
    detail,
    timeAgo: 'هم‌اکنون',
    category,
  });
  if (state.activities.length > 15) {
    state.activities = state.activities.slice(0, 15);
  }
  memoryState = state;
  writeLocalStorageSafe(state);
  if (!skipAutoSave) {
    void persistDbState(state);
  }
}

/**
 * Upload a file (resource, ticket attachment, homework attachment, or avatar)
 * to `POST /api/upload` using XMLHttpRequest so real byte-level upload progress (0%–100%)
 * is reported via `onProgress`. Supports files >1MB up to maxUploadSizeMb.
 */
export function uploadFileWithProgress(
  file: File,
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void
): Promise<{
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  sizeBytes?: number;
  message?: string;
}> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/upload`, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(pct, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText || '{}') as {
          success?: boolean;
          fileUrl?: string;
          fileName?: string;
          fileSize?: string;
          sizeBytes?: number;
          message?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && res.success && res.fileUrl) {
          if (onProgress) onProgress(100, file.size, file.size);
          resolve({
            success: true,
            fileUrl: res.fileUrl,
            fileName: res.fileName || file.name,
            fileSize: res.fileSize || '',
            sizeBytes: res.sizeBytes ?? file.size,
            message: res.message,
          });
        } else {
          resolve({
            success: false,
            message:
              res.message ||
              `خطا در آپلود فایل (کد وضعیت: ${xhr.status || 'نامشخص'}).`,
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
        message: 'خطای شبکه هنگام ارسال فایل به سرور رخ داد.',
      });
    };

    xhr.onabort = () => {
      resolve({
        success: false,
        message: 'آپلود فایل لغو شد.',
      });
    };

    xhr.send(file);
  });
}
