import $ from 'jquery';
import {
  changeStudentPasswordApi,
  studentReplyTicketApi,
  studentSubmitAssignmentApi,
  updateStudentProfileApi,
} from './api';
import { showToast } from './modal';
import { AppRoutePath, updateBrowserUrl } from './router';
import {
  getAuthoritativeNowMs,
  loadDbState,
  logAdminActivity,
  onDbStateSynced,
  persistDbState,
  setActiveStudentSessionId,
  setActiveUserRole,
  syncStateFromBackend,
  uploadFileWithProgress,
} from './store';
import {
  AnnouncementItem,
  AssignmentItem,
  AttendanceStatus,
  DatabaseState,
  EducationalResource,
  StudentRecord,
  StudentSectionId,
} from './types';
import {
  formatPersianDateTime,
  formatRecipientLabel,
  getAssignmentLockState,
  isValidRequiredEmail,
  normalizeDigits,
  toPersianDigits,
} from './validation';

let activeStudentSection: StudentSectionId = 'dashboard';
let studentHwSubView: 'list' | 'detail' = 'list';
let activeStudentHwId: number | null = null;
let pendingStudentHwFileName = '';
let pendingStudentHwFileDataUrl = '';
let isUploadingStudentHwFile = false;
let lastSelectedHwFile: File | null = null;

let studentResSubView: 'list' | 'detail' = 'list';
let activeStudentResId: number | null = null;
let studentResCategoryFilter = 'all';
let studentResSearchQuery = '';

let studentAnnSearchQuery = '';
let studentTicketSubView: 'list' | 'create' = 'list';
let activeStudentTicketId: number | null = null;
let pendingStudentTicketFileName = '';
let pendingStudentTicketFileDataUrl = '';
let isUploadingReplyTicketFile = false;
let lastSelectedReplyTicketFile: File | null = null;

let pendingNewTicketFileName = '';
let pendingNewTicketFileDataUrl = '';
let isUploadingNewTicketFile = false;
let lastSelectedNewTicketFile: File | null = null;

function getActiveStudent(state: DatabaseState): StudentRecord {
  const found = state.students.find((s) => s.id === state.activeStudentId);
  return (
    found ||
    state.students[0] || {
      id: 0,
      firstName: 'دانش‌آموز',
      lastName: '',
      phone: '',
      classCode: '901',
      status: 'approved',
      createdAt: '',
    }
  );
}

/**
 * Determine whether an announcement/notification belongs to this student:
 * - If `targetStudentId` is set (e.g. personal feedback notification), only show to that student.
 * - Otherwise, show if `targetClasses === 'all'` or matches `student.classCode`.
 */
function isAnnouncementForStudent(
  ann: AnnouncementItem,
  student: StudentRecord
): boolean {
  if (ann.targetStudentId && Number(ann.targetStudentId) > 0) {
    return Number(ann.targetStudentId) === Number(student.id);
  }
  return ann.targetClasses === 'all' || ann.targetClasses === student.classCode;
}

function isAssignmentForStudent(
  hw: AssignmentItem,
  student: StudentRecord
): boolean {
  if (hw.targetStudentId && Number(hw.targetStudentId) > 0) {
    return Number(hw.targetStudentId) === Number(student.id);
  }
  return hw.classCode === 'all' || hw.classCode === student.classCode;
}

function isResourceForStudent(
  res: EducationalResource,
  student: StudentRecord
): boolean {
  if (res.targetStudentId && Number(res.targetStudentId) > 0) {
    return Number(res.targetStudentId) === Number(student.id);
  }
  return res.classCode === 'all' || res.classCode === student.classCode;
}

function formatStudentItemRecipient(
  state: DatabaseState,
  student: StudentRecord,
  classCodeOrTarget: string,
  targetStudentId?: number,
  targetStudentName?: string
): string {
  return formatRecipientLabel({
    classCodeOrTarget,
    targetStudentId,
    targetStudentName:
      targetStudentName ||
      (targetStudentId && Number(targetStudentId) === Number(student.id)
        ? `${student.firstName} ${student.lastName}`.trim()
        : undefined),
    students: state.students,
    classes: state.classes,
  });
}

function formatAttendanceBadge(status: AttendanceStatus): string {
  if (status === 'present') {
    return `<span class="px-2.5 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] font-extrabold text-xs">حاضر</span>`;
  }
  if (status === 'late') {
    return `<span class="px-2.5 py-0.5 rounded-md bg-[#FFFBEB] text-[#D97706] font-extrabold text-xs">تأخیر</span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48] font-extrabold text-xs">غایب</span>`;
}

function triggerStudentFileDownload(
  fileName: string,
  dataUrl?: string,
  fallbackText?: string
): void {
  const cleanName = fileName.trim() || 'scoolmeet-file.txt';
  if (
    dataUrl &&
    (dataUrl.startsWith('/uploads/') ||
      dataUrl.startsWith('http://') ||
      dataUrl.startsWith('https://'))
  ) {
    const sep = dataUrl.includes('?') ? '&' : '?';
    const downloadHref = dataUrl.startsWith('/uploads/')
      ? `${dataUrl}${sep}download=1&name=${encodeURIComponent(cleanName)}`
      : dataUrl;
    const link = document.createElement('a');
    link.href = downloadHref;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      'دانلود انجام شد',
      `فایل «${toPersianDigits(cleanName)}» دانلود گردید.`,
      'success'
    );
    return;
  }

  if (dataUrl && dataUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      'دانلود انجام شد',
      `فایل «${toPersianDigits(cleanName)}» دانلود گردید.`,
      'success'
    );
    return;
  }

  const content =
    fallbackText ||
    `سامانه آموزشی اسکول میت (ScoolMeet)\nنام فایل: ${cleanName}\nدریافت‌شده از پنل دانش‌آموزی.`;
  const blob = new Blob([content], {
    type: 'application/octet-stream;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = cleanName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  showToast(
    'دانلود انجام شد',
    `فایل «${toPersianDigits(cleanName)}» دانلود گردید.`,
    'success'
  );
}

function markResourceViewedByStudent(
  state: DatabaseState,
  resourceId: number,
  student: StudentRecord
): void {
  const res = state.resources.find((r) => r.id === resourceId);
  if (!res) return;
  if (!res.viewers) {
    res.viewers = [];
  }
  const existing = res.viewers.find((v) => v.studentId === student.id);
  if (!existing) {
    res.viewers.push({
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      classCode: student.classCode || '901',
      viewedAt: formatPersianDateTime(new Date()),
    });
    void persistDbState(state);
  }
}

/**
 * Render an inline upload progress bar inside a container selector
 */
function renderUploadProgressWidget(
  containerSelector: string,
  state: {
    status: 'idle' | 'uploading' | 'success' | 'error';
    percent?: number;
    fileName?: string;
    fileSize?: string;
    errorMessage?: string;
    retryActionClass?: string;
  }
): void {
  const $box = $(containerSelector);
  if (!$box.length) return;

  if (state.status === 'idle') {
    $box.html('').addClass('hidden');
    return;
  }

  $box.removeClass('hidden');
  const pct = Math.max(0, Math.min(100, Number(state.percent || 0)));

  if (state.status === 'uploading') {
    $box.html(`
      <div class="p-3 rounded-xl bg-[#FDFBF7] border border-[#D4C3AE] space-y-2 mt-2">
        <div class="flex items-center justify-between text-xs font-extrabold text-[#251B15]">
          <span>در حال آپلود فایل «${toPersianDigits(state.fileName || '')}»...</span>
          <span class="tabular-nums text-[#1B5E5A]">${toPersianDigits(pct)}٪</span>
        </div>
        <div class="w-full h-2.5 bg-[#E6D8C5] rounded-full overflow-hidden">
          <div class="h-full bg-[#1B5E5A] transition-all duration-150 rounded-full" style="width: ${pct}%;"></div>
        </div>
      </div>
    `);
    return;
  }

  if (state.status === 'success') {
    $box.html(`
      <div class="p-2.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-between gap-2 mt-2">
        <div class="flex items-center gap-2 text-xs font-extrabold text-[#059669]">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>فایل «${toPersianDigits(state.fileName || '')}» با موفقیت آپلود شد (${toPersianDigits(100)}٪${state.fileSize ? ` · ${toPersianDigits(state.fileSize)}` : ''})</span>
        </div>
      </div>
    `);
    return;
  }

  if (state.status === 'error') {
    $box.html(`
      <div class="p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] flex items-center justify-between gap-3 flex-wrap mt-2">
        <div class="text-xs font-extrabold text-[#E11D48]">
          خطا در آپلود فایل: ${toPersianDigits(state.errorMessage || 'ارتباط با سرور برقرار نشد.')}
        </div>
        ${
          state.retryActionClass
            ? `<button type="button" class="btn-admin-action !h-8 !px-3 !text-xs ${state.retryActionClass}">تلاش مجدد آپلود</button>`
            : ''
        }
      </div>
    `);
  }
}

/**
 * Update Student Sidebar Counters, Avatar, Greeting & Bell Badge
 */
function syncStudentChrome(state: DatabaseState): void {
  const student = getActiveStudent(state);
  const fullName = `${student.firstName} ${student.lastName}`;
  const classLabel = student.classCode
    ? `دانش‌آموز کلاس ${toPersianDigits(student.classCode)}`
    : 'دانش‌آموز (بدون کلاس)';

  $('#sidebar-student-name, #student-sidebar-name').text(fullName);
  $('#sidebar-student-role, #student-sidebar-role').text(classLabel);
  $('#student-topbar-welcome').text(`${fullName} عزیز، به اسکول میت خوش آمدید`);

  const $avatar = $('#student-sidebar-avatar');
  $avatar.removeClass(
    'student-portrait-0 student-portrait-1 student-portrait-2 student-portrait-3 student-portrait-lg-0 student-portrait-lg-1 student-portrait-lg-2 student-portrait-lg-3 has-custom-avatar bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]'
  );
  if (student.avatarUrl && !student.avatarRemoved) {
    $avatar
      .addClass('has-custom-avatar')
      .css('background-image', `url('${student.avatarUrl}')`)
      .html('');
  } else {
    $avatar
      .css('background-image', 'none')
      .addClass('bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]')
      .html(
        `<svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>`
      );
  }

  const myAssignments = state.assignments.filter((a) =>
    isAssignmentForStudent(a, student)
  );
  const myGrades = state.gradebookEntries.filter((e) => e.studentId === student.id);
  const myResources = state.resources.filter((r) =>
    isResourceForStudent(r, student)
  );
  const myAnnouncements = state.announcements.filter((an) =>
    isAnnouncementForStudent(an, student)
  );
  const myUnreadAnnouncements = myAnnouncements.filter(
    (an) => !(an.readers || []).some((r) => r.studentId === student.id)
  );
  const myTickets = state.tickets.filter((t) => t.studentId === student.id);

  $('#st-badge-assignments, #st-nav-badge-assignments').text(
    toPersianDigits(myAssignments.length)
  );
  $('#st-badge-grades').text(toPersianDigits(myGrades.length));
  $('#st-badge-resources, #st-nav-badge-resources').text(
    toPersianDigits(myResources.length)
  );
  $('#st-badge-announcements, #st-nav-badge-announcements').text(
    myUnreadAnnouncements.length > 0 ? toPersianDigits(myUnreadAnnouncements.length) : ''
  );
  $('#st-badge-tickets, #st-nav-badge-tickets').text(
    toPersianDigits(myTickets.length)
  );
  $('#student-bell-badge, #student-topbar-bell-badge').text(
    myUnreadAnnouncements.length > 0 ? toPersianDigits(myUnreadAnnouncements.length) : ''
  );
}

/**
 * Navigate between Student Panel sections and update browser URL
 */
export function navigateStudentSection(
  sectionId: StudentSectionId,
  updateHistory = true,
  subPage?: string
): void {
  activeStudentSection = sectionId;

  if (sectionId === 'assignments') {
    studentHwSubView = subPage === 'detail' && activeStudentHwId ? 'detail' : 'list';
  } else if (sectionId === 'resources') {
    studentResSubView = subPage === 'detail' && activeStudentResId ? 'detail' : 'list';
  } else if (sectionId === 'tickets') {
    studentTicketSubView = subPage === 'create' ? 'create' : 'list';
  }

  $('.student-nav-btn').removeClass('is-active');
  $(`.student-nav-btn[data-section="${sectionId}"]`).addClass('is-active');

  if (updateHistory) {
    const path = subPage
      ? (`/student/${sectionId}/${subPage}` as AppRoutePath)
      : (`/student/${sectionId}` as AppRoutePath);
    updateBrowserUrl(path);
  }

  renderActiveStudentSection();
}

