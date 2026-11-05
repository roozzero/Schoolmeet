export type ClassRoomCode = '901' | '902' | '903';
export type TargetClassScope = '901' | '902' | '903' | 'all';
export type StudentStatus = 'pending' | 'approved' | 'rejected';

export type AdminSectionId =
  | 'dashboard'
  | 'classes'
  | 'students'
  | 'assignments'
  | 'schedule'
  | 'resources'
  | 'announcements'
  | 'tickets'
  | 'profile'
  | 'settings';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface StudentRegistrationPayload {
  firstName: string;
  lastName: string;
  phone: string;
  classCode: ClassRoomCode;
  password: string;
  passwordConfirmation: string;
}

export interface StudentRecord {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  classCode: ClassRoomCode;
  status: StudentStatus;
  nationalCode?: string;
  parentPhone?: string;
  notes?: string;
  password?: string;
  createdAt: string;
}

export interface ClassRoomInfo {
  code: ClassRoomCode;
  title: string;
  gradeLevel: string;
  instructorName: string;
  capacity: number;
  roomOrLink: string;
  scheduleSummary: string;
  description: string;
}

export interface AssignmentItem {
  id: number;
  title: string;
  description: string;
  classCode: TargetClassScope;
  dueDate: string;
  maxScore: number;
  attachmentName: string;
  status: 'active' | 'closed';
  createdAt: string;
}

export interface AssignmentSubmission {
  id: number;
  assignmentId: number;
  studentId: number;
  studentName: string;
  classCode: ClassRoomCode;
  fileName: string;
  fileContent: string;
  submittedAt: string;
  score: number | null;
  teacherFeedback: string;
  status: 'pending' | 'graded';
}

export interface ClassScheduleItem {
  id: number;
  classCode: ClassRoomCode;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  topic: string;
  sessionType: 'حضوری' | 'آنلاین' | 'آزمون و حل تمرین';
  locationOrLink: string;
}

export interface EducationalResource {
  id: number;
  title: string;
  category: 'جزوه PDF' | 'فایل تمرین' | 'لینک آموزشی' | 'ویدیو ضبط‌شده';
  classCode: TargetClassScope;
  urlOrFileName: string;
  fileSize: string;
  description: string;
  createdAt: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  targetClasses: TargetClassScope;
  priority: 'عادی' | 'مهم' | 'فوری';
  createdAt: string;
}

export interface TicketMessage {
  id: number;
  senderRole: 'student' | 'admin';
  senderName: string;
  message: string;
  sentAt: string;
}

export interface TicketItem {
  id: number;
  studentId: number;
  studentName: string;
  studentPhone: string;
  classCode: ClassRoomCode;
  subject: string;
  priority: 'عادی' | 'مهم' | 'فوری';
  status: 'در انتظار پاسخ' | 'پاسخ داده شده' | 'بسته شده';
  createdAt: string;
  messages: TicketMessage[];
}

export interface AdminProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  roleTitle: string;
  bio: string;
  password: string;
}

export interface SystemSettings {
  platformName: string;
  academicYear: string;
  allowNewRegistrations: boolean;
  requireAdminApproval: boolean;
  maxUploadSizeMb: number;
  supportPhone: string;
}

export interface ActivityLogItem {
  id: number;
  title: string;
  detail: string;
  timeAgo: string;
  category: 'student' | 'assignment' | 'ticket' | 'announcement';
}

export interface DatabaseState {
  admin: AdminProfile;
  classes: ClassRoomInfo[];
  students: StudentRecord[];
  assignments: AssignmentItem[];
  submissions: AssignmentSubmission[];
  schedules: ClassScheduleItem[];
  resources: EducationalResource[];
  announcements: AnnouncementItem[];
  tickets: TicketItem[];
  activities: ActivityLogItem[];
  settings: SystemSettings;
}

export interface ApiAuthResponse {
  success: boolean;
  role?: 'admin' | 'student';
  message: string;
  student?: StudentRecord;
}
