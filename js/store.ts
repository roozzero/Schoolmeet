import { DatabaseState } from './types';

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
    maxUploadSizeMb: 15,
    supportPhone: '',
  },
};

const API_BASE_URL: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

let backendSyncInitialized = false;

/**
 * Pull latest records from Node.js + MySQL backend (/api/state) into local cache
 */
export async function syncStateFromBackend(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/state`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Partial<DatabaseState>;
    };
    if (json.success && json.data) {
      const current = loadDbState();
      const merged: DatabaseState = {
        ...current,
        ...json.data,
        admin: {
          ...current.admin,
          ...(json.data.admin || {}),
          password: '',
        },
        settings: {
          ...current.settings,
          ...(json.data.settings || {}),
        },
        classes:
          Array.isArray(json.data.classes) && json.data.classes.length > 0
            ? json.data.classes
            : current.classes,
        students: Array.isArray(json.data.students)
          ? json.data.students
          : current.students,
      };
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(merged));
    }
  } catch {
    // Ignore when offline
  }
}

export function loadDbState(): DatabaseState {
  if (!backendSyncInitialized && typeof window !== 'undefined') {
    backendSyncInitialized = true;
    void syncStateFromBackend();
  }
  try {
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(
        DB_STORAGE_KEY,
        JSON.stringify(INITIAL_DB_STATE)
      );
      return JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
    }
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    return {
      ...INITIAL_DB_STATE,
      ...parsed,
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
  } catch {
    return JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
  }
}

export function saveDbState(state: DatabaseState): void {
  try {
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }

  // Persist changes to Node.js MySQL backend asynchronously
  if (typeof window !== 'undefined') {
    void fetch(`${API_BASE_URL}/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(state),
    }).catch(() => {
      // Ignore network errors if backend is unreachable
    });
  }
}

export function resetDbState(): void {
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
  category: 'student' | 'assignment' | 'ticket' | 'announcement'
): void {
  state.activities.unshift({
    id: Date.now(),
    title,
    detail,
    timeAgo: 'هم‌اکنون',
    category,
  });
  if (state.activities.length > 15) {
    state.activities = state.activities.slice(0, 15);
  }
  saveDbState(state);
}