export function renderActiveStudentSection(preserveInputSelector?: string): void {
  const state = loadDbState();
  syncStudentChrome(state);

  const $viewport = $('#student-main-viewport');
  if (!$viewport.length) return;

  switch (activeStudentSection) {
    case 'dashboard':
      renderStudentDashboard($viewport, state);
      break;
    case 'assignments':
      renderStudentAssignments($viewport, state);
      break;
    case 'grades':
      renderStudentGrades($viewport, state);
      break;
    case 'resources':
      renderStudentResources($viewport, state);
      break;
    case 'announcements':
      renderStudentAnnouncements($viewport, state);
      break;
    case 'tickets':
      renderStudentTickets($viewport, state);
      break;
    case 'profile':
      renderStudentProfile($viewport, state);
      break;
  }

  if (preserveInputSelector) {
    const $input = $(preserveInputSelector) as JQuery<HTMLInputElement>;
    if ($input.length) {
      const val = $input.val() || '';
      $input.trigger('focus');
      try {
        $input[0].setSelectionRange(val.length, val.length);
      } catch {
        // Ignore
      }
    }
  }
}

/* ============================================================================
   1. داشبورد دانش‌آموز: تکالیف جدید، آخرین اطلاعیه‌ها و خلاصه وضعیت
   ============================================================================ */
function renderStudentDashboard($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);
  const myClassInfo = state.classes.find((c) => c.code === student.classCode);
  const myAssignments = state.assignments.filter((a) =>
    isAssignmentForStudent(a, student)
  );
  const mySubmissions = state.submissions.filter((s) => s.studentId === student.id);
  const myGradebookEntries = state.gradebookEntries.filter((e) => e.studentId === student.id);
  const myAnnouncements = state.announcements.filter((an) =>
    isAnnouncementForStudent(an, student)
  );

  const totalPositives = myGradebookEntries.reduce((sum, e) => sum + e.positiveCount, 0);
  const totalNegatives = myGradebookEntries.reduce((sum, e) => sum + e.negativeCount, 0);
  const presentSessions = myGradebookEntries.filter((e) => e.attendance === 'present').length;

  const allScores: number[] = [];
  mySubmissions.forEach((s) => {
    if (s.score !== null) allScores.push(s.score);
  });
  myGradebookEntries.forEach((e) => {
    if (e.classScore !== null) allScores.push(e.classScore);
  });
  const avgScore =
    allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
      : 20;

  $container.html(`
    <div class="space-y-5">
      <!-- کارت‌های خلاصه وضعیت تحصیلی دانش‌آموز -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">کلاس و وضعیت عضویت</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${student.classCode ? `کلاس ${toPersianDigits(student.classCode)}` : 'بدون کلاس'}
            </div>
            <div class="text-[10.5px] font-semibold text-[#059669] mt-0.5 truncate">
              ${myClassInfo ? toPersianDigits(myClassInfo.scheduleSummary) : 'عضو فعال دوره'}
            </div>
          </div>
          <div class="kpi-icon-box bg-[#EADCCA] text-[#5A3A22]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        </div>

        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">وضعیت تکالیف من</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${toPersianDigits(mySubmissions.length)} از ${toPersianDigits(myAssignments.length)} تحویل‌شده
            </div>
            <div class="text-[10.5px] font-semibold text-[#5A3A22] mt-0.5 truncate">
              ${toPersianDigits(Math.max(0, myAssignments.length - mySubmissions.length))} تکلیف در انتظار ارسال
            </div>
          </div>
          <div class="kpi-icon-box bg-[#E2EFEA] text-[#1B5E5A]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">میانگین کل نمرات</div>
            <div class="text-[15px] font-black text-[#059669] mt-0.5 tabular-nums">
              ${toPersianDigits(avgScore)} از ۲۰
            </div>
            <div class="text-[10.5px] font-semibold text-[#6E5D4F] mt-0.5 truncate">
              بر اساس تکالیف و دفتر نمره
            </div>
          </div>
          <div class="kpi-icon-box bg-[#ECFDF5] text-[#059669]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>

        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">حضور و امتیاز کلاسی</div>
            <div class="flex items-center gap-1.5 mt-1 flex-wrap tabular-nums">
              <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] text-[12px] font-black">
                +${toPersianDigits(totalPositives)} مثبت
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-[#E11D48] text-[12px] font-black">
                −${toPersianDigits(totalNegatives)} منفی
              </span>
            </div>
            <div class="text-[10.5px] font-semibold text-[#1B5E5A] mt-1 truncate">
              ${toPersianDigits(presentSessions)} جلسه حضور ثبت‌شده
            </div>
          </div>
          <div class="kpi-icon-box bg-[#F3E5D0] text-[#7C4D25]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- بخش تکالیف جدید دانش‌آموز -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">تکالیف جدید کلاس</h2>
          <button
            type="button"
            class="text-xs font-extrabold text-[#5A3A22] hover:underline bg-transparent border-none p-0 cursor-pointer js-st-go-section"
            data-section="assignments"
          >
            مشاهده همه تکالیف ←
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          ${
            myAssignments.length
              ? myAssignments
                  .slice(0, 3)
                  .map((hw) => {
                    const sub = mySubmissions.find((s) => s.assignmentId === hw.id);
                    const lockInfo = getAssignmentLockState(hw, getAuthoritativeNowMs());
                    return `
                      <div class="modern-class-card">
                        <div>
                          <div class="flex items-center justify-between gap-2 flex-wrap">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                                sub
                                  ? 'bg-[#ECFDF5] text-[#059669]'
                                  : lockInfo.isLocked
                                  ? 'bg-[#FFF1F2] text-[#E11D48]'
                                  : 'bg-[#FFFBEB] text-[#D97706]'
                              }">
                                ${
                                  sub
                                    ? 'تحویل داده شده'
                                    : lockInfo.isClosedByAdmin
                                    ? 'بسته شده'
                                    : lockInfo.isDeadlineExpired
                                    ? 'مهلت به پایان رسیده'
                                    : 'در انتظار ارسال'
                                }
                              </span>
                              ${
                                lockInfo.isLocked && sub
                                  ? `<span class="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48]">${
                                      lockInfo.isClosedByAdmin ? 'بسته شده' : 'مهلت گذشته'
                                    }</span>`
                                  : ''
                              }
                            </div>
                            <span class="text-[11px] font-bold text-[#6E5D4F] tabular-nums">
                              بارم: ${toPersianDigits(hw.maxScore)} نمره
                            </span>
                          </div>
                          <h3 class="text-sm font-black text-[#251B15] mt-2.5 m-0 leading-snug">
                            ${toPersianDigits(hw.title)}
                          </h3>
                          <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">
                            ${toPersianDigits(hw.description)}
                          </p>
                        </div>

                        <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-2.5">
                          <div class="flex items-center justify-between text-[11px] text-[#6E5D4F]">
                            <span>مهلت تحویل:</span>
                            <strong class="${lockInfo.isDeadlineExpired ? 'text-[#E11D48]' : 'text-[#251B15]'} tabular-nums">${toPersianDigits(hw.dueDate)}</strong>
                          </div>
                          <button
                            type="button"
                            class="btn-admin-primary w-full !h-9 text-xs js-st-open-hw-detail"
                            data-id="${hw.id}"
                          >
                            ${
                              lockInfo.isLocked
                                ? sub
                                  ? 'مشاهده وضعیت و پاسخ ارسالی'
                                  : 'مشاهده جزئیات تکلیف'
                                : sub
                                ? 'مشاهده وضعیت و ویرایش پاسخ'
                                : 'مشاهده و ارسال تکلیف'
                            }
                          </button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')
              : `<div class="col-span-full admin-surface-card text-center py-6 text-xs text-[#6E5D4F]">تکلیفی برای کلاس شما ثبت نشده است.</div>`
          }
        </div>
      </div>

      <!-- آخرین اطلاعیه‌ها و اعلان‌های کلاس -->
      <div class="admin-surface-card">
        <div class="flex items-center justify-between mb-3.5">
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">آخرین اطلاعیه‌ها و اعلان‌های آموزشی</h2>
          <button
            type="button"
            class="text-xs font-extrabold text-[#5A3A22] hover:underline bg-transparent border-none p-0 cursor-pointer js-st-go-section"
            data-section="announcements"
          >
            همه اطلاعیه‌ها ←
          </button>
        </div>

        <div class="space-y-2.5">
          ${
            myAnnouncements.length
              ? myAnnouncements
                  .slice(0, 4)
                  .map(
                    (ann) => `
                    <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB]">
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-xs font-extrabold text-[#251B15]">${toPersianDigits(ann.title)}</span>
                          <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[#E2EFEA] text-[#1B5E5A]">
                            ${formatStudentItemRecipient(state, student, ann.targetClasses, ann.targetStudentId, ann.targetStudentName)}
                          </span>
                          ${
                            ann.notificationType === 'feedback'
                              ? `<span class="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">بازخورد اختصاصی مدرس</span>`
                              : ann.notificationType === 'assignment'
                              ? `<span class="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md bg-[#E2EFEA] text-[#1B5E5A]">اعلان تکلیف جدید</span>`
                              : ann.notificationType === 'resource'
                              ? `<span class="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md bg-[#F3E5D0] text-[#5A3A22] border border-[#DFC8A9]">منبع آموزشی جدید</span>`
                              : ''
                          }
                        </div>
                        <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(formatPersianDateTime(ann.createdAt))}</span>
                      </div>
                      <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">${toPersianDigits(ann.content)}</p>
                    </div>`
                  )
                  .join('')
              : `<div class="text-center py-6 text-xs text-[#6E5D4F]">اطلاعیه‌ای ثبت نشده است.</div>`
          }
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   2. تکالیف من: مشاهده لیست تکالیف و صفحه اختصاصی ارسال / ویرایش پاسخ تکلیف
   ============================================================================ */
