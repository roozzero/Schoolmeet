import {
  API_BASE_URL,
  loadDbState,
  logAdminActivity,
  persistDbState,
  syncStateFromBackend,
} from './store';
import {
  AdminProfile,
  ApiAuthResponse,
  LoginPayload,
  StudentRecord,
  StudentRegistrationPayload,
  StudentStatus,
} from './types';
import { normalizeDigits } from './validation';

/**
 * Test the Node.js -> MySQL database connection via GET /api/test-db
 */
export async function testDatabaseConnectionApi(): Promise<{
  success: boolean;
  connected: boolean;
  database?: string;
  message: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/test-db`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return await response.json();
  } catch {
    return {
      success: false,
      connected: false,
      message: 'عدم دسترسی به سرور بک‌اند Node.js در مسیر /api/test-db.',
    };
  }
}

/**
 * Authenticate Admin or Student strictly against Node.js + MySQL Backend (/api/auth/login).
 * Verifies credentials against the bcrypt password hash stored in MySQL (`scoolmeet_db`).
 */
export async function loginStudentApi(payload: LoginPayload): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        password: payload.password,
      }),
    });

    const data = (await res.json()) as ApiAuthResponse;

    if (data.success) {
      // Ensure we have the latest backend state before merging login session info
      await syncStateFromBackend();
      const state = loadDbState();

      if (data.role === 'admin' && data.admin) {
        state.admin = {
          ...state.admin,
          ...data.admin,
          password: '',
        };
        await persistDbState(state);
      } else if (data.role === 'student' && data.student) {
        const existingIdx = state.students.findIndex(
          (s) =>
            s.id === data.student!.id ||
            normalizeDigits(s.phone) === normalizeDigits(data.student!.phone)
        );
        if (existingIdx >= 0) {
          state.students[existingIdx] = {
            ...state.students[existingIdx],
            ...data.student,
          };
        } else {
          state.students.unshift(data.student);
        }
        state.activeStudentId = data.student.id;
        await persistDbState(state);
      }
    }

    return data;
  } catch {
    return {
      success: false,
      message: 'خطا در برقراری ارتباط با سرور Node.js و پایگاه داده MySQL.',
    };
  }
}

/**
 * Register New Student via Node.js + MySQL Backend (/api/auth/register)
 */
export async function registerStudentApi(
  payload: StudentRegistrationPayload
): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phone: normalizedPhone,
        classCode: payload.classCode,
        password: payload.password,
      }),
    });

    const data = (await res.json()) as ApiAuthResponse;

    if (data.success && data.student) {
      await syncStateFromBackend();
      const state = loadDbState();
      const createdStudent: StudentRecord = {
        ...data.student,
      };
      const existingIdx = state.students.findIndex((s) => s.id === createdStudent.id);
      if (existingIdx >= 0) {
        state.students[existingIdx] = createdStudent;
      } else {
        state.students.unshift(createdStudent);
      }
      state.activeStudentId = createdStudent.id;
      logAdminActivity(
        state,
        `ثبت‌نام دانش‌آموز جدید (${createdStudent.firstName} ${createdStudent.lastName} — کلاس ${createdStudent.classCode})`,
        `شماره تماس: ${createdStudent.phone} · ثبت‌شده در پایگاه داده MySQL`,
        'student',
        true
      );
      await persistDbState(state);
    }

    return data;
  } catch {
    return {
      success: false,
      message: 'خطا در برقراری ارتباط با سرور Node.js هنگام ثبت‌نام.',
    };
  }
}

/**
 * Update Student Profile (firstName, lastName, avatarUrl, avatarRemoved) via PUT /api/student/profile
 * Strictly enforces phone immutability on backend.
 */
export async function updateStudentProfileApi(payload: {
  id: number;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarRemoved?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  student?: StudentRecord;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/student/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت بروزرسانی پروفایل دانش‌آموز.',
    };
  }
}

/**
 * Update Student Password via POST /api/student/password
 */
export async function changeStudentPasswordApi(payload: {
  studentId: number;
  newPassword: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/student/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت تغییر رمز عبور.',
    };
  }
}

/**
 * Update Admin Profile via PUT /api/admin/profile
 */
export async function updateAdminProfileApi(payload: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  roleTitle: string;
  bio: string;
  avatarUrl?: string;
}): Promise<{
  success: boolean;
  message: string;
  admin?: AdminProfile;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت بروزرسانی پروفایل مدیر.',
    };
  }
}

/**
 * Change Admin Password via POST /api/admin/password
 */
export async function changeAdminPasswordApi(payload: {
  currentPassword?: string;
  newPassword: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت تغییر رمز عبور مدیر.',
    };
  }
}

/**
 * Admin: Create Student in MySQL via POST /api/admin/students
 */
export async function adminCreateStudentApi(payload: {
  firstName: string;
  lastName: string;
  phone: string;
  classCode: string;
  status: StudentStatus;
  notes?: string;
  password: string;
}): Promise<{
  success: boolean;
  message: string;
  student?: StudentRecord;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت ثبت دانش‌آموز جدید.',
    };
  }
}

/**
 * Admin: Update Student in MySQL via PUT /api/admin/students/:id
 */
export async function adminUpdateStudentApi(
  studentId: number,
  payload: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    classCode: string;
    status: StudentStatus;
    notes: string;
    password: string;
    avatarUrl: string | null;
    avatarRemoved: boolean;
  }>
): Promise<{
  success: boolean;
  message: string;
  student?: StudentRecord;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/students/${studentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت بروزرسانی اطلاعات دانش‌آموز.',
    };
  }
}
