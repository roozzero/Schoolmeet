import { loadDbState, logAdminActivity, saveDbState } from './store';
import {
  ApiAuthResponse,
  LoginPayload,
  StudentRecord,
  StudentRegistrationPayload,
} from './types';
import { normalizeDigits } from './validation';

const API_BASE_URL: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

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
      const state = loadDbState();

      if (data.role === 'admin' && data.admin) {
        state.admin = {
          ...state.admin,
          ...data.admin,
          password: '',
        };
        saveDbState(state);
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
        saveDbState(state);
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
      const state = loadDbState();
      const createdStudent: StudentRecord = {
        ...data.student,
      };
      state.students.unshift(createdStudent);
      state.activeStudentId = createdStudent.id;
      logAdminActivity(
        state,
        `ثبت‌نام دانش‌آموز جدید (${createdStudent.firstName} ${createdStudent.lastName} — کلاس ${createdStudent.classCode})`,
        `شماره تماس: ${createdStudent.phone} · ثبت‌شده در پایگاه داده MySQL`,
        'student'
      );
      saveDbState(state);
    }

    return data;
  } catch {
    return {
      success: false,
      message: 'خطا در برقراری ارتباط با سرور Node.js هنگام ثبت‌نام.',
    };
  }
}