function renderStudentAssignments($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);

  if (studentHwSubView === 'detail' && activeStudentHwId) {
    renderStudentAssignmentDetailPage($container, state, student, activeStudentHwId);
    return;
  }

  const myAssignments = state.assignments.filter((a) =>
    isAssignmentForStudent(a, student)
  );
  const mySubmissions = state.submissions.filter((s) => s.studentId === student.id);

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">
            تکالیف من (${toPersianDigits(myAssignments.length)} تکلیف)
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            برای مشاهده جزئیات، دانلود فایل راهنما و ارسال پاسخ، روی هر تکلیف کلیک کنید.
          </p>
        </div>
        <span class="text-xs font-bold text-[#1B5E5A]">
          تحویل‌شده: ${toPersianDigits(mySubmissions.length)} از ${toPersianDigits(myAssignments.length)}
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        ${
          myAssignments.length
            ? myAssignments
                .map((hw) => {
                  const sub = mySubmissions.find((s) => s.assignmentId === hw.id);
                  const lockInfo = getAssignmentLockState(hw, getAuthoritativeNowMs());
                  const recipientLabel = formatStudentItemRecipient(
                    state,
                    student,
                    hw.classCode,
                    hw.targetStudentId,
                    hw.targetStudentName
                  );
                  return `
                    <div class="modern-class-card">
                      <div>
                        <div class="flex items-center justify-between gap-2 flex-wrap">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                              sub
                                ? sub.score !== null
                                  ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                                  : 'bg-[#E2EFEA] text-[#1B5E5A]'
                                : lockInfo.isLocked
                                ? 'bg-[#FFF1F2] text-[#E11D48]'
                                : 'bg-[#FFFBEB] text-[#D97706]'
                            }">
                              ${
                                sub
                                  ? sub.score !== null
                                    ? `نمره کسب‌شده: ${toPersianDigits(sub.score)} از ${toPersianDigits(hw.maxScore)}`
                                    : 'تحویل داده شده (در انتظار نمره)'
                                  : lockInfo.isClosedByAdmin
                                  ? 'بسته شده توسط مدرس'
                                  : lockInfo.isDeadlineExpired
                                  ? 'مهلت به پایان رسیده'
                                  : 'تحویل نداده'
                              }
                            </span>
                            ${
                              lockInfo.isLocked && sub
                                ? `<span class="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48]">${
                                    lockInfo.isClosedByAdmin ? 'بسته شده' : 'مهلت به پایان رسیده'
                                  }</span>`
                                : ''
                            }
                          </div>
                          <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(formatPersianDateTime(hw.createdAt))}</span>
                        </div>

                        <h3 class="text-sm font-black text-[#251B15] mt-2.5 m-0 leading-snug">
                          ${toPersianDigits(hw.title)}
                        </h3>
                        <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">
                          ${toPersianDigits(hw.description)}
                        </p>
                      </div>

                      <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-2.5">
                        <div class="flex items-center justify-between text-[11px] text-[#6E5D4F]">
                          <span>مخاطب: <strong class="text-[#5A3A22]">${recipientLabel}</strong></span>
                          <span>بارم: <strong class="text-[#251B15]">${toPersianDigits(hw.maxScore)}</strong></span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-[#6E5D4F]">
                          <span>مهلت تحویل:</span>
                          <strong class="${lockInfo.isDeadlineExpired ? 'text-[#E11D48]' : 'text-[#251B15]'}">${toPersianDigits(hw.dueDate)}</strong>
                        </div>
                        ${
                          sub && sub.score !== null
                            ? `<div class="p-2.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-between gap-2">
                                <span class="text-[11px] font-extrabold text-[#065F46]">نمره نهایی مدرس:</span>
                                <span class="text-xs font-black text-[#059669] tabular-nums">${toPersianDigits(sub.score)} از ${toPersianDigits(hw.maxScore)}</span>
                              </div>`
                            : ''
                        }

                        <button
                          type="button"
                          class="btn-admin-primary w-full !h-9 text-xs js-st-open-hw-detail"
                          data-id="${hw.id}"
                        >
                          ${
                            lockInfo.isLocked
                              ? sub
                                ? 'مشاهده جزئیات و پاسخ ارسالی'
                                : 'مشاهده جزئیات تکلیف'
                              : sub
                              ? 'مشاهده جزئیات و ویرایش پاسخ'
                              : 'مشاهده جزئیات و ارسال تکلیف'
                          }
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')
            : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">تکلیفی برای کلاس شما ثبت نشده است.</div>`
        }
      </div>

      <!-- جدول تکالیف پاسخ داده شده همراه با نام دانش‌آموز -->
      <div class="admin-surface-card space-y-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h3 class="text-sm font-extrabold text-[#251B15] m-0">
            جدول تکالیف پاسخ داده شده (${toPersianDigits(mySubmissions.length)} مورد)
          </h3>
          <span class="text-xs font-bold text-[#6E5D4F]">
            سوابق پاسخ‌های ثبت‌شده و نمرات دریافتی
          </span>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>نام دانش‌آموز</th>
                <th>عنوان تکلیف</th>
                <th>فایل پیوست</th>
                <th>زمان ثبت پاسخ</th>
                <th>نمره مدرس</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              ${
                mySubmissions.length
                  ? mySubmissions
                      .map((sub, idx) => {
                        const hw = state.assignments.find((a) => a.id === sub.assignmentId);
                        const stFullName =
                          (sub.studentName || '').trim() ||
                          `${student.firstName} ${student.lastName}`.trim();
                        return `
                          <tr>
                            <td class="tabular-nums font-bold">${toPersianDigits(idx + 1)}</td>
                            <td class="font-extrabold text-[#251B15]">${toPersianDigits(stFullName)}</td>
                            <td class="font-bold text-[#5A3A22]">${toPersianDigits(hw ? hw.title : `تکلیف #${sub.assignmentId}`)}</td>
                            <td>
                              ${
                                sub.fileName
                                  ? `<span class="text-xs font-bold text-[#1B5E5A]">${toPersianDigits(sub.fileName)}</span>`
                                  : `<span class="text-xs text-[#6E5D4F]">بدون فایل پیوست</span>`
                              }
                            </td>
                            <td class="tabular-nums text-xs text-[#6E5D4F]">${toPersianDigits(sub.submittedAt)}</td>
                            <td class="tabular-nums">
                              ${
                                sub.score !== null && sub.score !== undefined
                                  ? `<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-xs font-black">${toPersianDigits(sub.score)} از ${toPersianDigits(hw ? hw.maxScore : 20)}</span>`
                                  : `<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] text-[11px] font-bold">در انتظار نمره</span>`
                              }
                            </td>
                            <td>
                              <button
                                type="button"
                                class="btn-admin-action !h-8 !px-3 !text-xs js-st-open-hw-detail"
                                data-id="${sub.assignmentId}"
                              >
                                مشاهده جزئیات
                              </button>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
                  : `<tr><td colspan="7" class="text-center py-6 text-xs text-[#6E5D4F]">هنوز پاسخی برای تکالیف ثبت نشده است.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

function renderStudentAssignmentDetailPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  student: StudentRecord,
  assignmentId: number
): void {
  const hw = state.assignments.find((a) => a.id === assignmentId);
  if (!hw) {
    studentHwSubView = 'list';
    renderStudentAssignments($container, state);
    return;
  }

  const existingSub = state.submissions.find(
    (s) => s.assignmentId === hw.id && s.studentId === student.id
  );
  const lockInfo = getAssignmentLockState(hw, getAuthoritativeNowMs());
  const isGraded = Boolean(existingSub && existingSub.score !== null);
  const isSubmissionBlocked = lockInfo.isLocked || isGraded;
  const studentDisplayName =
    existingSub && existingSub.studentName
      ? existingSub.studentName
      : `${student.firstName} ${student.lastName}`.trim();

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-base font-black text-[#251B15] m-0">${toPersianDigits(hw.title)}</h2>
            <span class="text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg ${
              lockInfo.isLocked
                ? 'bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3]'
                : 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
            }">
              ${
                lockInfo.isClosedByAdmin
                  ? 'بسته شده توسط مدرس'
                  : lockInfo.isDeadlineExpired
                  ? 'مهلت به پایان رسیده'
                  : 'فعال و قابل ارسال'
              }
            </span>
          </div>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            مهلت تحویل: <strong class="${lockInfo.isDeadlineExpired ? 'text-[#E11D48]' : 'text-[#251B15]'}">${toPersianDigits(hw.dueDate)}</strong> · بارم: <strong class="text-[#1B5E5A]">${toPersianDigits(hw.maxScore)} نمره</strong>
          </p>
        </div>
        <button type="button" class="btn-admin-action js-st-back-to-hw-list">
          بازگشت به تکالیف من ←
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- ستون راست: شرح تکلیف، فایل راهنما و نتیجه نمره‌دهی مدرس -->
        <div class="lg:col-span-6 space-y-4">
          <div class="admin-surface-card space-y-3">
            <h3 class="text-sm font-extrabold text-[#251B15] m-0">شرح و موارد مورد نیاز تکلیف</h3>
            <p class="text-xs text-[#3E3027] m-0 leading-relaxed">${toPersianDigits(hw.description)}</p>
            <div class="pt-3 border-t border-[#E6D8C5] flex items-center justify-between gap-2 flex-wrap">
              <span class="text-xs text-[#6E5D4F]">فایل راهنمای مدرس: <strong class="text-[#5A3A22]">${toPersianDigits(hw.attachmentName)}</strong></span>
              <button
                type="button"
                class="btn-admin-action !h-8 !text-xs js-st-download-hw-guide"
                data-id="${hw.id}"
              >
                دانلود فایل راهنما
              </button>
            </div>
          </div>

          ${
            existingSub
              ? `
              <div class="admin-surface-card space-y-3.5 ${
                existingSub.score !== null ? 'border-[#A7F3D0] bg-[#FAFDFC]' : ''
              }">
                <div class="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-[#E6D8C5]">
                  <div>
                    <h3 class="text-sm font-black text-[#251B15] m-0">نتیجه ارزیابی و پاسخ ارسالی</h3>
                    <div class="text-[11px] font-bold text-[#6E5D4F] mt-1">
                      دانش‌آموز: <strong class="text-[#251B15]">${toPersianDigits(studentDisplayName)}</strong> · زمان ثبت: <span class="tabular-nums">${toPersianDigits(existingSub.submittedAt)}</span>
                    </div>
                  </div>
                  ${
                    existingSub.score !== null
                      ? `<div class="px-3.5 py-2 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-center shrink-0">
                          <div class="text-[10.5px] font-bold text-[#047857]">نمره کسب‌شده</div>
                          <div class="text-base font-black text-[#059669] tabular-nums mt-0.5">
                            ${toPersianDigits(existingSub.score)} <span class="text-xs font-bold">از ${toPersianDigits(hw.maxScore)}</span>
                          </div>
                        </div>`
                      : `<span class="px-3 py-1.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs font-extrabold text-[#D97706]">
                          در انتظار بررسی و نمره‌دهی مدرس
                        </span>`
                  }
                </div>

                <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] space-y-2">
                  <div class="text-xs font-extrabold text-[#5A3A22]">متن پاسخ ارسالی شما:</div>
                  <div class="text-xs text-[#251B15] leading-relaxed whitespace-pre-line">
                    ${toPersianDigits(existingSub.fileContent)}
                  </div>
                  <div class="text-[11px] text-[#6E5D4F] pt-2 border-t border-[#E6D8C5] flex items-center justify-between flex-wrap gap-2">
                    <span>
                      فایل ضمیمه:
                      <strong class="text-[#1B5E5A]">
                        ${existingSub.fileName ? toPersianDigits(existingSub.fileName) : 'بدون فایل ضمیمه'}
                      </strong>
                    </span>
                    ${
                      existingSub.fileName
                        ? `<button
                            type="button"
                            class="btn-admin-action !h-7 !px-2.5 !text-[11px] js-st-download-own-submission"
                            data-id="${existingSub.id}"
                          >
                            دانلود فایل ارسالی
                          </button>`
                        : ''
                    }
                  </div>
                </div>

                ${
                  existingSub.score !== null || existingSub.teacherFeedback
                    ? `<div class="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] space-y-1.5">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-xs font-black text-[#065F46]">بازخورد و نظر مدرس:</span>
                          <span class="text-[11px] font-extrabold text-[#059669]">تصحیح شده</span>
                        </div>
                        <p class="text-xs text-[#064E3B] m-0 leading-relaxed whitespace-pre-line">
                          ${toPersianDigits(existingSub.teacherFeedback || 'تکلیف شما بررسی و نمره نهایی ثبت گردید.')}
                        </p>
                      </div>`
                    : `<p class="text-xs text-[#6E5D4F] m-0">تکلیف شما در تاریخ ${toPersianDigits(existingSub.submittedAt)} ارسال شده است و پس از تصحیح مدرس، نمره و بازخورد در این بخش قرار می‌گیرد.</p>`
                }
              </div>`
              : ''
          }
        </div>

        <!-- ستون چپ: فرم ارسال یا بروزرسانی پاسخ و فایل تکلیف (یا پیام قفل شدن تکلیف) -->
        <div class="lg:col-span-6 admin-surface-card">
          ${
            isSubmissionBlocked
              ? `
              <div class="space-y-3">
                <h3 class="text-sm font-extrabold text-[#251B15] m-0">
                  وضعیت ارسال و ویرایش پاسخ تکلیف
                </h3>
                <div class="p-4 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] space-y-2">
                  <div class="text-xs font-extrabold text-[#E11D48]">
                    ${
                      lockInfo.isClosedByAdmin
                        ? 'این تکلیف توسط مدرس بسته شده است.'
                        : lockInfo.isDeadlineExpired
                        ? 'مهلت ارسال این تکلیف به پایان رسیده است.'
                        : 'این تکلیف توسط مدرس تصحیح و نمره‌دهی شده است.'
                    }
                  </div>
                  <p class="text-xs text-[#881337] m-0 leading-relaxed">
                    ${
                      lockInfo.isClosedByAdmin
                        ? 'امکان ارسال پاسخ جدید یا ویرایش پاسخ قبلی برای تکالیف بسته‌شده وجود ندارد.'
                        : lockInfo.isDeadlineExpired
                        ? `مهلت تحویل این تکلیف (${toPersianDigits(hw.dueDate)}) به پایان رسیده است و سامانه به صورت خودکار امکان ارسال یا ویرایش پاسخ را غیرفعال کرده است.`
                        : 'پس از ثبت نمره نهایی توسط مدرس، امکان ویرایش پاسخ ارسالی وجود ندارد.'
                    }
                  </p>
                </div>
                <div class="pt-2">
                  <button type="button" class="btn-admin-action !h-10 w-full js-st-back-to-hw-list">
                    بازگشت به لیست تکالیف
                  </button>
                </div>
              </div>
              `
              : `
              <h3 class="text-sm font-extrabold text-[#251B15] mb-3.5 m-0">
                ${existingSub ? 'ویرایش و ارسال مجدد پاسخ تکلیف' : 'فرم ارسال پاسخ و فایل تکلیف'}
              </h3>

              <form id="form-student-submit-hw" data-hw-id="${hw.id}" class="space-y-3.5">
                <div>
                  <label class="scool-field-label">توضیحات و متن پاسخ شما</label>
                  <textarea
                    id="st-hw-response-text"
                    class="school-textarea !min-h-[115px]"
                    placeholder="توضیحات مربوط به نحوه انجام تمرین یا کدهای خود را بنویسید..."
                    required
                  >${existingSub ? toPersianDigits(existingSub.fileContent) : ''}</textarea>
                </div>

                <div>
                  <label class="scool-field-label">فایل پروژه / تمرین ارسالی (اختیاری)</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      id="st-hw-filename"
                      class="school-input flex-1"
                      placeholder="فایلی انتخاب نشده است (در صورت نیاز فایل را انتخاب کنید)"
                      value="${
                        pendingStudentHwFileName
                          ? toPersianDigits(pendingStudentHwFileName)
                          : existingSub && existingSub.fileName
                          ? toPersianDigits(existingSub.fileName)
                          : ''
                      }"
                    />
                    <label for="st-hw-file-input" class="btn-admin-action !h-[42px] cursor-pointer shrink-0">
                      انتخاب فایل
                    </label>
                    <input type="file" id="st-hw-file-input" class="hidden" />
                  </div>
                  <div id="st-hw-upload-progress-box" class="hidden"></div>
                </div>

                <div class="flex items-center gap-2 pt-2">
                  <button type="submit" id="btn-st-submit-hw" class="btn-admin-primary !h-10 flex-1">
                    ${existingSub ? 'بروزرسانی پاسخ ارسالی' : 'ثبت و ارسال نهایی تکلیف'}
                  </button>
                  <button type="button" class="btn-admin-action !h-10 js-st-back-to-hw-list">
                    انصراف
                  </button>
                </div>
              </form>
              `
          }
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   3. نمرات من: بصورت کارت با دکمه جزئیات (مودال)، مثبت‌ها سبز و منفی‌ها قرمز
   ============================================================================ */
function renderStudentGrades($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);
  const myEntries = state.gradebookEntries.filter((e) => e.studentId === student.id);

  const totalPositives = myEntries.reduce((sum, e) => sum + (e.positiveCount || 0), 0);
  const totalNegatives = myEntries.reduce((sum, e) => sum + (e.negativeCount || 0), 0);
  const presentCount = myEntries.filter((e) => e.attendance === 'present').length;
  const lateCount = myEntries.filter((e) => e.attendance === 'late').length;
  const absentCount = myEntries.filter((e) => e.attendance === 'absent').length;

  $container.html(`
    <div class="space-y-5">
      <!-- خلاصه وضعیت دفتر نمره و امتیازات کلاسی (مثبت سبز و منفی قرمز) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="admin-surface-card flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-[#6E5D4F]">وضعیت حضور در جلسات</div>
            <div class="text-sm font-black text-[#251B15] mt-1 tabular-nums">
              ${toPersianDigits(presentCount)} حاضر · ${toPersianDigits(lateCount)} تأخیر · ${toPersianDigits(absentCount)} غایب
            </div>
          </div>
          <span class="px-3 py-1 rounded-xl bg-[#ECFDF5] text-[#059669] text-xs font-extrabold">حضور و غیاب</span>
        </div>

        <div class="admin-surface-card flex items-center justify-between border-[#A7F3D0] bg-[#F8FEFC]">
          <div>
            <div class="text-xs font-bold text-[#047857]">مجموع امتیازات مثبت کلاسی</div>
            <div class="text-base font-black text-[#059669] mt-1 tabular-nums">
              +${toPersianDigits(totalPositives)} مثبت
            </div>
          </div>
          <span class="px-3 py-1 rounded-xl bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-xs font-extrabold">مثبت (+)</span>
        </div>

        <div class="admin-surface-card flex items-center justify-between border-[#FECDD3] bg-[#FFF9FA]">
          <div>
            <div class="text-xs font-bold text-[#BE123C]">مجموع امتیازات منفی ثبت‌شده</div>
            <div class="text-base font-black text-[#E11D48] mt-1 tabular-nums">
              −${toPersianDigits(totalNegatives)} منفی
            </div>
          </div>
          <span class="px-3 py-1 rounded-xl bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3] text-xs font-extrabold">منفی (−)</span>
        </div>
      </div>

      <!-- کارت‌های نمرات و عملکرد جلسات کلاسی -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-extrabold text-[#251B15] m-0">
            کارت‌های نمرات و عملکرد جلسات کلاس (${toPersianDigits(myEntries.length)} جلسه)
          </h3>
          <span class="text-xs font-bold text-[#6E5D4F]">
            برای مشاهده جزئیات کامل هر جلسه روی دکمه «مشاهده جزئیات» کلیک کنید
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          ${
            myEntries.length
              ? myEntries
                  .map((entry) => {
                    const session = state.gradebookSessions.find((s) => s.id === entry.sessionId);
                    return `
                      <div class="modern-class-card">
                        <div>
                          <div class="flex items-center justify-between gap-2">
                            ${formatAttendanceBadge(entry.attendance)}
                            <span class="text-[11px] font-bold text-[#6E5D4F] tabular-nums">
                              ${toPersianDigits(session ? session.sessionDate : '—')}
                            </span>
                          </div>

                          <h4 class="text-sm font-black text-[#251B15] mt-2.5 m-0 leading-snug">
                            ${toPersianDigits(session ? session.title : 'جلسه آموزشی کلاس')}
                          </h4>
                          <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">
                            ${toPersianDigits(session ? session.topic : 'بررسی مباحث و تمرین‌های کلاسی')}
                          </p>
                        </div>

                        <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-3">
                          <div class="flex items-center justify-between gap-2 flex-wrap tabular-nums">
                            <span class="inline-flex items-center gap-1.5 text-xs font-bold text-[#251B15]">
                              <span>نمره جلسه:</span>
                              ${
                                entry.classScore !== null && entry.classScore !== undefined
                                  ? `<strong class="px-2.5 py-0.5 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] font-black">${toPersianDigits(entry.classScore)} از ۲۰</strong>`
                                  : `<strong class="px-2.5 py-0.5 rounded-lg bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] font-extrabold text-[11px]">ثبت نشده</strong>`
                              }
                            </span>

                            <div class="flex items-center gap-1.5">
                              <span class="px-2.5 py-0.5 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-xs font-black">
                                مثبت: +${toPersianDigits(entry.positiveCount || 0)}
                              </span>
                              <span class="px-2.5 py-0.5 rounded-lg bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3] text-xs font-black">
                                منفی: −${toPersianDigits(entry.negativeCount || 0)}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            class="btn-admin-primary w-full !h-9 text-xs js-st-open-grade-modal"
                            data-entry-id="${entry.id}"
                          >
                            مشاهده جزئیات
                          </button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')
              : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">هنوز نمره یا جلسه‌ای در دفتر نمره برای شما ثبت نشده است.</div>`
          }
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   4. منابع آموزشی: مشاهده و دانلود فایل‌ها در پنل دانش‌آموز
   ============================================================================ */
function renderStudentResources($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);

  if (studentResSubView === 'detail' && activeStudentResId) {
    renderStudentResourceDetailPage($container, state, student, activeStudentResId);
    return;
  }

  const normalizedQuery = normalizeDigits(studentResSearchQuery.trim()).toLowerCase();

  const myResources = state.resources.filter((res) => {
    const inClass = isResourceForStudent(res, student);
    const matchesCat =
      studentResCategoryFilter === 'all' ? true : res.category === studentResCategoryFilter;
    const matchesQuery =
      !normalizedQuery ||
      res.title.toLowerCase().includes(normalizedQuery) ||
      res.description.toLowerCase().includes(normalizedQuery);
    return inClass && matchesCat && matchesQuery;
  });

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button
            type="button"
            class="admin-seg-btn js-st-res-filter ${studentResCategoryFilter === 'all' ? 'is-active' : ''}"
            data-filter="all"
          >
            همه منابع
          </button>
          <button
            type="button"
            class="admin-seg-btn js-st-res-filter ${studentResCategoryFilter === 'جزوه PDF' ? 'is-active' : ''}"
            data-filter="جزوه PDF"
          >
            جزوه PDF
          </button>
          <button
            type="button"
            class="admin-seg-btn js-st-res-filter ${studentResCategoryFilter === 'فایل تمرین' ? 'is-active' : ''}"
            data-filter="فایل تمرین"
          >
            فایل تمرین
          </button>
          <button
            type="button"
            class="admin-seg-btn js-st-res-filter ${studentResCategoryFilter === 'ویدیو ضبط‌شده' ? 'is-active' : ''}"
            data-filter="ویدیو ضبط‌شده"
          >
            ویدیو ضبط‌شده
          </button>
        </div>

        <input
          type="search"
          id="st-resource-search-input"
          class="school-input !h-9 !w-56 text-xs"
          placeholder="جستجو در منابع آموزشی..."
          value="${toPersianDigits(studentResSearchQuery)}"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        ${
          myResources.length
            ? myResources
                .map(
                  (res) => `
                  <div class="modern-class-card">
                    <div>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-[11px] font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
                          ${res.category} · ${formatStudentItemRecipient(state, student, res.classCode, res.targetStudentId, res.targetStudentName)}
                        </span>
                        <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(formatPersianDateTime(res.createdAt))}</span>
                      </div>

                      <h3 class="text-sm font-black text-[#251B15] mt-2.5 m-0 leading-snug">
                        ${toPersianDigits(res.title)}
                      </h3>
                      <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">
                        ${toPersianDigits(res.description)}
                      </p>
                    </div>

                    <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-2.5">
                      <div class="flex items-center justify-between text-[11px] text-[#6E5D4F] tabular-nums">
                        <span>فایل: <strong class="text-[#251B15]">${toPersianDigits(res.urlOrFileName)}</strong></span>
                        <span>${toPersianDigits(res.fileSize)}</span>
                      </div>

                      <div class="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          class="btn-admin-primary !h-9 text-xs js-st-open-res-detail"
                          data-id="${res.id}"
                        >
                          مشاهده جزئیات
                        </button>
                        <button
                          type="button"
                          class="btn-admin-action !h-9 text-xs js-st-download-resource"
                          data-id="${res.id}"
                        >
                          دانلود مستقیم
                        </button>
                      </div>
                    </div>
                  </div>`
                )
                .join('')
            : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">منبع آموزشی یافت نشد.</div>`
        }
      </div>
    </div>
  `);
}

function renderStudentResourceDetailPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  student: StudentRecord,
  resourceId: number
): void {
  const res = state.resources.find((r) => r.id === resourceId);
  if (!res) {
    studentResSubView = 'list';
    renderStudentResources($container, state);
    return;
  }

  markResourceViewedByStudent(state, res.id, student);

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span class="text-xs font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
            ${res.category}
          </span>
          <h2 class="text-base font-black text-[#251B15] mt-2 m-0">
            ${toPersianDigits(res.title)}
          </h2>
        </div>
        <button type="button" class="btn-admin-action js-st-back-to-res-list">
          بازگشت به منابع آموزشی ←
        </button>
      </div>

      <div class="admin-surface-card space-y-4">
        <div>
          <h3 class="text-sm font-extrabold text-[#251B15] mb-1.5 m-0">توضیحات کامل منبع آموزشی</h3>
          <p class="text-xs text-[#3E3027] m-0 leading-relaxed">${toPersianDigits(res.description)}</p>
        </div>

        <div class="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] flex items-center justify-between gap-3 flex-wrap">
          <div class="space-y-1 text-xs">
            <div>نام فایل / منبع: <strong class="text-[#5A3A22]">${toPersianDigits(res.urlOrFileName)}</strong></div>
            <div class="text-[#6E5D4F] tabular-nums">حجم: ${toPersianDigits(res.fileSize)} · تاریخ انتشار: ${toPersianDigits(res.createdAt)}</div>
          </div>

          <button
            type="button"
            class="btn-admin-primary js-st-download-resource"
            data-id="${res.id}"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>دانلود فایل منبع آموزشی</span>
          </button>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   5. اطلاعیه‌ها در پنل دانش‌آموز (شامل اطلاعیه‌های کلاس، اعلان تکلیف جدید و بازخورد اختصاصی)
   ============================================================================ */
function renderStudentAnnouncements($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);
  const normalizedQuery = normalizeDigits(studentAnnSearchQuery.trim()).toLowerCase();

  const list = state.announcements.filter((ann) => {
    const forMe = isAnnouncementForStudent(ann, student);
    const matchesQuery =
      !normalizedQuery ||
      ann.title.toLowerCase().includes(normalizedQuery) ||
      ann.content.toLowerCase().includes(normalizedQuery);
    return forMe && matchesQuery;
  });

  const unreadCount = list.filter(
    (ann) => !(ann.readers || []).some((r) => r.studentId === student.id)
  ).length;

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">
            اطلاعیه‌ها و اعلان‌های کلاس ${toPersianDigits(student.classCode || 'من')} (${toPersianDigits(list.length)})
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            اطلاعیه‌های خوانده‌نشده: <strong class="text-[#059669]">${toPersianDigits(unreadCount)} مورد</strong> — با زدن دکمه «خوانده شد»، وضعیت مطالعه شما برای مدیر نیز ثبت می‌شود.
          </p>
        </div>
        <input
          type="search"
          id="st-announcement-search"
          class="school-input !h-9 !w-56 text-xs"
          placeholder="جستجو در اطلاعیه‌ها..."
          value="${toPersianDigits(studentAnnSearchQuery)}"
        />
      </div>

      <div class="space-y-3">
        ${
          list.length
            ? list
                .map((ann) => {
                  const readLog = (ann.readers || []).find((r) => r.studentId === student.id);
                  const targetLabel = formatStudentItemRecipient(
                    state,
                    student,
                    ann.targetClasses,
                    ann.targetStudentId,
                    ann.targetStudentName
                  );
                  const createdLabel = formatPersianDateTime(ann.createdAt);

                  return `
                    <div class="admin-surface-card ${readLog ? 'opacity-95' : 'border-[#5A3A22]'}">
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-black text-[#251B15]">${toPersianDigits(ann.title)}</span>
                          <span class="text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            ann.priority === 'فوری'
                              ? 'bg-[#FFF1F2] text-[#E11D48]'
                              : ann.priority === 'مهم'
                              ? 'bg-[#FFFBEB] text-[#D97706]'
                              : 'bg-[#ECFDF5] text-[#059669]'
                          }">
                            ${ann.priority}
                          </span>
                          ${
                            ann.notificationType === 'feedback'
                              ? `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">بازخورد مدرس</span>`
                              : ann.notificationType === 'assignment'
                              ? `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#E2EFEA] text-[#1B5E5A]">تکلیف جدید</span>`
                              : ann.notificationType === 'resource'
                              ? `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#F3E5D0] text-[#5A3A22] border border-[#DFC8A9]">منبع آموزشی جدید</span>`
                              : ''
                          }
                          ${
                            !readLog
                              ? `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#D97706]">جدید (خوانده نشده)</span>`
                              : ''
                          }
                        </div>
                        <span class="text-xs text-[#6E5D4F] tabular-nums">${toPersianDigits(createdLabel)}</span>
                      </div>
                      <p class="text-xs text-[#3E3027] mt-2 m-0 leading-relaxed whitespace-pre-line">${toPersianDigits(ann.content)}</p>

                      <div class="mt-3 pt-2.5 border-t border-[#E6D8C5] flex items-center justify-between gap-2 flex-wrap">
                        <span class="text-[11px] text-[#6E5D4F]">
                          مخاطب: <strong class="text-[#5A3A22]">${targetLabel}</strong>
                        </span>

                        <div class="flex items-center gap-2 flex-wrap">
                          ${
                            ann.assignmentId
                              ? `<button
                                  type="button"
                                  class="btn-admin-action !h-8 !px-3 !text-xs js-st-open-hw-detail"
                                  data-id="${ann.assignmentId}"
                                >
                                  مشاهده تکلیف مرتبط
                                </button>`
                              : ann.notificationType === 'feedback'
                              ? `<button
                                  type="button"
                                  class="btn-admin-action !h-8 !px-3 !text-xs js-st-go-section"
                                  data-section="grades"
                                >
                                  مشاهده نمرات من
                                </button>`
                              : ann.notificationType === 'resource'
                              ? `<button
                                  type="button"
                                  class="btn-admin-action !h-8 !px-3 !text-xs js-st-go-section"
                                  data-section="resources"
                                >
                                  مشاهده منابع آموزشی
                                </button>`
                              : ''
                          }
                          ${
                            readLog
                              ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-xs font-extrabold tabular-nums">
                                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>خوانده شده (${toPersianDigits(readLog.readAt)})</span>
                                </span>`
                              : `<button
                                  type="button"
                                  class="btn-admin-primary !h-8 !px-3.5 !text-xs js-st-mark-ann-read"
                                  data-id="${ann.id}"
                                >
                                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.3">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>خوانده شد</span>
                                </button>`
                          }
                        </div>
                      </div>
                    </div>`;
                })
                .join('')
            : `<div class="admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">اطلاعیه‌ای یافت نشد.</div>`
        }
      </div>
    </div>
  `);
}

/* ============================================================================
   6. تیکت دانش‌آموز:
      - صفحه لیست و گفت‌وگوی تیکت‌ها (/student/tickets) + دکمه ایجاد تیکت در صفحه جدید
      - صفحه اختصاصی ایجاد تیکت جدید به همراه ارسال فایل (/student/tickets/create)
   ============================================================================ */
function renderStudentTickets($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);

  if (studentTicketSubView === 'create') {
    renderStudentCreateTicketPage($container, student);
    return;
  }

  const myTickets = state.tickets.filter((t) => t.studentId === student.id);

  if (!activeStudentTicketId && myTickets.length > 0) {
    activeStudentTicketId = myTickets[0].id;
  }

  const currentTicket =
    myTickets.find((t) => t.id === activeStudentTicketId) || myTickets[0] || null;

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">
            تیکت‌ها و پشتیبانی آموزشی (${toPersianDigits(myTickets.length)} تیکت)
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            سوالات درسی یا فایل‌های خود را از طریق تیکت برای مدرس ارسال نمایید.
          </p>
        </div>

        <button type="button" id="btn-st-open-create-ticket" class="btn-admin-primary !h-9">
          + ایجاد تیکت جدید
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="lg:col-span-5 admin-surface-card">
          <h3 class="text-sm font-extrabold text-[#251B15] mb-3 m-0">
            لیست تیکت‌های من (${toPersianDigits(myTickets.length)})
          </h3>
          <div class="space-y-2.5">
            ${
              myTickets.length
                ? myTickets
                    .map(
                      (tk) => `
                      <div
                        class="p-3.5 rounded-xl border cursor-pointer transition-all js-st-select-ticket ${
                          currentTicket?.id === tk.id
                            ? 'bg-[#F3ECE0] border-[#5A3A22]'
                            : 'bg-[#FDFBF7] border-[#E5DBCB]'
                        }"
                        data-id="${tk.id}"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-xs font-extrabold text-[#251B15]">${toPersianDigits(tk.subject)}</span>
                          <span class="text-[11px] font-bold ${
                            tk.status === 'پاسخ داده شده'
                              ? 'text-[#059669]'
                              : tk.status === 'بسته شده'
                              ? 'text-[#E11D48]'
                              : 'text-[#D97706]'
                          }">${tk.status}</span>
                        </div>
                        <div class="text-[11px] text-[#6E5D4F] mt-1 tabular-nums">${toPersianDigits(tk.createdAt)}</div>
                      </div>`
                    )
                    .join('')
                : `<div class="text-center py-6 text-xs text-[#6E5D4F]">تیکتی ثبت نشده است.</div>`
            }
          </div>
        </div>

        <div class="lg:col-span-7 admin-surface-card">
          ${
            currentTicket
              ? `
              <div class="pb-3 mb-3 border-b border-[#E6D8C5] flex items-center justify-between">
                <h3 class="text-sm font-extrabold text-[#251B15] m-0">${toPersianDigits(currentTicket.subject)}</h3>
                <span class="text-xs font-extrabold px-2.5 py-0.5 rounded-lg ${
                  currentTicket.status === 'بسته شده'
                    ? 'bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3]'
                    : currentTicket.status === 'پاسخ داده شده'
                    ? 'bg-[#ECFDF5] text-[#059669]'
                    : 'bg-[#FFFBEB] text-[#D97706]'
                }">${currentTicket.status}</span>
              </div>

              <div class="space-y-3 mb-4 max-h-[240px] overflow-y-auto pr-1">
                ${currentTicket.messages
                  .map(
                    (msg) => `
                    <div class="p-3.5 rounded-xl border ${
                      msg.senderRole === 'admin'
                        ? 'bg-[#F3ECE0] border-[#D4C3AE]'
                        : 'bg-[#FDFBF7] border-[#E5DBCB]'
                    }">
                      <div class="flex items-center justify-between text-[11px] font-bold text-[#251B15] mb-1">
                        <span>${msg.senderName} (${msg.senderRole === 'admin' ? 'مدرس / مدیر' : 'شما'})</span>
                        <span class="tabular-nums text-[#6E5D4F]">${toPersianDigits(msg.sentAt)}</span>
                      </div>
                      <p class="text-xs text-[#3E3027] m-0 leading-relaxed">${toPersianDigits(msg.message)}</p>
                      ${
                        msg.attachmentName
                          ? `
                          <div class="mt-2.5 pt-2 border-t border-[#E5DBCB] flex items-center justify-between gap-2">
                            <span class="text-[11px] font-bold text-[#1B5E5A]">فایل ضمیمه: ${toPersianDigits(msg.attachmentName)}</span>
                            <button
                              type="button"
                              class="btn-admin-action !h-7 !px-2.5 !text-[11px] js-st-download-ticket-file"
                              data-ticket-id="${currentTicket.id}"
                              data-msg-id="${msg.id}"
                            >
                              دانلود فایل
                            </button>
                          </div>`
                          : ''
                      }
                    </div>`
                  )
                  .join('')}
              </div>

              ${
                currentTicket.status === 'بسته شده'
                  ? `
                  <div class="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-xs font-extrabold text-[#E11D48] leading-relaxed">
                    این تیکت توسط مدیریت بسته شده است و امکان ارسال پیام یا فایل جدید در آن وجود ندارد.
                  </div>
                  `
                  : `
                  <form id="form-student-reply-ticket" data-id="${currentTicket.id}" class="space-y-3">
                    <div>
                      <label class="scool-field-label">ارسال پیام جدید در این تیکت</label>
                      <textarea
                        id="st-ticket-reply-text"
                        class="school-textarea !min-h-[70px]"
                        placeholder="پیام خود را بنویسید..."
                        required
                      ></textarea>
                    </div>
                    <div id="st-ticket-reply-upload-progress" class="hidden"></div>
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                      <div class="flex items-center gap-2">
                        <label for="st-ticket-reply-file" class="btn-admin-action cursor-pointer">
                          <span>افزودن فایل ضمیمه</span>
                        </label>
                        <input type="file" id="st-ticket-reply-file" class="hidden" />
                        <span id="st-ticket-attached-name" class="text-xs font-bold text-[#1B5E5A]">
                          ${pendingStudentTicketFileName ? toPersianDigits(pendingStudentTicketFileName) : 'فایلی انتخاب نشده'}
                        </span>
                      </div>
                      <button type="submit" id="btn-st-submit-reply-ticket" class="btn-admin-primary">ارسال پیام</button>
                    </div>
                  </form>
                  `
              }
            `
              : `<div class="text-center py-8 text-xs text-[#6E5D4F]">یک تیکت را انتخاب کنید یا تیکت جدید ثبت نمایید.</div>`
          }
        </div>
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی ایجاد تیکت جدید در پنل دانش‌آموز (/student/tickets/create) به همراه پیوست فایل
 */
function renderStudentCreateTicketPage(
  $container: JQuery<HTMLElement>,
  student: StudentRecord
): void {
  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-base font-black text-[#251B15] m-0">
            صفحه ایجاد و ارسال تیکت جدید به مدرس
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            سوال درسی، درخواست راهنمایی یا فایل تمرین خود را در این صفحه ثبت و ارسال کنید.
          </p>
        </div>

        <button type="button" class="btn-admin-action js-st-back-to-tickets">
          بازگشت به لیست تیکت‌ها ←
        </button>
      </div>

      <div class="admin-surface-card">
        <form id="form-student-new-ticket" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="md:col-span-2">
              <label class="scool-field-label">موضوع تیکت</label>
              <input
                type="text"
                id="st-new-ticket-subject"
                class="school-input"
                placeholder="مثلاً: سوال در مورد چیدمان پروژه طراحی وب"
                required
              />
            </div>

            <div>
              <label class="scool-field-label">درجه اهمیت</label>
              <select id="st-new-ticket-priority" class="school-select">
                <option value="عادی">عادی</option>
                <option value="مهم">مهم</option>
                <option value="فوری">فوری</option>
              </select>
            </div>
          </div>

          <div>
            <label class="scool-field-label">متن کامل پیام / سوال شما</label>
            <textarea
              id="st-new-ticket-msg"
              class="school-textarea !min-h-[120px]"
              placeholder="شرح کامل سوال یا توضیحات خود را برای مدرس بنویسید..."
              required
            ></textarea>
          </div>

          <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] space-y-2">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2.5">
                <label for="st-new-ticket-file" class="btn-admin-action cursor-pointer">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span>انتخاب فایل ضمیمه (اختیاری)</span>
                </label>
                <input type="file" id="st-new-ticket-file" class="hidden" />
                <span id="st-new-ticket-file-name" class="text-xs font-bold text-[#1B5E5A]">
                  ${
                    pendingNewTicketFileName
                      ? `فایل انتخاب‌شده: ${toPersianDigits(pendingNewTicketFileName)}`
                      : 'فایلی انتخاب نشده است'
                  }
                </span>
              </div>

              <span class="text-[11px] text-[#6E5D4F]">
                فرستنده: ${student.firstName} ${student.lastName} (کلاس ${toPersianDigits(student.classCode || '۹۰۱')})
              </span>
            </div>
            <div id="st-new-ticket-upload-progress" class="hidden"></div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E6D8C5]">
            <button type="button" class="btn-admin-action !h-10 js-st-back-to-tickets">
              انصراف و بازگشت
            </button>
            <button type="submit" id="btn-st-submit-new-ticket" class="btn-admin-primary !h-10">
              ثبت و ارسال نهایی تیکت
            </button>
          </div>
        </form>
      </div>
    </div>
  `);
}

