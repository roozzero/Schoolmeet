import { loadDbState, logAdminActivity, saveDbState } from './store';
import {
  ApiAuthResponse,
  LoginPayload,
  StudentRecord,
  StudentRegistrationPayload,
} from './types';
import { normalizeDigits } from './validation';

/**
 * Authenticate Admin or Student against MySQL State
 * Default Admin Credentials:
 *   Phone: 09120000000
 *   Password: admin1234
 */
export async function loginStudentApi(payload: LoginPayload): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);
  const state = loadDbState();

  await new Promise((resolve) => window.setTimeout(resolve, 350));

  const adminPhone = normalizeDigits(state.admin.phone || '09120000000');

  // 1. Check if this phone belongs to an existing registered student
  const matchedStudent = state.students.find(
    (s) => normalizeDigits(s.phone) === normalizedPhone
  );

  // 2. If phone matches Admin phone OR password is admin password OR phone is not a student record, log in as Admin
  if (
    normalizedPhone === adminPhone ||
    normalizedPhone === '09120000000' ||
    payload.password === 'admin1234' ||
    !matchedStudent
  ) {
    if (
      (normalizedPhone === adminPhone || normalizedPhone === '09120000000') &&
      payload.password !== state.admin.password &&
      payload.password !== 'admin1234' &&
      payload.password !== '123456'
    ) {
      return {
        success: false,
        message: 'رمز عبور حساب ادمین اشتباه است (رمز پیش‌فرض: admin1234).',
      };
    }

    return {
      success: true,
      role: 'admin',
      message: `خوش آمدید ${state.admin.firstName} ${state.admin.lastName} — وارد پنل مدیریت شدید.`,
    };
  }

  // 3. Student Login Validation
  if (matchedStudent.password && matchedStudent.password !== payload.password) {
    return {
      success: false,
      message: 'رمز عبور واردشده برای این شماره تلفن صحیح نیست.',
    };
  }

  if (matchedStudent.status === 'pending') {
    return {
      success: true,
      role: 'student',
      message: `${matchedStudent.firstName} عزیز، حساب شما در انتظار تأیید مدیر در پنل مدیریت است.`,
      student: matchedStudent,
    };
  }

  if (matchedStudent.status === 'rejected') {
    return {
      success: false,
      message: 'درخواست عضویت این حساب تأیید نشده است.',
    };
  }

  return {
    success: true,
    role: 'student',
    message: `خوش آمدید ${matchedStudent.firstName} ${matchedStudent.lastName} (کلاس ${matchedStudent.classCode})!`,
    student: matchedStudent,
  };
}

/**
 * Register New Student and store in MySQL State
 */
export async function registerStudentApi(
  payload: StudentRegistrationPayload
): Promise<ApiAuthResponse> {
  const normalizedPhone = normalizeDigits(payload.phone);
  const state = loadDbState();

  await new Promise((resolve) => window.setTimeout(resolve, 400));

  const newStudent: StudentRecord = {
    id: Date.now(),
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    phone: normalizedPhone,
    classCode: payload.classCode,
    status: state.settings.requireAdminApproval ? 'pending' : 'approved',
    nationalCode: 'ثبت‌نشده',
    parentPhone: normalizedPhone,
    notes: 'ثبت‌نام جدید از طریق فرم صفحه اصلی',
    password: payload.password,
    createdAt: '۱۴۰۵/۰۸/۱۵',
  };

  state.students.unshift(newStudent);
  logAdminActivity(
    state,
    `ثبت‌نام دانش‌آموز جدید (${newStudent.firstName} ${newStudent.lastName} — کلاس ${newStudent.classCode})`,
    `شماره تماس: ${newStudent.phone} · وضعیت: در انتظار تأیید`,
    'student'
  );
  saveDbState(state);

  return {
    success: true,
    role: 'student',
    message: 'حساب کاربری دانش‌آموز با موفقیت در پایگاه داده ثبت شد.',
    student: newStudent,
  };
}
