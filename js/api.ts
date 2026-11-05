import $ from 'jquery';
import {
  ApiAuthResponse,
  LoginPayload,
  StudentRecord,
  StudentRegistrationPayload,
} from './types';
import { normalizeDigits } from './validation';

/**
 * MySQL + PHP 8.2 PDO API Configuration
 */
const API_CONFIG = {
  USE_DEMO_MODE: true,
  ENDPOINTS: {
    LOGIN: '/api/auth/login.php',
    REGISTER: '/api/auth/register.php',
  },
};

const STORAGE_KEY = 'scoolmeet_mysql_students';

function getStoredStudents(): Array<StudentRecord & { password: string }> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredStudent(record: StudentRecord & { password: string }): void {
  try {
    const list = getStoredStudents();
    const filtered = list.filter((item) => item.phone !== record.phone);
    filtered.push(record);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage quota errors in sandboxed iframes
  }
}

/**
 * Authenticate Student via Phone Number & Password (MySQL Backend Ready)
 */
export async function loginStudentApi(payload: LoginPayload): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);

  if (!API_CONFIG.USE_DEMO_MODE) {
    const response = await $.ajax({
      url: API_CONFIG.ENDPOINTS.LOGIN,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      data: JSON.stringify({
        phone: normalizedPhone,
        password: payload.password,
      }),
    });
    return response as ApiAuthResponse;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 650));

  const students = getStoredStudents();
  const matched = students.find((s) => s.phone === normalizedPhone);

  if (matched && matched.password !== payload.password) {
    return {
      success: false,
      message: 'رمز عبور واردشده برای این شماره تلفن صحیح نیست.',
    };
  }

  return {
    success: true,
    message: matched
      ? `خوش آمدید ${matched.firstName} ${matched.lastName} (کلاس ${matched.classCode})!`
      : `ورود با شماره تلفن ${normalizedPhone} با موفقیت انجام شد.`,
    student: matched || {
      id: 1,
      firstName: 'دانش‌آموز',
      lastName: 'اسکول میت',
      phone: normalizedPhone,
      classCode: '901',
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Register New Student in MySQL Database
 */
export async function registerStudentApi(
  payload: StudentRegistrationPayload
): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);

  if (!API_CONFIG.USE_DEMO_MODE) {
    const response = await $.ajax({
      url: API_CONFIG.ENDPOINTS.REGISTER,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      data: JSON.stringify({
        first_name: payload.firstName.trim(),
        last_name: payload.lastName.trim(),
        phone: normalizedPhone,
        class_code: payload.classCode,
        password: payload.password,
      }),
    });
    return response as ApiAuthResponse;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 700));

  const newStudent: StudentRecord = {
    id: Date.now(),
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    phone: normalizedPhone,
    classCode: payload.classCode,
    createdAt: new Date().toISOString(),
  };

  saveStoredStudent({
    ...newStudent,
    password: payload.password,
  });

  return {
    success: true,
    message: 'حساب کاربری دانش‌آموز با موفقیت در پایگاه داده ثبت شد.',
    student: newStudent,
  };
}