/* ============================================================================
   7. پروفایل دانش‌آموز: تصویر پروفایل (با امکان تغییر و حذف عکس)، مشخصات فردی و تغییر رمز عبور
      شماره تلفن ثبت‌نامی کاملاً غیرقابل ویرایش (readonly + disabled) است.
   ============================================================================ */
function renderStudentProfile($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);

  let avatarBoxHtml = '';
  if (student.avatarUrl && !student.avatarRemoved) {
    avatarBoxHtml = `<div class="student-avatar-lg has-custom-avatar" style="background-image: url('${student.avatarUrl}');" role="img" aria-label="تصویر پروفایل دانش‌آموز"></div>`;
  } else {
    avatarBoxHtml = `<div class="student-avatar-lg bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]" style="background-image: none;" role="img" aria-label="آواتار پیش‌فرض دانش‌آموز">
      <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>`;
  }

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div class="lg:col-span-7 admin-surface-card">
        <div class="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-[#E6D8C5] flex-wrap">
          <div class="flex items-center gap-4">
            ${avatarBoxHtml}
            <div>
              <h3 class="text-base font-black text-[#251B15] m-0">
                ${student.firstName} ${student.lastName}
              </h3>
              <p class="text-xs font-bold text-[#1B5E5A] mt-1 m-0">
                ${student.classCode ? `دانش‌آموز کلاس ${toPersianDigits(student.classCode)}` : 'بدون کلاس'}
              </p>
              <p class="text-xs text-[#6E5D4F] mt-1 m-0 tabular-nums">
                شماره تلفن: ${toPersianDigits(student.phone)}
              </p>
              ${
                student.email
                  ? `<p class="text-xs text-[#5A3A22] mt-1 m-0" dir="ltr">${student.email}</p>`
                  : ''
              }
              ${
                student.bio
                  ? `<p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed max-w-md">${toPersianDigits(student.bio)}</p>`
                  : ''
              }
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <label for="st-prof-avatar-upload" class="btn-admin-action cursor-pointer">
              <span>تغییر تصویر پروفایل</span>
            </label>
            <input type="file" id="st-prof-avatar-upload" accept="image/*" class="hidden" />

            <button
              type="button"
              id="btn-st-delete-avatar"
              class="btn-admin-danger !h-9 !px-3 text-xs"
            >
              حذف عکس پروفایل
            </button>
          </div>
        </div>

        <form id="form-student-profile-save" class="space-y-3.5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">نام</label>
              <input type="text" id="st-prof-firstname" class="school-input" value="${student.firstName}" required />
            </div>
            <div>
              <label class="scool-field-label">نام خانوادگی</label>
              <input type="text" id="st-prof-lastname" class="school-input" value="${student.lastName}" required />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">شماره تلفن ثبت‌نامی (غیرقابل تغییر)</label>
              <input
                type="tel"
                id="st-prof-phone"
                class="school-input tabular-nums !bg-[#F3ECE0] !text-[#6E5D4F] cursor-not-allowed"
                value="${toPersianDigits(student.phone)}"
                readonly
                disabled
                aria-readonly="true"
              />
            </div>
            <div>
              <label class="scool-field-label">کلاس ثبت‌شده</label>
              <input
                type="text"
                class="school-input !bg-[#F3ECE0] !text-[#6E5D4F] cursor-not-allowed"
                value="${student.classCode ? `کلاس ${toPersianDigits(student.classCode)}` : '—'}"
                readonly
                disabled
              />
            </div>
          </div>

          <div>
            <label class="scool-field-label">پست الکترونیکی (Email — الزامی)</label>
            <input
              type="email"
              id="st-prof-email"
              class="school-input"
              dir="ltr"
              placeholder="student@example.com"
              value="${student.email || ''}"
              required
            />
          </div>

          <div>
            <label class="scool-field-label">بیوگرافی و معرفی کوتاه (حداکثر ۵۰۰ کاراکتر)</label>
            <textarea
              id="st-prof-bio"
              class="school-textarea !min-h-[82px]"
              maxlength="500"
              placeholder="علاقه‌مندی‌های درسی، مهارت‌ها یا معرفی کوتاه خود را بنویسید..."
            >${student.bio || ''}</textarea>
          </div>

          <button type="submit" id="btn-st-save-profile" class="btn-admin-primary">ذخیره مشخصات پروفایل</button>
        </form>
      </div>

      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-4 m-0">تغییر رمز عبور دانش‌آموز</h3>
        <form id="form-student-change-pass" class="space-y-3.5">
          <div>
            <label class="scool-field-label">رمز عبور جدید (حداقل ۶ کاراکتر)</label>
            <input type="password" id="st-new-pass" class="school-input" placeholder="حداقل ۶ کاراکتر" required />
          </div>
          <div>
            <label class="scool-field-label">تکرار رمز عبور جدید</label>
            <input type="password" id="st-confirm-pass" class="school-input" placeholder="تکرار رمز عبور" required />
          </div>
          <button type="submit" id="btn-st-save-password" class="btn-admin-primary w-full">بروزرسانی رمز عبور</button>
        </form>
      </div>
    </div>
  `);
}

async function startStudentHwFileUpload(file: File): Promise<void> {
  lastSelectedHwFile = file;
  isUploadingStudentHwFile = true;
  pendingStudentHwFileName = file.name;
  pendingStudentHwFileDataUrl = '';
  $('#st-hw-filename').val(toPersianDigits(file.name));
  $('#btn-st-submit-hw').prop('disabled', true);

  renderUploadProgressWidget('#st-hw-upload-progress-box', {
    status: 'uploading',
    percent: 0,
    fileName: file.name,
  });

  const result = await uploadFileWithProgress(file, (pct) => {
    renderUploadProgressWidget('#st-hw-upload-progress-box', {
      status: 'uploading',
      percent: pct,
      fileName: file.name,
    });
  });

  isUploadingStudentHwFile = false;
  $('#btn-st-submit-hw').prop('disabled', false);

  if (result.success && result.fileUrl) {
    pendingStudentHwFileDataUrl = result.fileUrl;
    renderUploadProgressWidget('#st-hw-upload-progress-box', {
      status: 'success',
      percent: 100,
      fileName: file.name,
      fileSize: result.fileSize,
    });
  } else {
    pendingStudentHwFileDataUrl = '';
    renderUploadProgressWidget('#st-hw-upload-progress-box', {
      status: 'error',
      fileName: file.name,
      errorMessage: result.message || 'آپلود فایل ناموفق بود.',
      retryActionClass: 'js-retry-st-hw-upload',
    });
    showToast('خطا در آپلود فایل تکلیف', result.message || 'آپلود فایل ناموفق بود.', 'error');
  }
}

async function startNewTicketFileUpload(file: File): Promise<void> {
  lastSelectedNewTicketFile = file;
  isUploadingNewTicketFile = true;
  pendingNewTicketFileName = file.name;
  pendingNewTicketFileDataUrl = '';
  $('#st-new-ticket-file-name').text(`در حال آپلود: ${toPersianDigits(file.name)}`);
  $('#btn-st-submit-new-ticket').prop('disabled', true);

  renderUploadProgressWidget('#st-new-ticket-upload-progress', {
    status: 'uploading',
    percent: 0,
    fileName: file.name,
  });

  const result = await uploadFileWithProgress(file, (pct) => {
    renderUploadProgressWidget('#st-new-ticket-upload-progress', {
      status: 'uploading',
      percent: pct,
      fileName: file.name,
    });
  });

  isUploadingNewTicketFile = false;
  $('#btn-st-submit-new-ticket').prop('disabled', false);

  if (result.success && result.fileUrl) {
    pendingNewTicketFileDataUrl = result.fileUrl;
    $('#st-new-ticket-file-name').text(
      `فایل آماده ارسال: ${toPersianDigits(file.name)} (${toPersianDigits(result.fileSize || '')})`
    );
    renderUploadProgressWidget('#st-new-ticket-upload-progress', {
      status: 'success',
      percent: 100,
      fileName: file.name,
      fileSize: result.fileSize,
    });
  } else {
    pendingNewTicketFileDataUrl = '';
    $('#st-new-ticket-file-name').text('خطا در آپلود فایل');
    renderUploadProgressWidget('#st-new-ticket-upload-progress', {
      status: 'error',
      fileName: file.name,
      errorMessage: result.message || 'آپلود فایل ضمیمه ناموفق بود.',
      retryActionClass: 'js-retry-st-new-ticket-upload',
    });
    showToast('خطا در آپلود پیوست تیکت', result.message || 'آپلود فایل ناموفق بود.', 'error');
  }
}

async function startReplyTicketFileUpload(file: File): Promise<void> {
  lastSelectedReplyTicketFile = file;
  isUploadingReplyTicketFile = true;
  pendingStudentTicketFileName = file.name;
  pendingStudentTicketFileDataUrl = '';
  $('#st-ticket-attached-name').text(`در حال آپلود: ${toPersianDigits(file.name)}`);
  $('#btn-st-submit-reply-ticket').prop('disabled', true);

  renderUploadProgressWidget('#st-ticket-reply-upload-progress', {
    status: 'uploading',
    percent: 0,
    fileName: file.name,
  });

  const result = await uploadFileWithProgress(file, (pct) => {
    renderUploadProgressWidget('#st-ticket-reply-upload-progress', {
      status: 'uploading',
      percent: pct,
      fileName: file.name,
    });
  });

  isUploadingReplyTicketFile = false;
  $('#btn-st-submit-reply-ticket').prop('disabled', false);

  if (result.success && result.fileUrl) {
    pendingStudentTicketFileDataUrl = result.fileUrl;
    $('#st-ticket-attached-name').text(
      `پیوست آماده: ${toPersianDigits(file.name)} (${toPersianDigits(result.fileSize || '')})`
    );
    renderUploadProgressWidget('#st-ticket-reply-upload-progress', {
      status: 'success',
      percent: 100,
      fileName: file.name,
      fileSize: result.fileSize,
    });
  } else {
    pendingStudentTicketFileDataUrl = '';
    $('#st-ticket-attached-name').text('خطا در آپلود فایل');
    renderUploadProgressWidget('#st-ticket-reply-upload-progress', {
      status: 'error',
      fileName: file.name,
      errorMessage: result.message || 'آپلود فایل ضمیمه ناموفق بود.',
      retryActionClass: 'js-retry-st-reply-ticket-upload',
    });
    showToast('خطا در آپلود پیوست تیکت', result.message || 'آپلود فایل ناموفق بود.', 'error');
  }
}

export function initStudentPanelEvents(): void {
  // Automatically re-render Student Panel when initial MySQL state finishes loading
  onDbStateSynced(() => {
    if (!$('#student-workspace-view').hasClass('view-hidden')) {
      renderActiveStudentSection();
    }
  });

  $(document).on('click', '.student-nav-btn, .js-st-go-section', function () {
    const sec = $(this).data('section') as StudentSectionId;
    if (sec) {
      navigateStudentSection(sec);
    }
  });

  $('#btn-student-logout').on('click', () => {
    setActiveUserRole('');
    setActiveStudentSessionId(0);
    $('#student-workspace-view').addClass('view-hidden');
    $('#public-auth-view').removeClass('view-hidden');
    updateBrowserUrl('/login');
    showToast('خروج از حساب دانش‌آموز', 'با موفقیت از پنل دانش‌آموزی خارج شدید.', 'info');
  });

  // Open Assignment Detail Page in Student Panel
  $(document).on('click', '.js-st-open-hw-detail', function () {
    activeStudentHwId = Number($(this).attr('data-id'));
    pendingStudentHwFileName = '';
    pendingStudentHwFileDataUrl = '';
    isUploadingStudentHwFile = false;
    lastSelectedHwFile = null;
    activeStudentSection = 'assignments';
    studentHwSubView = 'detail';
    $('.student-nav-btn').removeClass('is-active');
    $('.student-nav-btn[data-section="assignments"]').addClass('is-active');
    updateBrowserUrl('/student/assignments/detail');
    renderActiveStudentSection();
  });

  $(document).on('click', '.js-st-back-to-hw-list', function () {
    studentHwSubView = 'list';
    updateBrowserUrl('/student/assignments');
    renderActiveStudentSection();
  });

  $(document).on('click', '.js-st-download-hw-guide', function () {
    const hwId = Number($(this).attr('data-id'));
    const state = loadDbState();
    const hw = state.assignments.find((a) => a.id === hwId);
    if (!hw) return;
    triggerStudentFileDownload(
      hw.attachmentName,
      hw.attachmentDataUrl,
      `فایل راهنمای تکلیف: ${hw.title}\n\n${hw.description}`
    );
  });

  $(document).on('change', '#st-hw-file-input', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    void startStudentHwFileUpload(file);
  });

  $(document).on('click', '.js-retry-st-hw-upload', function () {
    if (lastSelectedHwFile) {
      void startStudentHwFileUpload(lastSelectedHwFile);
    }
  });

  $(document).on('click', '.js-st-download-own-submission', function () {
    const subId = Number($(this).attr('data-id'));
    const state = loadDbState();
    const sub = state.submissions.find((s) => s.id === subId);
    if (!sub || !sub.fileName) return;
    triggerStudentFileDownload(
      sub.fileName,
      sub.fileDataUrl,
      `پاسخ ارسالی دانش‌آموز: ${sub.studentName}\nزمان ارسال: ${sub.submittedAt}\n\n${sub.fileContent}`
    );
  });

  $(document).on('submit', '#form-student-submit-hw', async function (e) {
    e.preventDefault();
    if (isUploadingStudentHwFile) {
      showToast('در حال آپلود فایل', 'لطفاً تا تکمیل آپلود فایل صبر کنید.', 'info');
      return;
    }

    const hwId = Number($(this).attr('data-hw-id'));
    const responseText = String($('#st-hw-response-text').val() || '').trim();
    const fileName = String(
      $('#st-hw-filename').val() || pendingStudentHwFileName || ''
    ).trim();
    if (!responseText) return;

    const state = loadDbState();
    const student = getActiveStudent(state);
    const hw = state.assignments.find((a) => a.id === hwId);
    if (!hw) return;

    const lockInfo = getAssignmentLockState(hw, getAuthoritativeNowMs());
    if (lockInfo.isLocked) {
      showToast('ارسال تکلیف مجاز نیست', lockInfo.reasonMessage, 'error');
      renderActiveStudentSection();
      return;
    }

    const $btn = $('#btn-st-submit-hw');
    if ($btn.prop('disabled')) return;
    const origHtml = $btn.html();
    $btn.prop('disabled', true).text('در حال ثبت در سرور...');

    try {
      const existing = state.submissions.find(
        (s) => s.assignmentId === hwId && s.studentId === student.id
      );

      const apiRes = await studentSubmitAssignmentApi(hwId, {
        studentId: student.id,
        fileName,
        fileContent: responseText,
        fileDataUrl: pendingStudentHwFileDataUrl || existing?.fileDataUrl,
      });

      if (!apiRes.success) {
        await syncStateFromBackend();
        renderActiveStudentSection();
        showToast('خطا در ارسال تکلیف', apiRes.message, 'error');
        return;
      }

      await syncStateFromBackend();
      studentHwSubView = 'list';
      updateBrowserUrl('/student/assignments');
      renderActiveStudentSection();
      showToast('تکلیف ارسال شد', apiRes.message, 'success');
    } finally {
      $btn.prop('disabled', false).html(origHtml);
    }
  });

  // Student Grades Detail Modal
  $(document).on('click', '.js-st-open-grade-modal', function () {
    const entryId = Number($(this).attr('data-entry-id'));
    const state = loadDbState();
    const entry = state.gradebookEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const session = state.gradebookSessions.find((s) => s.id === entry.sessionId);

    $('#st-grade-modal-title').text(
      toPersianDigits(session ? session.title : 'جزئیات نمره و عملکرد جلسه')
    );
    $('#st-grade-modal-date').text(
      `تاریخ برگزاری: ${toPersianDigits(session ? session.sessionDate : '—')} · کلاس ${toPersianDigits(entry.classCode)}`
    );
    $('#st-grade-modal-attendance').html(formatAttendanceBadge(entry.attendance));

    $('#st-grade-modal-body').html(`
      <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] space-y-2">
        <div class="text-xs font-extrabold text-[#5A3A22]">مبحث آموزشی جلسه:</div>
        <div class="text-xs text-[#251B15] leading-relaxed">
          ${toPersianDigits(session ? session.topic : 'بررسی مباحث و تمرین‌های کلاسی')}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 tabular-nums">
        <div class="p-3 rounded-xl ${
          entry.classScore !== null && entry.classScore !== undefined
            ? 'bg-[#ECFDF5] border border-[#A7F3D0]'
            : 'bg-[#FFFBEB] border border-[#FDE68A]'
        } text-center">
          <div class="text-[11px] font-bold ${
            entry.classScore !== null && entry.classScore !== undefined
              ? 'text-[#047857]'
              : 'text-[#B45309]'
          }">نمره کلاسی جلسه</div>
          <div class="text-sm font-black ${
            entry.classScore !== null && entry.classScore !== undefined
              ? 'text-[#059669]'
              : 'text-[#D97706]'
          } mt-1">
            ${entry.classScore !== null && entry.classScore !== undefined ? `${toPersianDigits(entry.classScore)} از ۲۰` : 'ثبت نشده'}
          </div>
        </div>

        <div class="p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-center">
          <div class="text-[11px] font-bold text-[#047857]">امتیاز مثبت</div>
          <div class="text-sm font-black text-[#059669] mt-1">
            +${toPersianDigits(entry.positiveCount || 0)}
          </div>
        </div>

        <div class="p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-center">
          <div class="text-[11px] font-bold text-[#BE123C]">امتیاز منفی</div>
          <div class="text-sm font-black text-[#E11D48] mt-1">
            −${toPersianDigits(entry.negativeCount || 0)}
          </div>
        </div>
      </div>

      <div class="p-3.5 rounded-xl bg-[#F3ECE0] border border-[#DFD2C0] space-y-1.5">
        <div class="text-xs font-extrabold text-[#5A3A22]">یادداشت و بازخورد مدرس در این جلسه:</div>
        <p class="text-xs text-[#251B15] m-0 leading-relaxed">
          ${toPersianDigits(entry.teacherNote || 'یادداشتی برای این جلسه ثبت نشده است.')}
        </p>
      </div>
    `);

    $('#student-grade-detail-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  // Student Resources Filter, Search, Detail & Download
  $(document).on('click', '.js-st-res-filter', function () {
    studentResCategoryFilter = String($(this).attr('data-filter') || 'all');
    renderActiveStudentSection();
  });

  $(document).on('input', '#st-resource-search-input', function () {
    studentResSearchQuery = String($(this).val() || '');
    renderActiveStudentSection('#st-resource-search-input');
  });

  $(document).on('click', '.js-st-open-res-detail', function () {
    activeStudentResId = Number($(this).attr('data-id'));
    studentResSubView = 'detail';
    updateBrowserUrl('/student/resources/detail');
    renderActiveStudentSection();
  });

  $(document).on('click', '.js-st-back-to-res-list', function () {
    studentResSubView = 'list';
    updateBrowserUrl('/student/resources');
    renderActiveStudentSection();
  });

  $(document).on('click', '.js-st-download-resource', function () {
    const resId = Number($(this).attr('data-id'));
    const state = loadDbState();
    const student = getActiveStudent(state);
    const res = state.resources.find((r) => r.id === resId);
    if (!res) return;
    markResourceViewedByStudent(state, res.id, student);
    triggerStudentFileDownload(
      res.urlOrFileName,
      res.fileDataUrl,
      `منبع آموزشی: ${res.title}\nنوع: ${res.category}\n\n${res.description}`
    );
  });

  // Student Announcements Search & Mark Read
  $(document).on('input', '#st-announcement-search', function () {
    studentAnnSearchQuery = String($(this).val() || '');
    renderActiveStudentSection('#st-announcement-search');
  });

  $(document).on('click', '.js-st-mark-ann-read', async function () {
    const $btn = $(this);
    if ($btn.prop('disabled')) return;
    const annId = Number($btn.attr('data-id'));
    const state = loadDbState();
    const student = getActiveStudent(state);
    const ann = state.announcements.find((a) => a.id === annId);
    if (!ann) return;

    $btn.prop('disabled', true).text('در حال ثبت...');
    if (!ann.readers) {
      ann.readers = [];
    }
    const alreadyRead = ann.readers.some((r) => r.studentId === student.id);
    if (!alreadyRead) {
      ann.readers.push({
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        classCode: student.classCode || '901',
        readAt: formatPersianDateTime(new Date()),
      });
    }

    const saved = await persistDbState(state);
    if (!saved.success) {
      $btn.prop('disabled', false).text('خوانده شد');
      showToast('خطا در ثبت وضعیت مطالعه', saved.message, 'error');
      return;
    }

    renderActiveStudentSection();
    showToast(
      'اطلاعیه خوانده شد',
      'وضعیت مطالعه اطلاعیه در پایگاه داده ثبت گردید و از شمارنده اطلاعیه‌های جدید کسر شد.',
      'success'
    );
  });

  // Student Tickets: Open Create Page, Back to List, File Upload & Submit
  $(document).on('click', '#btn-st-open-create-ticket', function () {
    pendingNewTicketFileName = '';
    pendingNewTicketFileDataUrl = '';
    isUploadingNewTicketFile = false;
    lastSelectedNewTicketFile = null;
    studentTicketSubView = 'create';
    updateBrowserUrl('/student/tickets/create');
    renderActiveStudentSection();
  });

  $(document).on('click', '.js-st-back-to-tickets', function () {
    studentTicketSubView = 'list';
    updateBrowserUrl('/student/tickets');
    renderActiveStudentSection();
  });

  $(document).on('change', '#st-new-ticket-file', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) {
      pendingNewTicketFileName = '';
      pendingNewTicketFileDataUrl = '';
      renderUploadProgressWidget('#st-new-ticket-upload-progress', { status: 'idle' });
      $('#st-new-ticket-file-name').text('فایلی انتخاب نشده است');
      return;
    }
    void startNewTicketFileUpload(file);
  });

  $(document).on('click', '.js-retry-st-new-ticket-upload', function () {
    if (lastSelectedNewTicketFile) {
      void startNewTicketFileUpload(lastSelectedNewTicketFile);
    }
  });

  $(document).on('click', '.js-st-select-ticket', function () {
    activeStudentTicketId = Number($(this).attr('data-id'));
    pendingStudentTicketFileName = '';
    pendingStudentTicketFileDataUrl = '';
    isUploadingReplyTicketFile = false;
    lastSelectedReplyTicketFile = null;
    renderActiveStudentSection();
  });

  $(document).on('submit', '#form-student-new-ticket', async function (e) {
    e.preventDefault();
    if (isUploadingNewTicketFile) {
      showToast('در حال آپلود پیوست', 'لطفاً تا پایان آپلود فایل ضمیمه صبر کنید.', 'info');
      return;
    }

    const subject = String($('#st-new-ticket-subject').val() || '').trim();
    const priority = String($('#st-new-ticket-priority').val() || 'عادی') as
      | 'عادی'
      | 'مهم'
      | 'فوری';
    const msg = String($('#st-new-ticket-msg').val() || '').trim();
    if (!subject || !msg) return;

    const $btn = $('#btn-st-submit-new-ticket');
    if ($btn.prop('disabled')) return;
    const origText = $btn.text();
    $btn.prop('disabled', true).text('در حال ارسال تیکت...');

    try {
      const state = loadDbState();
      const student = getActiveStudent(state);
      const newTicketId = Date.now();
      const nowFa = formatPersianDateTime(new Date());

      state.tickets.unshift({
        id: newTicketId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentPhone: student.phone,
        classCode: student.classCode || '901',
        subject,
        priority,
        status: 'در انتظار پاسخ',
        createdAt: nowFa,
        messages: [
          {
            id: Date.now() + 1,
            senderRole: 'student',
            senderName: `${student.firstName} ${student.lastName}`,
            message: msg,
            sentAt: nowFa,
            attachmentName: pendingNewTicketFileName || undefined,
            attachmentDataUrl: pendingNewTicketFileDataUrl || undefined,
          },
        ],
      });

      logAdminActivity(
        state,
        `ثبت تیکت جدید توسط ${student.firstName} ${student.lastName}`,
        `موضوع: ${subject}`,
        'ticket',
        true
      );

      const saved = await persistDbState(state);
      if (!saved.success) {
        showToast('خطا در ثبت تیکت', saved.message, 'error');
        return;
      }

      pendingNewTicketFileName = '';
      pendingNewTicketFileDataUrl = '';
      activeStudentTicketId = newTicketId;
      studentTicketSubView = 'list';
      updateBrowserUrl('/student/tickets');
      renderActiveStudentSection();
      showToast('تیکت ارسال شد', 'تیکت جدید شما با موفقیت در پایگاه داده ثبت گردید.', 'success');
    } finally {
      $btn.prop('disabled', false).text(origText);
    }
  });

  $(document).on('change', '#st-ticket-reply-file', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    void startReplyTicketFileUpload(file);
  });

  $(document).on('click', '.js-retry-st-reply-ticket-upload', function () {
    if (lastSelectedReplyTicketFile) {
      void startReplyTicketFileUpload(lastSelectedReplyTicketFile);
    }
  });

  $(document).on('submit', '#form-student-reply-ticket', async function (e) {
    e.preventDefault();
    if (isUploadingReplyTicketFile) {
      showToast('در حال آپلود پیوست', 'لطفاً تا تکمیل آپلود فایل ضمیمه صبر کنید.', 'info');
      return;
    }

    const ticketId = Number($(this).attr('data-id'));
    const text = String($('#st-ticket-reply-text').val() || '').trim();
    if (!text) return;

    const state = loadDbState();
    const student = getActiveStudent(state);
    const tk = state.tickets.find((t) => t.id === ticketId);
    if (!tk) return;

    if (tk.status === 'بسته شده') {
      showToast(
        'تیکت بسته شده است',
        'این تیکت توسط مدیریت بسته شده است و امکان ارسال پیام جدید وجود ندارد.',
        'error'
      );
      renderActiveStudentSection();
      return;
    }

    const $btn = $('#btn-st-submit-reply-ticket');
    if ($btn.prop('disabled')) return;
    const origText = $btn.text();
    $btn.prop('disabled', true).text('در حال ارسال...');

    try {
      const apiRes = await studentReplyTicketApi(ticketId, {
        studentId: student.id,
        message: text,
        attachmentName: pendingStudentTicketFileName || undefined,
        attachmentDataUrl: pendingStudentTicketFileDataUrl || undefined,
      });

      if (!apiRes.success) {
        await syncStateFromBackend();
        renderActiveStudentSection();
        showToast('خطا در ارسال پیام', apiRes.message, 'error');
        return;
      }

      pendingStudentTicketFileName = '';
      pendingStudentTicketFileDataUrl = '';
      await syncStateFromBackend();
      renderActiveStudentSection();
      showToast('پیام ارسال شد', apiRes.message, 'success');
    } finally {
      $btn.prop('disabled', false).text(origText);
    }
  });

  $(document).on('click', '.js-st-download-ticket-file', function () {
    const ticketId = Number($(this).attr('data-ticket-id'));
    const msgId = Number($(this).attr('data-msg-id'));
    const state = loadDbState();
    const tk = state.tickets.find((t) => t.id === ticketId);
    if (!tk) return;
    const msg = tk.messages.find((m) => m.id === msgId);
    if (!msg || !msg.attachmentName) return;
    triggerStudentFileDownload(msg.attachmentName, msg.attachmentDataUrl, msg.message);
  });

  // Student Profile Save, Avatar Upload & Delete Avatar (Persisted in MySQL)
  $(document).on('change', '#st-prof-avatar-upload', async function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;

    const uploadRes = await uploadFileWithProgress(file);
    if (!uploadRes.success || !uploadRes.fileUrl) {
      showToast(
        'خطا در آپلود تصویر',
        uploadRes.message || 'آپلود تصویر پروفایل ناموفق بود.',
        'error'
      );
      return;
    }

    const cacheBustedUrl = `${uploadRes.fileUrl}?v=${Date.now()}`;
    const state = loadDbState();
    const student = getActiveStudent(state);

    const apiRes = await updateStudentProfileApi({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email || '',
      bio: student.bio || '',
      avatarUrl: cacheBustedUrl,
      avatarRemoved: false,
    });

    if (!apiRes.success) {
      showToast('خطا در ذخیره تصویر پروفایل', apiRes.message, 'error');
      return;
    }

    student.avatarUrl = cacheBustedUrl;
    student.avatarRemoved = false;
    await persistDbState(state);
    renderActiveStudentSection();
    showToast('تصویر پروفایل ذخیره شد', 'عکس جدید پروفایل شما در پایگاه داده ثبت گردید.', 'success');
  });

  $(document).on('click', '#btn-st-delete-avatar', async function () {
    const $btn = $(this);
    if ($btn.prop('disabled')) return;
    $btn.prop('disabled', true);

    try {
      const state = loadDbState();
      const student = getActiveStudent(state);

      const apiRes = await updateStudentProfileApi({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email || '',
        bio: student.bio || '',
        avatarUrl: '',
        avatarRemoved: true,
      });

      if (!apiRes.success) {
        showToast('خطا در حذف تصویر', apiRes.message, 'error');
        return;
      }

      student.avatarUrl = '';
      student.avatarRemoved = true;
      await persistDbState(state);
      renderActiveStudentSection();
      showToast('تصویر پروفایل حذف شد', 'عکس پروفایل شما در پایگاه داده حذف گردید.', 'info');
    } finally {
      $btn.prop('disabled', false);
    }
  });

  $(document).on('submit', '#form-student-profile-save', async function (e) {
    e.preventDefault();
    const firstName = String($('#st-prof-firstname').val() || '').trim();
    const lastName = String($('#st-prof-lastname').val() || '').trim();
    const email = normalizeDigits(String($('#st-prof-email').val() || '').trim());
    const bio = String($('#st-prof-bio').val() || '').trim();

    if (firstName.length < 2 || lastName.length < 2) {
      showToast('اطلاعات نامعتبر', 'نام و نام خانوادگی باید حداقل ۲ کاراکتر باشند.', 'error');
      return;
    }

    if (!isValidRequiredEmail(email)) {
      showToast('ایمیل الزامی و نامعتبر', 'وارد کردن یک آدرس ایمیل معتبر برای پروفایل دانش‌آموز الزامی است.', 'error');
      return;
    }

    if (bio.length > 500) {
      showToast('بیوگرافی طولانی', 'متن بیوگرافی نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.', 'error');
      return;
    }

    const $btn = $('#btn-st-save-profile');
    if ($btn.prop('disabled')) return;
    const origText = $btn.text();
    $btn.prop('disabled', true).text('در حال ذخیره...');

    try {
      const state = loadDbState();
      const student = getActiveStudent(state);

      // Phone number is strictly read-only and never modified by student
      const apiRes = await updateStudentProfileApi({
        id: student.id,
        firstName,
        lastName,
        email,
        bio,
        avatarUrl: student.avatarUrl,
        avatarRemoved: student.avatarRemoved,
      });

      if (!apiRes.success) {
        showToast('خطا در بروزرسانی پروفایل', apiRes.message, 'error');
        return;
      }

      student.firstName = firstName;
      student.lastName = lastName;
      student.email = email;
      student.bio = bio;
      await persistDbState(state);
      renderActiveStudentSection();
      showToast('پروفایل بروزرسانی شد', apiRes.message, 'success');
    } finally {
      $btn.prop('disabled', false).text(origText);
    }
  });

  $(document).on('submit', '#form-student-change-pass', async function (e) {
    e.preventDefault();
    const newPass = String($('#st-new-pass').val() || '');
    const confirmPass = String($('#st-confirm-pass').val() || '');
    if (newPass.length < 6 || newPass !== confirmPass) {
      showToast('خطا در رمز عبور', 'رمز عبور باید حداقل ۶ کاراکتر و با تکرار آن یکسان باشد.', 'error');
      return;
    }

    const $btn = $('#btn-st-save-password');
    if ($btn.prop('disabled')) return;
    const origText = $btn.text();
    $btn.prop('disabled', true).text('در حال بروزرسانی...');

    try {
      const state = loadDbState();
      const student = getActiveStudent(state);

      const apiRes = await changeStudentPasswordApi({
        studentId: student.id,
        newPassword: newPass,
      });

      if (!apiRes.success) {
        showToast('خطا در تغییر رمز عبور', apiRes.message, 'error');
        return;
      }

      $('#st-new-pass').val('');
      $('#st-confirm-pass').val('');
      renderActiveStudentSection();
      showToast('رمز عبور تغییر کرد', apiRes.message, 'success');
    } finally {
      $btn.prop('disabled', false).text(origText);
    }
  });
}
