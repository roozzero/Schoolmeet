import {
  API_BASE_URL,
  getActiveUserRole,
  loadDbState,
  logAdminActivity,
  persistDbState,
  setActiveStudentSessionId,
  setActiveUserRole,
  syncStateFromBackend,
} from './store';
import {
  AdminProfile,
  ApiAuthResponse,
  AssignmentItem,
  AssignmentSubmission,
  LoginPayload,
  StudentRecord,
  StudentRegistrationPayload,
  StudentStatus,
  TicketItem,
} from './types';
import { normalizeDigits } from './validation';

function buildJsonHeaders(explicitRole?: 'admin' | 'student'): Record<string, string> {
  const role = explicitRole || getActiveUserRole();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (role) {
    headers['X-User-Role'] = role;
  }
  return headers;
}

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
      headers: buildJsonHeaders(),
      body: JSON.stringify({
        phone: normalizedPhone,
        password: payload.password,
      }),
    });

    const data = (await res.json()) as ApiAuthResponse;

    if (data.success) {
      if (data.role === 'admin') {
        setActiveUserRole('admin');
      } else if (data.role === 'student' && data.student) {
        setActiveUserRole('student');
        setActiveStudentSessionId(data.student.id);
      }

      // Ensure we have the latest backend state before merging login session info
      await syncStateFromBackend();
      const state = loadDbState();

      if (data.role === 'admin' && data.admin) {
        state.admin = {
          ...state.admin,
          ...data.admin,
          password: '',
        };
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
        setActiveStudentSessionId(data.student.id);
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
      headers: buildJsonHeaders('student'),
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
      setActiveUserRole('student');
      setActiveStudentSessionId(data.student.id);
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
 * Update Student Profile (firstName, lastName, email, bio, avatarUrl, avatarRemoved) via PUT /api/student/profile
 * Strictly enforces phone immutability on backend.
 */
export async function updateStudentProfileApi(payload: {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  bio?: string;
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
      headers: buildJsonHeaders('student'),
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
      headers: buildJsonHeaders('student'),
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
      headers: buildJsonHeaders('admin'),
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
      headers: buildJsonHeaders('admin'),
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
  email?: string;
  bio?: string;
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
      headers: buildJsonHeaders('admin'),
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
    email: string;
    bio: string;
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
      headers: buildJsonHeaders('admin'),
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

/**
 * Admin: Remove Student Custom Profile Picture via DELETE /api/admin/students/:id/avatar
 * Reverts student's profile picture to the default account icon and cleans up unreferenced file.
 */
export async function adminRemoveStudentAvatarApi(studentId: number): Promise<{
  success: boolean;
  fileDeleted?: boolean;
  message: string;
  student?: StudentRecord;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/students/${studentId}/avatar`, {
      method: 'DELETE',
      headers: buildJsonHeaders('admin'),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت حذف تصویر پروفایل دانش‌آموز.',
    };
  }
}

/**
 * Admin: Close or Reopen an Assignment via POST /api/admin/assignments/:id/status
 */
export async function adminSetAssignmentStatusApi(
  assignmentId: number,
  status: 'active' | 'closed'
): Promise<{
  success: boolean;
  status?: 'active' | 'closed';
  assignment?: AssignmentItem;
  message: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/assignments/${assignmentId}/status`, {
      method: 'POST',
      headers: buildJsonHeaders('admin'),
      body: JSON.stringify({ status }),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت تغییر وضعیت تکلیف.',
    };
  }
}

/**
 * Student: Submit or Edit Assignment Response via POST /api/student/assignments/:id/submit
 * Enforces closed assignment and expired deadline restrictions on the backend.
 */
export async function studentSubmitAssignmentApi(
  assignmentId: number,
  payload: {
    studentId: number;
    fileName: string;
    fileContent: string;
    fileDataUrl?: string;
    submittedAt?: string;
  }
): Promise<{
  success: boolean;
  isEdit?: boolean;
  code?: string;
  submission?: AssignmentSubmission;
  message: string;
}> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/student/assignments/${assignmentId}/submit`,
      {
        method: 'POST',
        headers: buildJsonHeaders('student'),
        body: JSON.stringify(payload),
      }
    );
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت ارسال تکلیف.',
    };
  }
}

/**
 * Student: Reply to a Ticket via POST /api/student/tickets/:id/reply
 * Enforces closed ticket restriction on the backend.
 */
export async function studentReplyTicketApi(
  ticketId: number,
  payload: {
    studentId: number;
    message: string;
    attachmentName?: string;
    attachmentDataUrl?: string;
    sentAt?: string;
  }
): Promise<{
  success: boolean;
  code?: string;
  ticket?: TicketItem;
  message: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/student/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: buildJsonHeaders('student'),
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      message: 'خطا در ارتباط با سرور جهت ارسال پیام تیکت.',
    };
  }
}
