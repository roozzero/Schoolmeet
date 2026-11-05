import $ from 'jquery';
import { showToast } from './modal';
import { AppRoutePath, updateBrowserUrl } from './router';
import { loadDbState, logAdminActivity, resetDbState, saveDbState } from './store';
import {
  AdminSectionId,
  AttendanceStatus,
  ClassRoomCode,
  DatabaseState,
  GradebookEntry,
  StudentRecord,
  TargetClassScope,
} from './types';
import { normalizeDigits, toPersianDigits } from './validation';

let activeSection: AdminSectionId = 'dashboard';
let selectedClassTab: ClassRoomCode = '901';
let studentFilter = 'all';
let studentSearchQuery = '';

// Gradebook (دفتر نمره) state & dedicated session page
let gradebookClassCode: string = 'all';
let gradebookSubView: 'list' | 'session' = 'list';
let activeGradebookSessionId: number | null = null;

// Assignments state & dedicated sub-pages
let assignmentFilter = 'all';
let assignmentSearchQuery = '';
let assignmentSubView: 'list' | 'form' | 'detail' | 'submission' = 'list';
let editingAssignmentId: number | null = null;
let activeAssignmentDetailId: number | null = null;
let activeSubmissionId: number | null = null;
let pendingAssignmentAttachmentName = '';
let pendingAssignmentAttachmentDataUrl = '';

// Educational Resources state & dedicated sub-page
let resourceFilter = 'all';
let resourceSearchQuery = '';
let resourceSubView: 'list' | 'form' | 'detail' = 'list';
let editingResourceId: number | null = null;
let activeResourceDetailId: number | null = null;
let pendingResourceFileName = '';
let pendingResourceFileDataUrl = '';
let pendingResourceFileSize = '';

// Announcements state
let announcementFilter = 'all';
let announcementSearchQuery = '';

// Tickets state + downloadable attachment state
let ticketFilter: 'all' | 'در انتظار پاسخ' | 'پاسخ داده شده' = 'all';
let activeTicketId: number | null = null;
let pendingTicketAttachmentName = '';
let pendingTicketAttachmentDataUrl = '';

// Confirmation modal callback
let pendingConfirmCallback: (() => void) | null = null;

function formatClassLabel(code: TargetClassScope): string {
  if (!code || code === '-') return '—';
  if (code === 'all') return 'هر سه کلاس (۹۰۱، ۹۰۲ و ۹۰۳)';
  return `کلاس ${toPersianDigits(code)}`;
}

function formatStatusLabel(status: 'pending' | 'approved' | 'rejected'): string {
  if (status === 'pending') return 'در انتظار تأیید';
  if (status === 'approved') return 'تأیید شده';
  return 'رد شده';
}

/**
 * Render Student Profile Photo (Cropped Portrait or Custom Uploaded Avatar)
 */
function renderStudentAvatarHtml(
  student: Pick<StudentRecord, 'id' | 'firstName' | 'lastName' | 'avatarUrl' | 'avatarRemoved'>,
  size: 'sm' | 'lg' = 'sm'
): string {
  const portraitIdx = Math.abs(Number(student.id) || 0) % 4;
  const fullName = `${student.firstName} ${student.lastName}`;
  const baseClass =
    size === 'lg'
      ? `student-avatar-lg student-portrait-lg-${portraitIdx}`
      : `student-avatar-sm student-portrait-${portraitIdx}`;

  if (student.avatarUrl) {
    return `<div class="${baseClass} has-custom-avatar" style="background-image: url('${student.avatarUrl}');" role="img" aria-label="تصویر ${fullName}"></div>`;
  }
  if (student.avatarRemoved) {
    const dimClass = size === 'lg' ? 'student-avatar-lg' : 'student-avatar-sm';
    return `<div class="${dimClass} bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]" style="background-image: none;" role="img" aria-label="بدون تصویر ${fullName}">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>`;
  }
  return `<div class="${baseClass}" role="img" aria-label="تصویر ${fullName}"></div>`;
}

/**
 * Trigger a real browser file download for any attachment or resource file
 */
function triggerFileDownload(
  fileName: string,
  dataUrl?: string,
  fallbackTextContent?: string
): void {
  const cleanName = fileName.trim() || 'scoolmeet-attachment.txt';

  if (dataUrl && dataUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('دانلود فایل آغاز شد', `فایل «${toPersianDigits(cleanName)}» با موفقیت دانلود شد.`, 'success');
    return;
  }

  const content =
    fallbackTextContent ||
    `سامانه آموزشی اسکول میت (ScoolMeet)\nنام فایل: ${cleanName}\nتاریخ دریافت: ۱۴۰۵/۰۸/۱۵\n\nاین فایل ضمیمه از سامانه اسکول میت دریافت شده است.`;
  const blob = new Blob([content], { type: 'application/octet-stream;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = cleanName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  showToast('دانلود فایل آغاز شد', `فایل «${toPersianDigits(cleanName)}» با موفقیت دانلود شد.`, 'success');
}

/**
 * Open Custom Confirmation Modal (No window.confirm)
 */
function openConfirmModal(options: {
  title: string;
  message: string;
  confirmText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
}): void {
  pendingConfirmCallback = options.onConfirm;
  $('#confirm-modal-title').text(options.title);
  $('#confirm-modal-message').text(options.message);
  const $yesBtn = $('#btn-confirm-modal-yes');
  $yesBtn.text(options.confirmText || 'تأیید و انجام');
  if (options.isDanger) {
    $yesBtn.removeClass('btn-admin-primary').addClass('btn-admin-danger !h-10');
  } else {
    $yesBtn.removeClass('btn-admin-danger').addClass('btn-admin-primary !h-10');
  }
  $('#admin-confirm-modal').addClass('is-open').attr('aria-hidden', 'false');
}

/**
 * Sync Class Select Options Dynamically
 */
function syncClassSelectOptions(state: DatabaseState): void {
  const classOptionsHtml = state.classes
    .map((c) => `<option value="${c.code}">${toPersianDigits(c.code)}</option>`)
    .join('');

  $('#prof-modal-class, #add-st-class').html(
    `<option value="">— (بدون کلاس)</option>${classOptionsHtml}`
  );

  const scopeOptionsHtml =
    `<option value="all">همه کلاس‌ها</option>` +
    state.classes
      .map((c) => `<option value="${c.code}">کلاس ${toPersianDigits(c.code)}</option>`)
      .join('');

  $('#ann-target').html(scopeOptionsHtml);
}

/**
 * Update Sidebar Counters, Avatar, Topbar Welcome Greeting & Bell Badge
 */
function syncAdminChrome(state: DatabaseState): void {
  $('#nav-badge-classes').text(toPersianDigits(state.classes.length));
  $('#nav-badge-students').text(toPersianDigits(state.students.length));
  $('#nav-badge-gradebook').text(toPersianDigits((state.gradebookSessions || []).length));
  $('#nav-badge-assignments').text(toPersianDigits(state.assignments.length));
  $('#nav-badge-resources').text(toPersianDigits(state.resources.length));
  $('#nav-badge-announcements').text(toPersianDigits(state.announcements.length));
  $('#nav-badge-tickets').text(toPersianDigits(state.tickets.length));

  const announcementsCount = state.announcements.length;
  $('#topbar-bell-badge').text(
    announcementsCount > 0 ? toPersianDigits(announcementsCount) : ''
  );

  const fullName = `${state.admin.firstName} ${state.admin.lastName}`;
  $('#sidebar-admin-name').text(fullName);
  $('#sidebar-admin-role').text(state.admin.roleTitle);
  $('#topbar-welcome-text').text(`${fullName} عزیز، به اسکول میت خوش آمدید`);

  // Apply custom uploaded profile photo if set
  const $sidebarAvatar = $('.admin-ref-avatar-box');
  if (state.admin.avatarUrl) {
    $sidebarAvatar
      .addClass('has-custom-avatar')
      .css('background-image', `url('${state.admin.avatarUrl}')`);
  } else {
    $sidebarAvatar.removeClass('has-custom-avatar').css('background-image', '');
  }

  syncClassSelectOptions(state);
}

/**
 * Switch Active Section in the Admin Workspace and update browser URL
 */
export function navigateAdminSection(
  sectionId: AdminSectionId,
  updateHistory = true,
  subPage?: string
): void {
  activeSection = sectionId;

  // Reset sub-page views when clicking main sidebar items unless a subPage is specified
  if (sectionId === 'assignments') {
    if (subPage === 'create' || subPage === 'edit') {
      assignmentSubView = 'form';
    } else if (subPage === 'detail' && activeAssignmentDetailId) {
      assignmentSubView = 'detail';
    } else if (subPage === 'submission' && activeSubmissionId) {
      assignmentSubView = 'submission';
    } else {
      assignmentSubView = 'list';
    }
  } else if (sectionId === 'resources') {
    if (subPage === 'create' || subPage === 'edit') {
      resourceSubView = 'form';
    } else if (subPage === 'detail' && activeResourceDetailId) {
      resourceSubView = 'detail';
    } else {
      resourceSubView = 'list';
    }
  } else if (sectionId === 'gradebook') {
    if (subPage === 'session' && activeGradebookSessionId) {
      gradebookSubView = 'session';
    } else {
      gradebookSubView = 'list';
    }
  }

  $('.admin-nav-btn').removeClass('is-active');
  $(`.admin-nav-btn[data-section="${sectionId}"]`).addClass('is-active');
  $('#admin-sidebar').removeClass('is-mobile-open');

  if (updateHistory) {
    const targetPath = subPage
      ? (`/admin/${sectionId}/${subPage}` as AppRoutePath)
      : (`/admin/${sectionId}` as AppRoutePath);
    updateBrowserUrl(targetPath);
  }

  renderActiveSection();
}

/**
 * Render the currently selected Admin Section into #admin-main-viewport
 */
export function renderActiveSection(preserveInputSelector?: string): void {
  const state = loadDbState();
  syncAdminChrome(state);

  const $viewport = $('#admin-main-viewport');
  if (!$viewport.length) return;

  switch (activeSection) {
    case 'dashboard':
      renderDashboardSection($viewport, state);
      break;
    case 'classes':
      renderClassesSection($viewport, state);
      break;
    case 'students':
      renderStudentsSection($viewport, state);
      break;
    case 'gradebook':
      renderGradebookSection($viewport, state);
      break;
    case 'assignments':
      renderAssignmentsSection($viewport, state);
      break;
    case 'resources':
      renderResourcesSection($viewport, state);
      break;
    case 'announcements':
      renderAnnouncementsSection($viewport, state);
      break;
    case 'tickets':
      renderTicketsSection($viewport, state);
      break;
    case 'profile':
      renderProfileSection($viewport, state);
      break;
    case 'settings':
      renderSettingsSection($viewport, state);
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
        // Ignore if selection range is not supported
      }
    }
  }
}

/* ============================================================================
   1. داشبورد: آمار ظریف، کارت‌های همسان کلاس‌ها (بدون بج پایه نهم)، فعالیت‌های اخیر تمام‌عرض
   ============================================================================ */
function renderDashboardSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const totalStudents = state.students.length;
  const approvedStudents = state.students.filter((s) => s.status === 'approved').length;
  const pendingStudentsCount = state.students.filter((s) => s.status === 'pending').length;
  const pendingSubmitsCount = state.submissions.filter((s) => s.status === 'pending').length;
  const openTicketsCount = state.tickets.filter((t) => t.status === 'در انتظار پاسخ').length;

  $container.html(`
    <div class="space-y-5">
      <!-- ردیف کارت‌های آماری ظریف و جمع‌وجور -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">کل دانش‌آموزان</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${toPersianDigits(totalStudents)} نفر
            </div>
            <div class="text-[10.5px] font-semibold text-[#1B5E5A] mt-0.5 truncate">
              ${toPersianDigits(approvedStudents)} عضو فعال در کلاس‌ها
            </div>
          </div>
          <div class="kpi-icon-box bg-[#EADCCA] text-[#5A3A22]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">ثبت‌نام‌های جدید</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${toPersianDigits(pendingStudentsCount)} نفر
            </div>
            <div class="text-[10.5px] font-semibold text-[#6E5D4F] mt-0.5 truncate">
              در انتظار بررسی و تأیید
            </div>
          </div>
          <div class="kpi-icon-box bg-[#F3E5D0] text-[#7C4D25]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
        </div>

        <div class="kpi-stat-card">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-[#6E5D4F]">تکالیف ارسالی</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${toPersianDigits(state.submissions.length)} فایل
            </div>
            <div class="text-[10.5px] font-semibold text-[#5A3A22] mt-0.5 truncate">
              ${toPersianDigits(pendingSubmitsCount)} فایل آماده نمره‌دهی
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
            <div class="text-[11px] font-bold text-[#6E5D4F]">تیکت‌های دانش‌آموزان</div>
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              ${toPersianDigits(openTicketsCount)} پیام باز
            </div>
            <div class="text-[10.5px] font-semibold text-[#6E5D4F] mt-0.5 truncate">
              از مجموع ${toPersianDigits(state.tickets.length)} گفت‌وگو
            </div>
          </div>
          <div class="kpi-icon-box bg-[#EADCCA] text-[#5A3A22]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- کارت‌های همسان کلاس‌های آموزشی (بدون بج پایه نهم) -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">کلاس‌های آموزشی دوره</h2>
          <button
            type="button"
            class="text-xs font-extrabold text-[#5A3A22] hover:underline bg-transparent border-none p-0 cursor-pointer js-go-section"
            data-section="classes"
          >
            مدیریت کلاس‌ها
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          ${state.classes
            .map((cls) => {
              const membersCount = state.students.filter(
                (s) => s.classCode === cls.code && s.status === 'approved'
              ).length;
              const fillWidth = Math.min(
                100,
                Math.max(12, Math.round((membersCount / cls.capacity) * 100))
              );
              return `
                <div class="modern-class-card">
                  <div>
                    <h3 class="text-sm font-black text-[#5A3A22] m-0">
                      ${toPersianDigits(cls.title)}
                    </h3>
                    <p class="text-xs text-[#6E5D4F] mt-2 m-0 leading-relaxed">
                      ${toPersianDigits(cls.description)}
                    </p>
                  </div>

                  <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-[#6E5D4F] font-medium">اعضای فعال کلاس</span>
                      <span class="font-extrabold text-[#251B15] tabular-nums">
                        ${toPersianDigits(membersCount)} از ${toPersianDigits(cls.capacity)} نفر
                      </span>
                    </div>
                    <div class="class-progress-track">
                      <div class="class-progress-fill" style="width: ${fillWidth}%"></div>
                    </div>
                    <div class="text-[11px] text-[#6E5D4F] pt-1">
                      ${toPersianDigits(cls.scheduleSummary)}
                    </div>
                    <div class="pt-1">
                      <button
                        type="button"
                        class="text-xs text-[#5A3A22] font-extrabold bg-transparent border-none p-0 cursor-pointer hover:underline js-open-class-direct"
                        data-code="${cls.code}"
                      >
                        مشاهده کلاس ←
                      </button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- بخش فعالیت‌های اخیر سامانه (تمام‌عرض) -->
      <div class="w-full admin-surface-card">
        <div class="flex items-center justify-between mb-3.5">
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">فعالیت‌های اخیر سامانه</h2>
          <span class="text-xs text-[#6E5D4F] font-semibold">بروزرسانی زنده</span>
        </div>
        <div class="space-y-2.5">
          ${state.activities
            .slice(0, 6)
            .map(
              (act) => `
              <div class="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB]">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-extrabold text-[#251B15]">${toPersianDigits(act.title)}</span>
                  <span class="text-[11px] text-[#6E5D4F] shrink-0">${toPersianDigits(act.timeAgo)}</span>
                </div>
                <p class="text-[11px] text-[#6E5D4F] mt-1 m-0 leading-relaxed">${toPersianDigits(act.detail)}</p>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   2. مدیریت کلاس‌ها: دکمه ایجاد کلاس، آیکون ویرایش در هر کارت، و اعضای کلاس با عکس پروفایل
   ============================================================================ */
function renderClassesSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const currentClass =
    state.classes.find((c) => c.code === selectedClassTab) || state.classes[0];
  const classMembers = state.students.filter((s) => s.classCode === currentClass.code);
  const classAssignments = state.assignments.filter(
    (a) => a.classCode === currentClass.code || a.classCode === 'all'
  );

  $container.html(`
    <div class="space-y-5">
      <!-- نوار ابزار بالای مدیریت کلاس‌ها: دکمه ایجاد کلاس جدید -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="text-sm font-extrabold text-[#251B15] m-0">
          لیست کلاس‌های آموزشی (${toPersianDigits(state.classes.length)} کلاس)
        </h2>
        <button type="button" id="btn-open-create-class" class="btn-admin-primary !h-9">
          + ایجاد کلاس جدید
        </button>
      </div>

      <!-- کارت‌های همسان کلاس‌ها با آیکون ویرایش -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        ${state.classes
          .map((cls) => {
            const count = state.students.filter((s) => s.classCode === cls.code).length;
            const isSelected = cls.code === currentClass.code;
            const fillWidth = Math.min(
              100,
              Math.max(12, Math.round((count / cls.capacity) * 100))
            );
            return `
              <div
                class="modern-class-card cursor-pointer js-select-class-card ${
                  isSelected ? '!border-[#5A3A22] !bg-[#F3ECE0]' : ''
                }"
                data-code="${cls.code}"
              >
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="text-sm font-black text-[#5A3A22] m-0">
                      ${toPersianDigits(cls.title)}
                    </h3>
                    <button
                      type="button"
                      class="btn-icon-action js-edit-class-modal"
                      data-code="${cls.code}"
                      title="ویرایش مشخصات کلاس ${toPersianDigits(cls.code)}"
                      aria-label="ویرایش مشخصات کلاس"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                  <p class="text-xs text-[#6E5D4F] mt-2 m-0 leading-relaxed">
                    ${toPersianDigits(cls.description)}
                  </p>
                </div>

                <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-2">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-[#6E5D4F] font-medium">اعضای کلاس</span>
                    <span class="font-extrabold text-[#251B15] tabular-nums">
                      ${toPersianDigits(count)} از ${toPersianDigits(cls.capacity)} نفر
                    </span>
                  </div>
                  <div class="class-progress-track">
                    <div class="class-progress-fill" style="width: ${fillWidth}%"></div>
                  </div>
                  <div class="text-[11px] text-[#6E5D4F] pt-1">
                    ${toPersianDigits(cls.scheduleSummary)}
                  </div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <!-- لیست اعضای کلاس انتخاب‌شده با عکس پروفایل هر دانش‌آموز -->
      <div class="w-full admin-surface-card">
        <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <div>
            <h3 class="text-sm font-extrabold text-[#251B15] m-0">
              اعضای ${toPersianDigits(currentClass.title)} (${toPersianDigits(classMembers.length)} نفر)
            </h3>
            <p class="text-[11px] text-[#6E5D4F] mt-1 m-0">
              محل برگزاری: ${toPersianDigits(currentClass.roomOrLink)} · زمان‌بندی: ${toPersianDigits(currentClass.scheduleSummary)}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-admin-action js-edit-class-modal"
              data-code="${currentClass.code}"
            >
              ویرایش اطلاعات کلاس
            </button>
            <button
              type="button"
              class="btn-admin-primary !h-9 js-open-add-student-modal"
              data-class="${currentClass.code}"
            >
              + افزودن دانش‌آموز به کلاس ${toPersianDigits(currentClass.code)}
            </button>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>شماره تلفن</th>
                <th>تاریخ ثبت‌نام</th>
                <th>وضعیت</th>
                <th>تغییر کلاس</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              ${
                classMembers.length
                  ? classMembers
                      .map(
                        (st) => `
                        <tr>
                          <td>
                            <div class="flex items-center gap-2.5">
                              ${renderStudentAvatarHtml(st, 'sm')}
                              <span class="font-extrabold text-[#251B15]">${st.firstName} ${st.lastName}</span>
                            </div>
                          </td>
                          <td class="tabular-nums">${toPersianDigits(st.phone)}</td>
                          <td class="tabular-nums">${toPersianDigits(st.createdAt)}</td>
                          <td>
                            <span class="font-extrabold ${
                              st.status === 'approved'
                                ? 'text-[#059669]'
                                : st.status === 'pending'
                                ? 'text-[#D97706]'
                                : 'text-[#E11D48]'
                            }">
                              ${formatStatusLabel(st.status)}
                            </span>
                          </td>
                          <td>
                            <select
                              class="school-select !h-8 !py-0 !text-xs !w-28 js-change-student-class"
                              data-id="${st.id}"
                            >
                              ${state.classes
                                .map(
                                  (c) =>
                                    `<option value="${c.code}" ${
                                      st.classCode === c.code ? 'selected' : ''
                                    }>کلاس ${toPersianDigits(c.code)}</option>`
                                )
                                .join('')}
                            </select>
                          </td>
                          <td>
                            <div class="flex items-center gap-1.5">
                              <button
                                type="button"
                                class="btn-icon-action js-open-student-profile"
                                data-id="${st.id}"
                                title="مشاهده و ویرایش پروفایل"
                              >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                class="btn-icon-action btn-icon-danger js-remove-student-from-class"
                                data-id="${st.id}"
                                title="حذف دانش‌آموز از این کلاس"
                              >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>`
                      )
                      .join('')
                  : `<tr><td colspan="6" class="text-center py-6">دانش‌آموزی در این کلاس ثبت نشده است.</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div class="mt-4 pt-3.5 border-t border-[#E6D8C5] flex items-center justify-between text-xs text-[#6E5D4F] flex-wrap gap-2">
          <span>تکالیف مرتبط با این کلاس: <strong class="text-[#251B15]">${toPersianDigits(classAssignments.length)} تکلیف</strong></span>
          <span>مدرس: <strong class="text-[#251B15]">${currentClass.instructorName}</strong></span>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   3. دانش‌آموزان: عکس پروفایل، فیلترها، خط تیره بدون کلاس، عملیات آیکونی، بازنشانی و ریست پسورد
   ============================================================================ */
function renderStudentsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const normalizedQuery = normalizeDigits(studentSearchQuery.trim()).toLowerCase();

  const filteredStudents = state.students.filter((st) => {
    const matchesFilter =
      studentFilter === 'all'
        ? true
        : studentFilter === 'pending'
        ? st.status === 'pending'
        : studentFilter === 'none'
        ? !st.classCode
        : String(st.classCode) === String(studentFilter);

    const fullName = `${st.firstName} ${st.lastName}`.toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      fullName.includes(normalizedQuery) ||
      normalizeDigits(st.phone).includes(normalizedQuery);

    return matchesFilter && matchesQuery;
  });

  const pendingCount = state.students.filter((s) => s.status === 'pending').length;

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار فیلتر و جستجوی دانش‌آموزان -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button
            type="button"
            class="admin-seg-btn js-student-filter ${studentFilter === 'all' ? 'is-active' : ''}"
            data-filter="all"
          >
            همه (${toPersianDigits(state.students.length)})
          </button>
          <button
            type="button"
            class="admin-seg-btn js-student-filter ${studentFilter === 'pending' ? 'is-active' : ''}"
            data-filter="pending"
          >
            در انتظار تأیید (${toPersianDigits(pendingCount)})
          </button>
          ${state.classes
            .map(
              (c) => `
              <button
                type="button"
                class="admin-seg-btn js-student-filter ${
                  String(studentFilter) === String(c.code) ? 'is-active' : ''
                }"
                data-filter="${c.code}"
              >
                کلاس ${toPersianDigits(c.code)}
              </button>`
            )
            .join('')}
          <button
            type="button"
            class="admin-seg-btn js-student-filter ${studentFilter === 'none' ? 'is-active' : ''}"
            data-filter="none"
          >
            بدون کلاس
          </button>
        </div>

        <div class="flex items-center gap-2.5">
          <input
            type="search"
            id="student-search-input"
            class="school-input !h-9 !w-52 text-xs"
            placeholder="جستجوی نام یا شماره تلفن..."
            value="${toPersianDigits(studentSearchQuery)}"
          />
          <button type="button" class="btn-admin-primary !h-9 js-open-add-student-modal" data-class="901">
            + ثبت دانش‌آموز جدید
          </button>
        </div>
      </div>

      <!-- جدول کامل دانش‌آموزان با تصویر پروفایل و عملیات آیکونی -->
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ردیف</th>
              <th>دانش‌آموز (عکس و نام)</th>
              <th>شماره تلفن</th>
              <th>کلاس</th>
              <th>تاریخ ثبت‌نام</th>
              <th>وضعیت تأیید</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredStudents.length
                ? filteredStudents
                    .map(
                      (st, idx) => `
                      <tr>
                        <td class="tabular-nums font-bold">${toPersianDigits(idx + 1)}</td>
                        <td>
                          <div class="flex items-center gap-2.5">
                            ${renderStudentAvatarHtml(st, 'sm')}
                            <span class="font-extrabold text-[#251B15]">${st.firstName} ${st.lastName}</span>
                          </div>
                        </td>
                        <td class="tabular-nums">${toPersianDigits(st.phone)}</td>
                        <td class="font-bold text-[#5A3A22]">
                          ${st.classCode ? `کلاس ${toPersianDigits(st.classCode)}` : '—'}
                        </td>
                        <td class="tabular-nums">${toPersianDigits(st.createdAt)}</td>
                        <td>
                          <span class="font-extrabold ${
                            st.status === 'approved'
                              ? 'text-[#059669]'
                              : st.status === 'pending'
                              ? 'text-[#D97706]'
                              : 'text-[#E11D48]'
                          }">
                            ${formatStatusLabel(st.status)}
                          </span>
                        </td>
                        <td>
                          <div class="flex items-center gap-1.5">
                            ${
                              st.status !== 'approved'
                                ? `
                                <button
                                  type="button"
                                  class="btn-icon-action btn-icon-success js-approve-student"
                                  data-id="${st.id}"
                                  title="تأیید عضویت دانش‌آموز"
                                  aria-label="تأیید عضویت دانش‌آموز"
                                >
                                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.3">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>`
                                : ''
                            }
                            ${
                              st.status !== 'rejected'
                                ? `
                                <button
                                  type="button"
                                  class="btn-icon-action btn-icon-danger js-reject-student"
                                  data-id="${st.id}"
                                  title="رد درخواست عضویت"
                                  aria-label="رد درخواست عضویت"
                                >
                                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.3">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>`
                                : ''
                            }
                            ${
                              st.status !== 'pending'
                                ? `
                                <button
                                  type="button"
                                  class="btn-icon-action btn-icon-warning js-reset-student-status"
                                  data-id="${st.id}"
                                  title="بازنشانی وضعیت به در انتظار تأیید"
                                  aria-label="بازنشانی وضعیت"
                                >
                                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </button>`
                                : ''
                            }
                            <button
                              type="button"
                              class="btn-icon-action btn-icon-teal js-open-reset-password"
                              data-id="${st.id}"
                              title="بازنشانی رمز عبور دانش‌آموز"
                              aria-label="بازنشانی رمز عبور"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="btn-icon-action js-open-student-profile"
                              data-id="${st.id}"
                              title="مشاهده و ویرایش پروفایل"
                              aria-label="مشاهده و ویرایش پروفایل"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>`
                    )
                    .join('')
                : `<tr><td colspan="7" class="text-center py-8">موردی مطابق فیلتر انتخاب‌شده یافت نشد.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `);
}

/* ============================================================================
   4. تکالیف:
      - لیست کارتی تکالیف (/admin/assignments)
      - صفحه جدید ایجاد / ویرایش تکلیف (/admin/assignments/create | /admin/assignments/edit)
      - صفحه جدید مشاهده جزئیات تکلیف (/admin/assignments/detail)
      - صفحه جدید مشاهده پاسخ دانش‌آموز و ثبت نمره (/admin/assignments/submission)
   ============================================================================ */
function renderAssignmentsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  if (assignmentSubView === 'form') {
    renderAssignmentFormPage($container, state);
    return;
  }

  if (assignmentSubView === 'detail' && activeAssignmentDetailId) {
    renderAssignmentDetailPage($container, state, activeAssignmentDetailId);
    return;
  }

  if (assignmentSubView === 'submission' && activeSubmissionId) {
    renderAssignmentSubmissionPage($container, state, activeSubmissionId);
    return;
  }

  const normalizedQuery = normalizeDigits(assignmentSearchQuery.trim()).toLowerCase();

  const filteredAssignments = state.assignments.filter((a) => {
    const matchesClass =
      assignmentFilter === 'all'
        ? true
        : String(a.classCode) === String(assignmentFilter) || a.classCode === 'all';
    const matchesQuery =
      !normalizedQuery ||
      a.title.toLowerCase().includes(normalizedQuery) ||
      a.description.toLowerCase().includes(normalizedQuery);
    return matchesClass && matchesQuery;
  });

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار تکالیف: فیلتر کلاس‌ها، جستجو و دکمه باز کردن صفحه ایجاد تکلیف جدید -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button
            type="button"
            class="admin-seg-btn js-hw-filter ${assignmentFilter === 'all' ? 'is-active' : ''}"
            data-filter="all"
          >
            همه تکالیف (${toPersianDigits(state.assignments.length)})
          </button>
          ${state.classes
            .map(
              (c) => `
              <button
                type="button"
                class="admin-seg-btn js-hw-filter ${
                  String(assignmentFilter) === String(c.code) ? 'is-active' : ''
                }"
                data-filter="${c.code}"
              >
                کلاس ${toPersianDigits(c.code)}
              </button>`
            )
            .join('')}
        </div>

        <div class="flex items-center gap-2.5">
          <input
            type="search"
            id="assignment-search-input"
            class="school-input !h-9 !w-48 text-xs"
            placeholder="جستجوی عنوان تکلیف..."
            value="${toPersianDigits(assignmentSearchQuery)}"
          />
          <button type="button" id="btn-open-create-assignment" class="btn-admin-primary !h-9">
            + ایجاد تکلیف جدید
          </button>
        </div>
      </div>

      <!-- کارت‌های تکالیف تعریف‌شده -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        ${
          filteredAssignments.length
            ? filteredAssignments
                .map((hw) => {
                  const targetStudents = state.students.filter((s) =>
                    hw.classCode === 'all' ? Boolean(s.classCode) : s.classCode === hw.classCode
                  );
                  const hwSubs = state.submissions.filter((sub) => sub.assignmentId === hw.id);
                  const submittedCount = hwSubs.length;
                  const notSubmittedCount = Math.max(0, targetStudents.length - submittedCount);

                  return `
                    <div class="modern-class-card">
                      <div>
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-xs font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
                            ${formatClassLabel(hw.classCode)}
                          </span>
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              class="btn-icon-action js-edit-assignment"
                              data-id="${hw.id}"
                              title="ویرایش تکلیف در صفحه جدید"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="btn-icon-action btn-icon-danger js-delete-assignment"
                              data-id="${hw.id}"
                              title="حذف تکلیف"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
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
                          <span>مهلت: <strong class="text-[#251B15]">${toPersianDigits(hw.dueDate)}</strong></span>
                          <span>بارم: <strong class="text-[#251B15]">${toPersianDigits(hw.maxScore)} نمره</strong></span>
                        </div>

                        <div class="flex items-center justify-between text-[11px] bg-[#FDFBF7] border border-[#E5DBCB] rounded-lg px-2.5 py-1.5">
                          <span class="text-[#059669] font-extrabold">
                            تحویل داده: ${toPersianDigits(submittedCount)} نفر
                          </span>
                          <span class="text-[#D97706] font-extrabold">
                            تحویل نداده: ${toPersianDigits(notSubmittedCount)} نفر
                          </span>
                        </div>

                        <button
                          type="button"
                          class="btn-admin-primary w-full !h-9 text-xs js-view-assignment-detail"
                          data-id="${hw.id}"
                        >
                          مشاهده جزئیات در صفحه جدید
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')
            : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">تکلیفی مطابق فیلتر یافت نشد.</div>`
        }
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی ایجاد یا ویرایش تکلیف (/admin/assignments/create | /admin/assignments/edit)
 */
function renderAssignmentFormPage($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const editingItem = editingAssignmentId
    ? state.assignments.find((a) => a.id === editingAssignmentId) || null
    : null;

  const classOptionsHtml =
    `<option value="all" ${editingItem?.classCode === 'all' ? 'selected' : ''}>همه کلاس‌ها</option>` +
    state.classes
      .map(
        (c) =>
          `<option value="${c.code}" ${
            editingItem?.classCode === c.code ? 'selected' : ''
          }>کلاس ${toPersianDigits(c.code)}</option>`
      )
      .join('');

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-base font-black text-[#251B15] m-0">
            ${editingItem ? `ویرایش تکلیف: ${toPersianDigits(editingItem.title)}` : 'صفحه ایجاد تکلیف جدید'}
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            مشخصات، مهلت تحویل، فایل پیوست و موارد مورد نیاز تکلیف را وارد نمایید.
          </p>
        </div>
        <button type="button" class="btn-admin-action js-back-to-assignments-list">
          <span>بازگشت به لیست تکالیف ←</span>
        </button>
      </div>

      <div class="admin-surface-card">
        <form id="form-save-assignment" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="scool-field-label">عنوان تکلیف</label>
              <input
                type="text"
                id="hw-title"
                class="school-input"
                placeholder="مثلاً: تمرین طراحی رابط کاربری واکنش‌گرا"
                value="${editingItem ? toPersianDigits(editingItem.title) : ''}"
                required
              />
            </div>

            <div>
              <label class="scool-field-label">کلاس هدف</label>
              <select id="hw-class" class="school-select" required>
                ${classOptionsHtml}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="scool-field-label">مهلت تحویل</label>
              <input
                type="text"
                id="hw-duedate"
                class="school-input"
                placeholder="۱۴۰۵/۰۸/۲۸ · ساعت ۱۸:۰۰"
                value="${editingItem ? toPersianDigits(editingItem.dueDate) : '۱۴۰۵/۰۸/۲۸ · ساعت ۱۸:۰۰'}"
                required
              />
            </div>

            <div>
              <label class="scool-field-label">بارم نمره</label>
              <input
                type="text"
                id="hw-maxscore"
                class="school-input tabular-nums"
                value="${editingItem ? toPersianDigits(editingItem.maxScore) : '۲۰'}"
                required
              />
            </div>

            <div>
              <label class="scool-field-label">نام فایل پیوست مدرس</label>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  id="hw-attachment"
                  class="school-input flex-1"
                  placeholder="فایل راهنمای تمرین.pdf"
                  value="${
                    pendingAssignmentAttachmentName
                      ? toPersianDigits(pendingAssignmentAttachmentName)
                      : editingItem
                      ? toPersianDigits(editingItem.attachmentName)
                      : 'فایل راهنمای تمرین.pdf'
                  }"
                />
                <label for="hw-file-upload" class="btn-admin-action !h-[42px] cursor-pointer shrink-0">
                  انتخاب فایل
                </label>
                <input type="file" id="hw-file-upload" class="hidden" />
              </div>
            </div>
          </div>

          <div>
            <label class="scool-field-label">توضیحات کامل و موارد مورد نیاز تکلیف</label>
            <textarea
              id="hw-desc"
              class="school-textarea !min-h-[120px]"
              placeholder="شرح کامل موارد مورد نیاز، فرمت فایل ارسالی و نکات مهم تمرین..."
              required
            >${editingItem ? toPersianDigits(editingItem.description) : ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E6D8C5]">
            <button type="button" class="btn-admin-action !h-10 js-back-to-assignments-list">
              انصراف و بازگشت
            </button>
            <button type="submit" class="btn-admin-primary !h-10">
              ${editingItem ? 'ذخیره تغییرات تکلیف' : 'ثبت و انتشار تکلیف جدید'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی مشاهده جزئیات تکلیف و وضعیت تحویل دانش‌آموزان (/admin/assignments/detail)
 */
function renderAssignmentDetailPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  assignmentId: number
): void {
  const hw = state.assignments.find((a) => a.id === assignmentId);
  if (!hw) {
    assignmentSubView = 'list';
    renderAssignmentsSection($container, state);
    return;
  }

  const targetStudents = state.students.filter((s) =>
    hw.classCode === 'all' ? Boolean(s.classCode) : s.classCode === hw.classCode
  );
  const submissions = state.submissions.filter((sub) => sub.assignmentId === hw.id);
  const submittedCount = submissions.length;
  const notSubmittedCount = Math.max(0, targetStudents.length - submittedCount);

  const studentRowsHtml = targetStudents.length
    ? targetStudents
        .map((st) => {
          const sub = submissions.find((s) => s.studentId === st.id);
          return `
            <tr>
              <td>
                <div class="flex items-center gap-2.5">
                  ${renderStudentAvatarHtml(st, 'sm')}
                  <span class="font-extrabold text-[#251B15]">${st.firstName} ${st.lastName}</span>
                </div>
              </td>
              <td class="font-bold text-[#5A3A22]">${st.classCode ? `کلاس ${toPersianDigits(st.classCode)}` : '—'}</td>
              <td>
                ${
                  sub
                    ? `<span class="text-[#059669] font-extrabold">تحویل داده</span>`
                    : `<span class="text-[#E11D48] font-extrabold">تحویل نداده</span>`
                }
              </td>
              <td class="tabular-nums text-xs">
                ${sub ? toPersianDigits(sub.submittedAt) : '—'}
              </td>
              <td class="tabular-nums font-bold">
                ${
                  sub
                    ? sub.score !== null
                      ? `<span class="text-[#059669]">${toPersianDigits(sub.score)} از ${toPersianDigits(hw.maxScore)}</span>`
                      : `<span class="text-[#D97706]">در انتظار نمره</span>`
                    : '—'
                }
              </td>
              <td>
                ${
                  sub
                    ? `
                    <button
                      type="button"
                      class="btn-admin-primary !h-8 !text-xs js-open-submission-page"
                      data-id="${sub.id}"
                    >
                      مشاهده پاسخ در صفحه جدید
                    </button>`
                    : `<span class="text-[11px] text-[#6E5D4F]">پاسخی ارسال نشده</span>`
                }
              </td>
            </tr>
          `;
        })
        .join('')
    : `<tr><td colspan="6" class="text-center py-6">دانش‌آموزی در این کلاس یافت نشد.</td></tr>`;

  $container.html(`
    <div class="space-y-4">
      <!-- هدر صفحه جزئیات تکلیف -->
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
              ${formatClassLabel(hw.classCode)}
            </span>
            <h2 class="text-base font-black text-[#251B15] m-0">
              ${toPersianDigits(hw.title)}
            </h2>
          </div>
          <p class="text-xs text-[#6E5D4F] mt-1.5 m-0">
            مهلت تحویل: <strong class="text-[#251B15]">${toPersianDigits(hw.dueDate)}</strong> · بارم: <strong class="text-[#251B15]">${toPersianDigits(hw.maxScore)} نمره</strong>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-admin-action js-edit-assignment"
            data-id="${hw.id}"
          >
            ویرایش تکلیف
          </button>
          <button type="button" class="btn-admin-action js-back-to-assignments-list">
            بازگشت به لیست تکالیف ←
          </button>
        </div>
      </div>

      <!-- کارت شرح موارد مورد نیاز و فایل پیوست تکلیف -->
      <div class="admin-surface-card space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="text-sm font-extrabold text-[#251B15] m-0">موارد مورد نیاز و توضیحات تکلیف</h3>
          <span class="text-xs text-[#6E5D4F] tabular-nums">تاریخ ثبت: ${toPersianDigits(hw.createdAt)}</span>
        </div>
        <p class="text-xs text-[#3E3027] m-0 leading-relaxed">
          ${toPersianDigits(hw.description)}
        </p>

        <div class="pt-3 border-t border-[#E6D8C5] flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-[#6E5D4F]">فایل راهنما / پیوست مدرس:</span>
            <strong class="text-[#5A3A22]">${toPersianDigits(hw.attachmentName)}</strong>
            <button
              type="button"
              class="btn-admin-action !h-7 !px-2.5 !text-[11px] js-download-hw-attachment"
              data-id="${hw.id}"
            >
              دانلود فایل پیوست
            </button>
          </div>

          <div class="flex items-center gap-3 text-xs">
            <span class="text-[#059669] font-extrabold">تحویل داده: ${toPersianDigits(submittedCount)} نفر</span>
            <span class="text-[#E11D48] font-extrabold">تحویل نداده: ${toPersianDigits(notSubmittedCount)} نفر</span>
          </div>
        </div>
      </div>

      <!-- جدول وضعیت تحویل تکلیف توسط دانش‌آموزان -->
      <div class="admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-3 m-0">
          لیست دانش‌آموزان و وضعیت تحویل (${toPersianDigits(submittedCount)} از ${toPersianDigits(targetStudents.length)} نفر)
        </h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>دانش‌آموز (عکس و نام)</th>
                <th>کلاس</th>
                <th>وضعیت تحویل</th>
                <th>زمان ارسال</th>
                <th>نمره ثبت‌شده</th>
                <th>مشاهده پاسخ و نمره</th>
              </tr>
            </thead>
            <tbody>
              ${studentRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی مشاهده پاسخ دانش‌آموز، دانلود فایل ارسالی و ثبت نمره و بازخورد (/admin/assignments/submission)
 */
function renderAssignmentSubmissionPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  submissionId: number
): void {
  const sub = state.submissions.find((s) => s.id === submissionId);
  if (!sub) {
    assignmentSubView = 'detail';
    renderAssignmentsSection($container, state);
    return;
  }

  const hw = state.assignments.find((a) => a.id === sub.assignmentId);
  const studentObj = state.students.find((st) => st.id === sub.studentId) || {
    id: sub.studentId,
    firstName: sub.studentName,
    lastName: '',
    avatarUrl: '',
  };

  $container.html(`
    <div class="space-y-4">
      <!-- نوار بالایی صفحه مشاهده پاسخ دانش‌آموز -->
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          ${renderStudentAvatarHtml(studentObj, 'lg')}
          <div>
            <h2 class="text-base font-black text-[#251B15] m-0">
              پاسخ ارسالی: ${sub.studentName}
            </h2>
            <p class="text-xs font-bold text-[#1B5E5A] mt-1 m-0">
              ${sub.classCode ? `کلاس ${toPersianDigits(sub.classCode)}` : '—'} · تکلیف: ${toPersianDigits(hw ? hw.title : 'تکلیف کلاسی')}
            </p>
            <p class="text-[11px] text-[#6E5D4F] mt-0.5 m-0 tabular-nums">
              زمان ارسال پاسخ: ${toPersianDigits(sub.submittedAt)}
            </p>
          </div>
        </div>

        <button type="button" class="btn-admin-action js-back-to-assignment-detail">
          بازگشت به جزئیات تکلیف ←
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- ستون راست: محتوای پاسخ و فایل ارسالی دانش‌آموز -->
        <div class="lg:col-span-7 admin-surface-card space-y-4">
          <div class="flex items-center justify-between gap-2 pb-3 border-b border-[#E6D8C5] flex-wrap">
            <h3 class="text-sm font-extrabold text-[#251B15] m-0">متن پاسخ و فایل تحویلی دانش‌آموز</h3>
            <button
              type="button"
              class="btn-admin-action !h-8 !text-xs js-download-submission-file"
              data-id="${sub.id}"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>دانلود فایل (${toPersianDigits(sub.fileName)})</span>
            </button>
          </div>

          <div class="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB]">
            <div class="text-xs font-extrabold text-[#5A3A22] mb-2">شرح پاسخ دانش‌آموز:</div>
            <pre class="text-xs text-[#251B15] whitespace-pre-wrap leading-relaxed m-0 font-normal">${toPersianDigits(sub.fileContent)}</pre>
          </div>

          ${
            hw
              ? `
              <div class="p-3.5 rounded-xl bg-[#F3ECE0] border border-[#DFD2C0] text-xs space-y-1">
                <div class="font-extrabold text-[#5A3A22]">یادآوری صورت تکلیف:</div>
                <p class="text-[#3E3027] m-0 leading-relaxed">${toPersianDigits(hw.description)}</p>
              </div>`
              : ''
          }
        </div>

        <!-- ستون چپ: فرم تصحیح، ثبت نمره و بازخورد تشریحی -->
        <div class="lg:col-span-5 admin-surface-card">
          <h3 class="text-sm font-extrabold text-[#251B15] mb-3.5 m-0">
            تصحیح، ثبت نمره و بازخورد مدرس
          </h3>

          <form id="form-grade-submission-page" data-id="${sub.id}" class="space-y-3.5">
            <div>
              <label for="grade-page-score" class="scool-field-label">
                نمره دانش‌آموز (از ${toPersianDigits(hw ? hw.maxScore : 20)})
              </label>
              <input
                type="text"
                inputmode="decimal"
                id="grade-page-score"
                class="school-input tabular-nums"
                placeholder="مثال: ۱۹.۵"
                value="${toPersianDigits(sub.score !== null ? sub.score : hw ? hw.maxScore : 20)}"
                required
              />
            </div>

            <div>
              <label for="grade-page-feedback" class="scool-field-label">
                بازخورد تشریحی مدرس برای دانش‌آموز
              </label>
              <textarea
                id="grade-page-feedback"
                class="school-textarea !min-h-[110px]"
                placeholder="نکات قوت یا اصلاحات لازم را برای دانش‌آموز بنویسید..."
                required
              >${toPersianDigits(
                sub.teacherFeedback ||
                  'تکلیف شما بررسی شد. کدنویسی و پیاده‌سازی ارائه‌شده صحیح و کامل است.'
              )}</textarea>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <button type="submit" class="btn-admin-primary !h-10 flex-1">
                ثبت نهایی نمره و بازخورد
              </button>
              <button type="button" class="btn-admin-action !h-10 js-back-to-assignment-detail">
                بازگشت
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   5. منابع آموزشی:
      - لیست کارتی منابع آموزشی (/admin/resources)
      - صفحه جدید افزودن / ویرایش منبع آموزشی (/admin/resources/create | /admin/resources/edit)
      - مودال جزئیات و دانش‌آموزان مشاهده‌کننده با عکس پروفایل
   ============================================================================ */
function renderResourcesSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  if (resourceSubView === 'form') {
    renderResourceFormPage($container, state);
    return;
  }

  if (resourceSubView === 'detail' && activeResourceDetailId) {
    renderResourceDetailPage($container, state, activeResourceDetailId);
    return;
  }

  const normalizedQuery = normalizeDigits(resourceSearchQuery.trim()).toLowerCase();

  const list = state.resources.filter((res) => {
    const matchesClass =
      resourceFilter === 'all'
        ? true
        : String(res.classCode) === String(resourceFilter) || res.classCode === 'all';

    const matchesQuery =
      !normalizedQuery ||
      res.title.toLowerCase().includes(normalizedQuery) ||
      res.description.toLowerCase().includes(normalizedQuery) ||
      res.category.toLowerCase().includes(normalizedQuery);

    return matchesClass && matchesQuery;
  });

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار منابع آموزشی: فیلتر، جستجو و دکمه باز کردن صفحه افزودن منبع -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button
            type="button"
            class="admin-seg-btn js-res-filter ${resourceFilter === 'all' ? 'is-active' : ''}"
            data-filter="all"
          >
            همه (${toPersianDigits(state.resources.length)})
          </button>
          ${state.classes
            .map(
              (c) => `
              <button
                type="button"
                class="admin-seg-btn js-res-filter ${
                  String(resourceFilter) === String(c.code) ? 'is-active' : ''
                }"
                data-filter="${c.code}"
              >
                کلاس ${toPersianDigits(c.code)}
              </button>`
            )
            .join('')}
        </div>

        <div class="flex items-center gap-2.5">
          <input
            type="search"
            id="resource-search-input"
            class="school-input !h-9 !w-52 text-xs"
            placeholder="جستجوی عنوان یا نوع منبع..."
            value="${toPersianDigits(resourceSearchQuery)}"
          />
          <button type="button" id="btn-open-create-resource" class="btn-admin-primary !h-9">
            + افزودن فایل / منبع جدید
          </button>
        </div>
      </div>

      <!-- کارت‌های منابع آموزشی -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        ${
          list.length
            ? list
                .map((res) => {
                  const viewersCount = res.viewers ? res.viewers.length : 0;
                  return `
                    <div class="modern-class-card">
                      <div>
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-[11px] font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
                            ${res.category} · ${formatClassLabel(res.classCode)}
                          </span>
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              class="btn-icon-action js-edit-resource"
                              data-id="${res.id}"
                              title="ویرایش منبع آموزشی در صفحه جدید"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="btn-icon-action btn-icon-danger js-delete-resource"
                              data-id="${res.id}"
                              title="حذف منبع آموزشی"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
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
                          <span>حجم / نوع: <strong class="text-[#251B15]">${toPersianDigits(res.fileSize)}</strong></span>
                          <span>بازدید دانش‌آموزان: <strong class="text-[#059669]">${toPersianDigits(viewersCount)} نفر</strong></span>
                        </div>

                        <button
                          type="button"
                          class="btn-admin-primary w-full !h-9 text-xs js-view-resource-detail"
                          data-id="${res.id}"
                        >
                          مشاهده جزئیات در صفحه جدید
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')
            : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">منبع آموزشی مطابق فیلتر یا جستجو یافت نشد.</div>`
        }
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی افزودن یا ویرایش منبع آموزشی (/admin/resources/create | /admin/resources/edit)
 */
function renderResourceFormPage($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const editingRes = editingResourceId
    ? state.resources.find((r) => r.id === editingResourceId) || null
    : null;

  const classOptionsHtml =
    `<option value="all" ${editingRes?.classCode === 'all' ? 'selected' : ''}>هر سه کلاس (۹۰۱ تا ۹۰۳)</option>` +
    state.classes
      .map(
        (c) =>
          `<option value="${c.code}" ${
            editingRes?.classCode === c.code ? 'selected' : ''
          }>کلاس ${toPersianDigits(c.code)}</option>`
      )
      .join('');

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-base font-black text-[#251B15] m-0">
            ${editingRes ? `ویرایش منبع آموزشی: ${toPersianDigits(editingRes.title)}` : 'صفحه افزودن منبع آموزشی جدید'}
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            فایل آموزشی، جزوه، تمرین یا لینک مربوط به کلاس‌ها را در این صفحه ثبت کنید.
          </p>
        </div>
        <button type="button" class="btn-admin-action js-back-to-resources-list">
          <span>بازگشت به لیست منابع ←</span>
        </button>
      </div>

      <div class="admin-surface-card">
        <form id="form-save-resource" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="md:col-span-1">
              <label class="scool-field-label">عنوان منبع آموزشی</label>
              <input
                type="text"
                id="res-title"
                class="school-input"
                placeholder="مثلاً: جزوه طراحی وب مدرن"
                value="${editingRes ? toPersianDigits(editingRes.title) : ''}"
                required
              />
            </div>

            <div>
              <label class="scool-field-label">نوع منبع</label>
              <select id="res-category" class="school-select">
                <option value="جزوه PDF" ${editingRes?.category === 'جزوه PDF' ? 'selected' : ''}>جزوه PDF</option>
                <option value="فایل تمرین" ${editingRes?.category === 'فایل تمرین' ? 'selected' : ''}>فایل تمرین</option>
                <option value="لینک آموزشی" ${editingRes?.category === 'لینک آموزشی' ? 'selected' : ''}>لینک آموزشی</option>
                <option value="ویدیو ضبط‌شده" ${editingRes?.category === 'ویدیو ضبط‌شده' ? 'selected' : ''}>ویدیو ضبط‌شده</option>
              </select>
            </div>

            <div>
              <label class="scool-field-label">کلاس هدف</label>
              <select id="res-class" class="school-select">
                ${classOptionsHtml}
              </select>
            </div>
          </div>

          <div>
            <label class="scool-field-label">نام فایل یا آدرس لینک</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                id="res-url"
                class="school-input flex-1"
                placeholder="booklet-session-4.pdf یا آدرس لینک"
                value="${
                  pendingResourceFileName
                    ? toPersianDigits(pendingResourceFileName)
                    : editingRes
                    ? toPersianDigits(editingRes.urlOrFileName)
                    : ''
                }"
                required
              />
              <label for="res-file-upload" class="btn-admin-action !h-[42px] cursor-pointer shrink-0">
                انتخاب فایل از سیستم
              </label>
              <input type="file" id="res-file-upload" class="hidden" />
            </div>
          </div>

          <div>
            <label class="scool-field-label">توضیحات کامل منبع آموزشی</label>
            <textarea
              id="res-desc"
              class="school-textarea !min-h-[110px]"
              placeholder="توضیح درباره سرفصل‌ها، کاربرد فایل و نکات مطالعه برای دانش‌آموزان..."
              required
            >${editingRes ? toPersianDigits(editingRes.description) : ''}</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E6D8C5]">
            <button type="button" class="btn-admin-action !h-10 js-back-to-resources-list">
              انصراف و بازگشت
            </button>
            <button type="submit" class="btn-admin-primary !h-10">
              ${editingRes ? 'ذخیره تغییرات منبع آموزشی' : 'ثبت و انتشار منبع آموزشی'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی مشاهده جزئیات منبع آموزشی و لیست دانش‌آموزان مشاهده‌کننده (/admin/resources/detail)
 */
function renderResourceDetailPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  resourceId: number
): void {
  const res = state.resources.find((r) => r.id === resourceId);
  if (!res) {
    resourceSubView = 'list';
    renderResourcesSection($container, state);
    return;
  }

  const targetStudents = state.students.filter((s) =>
    res.classCode === 'all' ? Boolean(s.classCode) : s.classCode === res.classCode
  );
  const viewers = res.viewers || [];
  const viewedCount = viewers.length;
  const notViewedCount = Math.max(0, targetStudents.length - viewedCount);

  const studentRowsHtml = targetStudents.length
    ? targetStudents
        .map((st) => {
          const viewLog = viewers.find((v) => v.studentId === st.id);
          return `
            <tr>
              <td>
                <div class="flex items-center gap-2.5">
                  ${renderStudentAvatarHtml(st, 'sm')}
                  <span class="font-extrabold text-[#251B15]">${st.firstName} ${st.lastName}</span>
                </div>
              </td>
              <td class="font-bold text-[#5A3A22]">${st.classCode ? `کلاس ${toPersianDigits(st.classCode)}` : '—'}</td>
              <td>
                ${
                  viewLog
                    ? `<span class="text-[#059669] font-extrabold">مشاهده کرده</span>`
                    : `<span class="text-[#D97706] font-extrabold">مشاهده نکرده</span>`
                }
              </td>
              <td class="tabular-nums text-xs">
                ${viewLog ? toPersianDigits(viewLog.viewedAt) : '—'}
              </td>
            </tr>
          `;
        })
        .join('')
    : `<tr><td colspan="4" class="text-center py-6">دانش‌آموزی در این کلاس ثبت نشده است.</td></tr>`;

  $container.html(`
    <div class="space-y-4">
      <!-- هدر صفحه جزئیات منبع آموزشی -->
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
              ${res.category} · ${formatClassLabel(res.classCode)}
            </span>
            <h2 class="text-base font-black text-[#251B15] m-0">
              ${toPersianDigits(res.title)}
            </h2>
          </div>
          <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 tabular-nums">
            تاریخ ثبت: <strong class="text-[#251B15]">${toPersianDigits(res.createdAt)}</strong> · حجم / نوع: <strong class="text-[#251B15]">${toPersianDigits(res.fileSize)}</strong>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-admin-action js-edit-resource"
            data-id="${res.id}"
          >
            ویرایش منبع آموزشی
          </button>
          <button type="button" class="btn-admin-action js-back-to-resources-list">
            بازگشت به لیست منابع ←
          </button>
        </div>
      </div>

      <!-- کارت توضیحات منبع آموزشی و دانلود فایل -->
      <div class="admin-surface-card space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="text-sm font-extrabold text-[#251B15] m-0">توضیحات و فایل منبع آموزشی</h3>
          <span class="text-xs font-bold text-[#1B5E5A]">${formatClassLabel(res.classCode)}</span>
        </div>
        <p class="text-xs text-[#3E3027] m-0 leading-relaxed">
          ${toPersianDigits(res.description)}
        </p>

        <div class="pt-3 border-t border-[#E6D8C5] flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-[#6E5D4F]">فایل / لینک منبع:</span>
            <strong class="text-[#5A3A22]">${toPersianDigits(res.urlOrFileName)}</strong>
            <button
              type="button"
              class="btn-admin-action !h-7 !px-2.5 !text-[11px] js-download-resource-file"
              data-id="${res.id}"
            >
              دانلود فایل منبع
            </button>
          </div>

          <div class="flex items-center gap-3 text-xs">
            <span class="text-[#059669] font-extrabold">مشاهده کرده: ${toPersianDigits(viewedCount)} نفر</span>
            <span class="text-[#D97706] font-extrabold">مشاهده نکرده: ${toPersianDigits(notViewedCount)} نفر</span>
          </div>
        </div>
      </div>

      <!-- جدول لیست دانش‌آموزان مشاهده‌کننده -->
      <div class="admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-3 m-0">
          لیست دانش‌آموزان و وضعیت مشاهده (${toPersianDigits(viewedCount)} از ${toPersianDigits(targetStudents.length)} نفر)
        </h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>دانش‌آموز (عکس و نام)</th>
                <th>کلاس</th>
                <th>وضعیت مشاهده</th>
                <th>زمان مشاهده / دریافت</th>
              </tr>
            </thead>
            <tbody>
              ${studentRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   6. اطلاعیه‌ها: دکمه ارسال اطلاعیه جدید، فیلتر و جستجو
   ============================================================================ */
function renderAnnouncementsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const normalizedQuery = normalizeDigits(announcementSearchQuery.trim()).toLowerCase();

  const filteredAnnouncements = state.announcements.filter((ann) => {
    const matchesFilter =
      announcementFilter === 'all'
        ? true
        : announcementFilter === 'فوری' || announcementFilter === 'مهم'
        ? ann.priority === announcementFilter
        : String(ann.targetClasses) === String(announcementFilter) || ann.targetClasses === 'all';

    const matchesQuery =
      !normalizedQuery ||
      ann.title.toLowerCase().includes(normalizedQuery) ||
      ann.content.toLowerCase().includes(normalizedQuery);

    return matchesFilter && matchesQuery;
  });

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار اطلاعیه‌ها: فیلتر، جستجو و دکمه ارسال اطلاعیه جدید -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button
            type="button"
            class="admin-seg-btn js-ann-filter ${announcementFilter === 'all' ? 'is-active' : ''}"
            data-filter="all"
          >
            همه (${toPersianDigits(state.announcements.length)})
          </button>
          ${state.classes
            .map(
              (c) => `
              <button
                type="button"
                class="admin-seg-btn js-ann-filter ${
                  String(announcementFilter) === String(c.code) ? 'is-active' : ''
                }"
                data-filter="${c.code}"
              >
                کلاس ${toPersianDigits(c.code)}
              </button>`
            )
            .join('')}
          <button
            type="button"
            class="admin-seg-btn js-ann-filter ${announcementFilter === 'مهم' ? 'is-active' : ''}"
            data-filter="مهم"
          >
            مهم
          </button>
          <button
            type="button"
            class="admin-seg-btn js-ann-filter ${announcementFilter === 'فوری' ? 'is-active' : ''}"
            data-filter="فوری"
          >
            فوری
          </button>
        </div>

        <div class="flex items-center gap-2.5">
          <input
            type="search"
            id="announcement-search-input"
            class="school-input !h-9 !w-52 text-xs"
            placeholder="جستجو در عنوان یا متن اطلاعیه..."
            value="${toPersianDigits(announcementSearchQuery)}"
          />
          <button type="button" id="btn-open-create-announcement" class="btn-admin-primary !h-9">
            + ارسال اطلاعیه جدید
          </button>
        </div>
      </div>

      <!-- لیست اطلاعیه‌ها به همراه دکمه مودال لیست خوانده‌ها برای مدیر -->
      <div class="space-y-3.5">
        ${
          filteredAnnouncements.length
            ? filteredAnnouncements
                .map((ann) => {
                  const readers = ann.readers || [];
                  return `
                  <div class="admin-surface-card">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm font-black text-[#251B15]">${toPersianDigits(ann.title)}</span>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          ann.priority === 'فوری'
                            ? 'bg-[#FFF1F2] text-[#E11D48]'
                            : ann.priority === 'مهم'
                            ? 'bg-[#FFFBEB] text-[#D97706]'
                            : 'bg-[#ECFDF5] text-[#059669]'
                        }">
                          اولویت ${ann.priority}
                        </span>
                        <span class="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] tabular-nums">
                          خوانده شده توسط ${toPersianDigits(readers.length)} نفر
                        </span>
                      </div>
                      <button
                        type="button"
                        class="btn-icon-action btn-icon-danger js-delete-announcement"
                        data-id="${ann.id}"
                        title="حذف اطلاعیه"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p class="text-xs text-[#6E5D4F] mt-2 m-0 leading-relaxed">${toPersianDigits(ann.content)}</p>
                    <div class="mt-3 pt-2.5 border-t border-[#E6D8C5] flex items-center justify-between gap-2 flex-wrap text-[11px] text-[#6E5D4F]">
                      <div class="flex items-center gap-3 flex-wrap">
                        <span>گیرندگان: <strong class="text-[#5A3A22]">${formatClassLabel(ann.targetClasses)}</strong></span>
                        <span class="tabular-nums">تاریخ انتشار: ${toPersianDigits(ann.createdAt)}</span>
                      </div>
                      <button
                        type="button"
                        class="btn-admin-action !h-8 !px-3 !text-xs js-open-ann-readers-modal"
                        data-id="${ann.id}"
                      >
                        مشاهده لیست خوانده‌ها (${toPersianDigits(readers.length)} نفر)
                      </button>
                    </div>
                  </div>`;
                })
                .join('')
            : `<div class="admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">اطلاعیه‌ای مطابق فیلتر یا جستجو یافت نشد.</div>`
        }
      </div>
    </div>
  `);
}

/* ============================================================================
   7. تیکت: عکس پروفایل دانش‌آموز، پاسخ‌گویی به تیکت‌ها + پیوست فایل با قابلیت دانلود مستقیم
   ============================================================================ */
function renderTicketsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const filteredTickets = state.tickets.filter((tk) =>
    ticketFilter === 'all' ? true : tk.status === ticketFilter
  );

  if (!activeTicketId && filteredTickets.length > 0) {
    activeTicketId = filteredTickets[0].id;
  }

  const currentTicket =
    state.tickets.find((t) => t.id === activeTicketId) || filteredTickets[0] || null;

  const currentTicketStudent = currentTicket
    ? state.students.find((s) => s.id === currentTicket.studentId) || {
        id: currentTicket.studentId,
        firstName: currentTicket.studentName,
        lastName: '',
        avatarUrl: '',
      }
    : null;

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- لیست تیکت‌ها با عکس پروفایل دانش‌آموز -->
      <div class="lg:col-span-5 admin-surface-card">
        <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <h3 class="text-sm font-extrabold text-[#251B15] m-0">صندوق تیکت‌ها</h3>
          <div class="admin-segmented-bar">
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'all' ? 'is-active' : ''}" data-filter="all">همه</button>
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'در انتظار پاسخ' ? 'is-active' : ''}" data-filter="در انتظار پاسخ">در انتظار پاسخ</button>
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'پاسخ داده شده' ? 'is-active' : ''}" data-filter="پاسخ داده شده">پاسخ‌داده‌شده</button>
          </div>
        </div>

        <div class="space-y-2.5">
          ${filteredTickets
            .map((tk) => {
              const stObj = state.students.find((s) => s.id === tk.studentId) || {
                id: tk.studentId,
                firstName: tk.studentName,
                lastName: '',
                avatarUrl: '',
              };
              return `
              <div
                class="p-3.5 rounded-xl border cursor-pointer transition-all js-select-ticket ${
                  currentTicket?.id === tk.id
                    ? 'bg-[#F3ECE0] border-[#5A3A22]'
                    : 'bg-[#FDFBF7] border-[#E5DBCB]'
                }"
                data-id="${tk.id}"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    ${renderStudentAvatarHtml(stObj, 'sm')}
                    <div class="min-w-0">
                      <div class="text-xs font-extrabold text-[#251B15] truncate">${toPersianDigits(tk.subject)}</div>
                      <div class="text-[11px] text-[#6E5D4F] mt-0.5 tabular-nums">
                        ${tk.studentName} · ${tk.classCode ? `کلاس ${toPersianDigits(tk.classCode)}` : '—'}
                      </div>
                    </div>
                  </div>
                  <span class="text-[11px] font-bold shrink-0 ${
                    tk.status === 'در انتظار پاسخ' ? 'text-[#D97706]' : 'text-[#059669]'
                  }">${tk.status}</span>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>

      <!-- جزئیات گفت‌وگو و ارسال پاسخ ادمین به همراه پیوست فایل و دانلود -->
      <div class="lg:col-span-7 admin-surface-card">
        ${
          currentTicket && currentTicketStudent
            ? `
            <div class="pb-3.5 mb-3.5 border-b border-[#E6D8C5] flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-3">
                ${renderStudentAvatarHtml(currentTicketStudent, 'sm')}
                <div>
                  <h3 class="text-sm font-extrabold text-[#251B15] m-0">${toPersianDigits(currentTicket.subject)}</h3>
                  <div class="text-xs text-[#6E5D4F] mt-0.5 tabular-nums">
                    دانش‌آموز: <strong class="text-[#251B15]">${currentTicket.studentName}</strong> (${currentTicket.classCode ? `کلاس ${toPersianDigits(currentTicket.classCode)}` : '—'}) · تلفن: ${toPersianDigits(currentTicket.studentPhone)}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-admin-action js-toggle-ticket-close" data-id="${currentTicket.id}">
                  ${currentTicket.status === 'بسته شده' ? 'بازگشایی تیکت' : 'بستن تیکت'}
                </button>
              </div>
            </div>

            <div class="space-y-3 mb-4 max-h-[250px] overflow-y-auto pr-1">
              ${currentTicket.messages
                .map(
                  (msg) => `
                  <div class="p-3.5 rounded-xl border ${
                    msg.senderRole === 'admin'
                      ? 'bg-[#F3ECE0] border-[#D4C3AE]'
                      : 'bg-[#FDFBF7] border-[#E5DBCB]'
                  }">
                    <div class="flex items-center justify-between text-[11px] font-bold text-[#251B15] mb-1">
                      <span>${msg.senderName} (${msg.senderRole === 'admin' ? 'مدیر / مدرس' : 'دانش‌آموز'})</span>
                      <span class="tabular-nums text-[#6E5D4F]">${toPersianDigits(msg.sentAt)}</span>
                    </div>
                    <p class="text-xs text-[#3E3027] m-0 leading-relaxed">${toPersianDigits(msg.message)}</p>
                    ${
                      msg.attachmentName
                        ? `
                        <div class="mt-2.5 pt-2.5 border-t border-[#E5DBCB] flex items-center justify-between gap-2 flex-wrap">
                          <div class="flex items-center gap-1.5 text-[11px] font-bold text-[#1B5E5A]">
                            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span>فایل ضمیمه: ${toPersianDigits(msg.attachmentName)}</span>
                          </div>
                          <button
                            type="button"
                            class="btn-admin-action !h-7 !px-2.5 !text-[11px] js-download-ticket-attachment"
                            data-ticket-id="${currentTicket.id}"
                            data-msg-id="${msg.id}"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>دانلود فایل</span>
                          </button>
                        </div>`
                        : ''
                    }
                  </div>`
                )
                .join('')}
            </div>

            <form id="form-reply-ticket" data-id="${currentTicket.id}" class="space-y-3">
              <div>
                <label class="scool-field-label">پاسخ شما به دانش‌آموز</label>
                <textarea
                  id="ticket-reply-text"
                  class="school-textarea !min-h-[76px]"
                  placeholder="پاسخ راهنمایی یا آموزشی خود را بنویسید..."
                  required
                ></textarea>
              </div>

              <!-- بخش پیوست فایل در تیکت -->
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                  <label
                    for="ticket-reply-file"
                    class="btn-admin-action cursor-pointer"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span>افزودن فایل پیوست</span>
                  </label>
                  <input type="file" id="ticket-reply-file" class="hidden" />
                  <span id="ticket-attached-filename" class="text-xs font-bold text-[#1B5E5A]">
                    ${pendingTicketAttachmentName ? toPersianDigits(pendingTicketAttachmentName) : 'فایلی انتخاب نشده'}
                  </span>
                </div>

                <button type="submit" class="btn-admin-primary">
                  ارسال پاسخ تیکت
                </button>
              </div>
            </form>
          `
            : `<div class="p-8 text-center text-xs text-[#6E5D4F]">تیکتی برای نمایش وجود ندارد.</div>`
        }
      </div>
    </div>
  `);
}

/* ============================================================================
   8. پروفایل: امکان افزودن و تغییر تصویر پروفایل، مشخصات ادمین و تغییر رمز عبور
   ============================================================================ */
function renderProfileSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const admin = state.admin;
  const customAvatarStyle = admin.avatarUrl
    ? `style="background-image: url('${admin.avatarUrl}');"`
    : '';
  const customAvatarClass = admin.avatarUrl ? 'has-custom-avatar' : '';

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div class="lg:col-span-7 admin-surface-card">
        <!-- هدر تصویر پروفایل مدیر به همراه دکمه بارگذاری عکس جدید -->
        <div class="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-[#E6D8C5] flex-wrap">
          <div class="flex items-center gap-4">
            <div
              id="profile-page-avatar"
              class="admin-ref-avatar-lg ${customAvatarClass}"
              ${customAvatarStyle}
              role="img"
              aria-label="تصویر پروفایل مدیر"
            ></div>
            <div>
              <h3 class="text-base font-black text-[#251B15] m-0">
                ${admin.firstName} ${admin.lastName}
              </h3>
              <p class="text-xs font-bold text-[#1B5E5A] mt-1 m-0">${admin.roleTitle}</p>
              <p class="text-xs text-[#6E5D4F] mt-1 m-0 tabular-nums">
                شماره تماس: ${toPersianDigits(admin.phone)}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <label for="prof-avatar-upload" class="btn-admin-action cursor-pointer">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>انتخاب تصویر پروفایل</span>
            </label>
            <input type="file" id="prof-avatar-upload" accept="image/*" class="hidden" />
            ${
              admin.avatarUrl
                ? `<button type="button" id="btn-reset-admin-avatar" class="btn-admin-danger !h-[35px]">حذف تصویر</button>`
                : ''
            }
          </div>
        </div>

        <form id="form-admin-profile" class="space-y-3.5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">نام</label>
              <input type="text" id="prof-firstname" class="school-input" value="${admin.firstName}" required />
            </div>
            <div>
              <label class="scool-field-label">نام خانوادگی</label>
              <input type="text" id="prof-lastname" class="school-input" value="${admin.lastName}" required />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">شماره تلفن ورود ادمین</label>
              <input type="tel" id="prof-phone" class="school-input tabular-nums" value="${toPersianDigits(admin.phone)}" required />
            </div>
            <div>
              <label class="scool-field-label">سمت آموزشی</label>
              <input type="text" id="prof-role" class="school-input" value="${admin.roleTitle}" required />
            </div>
          </div>

          <div>
            <label class="scool-field-label">بیوگرافی و معرفی مدرس</label>
            <textarea id="prof-bio" class="school-textarea">${toPersianDigits(admin.bio)}</textarea>
          </div>

          <button type="submit" class="btn-admin-primary">ذخیره اطلاعات پروفایل</button>
        </form>
      </div>

      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-4 m-0">امنیت و تغییر رمز عبور مدیر</h3>
        <form id="form-admin-password" class="space-y-3.5">
          <div>
            <label class="scool-field-label">رمز عبور فعلی</label>
            <input type="password" id="prof-current-pass" class="school-input" placeholder="رمز فعلی ادمین" required />
          </div>
          <div>
            <label class="scool-field-label">رمز عبور جدید</label>
            <input type="password" id="prof-new-pass" class="school-input" placeholder="حداقل ۶ کاراکتر" required />
          </div>
          <div>
            <label class="scool-field-label">تکرار رمز عبور جدید</label>
            <input type="password" id="prof-confirm-pass" class="school-input" placeholder="تکرار رمز عبور جدید" required />
          </div>
          <button type="submit" class="btn-admin-primary w-full">بروزرسانی رمز عبور ادمین</button>
        </form>

        <div class="mt-5 p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] text-xs text-[#6E5D4F]">
          <div class="font-extrabold text-[#251B15] mb-1">مشخصات فعلی ورود ادمین:</div>
          <div class="tabular-nums">شماره تلفن: <strong>${toPersianDigits(admin.phone)}</strong></div>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   9. تنظیمات: مشخصات کلاس‌ها و تنظیمات سامانه
   ============================================================================ */
function renderSettingsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const s = state.settings;
  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- تنظیمات عمومی سامانه -->
      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-4 m-0">تنظیمات کلی سامانه اسکول میت</h3>
        <form id="form-system-settings" class="space-y-3.5">
          <div>
            <label class="scool-field-label">عنوان سامانه</label>
            <input type="text" id="set-platform-name" class="school-input" value="اسکول میت" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">سال تحصیلی جاری</label>
              <input type="text" id="set-academic-year" class="school-input tabular-nums" value="${toPersianDigits(s.academicYear)}" required />
            </div>
            <div>
              <label class="scool-field-label">حداکثر حجم فایل تکلیف (مگابایت)</label>
              <input type="text" id="set-max-upload" class="school-input tabular-nums" value="${toPersianDigits(s.maxUploadSizeMb)}" required />
            </div>
          </div>
          <div>
            <label class="scool-field-label">شماره پشتیبانی سامانه</label>
            <input type="tel" id="set-support-phone" class="school-input tabular-nums" value="${toPersianDigits(s.supportPhone)}" required />
          </div>

          <div class="space-y-2 pt-1">
            <label class="flex items-center gap-2.5 text-xs font-bold text-[#251B15] cursor-pointer">
              <input type="checkbox" id="set-allow-reg" class="w-4 h-4 accent-[#5A3A22]" ${s.allowNewRegistrations ? 'checked' : ''} />
              <span>امکان ثبت‌نام دانش‌آموزان جدید در صفحه ورود فعال باشد</span>
            </label>
            <label class="flex items-center gap-2.5 text-xs font-bold text-[#251B15] cursor-pointer">
              <input type="checkbox" id="set-require-approval" class="w-4 h-4 accent-[#5A3A22]" ${s.requireAdminApproval ? 'checked' : ''} />
              <span>حساب دانش‌آموزان جدید نیازمند تأیید ادمین باشد</span>
            </label>
          </div>

          <div class="pt-2 flex items-center gap-2">
            <button type="submit" class="btn-admin-primary flex-1">ذخیره تنظیمات سامانه</button>
            <button type="button" id="btn-reset-demo-db" class="btn-admin-danger !h-[38px]">بازنشانی داده‌ها</button>
          </div>
        </form>
      </div>

      <!-- مشخصات سریع کلاس‌ها -->
      <div class="lg:col-span-7 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#251B15] mb-4 m-0">مشخصات کلاس‌های آموزشی</h3>
        <form id="form-all-classes-settings" class="space-y-4">
          ${state.classes
            .map(
              (cls) => `
              <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] space-y-2.5">
                <div class="text-xs font-black text-[#5A3A22]">کلاس ${toPersianDigits(cls.code)}</div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label class="scool-field-label">عنوان کلاس</label>
                    <input type="text" class="school-input !h-9 text-xs js-cls-set-title" data-code="${cls.code}" value="${toPersianDigits(cls.title)}" required />
                  </div>
                  <div>
                    <label class="scool-field-label">ظرفیت (نفر)</label>
                    <input type="text" class="school-input !h-9 text-xs tabular-nums js-cls-set-cap" data-code="${cls.code}" value="${toPersianDigits(cls.capacity)}" required />
                  </div>
                  <div>
                    <label class="scool-field-label">زمان‌بندی</label>
                    <input type="text" class="school-input !h-9 text-xs js-cls-set-sch" data-code="${cls.code}" value="${toPersianDigits(cls.scheduleSummary)}" required />
                  </div>
                </div>
              </div>`
            )
            .join('')}
          <button type="submit" class="btn-admin-primary">بروزرسانی مشخصات کلاس‌ها</button>
        </form>
      </div>
    </div>
  `);
}

/* ============================================================================
   Student Profile Modal with Student Avatar Preview & Upload
   ============================================================================ */
function openStudentProfileModal(studentId: number): void {
  const state = loadDbState();
  const st = state.students.find((s) => s.id === studentId);
  if (!st) return;

  syncClassSelectOptions(state);

  $('#prof-modal-student-id').val(String(st.id));
  $('#prof-modal-firstname').val(st.firstName);
  $('#prof-modal-lastname').val(st.lastName);
  $('#prof-modal-phone').val(toPersianDigits(st.phone));
  $('#prof-modal-class').val(st.classCode || '');
  $('#prof-modal-status').val(st.status);
  $('#prof-modal-notes').val(toPersianDigits(st.notes || ''));

  // Update Student Modal Header Photo & Name
  $('#student-modal-header-name').text(`${st.firstName} ${st.lastName}`);
  $('#student-modal-header-class').text(
    st.classCode ? `کلاس ${toPersianDigits(st.classCode)}` : 'بدون کلاس (—)'
  );

  const portraitIdx = Math.abs(Number(st.id) || 0) % 4;
  const $avatarBox = $('#student-modal-avatar-box');
  $avatarBox
    .removeClass('student-portrait-lg-0 student-portrait-lg-1 student-portrait-lg-2 student-portrait-lg-3 has-custom-avatar')
    .addClass(`student-portrait-lg-${portraitIdx}`);

  if (st.avatarUrl) {
    $avatarBox.addClass('has-custom-avatar').css('background-image', `url('${st.avatarUrl}')`);
  } else {
    $avatarBox.css('background-image', '');
  }

  $('#admin-student-modal').addClass('is-open').attr('aria-hidden', 'false');
}

/**
 * Bind Delegated Event Listeners for the Admin Panel
 */
export function initAdminPanelEvents(): void {
  // Global Backdrop Click Closes Any Open Modal Across the Entire Project
  $(document).on('click', '.scool-modal-backdrop', function (e) {
    if (e.target === this) {
      $(this).removeClass('is-open').attr('aria-hidden', 'true');
    }
  });

  // Close Modal Buttons (.js-close-modal)
  $(document).on('click', '.js-close-modal', function () {
    $(this).closest('.scool-modal-backdrop').removeClass('is-open').attr('aria-hidden', 'true');
  });

  // Confirmation Modal Yes Action
  $(document).on('click', '#btn-confirm-modal-yes', function () {
    $('#admin-confirm-modal').removeClass('is-open').attr('aria-hidden', 'true');
    if (pendingConfirmCallback) {
      const cb = pendingConfirmCallback;
      pendingConfirmCallback = null;
      cb();
    }
  });

  // Sidebar section navigation
  $(document).on('click', '.admin-nav-btn, .js-go-section', function () {
    const sec = $(this).data('section') as AdminSectionId;
    if (sec) {
      navigateAdminSection(sec);
    }
  });

  // Open specific class directly from Dashboard class card
  $(document).on('click', '.js-open-class-direct', function () {
    const code = String($(this).attr('data-code') || '901');
    selectedClassTab = code;
    navigateAdminSection('classes');
  });

  // Logout from Admin Panel back to Auth View (/login)
  $('#btn-admin-logout').on('click', () => {
    $('#admin-workspace-view').addClass('view-hidden');
    $('#public-auth-view').removeClass('view-hidden');
    updateBrowserUrl('/login');
    showToast('خروج از پنل مدیریت', 'با موفقیت از حساب مدیریت خارج شدید.', 'info');
  });

  /* --------------------------------------------------------------------------
     Classes Management: Select Card, Create Class Modal & Edit Class Icon Modal
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-select-class-card', function (e) {
    if ($(e.target).closest('.js-edit-class-modal').length) return;
    const code = String($(this).attr('data-code') || '901');
    selectedClassTab = code;
    renderActiveSection();
  });

  $(document).on('click', '#btn-open-create-class', function () {
    $('#class-modal-heading').text('ایجاد کلاس جدید');
    $('#cls-modal-mode').val('create');
    $('#cls-modal-code').val('').prop('readonly', false);
    $('#cls-modal-capacity').val('۳۰');
    $('#cls-modal-title').val('');
    $('#cls-modal-schedule').val('شنبه‌ها و دوشنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰');
    $('#cls-modal-room').val('تالار آنلاین');
    $('#cls-modal-desc').val('آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.');
    $('#admin-class-form-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $(document).on('click', '.js-edit-class-modal', function (e) {
    e.stopPropagation();
    const code = String($(this).attr('data-code') || '');
    const state = loadDbState();
    const cls = state.classes.find((c) => c.code === code);
    if (!cls) return;

    $('#class-modal-heading').text(`ویرایش مشخصات کلاس ${toPersianDigits(cls.code)}`);
    $('#cls-modal-mode').val('edit');
    $('#cls-modal-code').val(toPersianDigits(cls.code)).prop('readonly', true);
    $('#cls-modal-capacity').val(toPersianDigits(cls.capacity));
    $('#cls-modal-title').val(toPersianDigits(cls.title));
    $('#cls-modal-schedule').val(toPersianDigits(cls.scheduleSummary));
    $('#cls-modal-room').val(toPersianDigits(cls.roomOrLink));
    $('#cls-modal-desc').val(toPersianDigits(cls.description));
    $('#admin-class-form-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $(document).on('submit', '#form-save-class-modal', function (e) {
    e.preventDefault();
    const mode = String($('#cls-modal-mode').val());
    const rawCode = normalizeDigits(String($('#cls-modal-code').val() || '').trim());
    const capacity = Number(normalizeDigits(String($('#cls-modal-capacity').val() || '30'))) || 30;
    const title =
      String($('#cls-modal-title').val() || '').trim() ||
      `کلاس ${toPersianDigits(rawCode)} - برنامه‌نویسی`;
    const scheduleSummary = String($('#cls-modal-schedule').val() || '').trim();
    const roomOrLink = String($('#cls-modal-room').val() || '').trim();
    const description = String($('#cls-modal-desc').val() || '').trim();

    if (!rawCode) return;

    const state = loadDbState();
    if (mode === 'edit') {
      const cls = state.classes.find((c) => c.code === rawCode);
      if (cls) {
        cls.capacity = capacity;
        cls.title = title;
        cls.scheduleSummary = scheduleSummary;
        cls.roomOrLink = roomOrLink;
        cls.description = description;
      }
      showToast('کلاس ویرایش شد', `مشخصات کلاس ${toPersianDigits(rawCode)} بروزرسانی گردید.`, 'success');
    } else {
      if (state.classes.some((c) => c.code === rawCode)) {
        showToast('کد تکراری', `کلاس با کد ${toPersianDigits(rawCode)} قبلاً ثبت شده است.`, 'error');
        return;
      }
      state.classes.push({
        code: rawCode,
        title,
        gradeLevel: '',
        instructorName: `${state.admin.firstName} ${state.admin.lastName}`,
        capacity,
        roomOrLink,
        scheduleSummary,
        description,
      });
      selectedClassTab = rawCode;
      showToast('کلاس جدید ایجاد شد', `${toPersianDigits(title)} با موفقیت اضافه گردید.`, 'success');
    }

    saveDbState(state);
    $('#admin-class-form-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
  });

  /* --------------------------------------------------------------------------
     Student Actions: Approve, Reject, Reset Status (with Confirm), Reset Password, Photo Upload
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-approve-student', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    openConfirmModal({
      title: 'تأیید عضویت دانش‌آموز',
      message: `آیا از تأیید عضویت «${st.firstName} ${st.lastName}» اطمینان دارید؟`,
      confirmText: 'بله، تأیید شود',
      onConfirm: () => {
        const fresh = loadDbState();
        const target = fresh.students.find((s) => s.id === id);
        if (!target) return;
        target.status = 'approved';
        logAdminActivity(
          fresh,
          `تأیید عضویت دانش‌آموز (${target.firstName} ${target.lastName})`,
          target.classCode ? `کلاس ${toPersianDigits(target.classCode)}` : 'بدون کلاس',
          'student'
        );
        saveDbState(fresh);
        renderActiveSection();
        showToast('دانش‌آموز تأیید شد', `وضعیت ${target.firstName} ${target.lastName} به تأیید شده تغییر یافت.`, 'success');
      },
    });
  });

  $(document).on('click', '.js-reject-student', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    openConfirmModal({
      title: 'رد درخواست عضویت',
      message: `آیا از رد کردن وضعیت «${st.firstName} ${st.lastName}» اطمینان دارید؟`,
      confirmText: 'بله، رد شود',
      isDanger: true,
      onConfirm: () => {
        const fresh = loadDbState();
        const target = fresh.students.find((s) => s.id === id);
        if (!target) return;
        target.status = 'rejected';
        saveDbState(fresh);
        renderActiveSection();
        showToast('وضعیت تغییر کرد', `درخواست ${target.firstName} ${target.lastName} رد شد.`, 'info');
      },
    });
  });

  $(document).on('click', '.js-reset-student-status', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    openConfirmModal({
      title: 'بازنشانی وضعیت تأیید',
      message: `آیا می‌خواهید وضعیت «${st.firstName} ${st.lastName}» به حالت «در انتظار تأیید» بازنشانی شود؟`,
      confirmText: 'بله، بازنشانی شود',
      onConfirm: () => {
        const fresh = loadDbState();
        const target = fresh.students.find((s) => s.id === id);
        if (!target) return;
        target.status = 'pending';
        saveDbState(fresh);
        renderActiveSection();
        showToast('بازنشانی انجام شد', `وضعیت ${target.firstName} ${target.lastName} به در انتظار تأیید تغییر یافت.`, 'info');
      },
    });
  });

  $(document).on('click', '.js-open-reset-password', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    $('#reset-pass-student-id').val(String(st.id));
    $('#reset-pass-student-name').text(`${st.firstName} ${st.lastName}`);
    $('#reset-pass-new-value').val('123456');
    $('#admin-reset-pass-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $(document).on('submit', '#form-reset-student-pass', function (e) {
    e.preventDefault();
    const id = Number($('#reset-pass-student-id').val());
    const newPass = String($('#reset-pass-new-value').val() || '').trim();
    if (newPass.length < 6) {
      showToast('رمز عبور کوتاه است', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 'error');
      return;
    }

    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.password = newPass;
    saveDbState(state);
    $('#admin-reset-pass-modal').removeClass('is-open').attr('aria-hidden', 'true');
    showToast('رمز عبور بازنشانی شد', `رمز عبور جدید برای ${st.firstName} ${st.lastName} ثبت گردید.`, 'success');
  });

  // Upload custom student profile photo inside Student Profile Modal
  $(document).on('change', '#student-modal-avatar-upload', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    const studentId = Number($('#prof-modal-student-id').val());
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;
      const state = loadDbState();
      const st = state.students.find((s) => s.id === studentId);
      if (!st) return;
      st.avatarUrl = dataUrl;
      saveDbState(state);
      $('#student-modal-avatar-box')
        .addClass('has-custom-avatar')
        .css('background-image', `url('${dataUrl}')`);
      renderActiveSection();
      showToast('عکس دانش‌آموز بروزرسانی شد', `تصویر پروفایل ${st.firstName} ${st.lastName} ذخیره گردید.`, 'success');
    };
    reader.readAsDataURL(file);
  });

  // Remove student ONLY from class (keeps student in Students list with classCode = '')
  function confirmAndRemoveStudentFromClass(studentId: number): void {
    const state = loadDbState();
    const st = state.students.find((s) => s.id === studentId);
    if (!st) return;

    openConfirmModal({
      title: 'حذف دانش‌آموز از کلاس',
      message: `آیا از حذف «${st.firstName} ${st.lastName}» از کلاس ${toPersianDigits(st.classCode || 'فعلی')} اطمینان دارید؟ دانش‌آموز فقط از کلاس خارج شده و در لیست دانش‌آموزان باقی می‌ماند.`,
      confirmText: 'حذف از کلاس',
      isDanger: true,
      onConfirm: () => {
        const fresh = loadDbState();
        const target = fresh.students.find((s) => s.id === studentId);
        if (!target) return;
        target.classCode = '';
        saveDbState(fresh);
        $('#admin-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
        renderActiveSection();
        showToast('از کلاس حذف شد', `${target.firstName} ${target.lastName} از کلاس خارج گردید و در بخش دانش‌آموزان بدون کلاس (—) قرار گرفت.`, 'info');
      },
    });
  }

  $(document).on('click', '.js-remove-student-from-class', function () {
    const id = Number($(this).attr('data-id'));
    confirmAndRemoveStudentFromClass(id);
  });

  $('#btn-delete-student').on('click', () => {
    const id = Number($('#prof-modal-student-id').val());
    confirmAndRemoveStudentFromClass(id);
  });

  // Change Student Class Directly from Table
  $(document).on('change', '.js-change-student-class', function () {
    const id = Number($(this).attr('data-id'));
    const newClass = String($(this).val() || '');
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.classCode = newClass;
    saveDbState(state);
    renderActiveSection();
    showToast('انتقال کلاس انجام شد', `${st.firstName} ${st.lastName} به کلاس ${toPersianDigits(newClass)} منتقل شد.`, 'success');
  });

  // Students Filters & Search
  $(document).on('click', '.js-student-filter', function () {
    studentFilter = String($(this).attr('data-filter') || 'all');
    renderActiveSection();
  });

  $(document).on('input', '#student-search-input', function () {
    studentSearchQuery = String($(this).val() || '');
    renderActiveSection('#student-search-input');
  });

  // Open & Save Student Profile Modal
  $(document).on('click', '.js-open-student-profile', function () {
    const id = Number($(this).attr('data-id'));
    openStudentProfileModal(id);
  });

  $('#form-edit-student-profile').on('submit', function (e) {
    e.preventDefault();
    const id = Number($('#prof-modal-student-id').val());
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.firstName = String($('#prof-modal-firstname').val() || '').trim();
    st.lastName = String($('#prof-modal-lastname').val() || '').trim();
    st.phone = normalizeDigits(String($('#prof-modal-phone').val() || ''));
    st.classCode = String($('#prof-modal-class').val() || '');
    st.status = String($('#prof-modal-status').val()) as typeof st.status;
    st.notes = String($('#prof-modal-notes').val() || '').trim();

    saveDbState(state);
    $('#admin-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast('پروفایل بروزرسانی شد', `اطلاعات ${st.firstName} ${st.lastName} ذخیره گردید.`, 'success');
  });

  // Add New Student Modal
  $(document).on('click', '.js-open-add-student-modal', function () {
    const state = loadDbState();
    syncClassSelectOptions(state);
    const cls = String($(this).attr('data-class') || '901');
    $('#add-st-class').val(cls);
    $('#admin-add-student-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $('#form-admin-add-student').on('submit', function (e) {
    e.preventDefault();
    const firstName = String($('#add-st-firstname').val() || '').trim();
    const lastName = String($('#add-st-lastname').val() || '').trim();
    const phone = normalizeDigits(String($('#add-st-phone').val() || ''));
    const classCode = String($('#add-st-class').val() || '');

    if (!firstName || !lastName || phone.length < 10) {
      showToast('اطلاعات ناقص', 'لطفاً نام، نام خانوادگی و شماره تلفن معتبر وارد کنید.', 'error');
      return;
    }

    const state = loadDbState();
    state.students.unshift({
      id: Date.now(),
      firstName,
      lastName,
      phone,
      classCode,
      status: 'approved',
      createdAt: '۱۴۰۵/۰۸/۱۵',
    });
    saveDbState(state);
    ($('#form-admin-add-student')[0] as HTMLFormElement | undefined)?.reset();
    $('#admin-add-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast('دانش‌آموز اضافه شد', `${firstName} ${lastName} با موفقیت ثبت گردید.`, 'success');
  });

  /* --------------------------------------------------------------------------
     Assignments: Dedicated Pages for Create/Edit, Detail View & Submission View
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-hw-filter', function () {
    assignmentFilter = String($(this).attr('data-filter') || 'all');
    renderActiveSection();
  });

  $(document).on('input', '#assignment-search-input', function () {
    assignmentSearchQuery = String($(this).val() || '');
    renderActiveSection('#assignment-search-input');
  });

  // Navigate to Create Assignment New Page (/admin/assignments/create)
  $(document).on('click', '#btn-open-create-assignment', function () {
    editingAssignmentId = null;
    pendingAssignmentAttachmentName = '';
    pendingAssignmentAttachmentDataUrl = '';
    assignmentSubView = 'form';
    updateBrowserUrl('/admin/assignments/create');
    renderActiveSection();
  });

  // Navigate to Edit Assignment New Page (/admin/assignments/edit)
  $(document).on('click', '.js-edit-assignment', function () {
    const id = Number($(this).attr('data-id'));
    editingAssignmentId = id;
    pendingAssignmentAttachmentName = '';
    pendingAssignmentAttachmentDataUrl = '';
    assignmentSubView = 'form';
    updateBrowserUrl('/admin/assignments/edit');
    renderActiveSection();
  });

  // Back to Assignments List Page (/admin/assignments)
  $(document).on('click', '.js-back-to-assignments-list', function () {
    assignmentSubView = 'list';
    editingAssignmentId = null;
    updateBrowserUrl('/admin/assignments');
    renderActiveSection();
  });

  // File upload inside Assignment Form Page
  $(document).on('change', '#hw-file-upload', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    pendingAssignmentAttachmentName = file.name;
    $('#hw-attachment').val(toPersianDigits(file.name));
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingAssignmentAttachmentDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  // Save Assignment from New Page and return to list
  $(document).on('submit', '#form-save-assignment', function (e) {
    e.preventDefault();
    const title = String($('#hw-title').val() || '').trim();
    const classCode = String($('#hw-class').val() || 'all');
    const dueDate = String($('#hw-duedate').val() || '').trim();
    const maxScore = Number(normalizeDigits(String($('#hw-maxscore').val() || '20'))) || 20;
    const attachmentName = String($('#hw-attachment').val() || 'فایل تمرین.pdf').trim();
    const description = String($('#hw-desc').val() || '').trim();

    if (!title || !description) return;

    const state = loadDbState();
    if (editingAssignmentId) {
      const item = state.assignments.find((a) => a.id === editingAssignmentId);
      if (item) {
        item.title = title;
        item.classCode = classCode;
        item.dueDate = dueDate;
        item.maxScore = maxScore;
        item.attachmentName = attachmentName;
        if (pendingAssignmentAttachmentDataUrl) {
          item.attachmentDataUrl = pendingAssignmentAttachmentDataUrl;
        }
        item.description = description;
      }
      editingAssignmentId = null;
      showToast('تکلیف ویرایش شد', 'تغییرات تکلیف با موفقیت ذخیره گردید.', 'success');
    } else {
      state.assignments.unshift({
        id: Date.now(),
        title,
        classCode,
        dueDate,
        maxScore,
        attachmentName,
        attachmentDataUrl: pendingAssignmentAttachmentDataUrl || undefined,
        description,
        status: 'active',
        createdAt: '۱۴۰۵/۰۸/۱۵',
      });
      logAdminActivity(
        state,
        `ایجاد تکلیف جدید: ${title}`,
        `ویژه ${formatClassLabel(classCode)} · مهلت: ${dueDate}`,
        'assignment'
      );
      showToast('تکلیف منتشر شد', `تکلیف «${title}» با موفقیت ثبت گردید.`, 'success');
    }

    pendingAssignmentAttachmentName = '';
    pendingAssignmentAttachmentDataUrl = '';
    saveDbState(state);
    assignmentSubView = 'list';
    updateBrowserUrl('/admin/assignments');
    renderActiveSection();
  });

  $(document).on('click', '.js-delete-assignment', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const hw = state.assignments.find((a) => a.id === id);
    if (!hw) return;

    openConfirmModal({
      title: 'حذف تکلیف',
      message: `آیا از حذف تکلیف «${toPersianDigits(hw.title)}» اطمینان دارید؟`,
      confirmText: 'حذف تکلیف',
      isDanger: true,
      onConfirm: () => {
        const fresh = loadDbState();
        fresh.assignments = fresh.assignments.filter((a) => a.id !== id);
        saveDbState(fresh);
        renderActiveSection();
        showToast('تکلیف حذف شد', 'تکلیف مورد نظر از لیست حذف گردید.', 'info');
      },
    });
  });

  // Navigate to Assignment Detail Page (/admin/assignments/detail)
  $(document).on('click', '.js-view-assignment-detail', function () {
    const id = Number($(this).attr('data-id'));
    activeAssignmentDetailId = id;
    assignmentSubView = 'detail';
    updateBrowserUrl('/admin/assignments/detail');
    renderActiveSection();
  });

  // Back from Submission Page to Assignment Detail Page (/admin/assignments/detail)
  $(document).on('click', '.js-back-to-assignment-detail', function () {
    assignmentSubView = 'detail';
    updateBrowserUrl('/admin/assignments/detail');
    renderActiveSection();
  });

  // Navigate to Student Submission Response Page (/admin/assignments/submission)
  $(document).on('click', '.js-open-submission-page', function () {
    const subId = Number($(this).attr('data-id'));
    activeSubmissionId = subId;
    assignmentSubView = 'submission';
    updateBrowserUrl('/admin/assignments/submission');
    renderActiveSection();
  });

  // Download Teacher Assignment Attachment
  $(document).on('click', '.js-download-hw-attachment', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const hw = state.assignments.find((a) => a.id === id);
    if (!hw) return;
    triggerFileDownload(
      hw.attachmentName,
      hw.attachmentDataUrl,
      `عنوان تکلیف: ${hw.title}\nشرح تکلیف: ${hw.description}\nمهلت تحویل: ${hw.dueDate}`
    );
  });

  // Download Student Submission File
  $(document).on('click', '.js-download-submission-file', function () {
    const subId = Number($(this).attr('data-id'));
    const state = loadDbState();
    const sub = state.submissions.find((s) => s.id === subId);
    if (!sub) return;
    triggerFileDownload(
      sub.fileName,
      sub.fileDataUrl,
      `دانش‌آموز: ${sub.studentName} (کلاس ${sub.classCode})\nتاریخ ارسال: ${sub.submittedAt}\n\nپاسخ دانش‌آموز:\n${sub.fileContent}`
    );
  });

  // Save Score & Feedback from Dedicated Submission Page
  $(document).on('submit', '#form-grade-submission-page', function (e) {
    e.preventDefault();
    const subId = Number($(this).attr('data-id'));
    const score = Number(normalizeDigits(String($('#grade-page-score').val() || '20')));
    const feedback = String($('#grade-page-feedback').val() || '').trim();

    const state = loadDbState();
    const sub = state.submissions.find((s) => s.id === subId);
    if (!sub) return;

    sub.score = score;
    sub.teacherFeedback = feedback;
    sub.status = 'graded';

    logAdminActivity(
      state,
      `ثبت نمره تکلیف برای ${sub.studentName}`,
      `نمره ثبت‌شده: ${toPersianDigits(score)}`,
      'assignment'
    );
    saveDbState(state);
    assignmentSubView = 'detail';
    updateBrowserUrl('/admin/assignments/detail');
    renderActiveSection();
    showToast('نمره و بازخورد ثبت شد', `نمره ${toPersianDigits(score)} برای ${sub.studentName} ذخیره گردید.`, 'success');
  });

  /* --------------------------------------------------------------------------
     Educational Resources: Filter, Search, Dedicated Create/Edit Page, Detail Modal
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-res-filter', function () {
    resourceFilter = String($(this).attr('data-filter') || 'all');
    renderActiveSection();
  });

  $(document).on('input', '#resource-search-input', function () {
    resourceSearchQuery = String($(this).val() || '');
    renderActiveSection('#resource-search-input');
  });

  // Navigate to Create Resource New Page (/admin/resources/create)
  $(document).on('click', '#btn-open-create-resource', function () {
    editingResourceId = null;
    pendingResourceFileName = '';
    pendingResourceFileDataUrl = '';
    pendingResourceFileSize = '';
    resourceSubView = 'form';
    updateBrowserUrl('/admin/resources/create');
    renderActiveSection();
  });

  // Navigate to Edit Resource New Page (/admin/resources/edit)
  $(document).on('click', '.js-edit-resource', function () {
    const id = Number($(this).attr('data-id'));
    editingResourceId = id;
    pendingResourceFileName = '';
    pendingResourceFileDataUrl = '';
    pendingResourceFileSize = '';
    resourceSubView = 'form';
    updateBrowserUrl('/admin/resources/edit');
    renderActiveSection();
  });

  // Back to Resources List Page (/admin/resources)
  $(document).on('click', '.js-back-to-resources-list', function () {
    resourceSubView = 'list';
    editingResourceId = null;
    updateBrowserUrl('/admin/resources');
    renderActiveSection();
  });

  // File upload inside Resource Form Page
  $(document).on('change', '#res-file-upload', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    pendingResourceFileName = file.name;
    const sizeMb = Math.max(0.1, Math.round((file.size / (1024 * 1024)) * 10) / 10);
    pendingResourceFileSize = `${toPersianDigits(sizeMb)} مگابایت`;
    $('#res-url').val(toPersianDigits(file.name));
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingResourceFileDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  // Save Resource from Dedicated Page and return to list
  $(document).on('submit', '#form-save-resource', function (e) {
    e.preventDefault();
    const title = String($('#res-title').val() || '').trim();
    const category = String($('#res-category').val() || 'جزوه PDF') as
      | 'جزوه PDF'
      | 'فایل تمرین'
      | 'لینک آموزشی'
      | 'ویدیو ضبط‌شده';
    const classCode = String($('#res-class').val() || 'all');
    const urlOrFileName = String($('#res-url').val() || '').trim();
    const description = String($('#res-desc').val() || '').trim();

    if (!title || !urlOrFileName) return;

    const state = loadDbState();
    if (editingResourceId) {
      const item = state.resources.find((r) => r.id === editingResourceId);
      if (item) {
        item.title = title;
        item.category = category;
        item.classCode = classCode;
        item.urlOrFileName = urlOrFileName;
        if (pendingResourceFileDataUrl) {
          item.fileDataUrl = pendingResourceFileDataUrl;
        }
        if (pendingResourceFileSize) {
          item.fileSize = pendingResourceFileSize;
        }
        item.description = description;
      }
      editingResourceId = null;
      showToast('منبع آموزشی ویرایش شد', `تغییرات «${title}» ذخیره گردید.`, 'success');
    } else {
      state.resources.unshift({
        id: Date.now(),
        title,
        category,
        classCode,
        urlOrFileName,
        fileDataUrl: pendingResourceFileDataUrl || undefined,
        fileSize:
          pendingResourceFileSize ||
          (category === 'لینک آموزشی' ? 'لینک وب' : '۳.۱ مگابایت'),
        description,
        createdAt: '۱۴۰۵/۰۸/۱۵',
        viewers: [],
      });
      showToast('منبع آموزشی اضافه شد', `«${title}» در بخش منابع قرار گرفت.`, 'success');
    }

    pendingResourceFileName = '';
    pendingResourceFileDataUrl = '';
    pendingResourceFileSize = '';
    saveDbState(state);
    resourceSubView = 'list';
    updateBrowserUrl('/admin/resources');
    renderActiveSection();
  });

  // Navigate to Resource Detail New Page (/admin/resources/detail)
  $(document).on('click', '.js-view-resource-detail', function () {
    const id = Number($(this).attr('data-id'));
    activeResourceDetailId = id;
    resourceSubView = 'detail';
    updateBrowserUrl('/admin/resources/detail');
    renderActiveSection();
  });

  $(document).on('click', '.js-download-resource-file', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const res = state.resources.find((r) => r.id === id);
    if (!res) return;
    triggerFileDownload(
      res.urlOrFileName,
      res.fileDataUrl,
      `عنوان منبع: ${res.title}\nنوع: ${res.category}\nتوضیحات:\n${res.description}`
    );
  });

  $(document).on('click', '.js-delete-resource', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const res = state.resources.find((r) => r.id === id);
    if (!res) return;

    openConfirmModal({
      title: 'حذف منبع آموزشی',
      message: `آیا از حذف «${toPersianDigits(res.title)}» اطمینان دارید؟`,
      confirmText: 'حذف منبع',
      isDanger: true,
      onConfirm: () => {
        const fresh = loadDbState();
        fresh.resources = fresh.resources.filter((r) => r.id !== id);
        saveDbState(fresh);
        renderActiveSection();
        showToast('منبع حذف شد', 'آیتم انتخاب‌شده از منابع آموزشی حذف گردید.', 'info');
      },
    });
  });

  /* --------------------------------------------------------------------------
     Announcements: Filter, Search, Create Modal & Delete
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-ann-filter', function () {
    announcementFilter = String($(this).attr('data-filter') || 'all');
    renderActiveSection();
  });

  $(document).on('input', '#announcement-search-input', function () {
    announcementSearchQuery = String($(this).val() || '');
    renderActiveSection('#announcement-search-input');
  });

  $(document).on('click', '#btn-open-create-announcement', function () {
    const state = loadDbState();
    syncClassSelectOptions(state);
    $('#ann-title').val('');
    $('#ann-target').val('all');
    $('#ann-priority').val('عادی');
    $('#ann-content').val('');
    $('#admin-announcement-form-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $(document).on('submit', '#form-add-announcement', function (e) {
    e.preventDefault();
    const title = String($('#ann-title').val() || '').trim();
    const targetClasses = String($('#ann-target').val() || 'all');
    const priority = String($('#ann-priority').val() || 'عادی') as 'عادی' | 'مهم' | 'فوری';
    const content = String($('#ann-content').val() || '').trim();

    if (!title || !content) return;

    const state = loadDbState();
    state.announcements.unshift({
      id: Date.now(),
      title,
      targetClasses,
      priority,
      content,
      createdAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
    });
    logAdminActivity(
      state,
      `ارسال اطلاعیه به ${formatClassLabel(targetClasses)}`,
      `عنوان: ${title}`,
      'announcement'
    );
    saveDbState(state);
    $('#admin-announcement-form-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast(
      'اطلاعیه ارسال شد',
      `اطلاعیه «${title}» برای ${formatClassLabel(targetClasses)} منتشر گردید.`,
      'success'
    );
  });

  $(document).on('click', '.js-delete-announcement', function () {
    const id = Number($(this).attr('data-id'));
    openConfirmModal({
      title: 'حذف اطلاعیه',
      message: 'آیا از حذف این اطلاعیه اطمینان دارید؟',
      confirmText: 'حذف اطلاعیه',
      isDanger: true,
      onConfirm: () => {
        const state = loadDbState();
        state.announcements = state.announcements.filter((a) => a.id !== id);
        saveDbState(state);
        renderActiveSection();
        showToast('اطلاعیه حذف شد', 'اطلاعیه مورد نظر حذف گردید.', 'info');
      },
    });
  });

  // Open Announcement Readers Modal (#admin-announcement-readers-modal)
  $(document).on('click', '.js-open-ann-readers-modal', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const ann = state.announcements.find((a) => a.id === id);
    if (!ann) return;

    const readers = ann.readers || [];
    $('#ann-readers-modal-title').text(`لیست خوانده‌ها: ${toPersianDigits(ann.title)}`);
    $('#ann-readers-modal-sub').text(
      `گیرندگان: ${formatClassLabel(ann.targetClasses)} · تاریخ انتشار: ${toPersianDigits(ann.createdAt)}`
    );
    $('#ann-readers-modal-count-badge').text(`${toPersianDigits(readers.length)} نفر`);

    if (readers.length > 0) {
      const listHtml = readers
        .map((r) => {
          const stObj = state.students.find((s) => s.id === r.studentId) || {
            id: r.studentId,
            firstName: r.studentName,
            lastName: '',
          };
          return `
            <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] text-xs">
              <div class="flex items-center gap-2.5">
                ${renderStudentAvatarHtml(stObj, 'sm')}
                <div>
                  <div class="font-extrabold text-[#251B15]">${toPersianDigits(r.studentName)}</div>
                  <div class="text-[11px] text-[#1B5E5A] font-bold mt-0.5">کلاس ${toPersianDigits(r.classCode)}</div>
                </div>
              </div>
              <div class="text-[11px] font-bold text-[#6E5D4F] tabular-nums">
                خوانده در: ${toPersianDigits(r.readAt)}
              </div>
            </div>
          `;
        })
        .join('');
      $('#ann-readers-modal-list').html(listHtml);
    } else {
      $('#ann-readers-modal-list').html(`
        <div class="p-6 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] text-center text-xs text-[#6E5D4F]">
          هنوز هیچ دانش‌آموزی گزینه «خوانده شد» را برای این اطلاعیه ثبت نکرده است.
        </div>
      `);
    }

    $('#admin-announcement-readers-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  /* --------------------------------------------------------------------------
     Tickets Section + Downloadable File Attachments
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-ticket-filter', function () {
    ticketFilter = String($(this).attr('data-filter') || 'all') as typeof ticketFilter;
    renderActiveSection();
  });

  $(document).on('click', '.js-select-ticket', function () {
    activeTicketId = Number($(this).attr('data-id'));
    pendingTicketAttachmentName = '';
    pendingTicketAttachmentDataUrl = '';
    renderActiveSection();
  });

  $(document).on('change', '#ticket-reply-file', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) {
      pendingTicketAttachmentName = '';
      pendingTicketAttachmentDataUrl = '';
      $('#ticket-attached-filename').text('فایلی انتخاب نشده');
      return;
    }

    pendingTicketAttachmentName = file.name;
    $('#ticket-attached-filename').text(`پیوست: ${toPersianDigits(file.name)}`);

    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingTicketAttachmentDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  // Download attached file from any Ticket Message
  $(document).on('click', '.js-download-ticket-attachment', function () {
    const ticketId = Number($(this).attr('data-ticket-id'));
    const msgId = Number($(this).attr('data-msg-id'));
    const state = loadDbState();
    const tk = state.tickets.find((t) => t.id === ticketId);
    if (!tk) return;
    const msg = tk.messages.find((m) => m.id === msgId);
    if (!msg || !msg.attachmentName) return;

    triggerFileDownload(
      msg.attachmentName,
      msg.attachmentDataUrl,
      `موضوع تیکت: ${tk.subject}\nفرستنده: ${msg.senderName}\nزمان ارسال: ${msg.sentAt}\n\nمتن پیام:\n${msg.message}`
    );
  });

  $(document).on('click', '.js-toggle-ticket-close', function () {
    const id = Number($(this).attr('data-id'));
    const state = loadDbState();
    const tk = state.tickets.find((t) => t.id === id);
    if (!tk) return;

    tk.status = tk.status === 'بسته شده' ? 'در انتظار پاسخ' : 'بسته شده';
    saveDbState(state);
    renderActiveSection();
    showToast('وضعیت تیکت تغییر کرد', `وضعیت تیکت به «${tk.status}» تغییر یافت.`, 'info');
  });

  $(document).on('submit', '#form-reply-ticket', function (e) {
    e.preventDefault();
    const id = Number($(this).attr('data-id'));
    const replyText = String($('#ticket-reply-text').val() || '').trim();
    if (!replyText) return;

    const state = loadDbState();
    const tk = state.tickets.find((t) => t.id === id);
    if (!tk) return;

    tk.messages.push({
      id: Date.now(),
      senderRole: 'admin',
      senderName: `${state.admin.firstName} ${state.admin.lastName}`,
      message: replyText,
      sentAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
      attachmentName: pendingTicketAttachmentName || undefined,
      attachmentDataUrl: pendingTicketAttachmentDataUrl || undefined,
    });
    tk.status = 'پاسخ داده شده';
    pendingTicketAttachmentName = '';
    pendingTicketAttachmentDataUrl = '';

    logAdminActivity(
      state,
      `پاسخ به تیکت ${tk.studentName}`,
      `موضوع: ${tk.subject}`,
      'ticket'
    );
    saveDbState(state);
    renderActiveSection();
    showToast('پاسخ ارسال شد', `پاسخ شما برای ${tk.studentName} ثبت گردید.`, 'success');
  });

  /* --------------------------------------------------------------------------
     Admin Profile Section + Custom Profile Image Upload
     -------------------------------------------------------------------------- */
  $(document).on('change', '#prof-avatar-upload', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;
      const state = loadDbState();
      state.admin.avatarUrl = dataUrl;
      saveDbState(state);
      renderActiveSection();
      showToast('تصویر پروفایل بروزرسانی شد', 'عکس جدید پروفایل شما در سامانه ثبت گردید.', 'success');
    };
    reader.readAsDataURL(file);
  });

  $(document).on('click', '#btn-reset-admin-avatar', function () {
    const state = loadDbState();
    state.admin.avatarUrl = '';
    saveDbState(state);
    renderActiveSection();
    showToast('تصویر پیش‌فرض فعال شد', 'آواتار پیش‌فرض مجدداً جایگزین گردید.', 'info');
  });

  $(document).on('submit', '#form-admin-profile', function (e) {
    e.preventDefault();
    const state = loadDbState();
    state.admin.firstName = String($('#prof-firstname').val() || '').trim();
    state.admin.lastName = String($('#prof-lastname').val() || '').trim();
    state.admin.phone = normalizeDigits(String($('#prof-phone').val() || ''));
    state.admin.roleTitle = String($('#prof-role').val() || '').trim();
    state.admin.bio = String($('#prof-bio').val() || '').trim();

    saveDbState(state);
    renderActiveSection();
    showToast('پروفایل مدیر ذخیره شد', 'مشخصات شما با موفقیت بروزرسانی گردید.', 'success');
  });

  $(document).on('submit', '#form-admin-password', function (e) {
    e.preventDefault();
    const currentPass = String($('#prof-current-pass').val() || '');
    const newPass = String($('#prof-new-pass').val() || '');
    const confirmPass = String($('#prof-confirm-pass').val() || '');

    const state = loadDbState();
    if (currentPass !== state.admin.password) {
      showToast('خطا در رمز فعلی', 'رمز عبور فعلی واردشده صحیح نیست.', 'error');
      return;
    }
    if (newPass.length < 6 || newPass !== confirmPass) {
      showToast('خطا در رمز جدید', 'رمز عبور جدید باید حداقل ۶ کاراکتر و با تکرار آن یکسان باشد.', 'error');
      return;
    }

    state.admin.password = newPass;
    saveDbState(state);
    renderActiveSection();
    showToast('رمز عبور تغییر کرد', 'رمز عبور حساب مدیریت با موفقیت بروزرسانی شد.', 'success');
  });

  /* --------------------------------------------------------------------------
     System & Classes Settings Section
     -------------------------------------------------------------------------- */
  $(document).on('submit', '#form-system-settings', function (e) {
    e.preventDefault();
    const state = loadDbState();
    state.settings.platformName = String($('#set-platform-name').val() || '').trim();
    state.settings.academicYear = String($('#set-academic-year').val() || '').trim();
    state.settings.maxUploadSizeMb =
      Number(normalizeDigits(String($('#set-max-upload').val() || '15'))) || 15;
    state.settings.supportPhone = normalizeDigits(String($('#set-support-phone').val() || ''));
    state.settings.allowNewRegistrations = $('#set-allow-reg').is(':checked');
    state.settings.requireAdminApproval = $('#set-require-approval').is(':checked');

    saveDbState(state);
    renderActiveSection();
    showToast('تنظیمات ذخیره شد', 'تنظیمات کلی سامانه بروزرسانی گردید.', 'success');
  });

  $(document).on('submit', '#form-all-classes-settings', function (e) {
    e.preventDefault();
    const state = loadDbState();

    $('.js-cls-set-title').each(function () {
      const code = String($(this).attr('data-code'));
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.title = String($(this).val() || '').trim();
    });

    $('.js-cls-set-cap').each(function () {
      const code = String($(this).attr('data-code'));
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.capacity = Number(normalizeDigits(String($(this).val() || '30'))) || 30;
    });

    $('.js-cls-set-sch').each(function () {
      const code = String($(this).attr('data-code'));
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.scheduleSummary = String($(this).val() || '').trim();
    });

    saveDbState(state);
    renderActiveSection();
    showToast('مشخصات کلاس‌ها بروزرسانی شد', 'اطلاعات کلاس‌ها ذخیره گردید.', 'success');
  });

  $(document).on('click', '#btn-reset-demo-db', () => {
    openConfirmModal({
      title: 'بازنشانی کل داده‌های سامانه',
      message: 'آیا از بازگرداندن تمام داده‌های نمونه به حالت اولیه اطمینان دارید؟',
      confirmText: 'بله، بازنشانی شود',
      isDanger: true,
      onConfirm: () => {
        resetDbState();
        renderActiveSection();
        showToast('بازنشانی انجام شد', 'داده‌های نمونه سامانه به حالت اولیه بازگردانده شدند.', 'info');
      },
    });
  });

  /* --------------------------------------------------------------------------
     Gradebook Section (دفتر نمره: کارت‌های جلسات + صفحه اختصاصی هر جلسه)
     -------------------------------------------------------------------------- */
  $(document).on('click', '.js-gb-class-tab', function () {
    gradebookClassCode = String($(this).attr('data-code') || 'all');
    renderActiveSection();
  });

  // Enter a specific session in a dedicated new page (/admin/gradebook/session)
  $(document).on('click', '.js-gb-enter-session', function () {
    activeGradebookSessionId = Number($(this).attr('data-id'));
    gradebookSubView = 'session';
    updateBrowserUrl('/admin/gradebook/session');
    renderActiveSection();
  });

  // Back to Gradebook sessions card list (/admin/gradebook)
  $(document).on('click', '.js-gb-back-to-sessions', function () {
    gradebookSubView = 'list';
    updateBrowserUrl('/admin/gradebook');
    renderActiveSection();
  });

  $(document).on('click', '#btn-open-create-gb-session', function () {
    const state = loadDbState();
    const defaultClass = gradebookClassCode === 'all' ? '901' : gradebookClassCode;
    const classOptionsHtml = state.classes
      .map(
        (c) =>
          `<option value="${c.code}" ${String(c.code) === String(defaultClass) ? 'selected' : ''}>کلاس ${toPersianDigits(c.code)}</option>`
      )
      .join('');
    $('#gb-session-class').html(classOptionsHtml);

    const classSessionsCount = (state.gradebookSessions || []).filter(
      (s) => String(s.classCode) === String(defaultClass)
    ).length;
    $('#gb-session-title').val(`جلسه ${toPersianDigits(classSessionsCount + 1)} — کلاس ${toPersianDigits(defaultClass)}`);
    $('#gb-session-date').val('۱۴۰۵/۰۸/۱۶');
    $('#gb-session-topic').val('');
    $('#admin-gradebook-session-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $(document).on('submit', '#form-add-gb-session', function (e) {
    e.preventDefault();
    const targetClassCode = String($('#gb-session-class').val() || '901');
    const title = String($('#gb-session-title').val() || '').trim();
    const date = String($('#gb-session-date').val() || '').trim();
    const topic = String($('#gb-session-topic').val() || '').trim();
    if (!title || !date) return;

    const state = loadDbState();
    if (!state.gradebookSessions) state.gradebookSessions = [];
    if (!state.gradebookEntries) state.gradebookEntries = [];

    const newSessionId = Date.now();
    state.gradebookSessions.push({
      id: newSessionId,
      classCode: targetClassCode,
      title,
      sessionDate: date,
      topic: topic || 'بررسی مباحث عملی و تمرین کلاسی',
    });

    // Seed default present entries for all approved students in this class
    const classStudents = state.students.filter(
      (s) => String(s.classCode) === String(targetClassCode) && s.status === 'approved'
    );
    classStudents.forEach((st, idx) => {
      state.gradebookEntries.push({
        id: newSessionId + idx + 1,
        sessionId: newSessionId,
        studentId: st.id,
        classCode: targetClassCode,
        attendance: 'present',
        classScore: null,
        positiveCount: 0,
        negativeCount: 0,
        teacherNote: '',
      });
    });

    logAdminActivity(
      state,
      `ایجاد جلسه جدید در دفتر نمره کلاس ${toPersianDigits(targetClassCode)}`,
      `${title} (${date})`,
      'assignment'
    );
    saveDbState(state);
    $('#admin-gradebook-session-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast(
      'جلسه جدید ثبت شد',
      `«${toPersianDigits(title)}» به دفتر نمره کلاس ${toPersianDigits(targetClassCode)} اضافه شد.`,
      'success'
    );
  });

  // Helper to get or create a GradebookEntry for (sessionId, studentId)
  function ensureGradebookEntry(
    state: DatabaseState,
    sessionId: number,
    studentId: number
  ): GradebookEntry {
    if (!state.gradebookEntries) state.gradebookEntries = [];
    let entry = state.gradebookEntries.find(
      (e) => Number(e.sessionId) === Number(sessionId) && Number(e.studentId) === Number(studentId)
    );
    if (!entry) {
      const ses = (state.gradebookSessions || []).find((s) => Number(s.id) === Number(sessionId));
      entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        sessionId: Number(sessionId),
        studentId: Number(studentId),
        classCode: ses ? ses.classCode : '901',
        attendance: 'present',
        classScore: null,
        positiveCount: 0,
        negativeCount: 0,
        teacherNote: '',
      };
      state.gradebookEntries.push(entry);
    }
    entry.positiveCount = Number(entry.positiveCount) || 0;
    entry.negativeCount = Number(entry.negativeCount) || 0;
    if (entry.attendance === 'absent') {
      entry.classScore = null;
      entry.positiveCount = 0;
      entry.negativeCount = 0;
    }
    return entry;
  }

  // Sync current DOM inputs (scores, notes, positive/negative counts) into state before re-rendering
  function syncGradebookInputsFromDom(state: DatabaseState, sessionId: number): void {
    $('.js-gb-pos-value').each(function () {
      const studentId = Number($(this).attr('data-student-id'));
      const val = Number($(this).attr('data-count'));
      const entry = ensureGradebookEntry(state, sessionId, studentId);
      if (entry.attendance === 'absent') {
        entry.positiveCount = 0;
      } else if (!isNaN(val)) {
        entry.positiveCount = Math.max(0, val);
      }
    });

    $('.js-gb-neg-value').each(function () {
      const studentId = Number($(this).attr('data-student-id'));
      const val = Number($(this).attr('data-count'));
      const entry = ensureGradebookEntry(state, sessionId, studentId);
      if (entry.attendance === 'absent') {
        entry.negativeCount = 0;
      } else if (!isNaN(val)) {
        entry.negativeCount = Math.max(0, val);
      }
    });

    $('.js-gb-score-input').each(function () {
      const studentId = Number($(this).attr('data-student-id'));
      const rawScore = normalizeDigits(String($(this).val() || '').trim());
      const entry = ensureGradebookEntry(state, sessionId, studentId);
      if (entry.attendance === 'absent' || rawScore === '') {
        entry.classScore = null;
      } else {
        const parsed = parseFloat(rawScore);
        entry.classScore = !isNaN(parsed) ? Math.min(20, Math.max(0, parsed)) : null;
      }
    });

    $('.js-gb-note-input').each(function () {
      const studentId = Number($(this).attr('data-student-id'));
      const note = String($(this).val() || '').trim();
      const entry = ensureGradebookEntry(state, sessionId, studentId);
      entry.teacherNote = note;
    });
  }

  // Toggle Attendance Status (حاضر / تأخیر / غایب)
  $(document).on('click', '.js-gb-attendance-btn', function () {
    const sessionId = Number($(this).attr('data-session-id'));
    const studentId = Number($(this).attr('data-student-id'));
    const status = String($(this).attr('data-status')) as AttendanceStatus;

    const state = loadDbState();
    syncGradebookInputsFromDom(state, sessionId);
    const entry = ensureGradebookEntry(state, sessionId, studentId);
    entry.attendance = status;
    if (status === 'absent') {
      entry.classScore = null;
      entry.positiveCount = 0;
      entry.negativeCount = 0;
    }
    saveDbState(state);
    renderActiveSection();
  });

  // Adjust Positive Points (+ / -)
  $(document).on('click', '.js-gb-pos-delta', function () {
    if ($(this).prop('disabled')) return;
    const sessionId = Number($(this).attr('data-session-id'));
    const studentId = Number($(this).attr('data-student-id'));
    const delta = Number($(this).attr('data-delta'));

    const state = loadDbState();
    syncGradebookInputsFromDom(state, sessionId);
    const entry = ensureGradebookEntry(state, sessionId, studentId);
    if (entry.attendance === 'absent') {
      showToast('دانش‌آموز غایب است', 'برای دانش‌آموز غایب امکان ثبت امتیاز مثبت یا منفی وجود ندارد.', 'info');
      return;
    }
    entry.positiveCount = Math.max(0, (Number(entry.positiveCount) || 0) + delta);
    saveDbState(state);
    renderActiveSection();
  });

  // Adjust Negative Points (+ / -)
  $(document).on('click', '.js-gb-neg-delta', function () {
    if ($(this).prop('disabled')) return;
    const sessionId = Number($(this).attr('data-session-id'));
    const studentId = Number($(this).attr('data-student-id'));
    const delta = Number($(this).attr('data-delta'));

    const state = loadDbState();
    syncGradebookInputsFromDom(state, sessionId);
    const entry = ensureGradebookEntry(state, sessionId, studentId);
    if (entry.attendance === 'absent') {
      showToast('دانش‌آموز غایب است', 'برای دانش‌آموز غایب امکان ثبت امتیاز مثبت یا منفی وجود ندارد.', 'info');
      return;
    }
    entry.negativeCount = Math.max(0, (Number(entry.negativeCount) || 0) + delta);
    saveDbState(state);
    renderActiveSection();
  });

  // Save all scores, attendance, positive/negative counts and teacher notes for the active session
  $(document).on('click', '#btn-save-gradebook-session', function () {
    const sessionId = Number($(this).attr('data-session-id'));
    if (!sessionId) return;

    const state = loadDbState();
    const session = (state.gradebookSessions || []).find((s) => Number(s.id) === Number(sessionId));

    syncGradebookInputsFromDom(state, sessionId);

    // Ensure every approved student in this session's class has a persisted entry
    if (session) {
      const classStudents = state.students.filter(
        (st) => String(st.classCode) === String(session.classCode) && st.status === 'approved'
      );
      classStudents.forEach((st) => {
        const en = ensureGradebookEntry(state, sessionId, st.id);
        if (en.attendance === 'absent') {
          en.classScore = null;
          en.positiveCount = 0;
          en.negativeCount = 0;
        }
      });
    }

    logAdminActivity(
      state,
      `ثبت دفتر نمره و حضور و غیاب کلاس ${toPersianDigits(session ? session.classCode : '901')}`,
      session ? `${session.title} (${session.sessionDate})` : 'بروزرسانی نمرات جلسه',
      'assignment'
    );
    saveDbState(state);
    renderActiveSection();
    showToast(
      'دفتر نمره ذخیره شد',
      `حضور و غیاب، امتیازات مثبت/منفی و نمرات کلاسی با موفقیت ثبت گردید.`,
      'success'
    );
  });
}

/* ============================================================================
   دفتر نمره (Gradebook):
   1) نمای کارتی جلسات (/admin/gradebook) با دکمه «ورود به جلسه»
   2) صفحه اختصاصی هر جلسه (/admin/gradebook/session) برای ثبت حضور و غیاب، نمره و مثبت/منفی
   ============================================================================ */
function renderGradebookSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  if (gradebookSubView === 'session' && activeGradebookSessionId) {
    renderGradebookSessionDetailPage($container, state, activeGradebookSessionId);
    return;
  }

  const allSessions = state.gradebookSessions || [];
  const filteredSessions = allSessions.filter((s) =>
    gradebookClassCode === 'all' ? true : String(s.classCode) === String(gradebookClassCode)
  );

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار دفتر نمره: فیلتر کلاس‌ها و دکمه ثبت جلسه جدید -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-extrabold text-[#6E5D4F] ml-1">فیلتر جلسات بر اساس کلاس:</span>
          <div class="admin-segmented-bar flex-wrap">
            <button
              type="button"
              class="admin-seg-btn js-gb-class-tab ${gradebookClassCode === 'all' ? 'is-active' : ''}"
              data-code="all"
            >
              همه کلاس‌ها (${toPersianDigits(allSessions.length)})
            </button>
            ${state.classes
              .map(
                (cls) => `
                <button
                  type="button"
                  class="admin-seg-btn js-gb-class-tab ${
                    String(gradebookClassCode) === String(cls.code) ? 'is-active' : ''
                  }"
                  data-code="${cls.code}"
                >
                  ${toPersianDigits(cls.title)}
                </button>`
              )
              .join('')}
          </div>
        </div>

        <button type="button" id="btn-open-create-gb-session" class="btn-admin-primary !h-9">
          + ثبت جلسه جدید
        </button>
      </div>

      <!-- کارت‌های جلسات دفتر نمره -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        ${
          filteredSessions.length
            ? filteredSessions
                .map((ses) => {
                  const classStudents = state.students.filter(
                    (st) => String(st.classCode) === String(ses.classCode) && st.status === 'approved'
                  );
                  const allowedIds = new Set(classStudents.map((st) => Number(st.id)));
                  const entries = (state.gradebookEntries || []).filter(
                    (e) => Number(e.sessionId) === Number(ses.id) && allowedIds.has(Number(e.studentId))
                  );
                  const presentCount = classStudents.filter((st) => {
                    const en = entries.find((e) => Number(e.studentId) === Number(st.id));
                    return !en || en.attendance === 'present';
                  }).length;
                  const lateCount = classStudents.filter((st) => {
                    const en = entries.find((e) => Number(e.studentId) === Number(st.id));
                    return en && en.attendance === 'late';
                  }).length;
                  const absentCount = classStudents.filter((st) => {
                    const en = entries.find((e) => Number(e.studentId) === Number(st.id));
                    return en && en.attendance === 'absent';
                  }).length;

                  const totalPos = entries.reduce(
                    (sum, e) => sum + (e.attendance === 'absent' ? 0 : Number(e.positiveCount) || 0),
                    0
                  );
                  const totalNeg = entries.reduce(
                    (sum, e) => sum + (e.attendance === 'absent' ? 0 : Number(e.negativeCount) || 0),
                    0
                  );

                  return `
                    <div class="modern-class-card">
                      <div>
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-[11px] font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
                            کلاس ${toPersianDigits(ses.classCode)}
                          </span>
                          <span class="text-xs font-bold text-[#6E5D4F] tabular-nums">
                            ${toPersianDigits(ses.sessionDate)}
                          </span>
                        </div>

                        <h3 class="text-sm font-black text-[#251B15] mt-2.5 m-0 leading-snug">
                          ${toPersianDigits(ses.title)}
                        </h3>
                        <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">
                          ${toPersianDigits(ses.topic)}
                        </p>
                      </div>

                      <div class="mt-4 pt-3 border-t border-[#E6D8C5] space-y-3">
                        <div class="flex items-center justify-between text-[11px] tabular-nums">
                          <div class="flex items-center gap-1.5">
                            <span class="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] font-extrabold">حاضر: ${toPersianDigits(presentCount)}</span>
                            <span class="px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#D97706] font-extrabold">تأخیر: ${toPersianDigits(lateCount)}</span>
                            <span class="px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48] font-extrabold">غایب: ${toPersianDigits(absentCount)}</span>
                          </div>
                          <div class="flex items-center gap-1 font-extrabold">
                            <span class="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669]">مثبت: +${toPersianDigits(totalPos)}</span>
                            <span class="px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48]">منفی: −${toPersianDigits(totalNeg)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          class="btn-admin-primary w-full !h-9 text-xs js-gb-enter-session"
                          data-id="${ses.id}"
                        >
                          ورود به جلسه
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')
            : `<div class="col-span-full admin-surface-card text-center py-8 text-xs text-[#6E5D4F]">جلسه‌ای برای این کلاس ثبت نشده است.</div>`
        }
      </div>
    </div>
  `);
}

/**
 * صفحه اختصاصی هر جلسه در دفتر نمره (/admin/gradebook/session)
 */
function renderGradebookSessionDetailPage(
  $container: JQuery<HTMLElement>,
  state: DatabaseState,
  sessionId: number
): void {
  const activeSession = (state.gradebookSessions || []).find((s) => Number(s.id) === Number(sessionId));
  if (!activeSession) {
    gradebookSubView = 'list';
    renderGradebookSection($container, state);
    return;
  }

  const classStudents = state.students.filter(
    (s) => String(s.classCode) === String(activeSession.classCode) && s.status === 'approved'
  );
  const allowedIds = new Set(classStudents.map((st) => Number(st.id)));
  const sessionEntries = (state.gradebookEntries || []).filter(
    (e) => Number(e.sessionId) === Number(activeSession.id) && allowedIds.has(Number(e.studentId))
  );

  const presentCount = classStudents.filter((st) => {
    const en = sessionEntries.find((e) => Number(e.studentId) === Number(st.id));
    return !en || en.attendance === 'present';
  }).length;
  const lateCount = classStudents.filter((st) => {
    const en = sessionEntries.find((e) => Number(e.studentId) === Number(st.id));
    return en && en.attendance === 'late';
  }).length;
  const absentCount = classStudents.filter((st) => {
    const en = sessionEntries.find((e) => Number(e.studentId) === Number(st.id));
    return en && en.attendance === 'absent';
  }).length;

  const sessionTotalPos = sessionEntries.reduce(
    (sum, e) => sum + (e.attendance === 'absent' ? 0 : Number(e.positiveCount) || 0),
    0
  );
  const sessionTotalNeg = sessionEntries.reduce(
    (sum, e) => sum + (e.attendance === 'absent' ? 0 : Number(e.negativeCount) || 0),
    0
  );

  $container.html(`
    <div class="space-y-4">
      <!-- هدر صفحه اختصاصی جلسه در دفتر نمره -->
      <div class="admin-surface-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-extrabold text-[#1B5E5A] bg-[#E2EFEA] px-2.5 py-1 rounded-lg">
              کلاس ${toPersianDigits(activeSession.classCode)}
            </span>
            <span class="text-xs font-bold text-[#6E5D4F] tabular-nums">
              تاریخ جلسه: ${toPersianDigits(activeSession.sessionDate)}
            </span>
          </div>
          <h2 class="text-base font-black text-[#251B15] mt-2 m-0">
            ${toPersianDigits(activeSession.title)}
          </h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            مبحث آموزشی: <strong class="text-[#251B15]">${toPersianDigits(activeSession.topic)}</strong>
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="btn-save-gradebook-session"
            data-session-id="${activeSession.id}"
            class="btn-admin-primary !h-9"
          >
            ذخیره نهایی نمرات و حضور و غیاب جلسه
          </button>
          <button type="button" class="btn-admin-action !h-9 js-gb-back-to-sessions">
            بازگشت به لیست جلسات ←
          </button>
        </div>
      </div>

      <!-- خلاصه آمار حضور و غیاب و مجموع مثبت/منفی این جلسه -->
      <div class="admin-surface-card !py-3 flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs font-extrabold text-[#5A3A22]">
          لیست دانش‌آموزان کلاس ${toPersianDigits(activeSession.classCode)} (${toPersianDigits(classStudents.length)} نفر)
        </span>
        <div class="flex items-center gap-2 flex-wrap text-xs tabular-nums">
          <span class="status-pill status-pill-approved">حاضر: ${toPersianDigits(presentCount)}</span>
          <span class="status-pill status-pill-pending">تأخیر: ${toPersianDigits(lateCount)}</span>
          <span class="status-pill status-pill-rejected">غایب: ${toPersianDigits(absentCount)}</span>
          <span class="px-2.5 py-1 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] font-extrabold">
            مجموع مثبت جلسه: +${toPersianDigits(sessionTotalPos)}
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3] font-extrabold">
            مجموع منفی جلسه: −${toPersianDigits(sessionTotalNeg)}
          </span>
        </div>
      </div>

      <!-- جدول دفتر نمره، حضور و غیاب و مثبت / منفی دانش‌آموزان -->
      <div class="admin-surface-card !p-0 overflow-hidden">
        <div class="admin-table-wrap !border-0 !rounded-none">
          <table class="admin-table">
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>وضعیت حضور و غیاب</th>
                <th>امتیاز مثبت (+)</th>
                <th>امتیاز منفی (-)</th>
                <th>نمره جلسه (از ۲۰)</th>
                <th>یادداشت و بازخورد کلاسی</th>
                <th>تراز کل جلسات</th>
              </tr>
            </thead>
            <tbody>
              ${
                classStudents.length
                  ? classStudents
                      .map((st) => {
                        const existingEntry = sessionEntries.find(
                          (e) => Number(e.studentId) === Number(st.id)
                        );
                        const attendance: AttendanceStatus = existingEntry
                          ? existingEntry.attendance
                          : 'present';
                        const isAbsent = attendance === 'absent';
                        const posCount = isAbsent
                          ? 0
                          : Number(existingEntry?.positiveCount) || 0;
                        const negCount = isAbsent
                          ? 0
                          : Number(existingEntry?.negativeCount) || 0;
                        const classScore = isAbsent
                          ? null
                          : existingEntry?.classScore ?? null;
                        const teacherNote = existingEntry?.teacherNote || '';

                        const allStEntries = (state.gradebookEntries || []).filter(
                          (e) => Number(e.studentId) === Number(st.id) && e.attendance !== 'absent'
                        );
                        const totalPos = allStEntries.reduce(
                          (a, b) => a + (Number(b.positiveCount) || 0),
                          0
                        );
                        const totalNeg = allStEntries.reduce(
                          (a, b) => a + (Number(b.negativeCount) || 0),
                          0
                        );

                        return `
                          <tr class="${isAbsent ? 'bg-[#FFF9FA]/60' : ''}">
                            <td>
                              <div class="flex items-center gap-2.5">
                                ${renderStudentAvatarHtml(st, 'sm')}
                                <div>
                                  <div class="font-extrabold text-[#251B15]">${st.firstName} ${st.lastName}</div>
                                  <div class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(st.phone)}</div>
                                </div>
                              </div>
                            </td>

                            <!-- دکمه‌های حضور و غیاب -->
                            <td>
                              <div class="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F3ECE0] border border-[#E2D5C1]">
                                <button
                                  type="button"
                                  class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer border-none transition js-gb-attendance-btn ${
                                    attendance === 'present'
                                      ? 'bg-[#059669] text-white shadow-xs'
                                      : 'bg-transparent text-[#4E3E30] hover:bg-[#E7DEC8]'
                                  }"
                                  data-session-id="${activeSession.id}"
                                  data-student-id="${st.id}"
                                  data-status="present"
                                >
                                  حاضر
                                </button>
                                <button
                                  type="button"
                                  class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer border-none transition js-gb-attendance-btn ${
                                    attendance === 'late'
                                      ? 'bg-[#D97706] text-white shadow-xs'
                                      : 'bg-transparent text-[#4E3E30] hover:bg-[#E7DEC8]'
                                  }"
                                  data-session-id="${activeSession.id}"
                                  data-student-id="${st.id}"
                                  data-status="late"
                                >
                                  تأخیر
                                </button>
                                <button
                                  type="button"
                                  class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer border-none transition js-gb-attendance-btn ${
                                    attendance === 'absent'
                                      ? 'bg-[#E11D48] text-white shadow-xs'
                                      : 'bg-transparent text-[#4E3E30] hover:bg-[#E7DEC8]'
                                  }"
                                  data-session-id="${activeSession.id}"
                                  data-student-id="${st.id}"
                                  data-status="absent"
                                >
                                  غایب
                                </button>
                              </div>
                            </td>

                            <!-- امتیاز مثبت (+) سبز -->
                            <td>
                              ${
                                isAbsent
                                  ? `<span
                                      class="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#F5EFE6] text-[#9A8B7A] border border-[#E2D5C1] text-[11px] font-bold js-gb-pos-value"
                                      data-student-id="${st.id}"
                                      data-count="0"
                                    >
                                      غایب (غیرفعال)
                                    </span>`
                                  : `<div class="inline-flex items-center gap-1.5 tabular-nums">
                                      <button
                                        type="button"
                                        class="w-6 h-6 rounded-lg border border-[#D4C3AE] bg-white text-[#251B15] font-black text-xs flex items-center justify-center cursor-pointer hover:bg-[#F3ECE0] js-gb-pos-delta"
                                        data-session-id="${activeSession.id}"
                                        data-student-id="${st.id}"
                                        data-delta="-1"
                                        title="کاهش مثبت"
                                      >
                                        −
                                      </button>
                                      <span
                                        class="min-w-[34px] text-center px-2 py-0.5 rounded-lg bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] font-black text-xs js-gb-pos-value"
                                        data-student-id="${st.id}"
                                        data-count="${posCount}"
                                      >
                                        +${toPersianDigits(posCount)}
                                      </span>
                                      <button
                                        type="button"
                                        class="w-6 h-6 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] text-[#059669] font-black text-xs flex items-center justify-center cursor-pointer hover:bg-[#059669] hover:text-white js-gb-pos-delta"
                                        data-session-id="${activeSession.id}"
                                        data-student-id="${st.id}"
                                        data-delta="1"
                                        title="افزودن مثبت"
                                      >
                                        +
                                      </button>
                                    </div>`
                              }
                            </td>

                            <!-- امتیاز منفی (-) قرمز -->
                            <td>
                              ${
                                isAbsent
                                  ? `<span
                                      class="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#F5EFE6] text-[#9A8B7A] border border-[#E2D5C1] text-[11px] font-bold js-gb-neg-value"
                                      data-student-id="${st.id}"
                                      data-count="0"
                                    >
                                      غایب (غیرفعال)
                                    </span>`
                                  : `<div class="inline-flex items-center gap-1.5 tabular-nums">
                                      <button
                                        type="button"
                                        class="w-6 h-6 rounded-lg border border-[#D4C3AE] bg-white text-[#251B15] font-black text-xs flex items-center justify-center cursor-pointer hover:bg-[#F3ECE0] js-gb-neg-delta"
                                        data-session-id="${activeSession.id}"
                                        data-student-id="${st.id}"
                                        data-delta="-1"
                                        title="کاهش منفی"
                                      >
                                        −
                                      </button>
                                      <span
                                        class="min-w-[34px] text-center px-2 py-0.5 rounded-lg bg-[#FFF1F2] text-[#E11D48] border border-[#FECDD3] font-black text-xs js-gb-neg-value"
                                        data-student-id="${st.id}"
                                        data-count="${negCount}"
                                      >
                                        −${toPersianDigits(negCount)}
                                      </span>
                                      <button
                                        type="button"
                                        class="w-6 h-6 rounded-lg border border-[#FECDD3] bg-[#FFF1F2] text-[#E11D48] font-black text-xs flex items-center justify-center cursor-pointer hover:bg-[#E11D48] hover:text-white js-gb-neg-delta"
                                        data-session-id="${activeSession.id}"
                                        data-student-id="${st.id}"
                                        data-delta="1"
                                        title="ثبت منفی"
                                      >
                                        +
                                      </button>
                                    </div>`
                              }
                            </td>

                            <!-- نمره کلاسی جلسه -->
                            <td>
                              <input
                                type="text"
                                inputmode="decimal"
                                class="school-input !h-8 !w-24 text-center text-xs font-extrabold tabular-nums js-gb-score-input ${
                                  isAbsent ? '!bg-[#F3ECE0] !text-[#9A8B7A] cursor-not-allowed opacity-65' : ''
                                }"
                                data-student-id="${st.id}"
                                placeholder="${isAbsent ? 'غایب' : 'از ۲۰'}"
                                value="${
                                  !isAbsent && classScore !== null && classScore !== undefined
                                    ? toPersianDigits(classScore)
                                    : ''
                                }"
                                ${isAbsent ? 'disabled' : ''}
                              />
                            </td>

                            <!-- یادداشت کلاسی -->
                            <td>
                              <input
                                type="text"
                                class="school-input !h-8 !w-48 text-xs js-gb-note-input"
                                data-student-id="${st.id}"
                                placeholder="یادداشت عملکرد در این جلسه..."
                                value="${toPersianDigits(teacherNote)}"
                              />
                            </td>

                            <!-- تراز کل مثبت و منفی در کل ترم -->
                            <td>
                              <div class="flex items-center gap-1.5 text-[11px] font-extrabold tabular-nums">
                                <span class="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669]">+${toPersianDigits(totalPos)}</span>
                                <span class="px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#E11D48]">−${toPersianDigits(totalNeg)}</span>
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
                  : `<tr><td colspan="7" class="text-center py-8 text-xs text-[#6E5D4F]">دانش‌آموز تأییدشده‌ای در کلاس ${toPersianDigits(activeSession.classCode)} یافت نشد.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

