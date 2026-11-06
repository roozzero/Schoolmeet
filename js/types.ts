export type ClassRoomCode = string;
export type TargetClassScope = string;
export type StudentStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceStatus = 'present' | 'absent' | 'late';

export type AdminSectionId =
  | 'dashboard'
  | 'classes'
  | 'students'
  | 'gradebook'
  | 'assignments'
  | 'resources'
  | 'announcements'
  | 'tickets'
  | 'profile'
  | 'settings';

export type StudentSectionId =
  | 'dashboard'
  | 'assignments'
  | 'grades'
  | 'resources'
  | 'announcements'
  | 'tickets'
  | 'profile';

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
  classCode: ClassRoomCode; // '' when removed from class
  status: StudentStatus;
  notes?: string;
  password?: string;
  avatarUrl?: string;
  avatarRemoved?: boolean;
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

export interface GradebookSession {
  id: number;
  classCode: ClassRoomCode;
  title: string;
  sessionDate: string;
  topic: string;
}

export interface GradebookEntry {
  id: number;
  sessionId: number;
  studentId: number;
  classCode: ClassRoomCode;
  attendance: AttendanceStatus;
  positiveCount: number;
  negativeCount: number;
  classScore: number | null;
  teacherNote: string;
}

export interface AssignmentItem {
  id: number;
  title: string;
  description: string;
  classCode: TargetClassScope;
  dueDate: string;
  maxScore: number;
  attachmentName: string;
  attachmentDataUrl?: string;
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
  fileDataUrl?: string;
  submittedAt: string;
  score: number | null;
  teacherFeedback: string;
  status: 'pending' | 'graded';
}

export interface ResourceViewerLog {
  studentId: number;
  studentName: string;
  classCode: ClassRoomCode;
  viewedAt: string;
}

export interface EducationalResource {
  id: number;
  title: string;
  category: 'جزوه PDF' | 'فایل تمرین' | 'لینک آموزشی' | 'ویدیو ضبط‌شده';
  classCode: TargetClassScope;
  urlOrFileName: string;
  fileDataUrl?: string;
  fileSize: string;
  description: string;
  createdAt: string;
  viewers?: ResourceViewerLog[];
}

export interface AnnouncementReaderLog {
  studentId: number;
  studentName: string;
  classCode: ClassRoomCode;
  readAt: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  targetClasses: TargetClassScope;
  priority: 'عادی' | 'مهم' | 'فوری';
  createdAt: string;
  readers?: AnnouncementReaderLog[];
}

export interface TicketMessage {
  id: number;
  senderRole: 'student' | 'admin';
  senderName: string;
  message: string;
  sentAt: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
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
  avatarUrl?: string;
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
  activeStudentId: number;
  classes: ClassRoomInfo[];
  students: StudentRecord[];
  gradebookSessions: GradebookSession[];
  gradebookEntries: GradebookEntry[];
  assignments: AssignmentItem[];
  submissions: AssignmentSubmission[];
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
  admin?: Partial<AdminProfile>;
}

