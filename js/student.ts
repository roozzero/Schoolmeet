import $ from 'jquery';
import { showToast } from './modal';
import { AppRoutePath, updateBrowserUrl } from './router';
import { loadDbState, logAdminActivity, saveDbState } from './store';
import {
  AttendanceStatus,
  DatabaseState,
  StudentRecord,
  StudentSectionId,
} from './types';
import { normalizeDigits, toPersianDigits } from './validation';

let activeStudentSection: StudentSectionId = 'dashboard';
let studentHwSubView: 'list' | 'detail' = 'list';
let activeStudentHwId: number | null = null;
let pendingStudentHwFileName = '';
let pendingStudentHwFileDataUrl = '';

let studentResSubView: 'list' | 'detail' = 'list';
let activeStudentResId: number | null = null;
let studentResCategoryFilter = 'all';
let studentResSearchQuery = '';

let studentAnnSearchQuery = '';
let studentTicketSubView: 'list' | 'create' = 'list';
let activeStudentTicketId: number | null = null;
let pendingStudentTicketFileName = '';
let pendingStudentTicketFileDataUrl = '';
let pendingNewTicketFileName = '';
let pendingNewTicketFileDataUrl = '';

function getActiveStudent(state: DatabaseState): StudentRecord {
  const found = state.students.find((s) => s.id === state.activeStudentId);
  return found || state.students[0];
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
  if (dataUrl && dataUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('دانلود انجام شد', `فایل «${toPersianDigits(cleanName)}» دانلود گردید.`, 'success');
    return;
  }

  const content =
    fallbackText ||
    `سامانه آموزشی اسکول میت (ScoolMeet)\nنام فایل: ${cleanName}\nدریافت‌شده از پنل دانش‌آموزی.`;
  const blob = new Blob([content], { type: 'application/octet-stream;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = cleanName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  showToast('دانلود انجام شد', `فایل «${toPersianDigits(cleanName)}» دانلود گردید.`, 'success');
}

function markResourceViewedByStudent(state: DatabaseState, resourceId: number, student: StudentRecord): void {
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
      viewedAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
    });
    saveDbState(state);
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

  const portraitIdx = Math.abs(Number(student.id) || 0) % 4;
  const $avatar = $('#student-sidebar-avatar');
  $avatar.removeClass(
    'student-portrait-0 student-portrait-1 student-portrait-2 student-portrait-3 student-portrait-lg-0 student-portrait-lg-1 student-portrait-lg-2 student-portrait-lg-3 has-custom-avatar'
  );
  if (student.avatarUrl) {
    $avatar
      .addClass('has-custom-avatar')
      .css('background-image', `url('${student.avatarUrl}')`)
      .html('');
  } else if (student.avatarRemoved) {
    $avatar
      .css('background-image', 'none')
      .addClass('bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]')
      .html(
        `<svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>`
      );
  } else {
    $avatar
      .addClass(`student-portrait-lg-${portraitIdx}`)
      .css('background-image', '')
      .html('');
  }

  const myAssignments = state.assignments.filter(
    (a) => a.classCode === 'all' || a.classCode === student.classCode
  );
  const myGrades = state.gradebookEntries.filter((e) => e.studentId === student.id);
  const myResources = state.resources.filter(
    (r) => r.classCode === 'all' || r.classCode === student.classCode
  );
  const myAnnouncements = state.announcements.filter(
    (an) => an.targetClasses === 'all' || an.targetClasses === student.classCode
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
  const myAssignments = state.assignments.filter(
    (a) => a.classCode === 'all' || a.classCode === student.classCode
  );
  const mySubmissions = state.submissions.filter((s) => s.studentId === student.id);
  const myGradebookEntries = state.gradebookEntries.filter((e) => e.studentId === student.id);
  const myAnnouncements = state.announcements.filter(
    (an) => an.targetClasses === 'all' || an.targetClasses === student.classCode
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
            <div class="text-[15px] font-black text-[#251B15] mt-0.5 tabular-nums">
              +${toPersianDigits(totalPositives)} مثبت / -${toPersianDigits(totalNegatives)} منفی
            </div>
            <div class="text-[10.5px] font-semibold text-[#1B5E5A] mt-0.5 truncate">
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
          ${myAssignments
            .slice(0, 3)
            .map((hw) => {
              const sub = mySubmissions.find((s) => s.assignmentId === hw.id);
              return `
                <div class="modern-class-card">
                  <div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                        sub
                          ? 'bg-[#ECFDF5] text-[#059669]'
                          : 'bg-[#FFFBEB] text-[#D97706]'
                      }">
                        ${sub ? 'تحویل داده شده' : 'در انتظار ارسال'}
                      </span>
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
                      <strong class="text-[#251B15] tabular-nums">${toPersianDigits(hw.dueDate)}</strong>
                    </div>
                    <button
                      type="button"
                      class="btn-admin-primary w-full !h-9 text-xs js-st-open-hw-detail"
                      data-id="${hw.id}"
                    >
                      ${sub ? 'مشاهده وضعیت و ویرایش پاسخ' : 'مشاهده و ارسال تکلیف'}
                    </button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- آخرین اطلاعیه‌های کلاس -->
      <div class="admin-surface-card">
        <div class="flex items-center justify-between mb-3.5">
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">آخرین اطلاعیه‌های آموزشی</h2>
          <button
            type="button"
            class="text-xs font-extrabold text-[#5A3A22] hover:underline bg-transparent border-none p-0 cursor-pointer js-st-go-section"
            data-section="announcements"
          >
            همه اطلاعیه‌ها ←
          </button>
        </div>

        <div class="space-y-2.5">
          ${myAnnouncements
            .slice(0, 4)
            .map(
              (ann) => `
              <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB]">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-extrabold text-[#251B15]">${toPersianDigits(ann.title)}</span>
                  <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(ann.createdAt)}</span>
                </div>
                <p class="text-xs text-[#6E5D4F] mt-1.5 m-0 leading-relaxed">${toPersianDigits(ann.content)}</p>
              </div>`
            )
            .join('')}
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

  const myAssignments = state.assignments.filter(
    (a) => a.classCode === 'all' || a.classCode === student.classCode
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
        ${myAssignments
          .map((hw) => {
            const sub = mySubmissions.find((s) => s.assignmentId === hw.id);
            return `
              <div class="modern-class-card">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                      sub
                        ? sub.score !== null
                          ? 'bg-[#ECFDF5] text-[#059669]'
                          : 'bg-[#E2EFEA] text-[#1B5E5A]'
                        : 'bg-[#FFFBEB] text-[#D97706]'
                    }">
                      ${
                        sub
                          ? sub.score !== null
                            ? `نمره ثبت‌شده: ${toPersianDigits(sub.score)} از ${toPersianDigits(hw.maxScore)}`
                            : 'تحویل داده شده (در انتظار نمره)'
                          : 'تحویل نداده'
                      }
                    </span>
                    <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(hw.createdAt)}</span>
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
                    <span>مهلت تحویل: <strong class="text-[#251B15]">${toPersianDigits(hw.dueDate)}</strong></span>
                    <span>بارم: <strong class="text-[#251B15]">${toPersianDigits(hw.maxScore)}</strong></span>
                  </div>

                  <button
                    type="button"
                    class="btn-admin-primary w-full !h-9 text-xs js-st-open-hw-detail"
                    data-id="${hw.id}"
                  >
                    ${sub ? 'مشاهده جزئیات و پاسخ ارسالی' : 'مشاهده جزئیات و ارسال تکلیف'}
                  </button>
                </div>
              </div>
            `;
          })
          .join('')}
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

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-base font-black text-[#251B15] m-0">${toPersianDigits(hw.title)}</h2>
          <p class="text-xs text-[#6E5D4F] mt-1 m-0">
            مهلت تحویل: <strong class="text-[#251B15]">${toPersianDigits(hw.dueDate)}</strong> · بارم: <strong class="text-[#1B5E5A]">${toPersianDigits(hw.maxScore)} نمره</strong>
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
              <div class="admin-surface-card space-y-2.5">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-extrabold text-[#251B15] m-0">وضعیت بررسی و نمره مدرس</h3>
                  <span class="text-xs font-extrabold ${
                    existingSub.score !== null ? 'text-[#059669]' : 'text-[#D97706]'
                  }">
                    ${
                      existingSub.score !== null
                        ? `نمره شما: ${toPersianDigits(existingSub.score)} از ${toPersianDigits(hw.maxScore)}`
                        : 'در انتظار بررسی و نمره‌دهی مدرس'
                    }
                  </span>
                </div>
                ${
                  existingSub.teacherFeedback
                    ? `<div class="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] text-xs text-[#3E3027] leading-relaxed">
                        <strong class="text-[#5A3A22]">بازخورد مدرس:</strong> ${toPersianDigits(existingSub.teacherFeedback)}
                      </div>`
                    : `<p class="text-xs text-[#6E5D4F] m-0">تکلیف شما در تاریخ ${toPersianDigits(existingSub.submittedAt)} ارسال شده است و پس از تصحیح مدرس، نمره و بازخورد در این بخش قرار می‌گیرد.</p>`
                }
              </div>`
              : ''
          }
        </div>

        <!-- ستون چپ: فرم ارسال یا بروزرسانی پاسخ و فایل تکلیف -->
        <div class="lg:col-span-6 admin-surface-card">
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
              <label class="scool-field-label">فایل پروژه / تمرین ارسالی</label>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  id="st-hw-filename"
                  class="school-input flex-1"
                  placeholder="نام فایل ارسالی (مثال: project-901.zip)"
                  value="${
                    pendingStudentHwFileName
                      ? toPersianDigits(pendingStudentHwFileName)
                      : existingSub
                      ? toPersianDigits(existingSub.fileName)
                      : `${student.firstName}-hw-${hw.id}.zip`
                  }"
                  required
                />
                <label for="st-hw-file-input" class="btn-admin-action !h-[42px] cursor-pointer shrink-0">
                  انتخاب فایل
                </label>
                <input type="file" id="st-hw-file-input" class="hidden" />
              </div>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <button type="submit" class="btn-admin-primary !h-10 flex-1">
                ${existingSub ? 'بروزرسانی پاسخ ارسالی' : 'ثبت و ارسال نهایی تکلیف'}
              </button>
              <button type="button" class="btn-admin-action !h-10 js-st-back-to-hw-list">
                انصراف
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   3. نمرات من: بصورت کارت با دکمه جزئیات (مودال)، مثبت‌ها سبز و منفی‌ها قرمز
      (بخش نمرات و بازخورد تکالیف طبق درخواست کاملاً حذف شده است)
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
                          <!-- نمره جلسه و بج‌های سبز مثبت و قرمز منفی -->
                          <div class="flex items-center justify-between gap-2 flex-wrap tabular-nums">
                            <span class="text-xs font-bold text-[#251B15]">
                              نمره جلسه:
                              <strong class="font-black text-[#1B5E5A]">
                                ${entry.classScore !== null ? `${toPersianDigits(entry.classScore)} از ۲۰` : 'ثبت نشده'}
                              </strong>
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
    const inClass = res.classCode === 'all' || res.classCode === student.classCode;
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
                          ${res.category}
                        </span>
                        <span class="text-[11px] text-[#6E5D4F] tabular-nums">${toPersianDigits(res.createdAt)}</span>
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
   5. اطلاعیه‌ها در پنل دانش‌آموز
   ============================================================================ */
/* ============================================================================
   5. اطلاعیه‌ها در پنل دانش‌آموز (با دکمه «خوانده شد» و کاهش بج اطلاعیه)
   ============================================================================ */
function renderStudentAnnouncements($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);
  const normalizedQuery = normalizeDigits(studentAnnSearchQuery.trim()).toLowerCase();

  const list = state.announcements.filter((ann) => {
    const inClass = ann.targetClasses === 'all' || ann.targetClasses === student.classCode;
    const matchesQuery =
      !normalizedQuery ||
      ann.title.toLowerCase().includes(normalizedQuery) ||
      ann.content.toLowerCase().includes(normalizedQuery);
    return inClass && matchesQuery;
  });

  const unreadCount = list.filter(
    (ann) => !(ann.readers || []).some((r) => r.studentId === student.id)
  ).length;

  $container.html(`
    <div class="space-y-4">
      <div class="admin-surface-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-sm font-extrabold text-[#251B15] m-0">
            اطلاعیه‌های کلاس ${toPersianDigits(student.classCode || 'من')} (${toPersianDigits(list.length)})
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
                            !readLog
                              ? `<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#D97706]">جدید (خوانده نشده)</span>`
                              : ''
                          }
                        </div>
                        <span class="text-xs text-[#6E5D4F] tabular-nums">${toPersianDigits(ann.createdAt)}</span>
                      </div>
                      <p class="text-xs text-[#3E3027] mt-2 m-0 leading-relaxed">${toPersianDigits(ann.content)}</p>

                      <div class="mt-3 pt-2.5 border-t border-[#E6D8C5] flex items-center justify-between gap-2 flex-wrap">
                        <span class="text-[11px] text-[#6E5D4F]">
                          مخاطب: <strong class="text-[#5A3A22]">${ann.targetClasses === 'all' ? 'همه کلاس‌ها' : `کلاس ${toPersianDigits(ann.targetClasses)}`}</strong>
                        </span>

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
      <!-- نوار بالایی تیکت‌های دانش‌آموز و دکمه باز کردن صفحه ایجاد تیکت جدید -->
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
        <!-- لیست تیکت‌های من -->
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
                            tk.status === 'پاسخ داده شده' ? 'text-[#059669]' : 'text-[#D97706]'
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

        <!-- گفت‌وگوی تیکت و دانلود فایل‌های ضمیمه -->
        <div class="lg:col-span-7 admin-surface-card">
          ${
            currentTicket
              ? `
              <div class="pb-3 mb-3 border-b border-[#E6D8C5] flex items-center justify-between">
                <h3 class="text-sm font-extrabold text-[#251B15] m-0">${toPersianDigits(currentTicket.subject)}</h3>
                <span class="text-xs font-bold text-[#1B5E5A]">${currentTicket.status}</span>
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
                  <button type="submit" class="btn-admin-primary">ارسال پیام</button>
                </div>
              </form>
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

          <div class="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] flex items-center justify-between gap-3 flex-wrap">
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

          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E6D8C5]">
            <button type="button" class="btn-admin-action !h-10 js-st-back-to-tickets">
              انصراف و بازگشت
            </button>
            <button type="submit" class="btn-admin-primary !h-10">
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
   ============================================================================ */
function renderStudentProfile($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const student = getActiveStudent(state);
  const portraitIdx = Math.abs(Number(student.id) || 0) % 4;

  let avatarBoxHtml = '';
  if (student.avatarUrl) {
    avatarBoxHtml = `<div class="student-avatar-lg has-custom-avatar" style="background-image: url('${student.avatarUrl}');" role="img" aria-label="تصویر پروفایل دانش‌آموز"></div>`;
  } else if (student.avatarRemoved) {
    avatarBoxHtml = `<div class="student-avatar-lg bg-[#EADCCA] flex items-center justify-center text-[#5A3A22]" style="background-image: none;" role="img" aria-label="بدون تصویر پروفایل">
      <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>`;
  } else {
    avatarBoxHtml = `<div class="student-avatar-lg student-portrait-lg-${portraitIdx}" role="img" aria-label="تصویر پروفایل دانش‌آموز"></div>`;
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
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">نام</label>
              <input type="text" id="st-prof-firstname" class="school-input" value="${student.firstName}" required />
            </div>
            <div>
              <label class="scool-field-label">نام خانوادگی</label>
              <input type="text" id="st-prof-lastname" class="school-input" value="${student.lastName}" required />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">شماره تلفن</label>
              <input type="tel" id="st-prof-phone" class="school-input tabular-nums" value="${toPersianDigits(student.phone)}" required />
            </div>
            <div>
              <label class="scool-field-label">کلاس ثبت‌شده</label>
              <input type="text" class="school-input" value="${student.classCode ? `کلاس ${toPersianDigits(student.classCode)}` : '—'}" readonly />
            </div>
          </div>

          <button type="submit" class="btn-admin-primary">ذخیره مشخصات پروفایل</button>
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
          <button type="submit" class="btn-admin-primary w-full">بروزرسانی رمز عبور</button>
        </form>
      </div>
    </div>
  `);
}

export function initStudentPanelEvents(): void {
  $(document).on('click', '.student-nav-btn, .js-st-go-section', function () {
    const sec = $(this).data('section') as StudentSectionId;
    if (sec) {
      navigateStudentSection(sec);
    }
  });

  $('#btn-student-logout').on('click', () => {
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
    pendingStudentHwFileName = file.name;
    $('#st-hw-filename').val(toPersianDigits(file.name));
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingStudentHwFileDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  $(document).on('submit', '#form-student-submit-hw', function (e) {
    e.preventDefault();
    const hwId = Number($(this).attr('data-hw-id'));
    const responseText = String($('#st-hw-response-text').val() || '').trim();
    const fileName = String($('#st-hw-filename').val() || 'homework.zip').trim();
    if (!responseText) return;

    const state = loadDbState();
    const student = getActiveStudent(state);
    const existing = state.submissions.find(
      (s) => s.assignmentId === hwId && s.studentId === student.id
    );

    if (existing) {
      existing.fileContent = responseText;
      existing.fileName = fileName;
      if (pendingStudentHwFileDataUrl) {
        existing.fileDataUrl = pendingStudentHwFileDataUrl;
      }
      existing.submittedAt = '۱۴۰۵/۰۸/۱۵ · هم‌اکنون';
    } else {
      state.submissions.unshift({
        id: Date.now(),
        assignmentId: hwId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        classCode: student.classCode || '901',
        fileName,
        fileContent: responseText,
        fileDataUrl: pendingStudentHwFileDataUrl || undefined,
        submittedAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
        score: null,
        teacherFeedback: '',
        status: 'pending',
      });
    }

    logAdminActivity(
      state,
      `ارسال تکلیف توسط ${student.firstName} ${student.lastName}`,
      `فایل: ${fileName}`,
      'assignment'
    );
    saveDbState(state);
    studentHwSubView = 'list';
    updateBrowserUrl('/student/assignments');
    renderActiveStudentSection();
    showToast('تکلیف ارسال شد', 'پاسخ و فایل تکلیف شما با موفقیت برای مدرس ارسال گردید.', 'success');
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
        <div class="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DBCB] text-center">
          <div class="text-[11px] font-bold text-[#6E5D4F]">نمره کلاسی جلسه</div>
          <div class="text-sm font-black text-[#251B15] mt-1">
            ${entry.classScore !== null ? `${toPersianDigits(entry.classScore)} از ۲۰` : 'ثبت نشده'}
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

  $(document).on('click', '.js-st-mark-ann-read', function () {
    const annId = Number($(this).attr('data-id'));
    const state = loadDbState();
    const student = getActiveStudent(state);
    const ann = state.announcements.find((a) => a.id === annId);
    if (!ann) return;

    if (!ann.readers) {
      ann.readers = [];
    }
    const alreadyRead = ann.readers.some((r) => r.studentId === student.id);
    if (!alreadyRead) {
      ann.readers.push({
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        classCode: student.classCode || '901',
        readAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
      });
      saveDbState(state);
    }

    renderActiveStudentSection();
    showToast(
      'اطلاعیه خوانده شد',
      'وضعیت مطالعه اطلاعیه ثبت گردید و از شمارنده اطلاعیه‌های جدید کسر شد.',
      'success'
    );
  });

  // Student Tickets: Open Create Page, Back to List, File Upload & Submit
  $(document).on('click', '#btn-st-open-create-ticket', function () {
    pendingNewTicketFileName = '';
    pendingNewTicketFileDataUrl = '';
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
      $('#st-new-ticket-file-name').text('فایلی انتخاب نشده است');
      return;
    }
    pendingNewTicketFileName = file.name;
    $('#st-new-ticket-file-name').text(`فایل انتخاب‌شده: ${toPersianDigits(file.name)}`);
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingNewTicketFileDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  $(document).on('click', '.js-st-select-ticket', function () {
    activeStudentTicketId = Number($(this).attr('data-id'));
    pendingStudentTicketFileName = '';
    pendingStudentTicketFileDataUrl = '';
    renderActiveStudentSection();
  });

  $(document).on('submit', '#form-student-new-ticket', function (e) {
    e.preventDefault();
    const subject = String($('#st-new-ticket-subject').val() || '').trim();
    const priority = (String($('#st-new-ticket-priority').val() || 'عادی') as
      | 'عادی'
      | 'مهم'
      | 'فوری');
    const msg = String($('#st-new-ticket-msg').val() || '').trim();
    if (!subject || !msg) return;

    const state = loadDbState();
    const student = getActiveStudent(state);
    const newTicketId = Date.now();

    state.tickets.unshift({
      id: newTicketId,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      studentPhone: student.phone,
      classCode: student.classCode || '901',
      subject,
      priority,
      status: 'در انتظار پاسخ',
      createdAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
      messages: [
        {
          id: Date.now() + 1,
          senderRole: 'student',
          senderName: `${student.firstName} ${student.lastName}`,
          message: msg,
          sentAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
          attachmentName: pendingNewTicketFileName || undefined,
          attachmentDataUrl: pendingNewTicketFileDataUrl || undefined,
        },
      ],
    });

    logAdminActivity(
      state,
      `ثبت تیکت جدید توسط ${student.firstName} ${student.lastName}`,
      `موضوع: ${subject}`,
      'ticket'
    );
    pendingNewTicketFileName = '';
    pendingNewTicketFileDataUrl = '';
    activeStudentTicketId = newTicketId;
    studentTicketSubView = 'list';
    saveDbState(state);
    updateBrowserUrl('/student/tickets');
    renderActiveStudentSection();
    showToast('تیکت ارسال شد', 'تیکت جدید شما با موفقیت برای مدرس ثبت گردید.', 'success');
  });

  $(document).on('change', '#st-ticket-reply-file', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    pendingStudentTicketFileName = file.name;
    $('#st-ticket-attached-name').text(`پیوست: ${toPersianDigits(file.name)}`);
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingStudentTicketFileDataUrl = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });

  $(document).on('submit', '#form-student-reply-ticket', function (e) {
    e.preventDefault();
    const ticketId = Number($(this).attr('data-id'));
    const text = String($('#st-ticket-reply-text').val() || '').trim();
    if (!text) return;

    const state = loadDbState();
    const student = getActiveStudent(state);
    const tk = state.tickets.find((t) => t.id === ticketId);
    if (!tk) return;

    tk.messages.push({
      id: Date.now(),
      senderRole: 'student',
      senderName: `${student.firstName} ${student.lastName}`,
      message: text,
      sentAt: '۱۴۰۵/۰۸/۱۵ · هم‌اکنون',
      attachmentName: pendingStudentTicketFileName || undefined,
      attachmentDataUrl: pendingStudentTicketFileDataUrl || undefined,
    });
    tk.status = 'در انتظار پاسخ';
    pendingStudentTicketFileName = '';
    pendingStudentTicketFileDataUrl = '';
    saveDbState(state);
    renderActiveStudentSection();
    showToast('پیام ارسال شد', 'پیام شما در تیکت ثبت گردید.', 'success');
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

  // Student Profile Save, Avatar Upload & Delete Avatar
  $(document).on('change', '#st-prof-avatar-upload', function (this: HTMLInputElement) {
    const file = this.files && this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;
      const state = loadDbState();
      const student = getActiveStudent(state);
      student.avatarUrl = dataUrl;
      student.avatarRemoved = false;
      saveDbState(state);
      renderActiveStudentSection();
      showToast('تصویر پروفایل ذخیره شد', 'عکس جدید پروفایل شما ثبت گردید.', 'success');
    };
    reader.readAsDataURL(file);
  });

  $(document).on('click', '#btn-st-delete-avatar', function () {
    const state = loadDbState();
    const student = getActiveStudent(state);
    student.avatarUrl = '';
    student.avatarRemoved = true;
    saveDbState(state);
    renderActiveStudentSection();
    showToast('تصویر پروفایل حذف شد', 'عکس پروفایل شما با موفقیت حذف گردید.', 'info');
  });

  $(document).on('submit', '#form-student-profile-save', function (e) {
    e.preventDefault();
    const state = loadDbState();
    const student = getActiveStudent(state);
    student.firstName = String($('#st-prof-firstname').val() || '').trim();
    student.lastName = String($('#st-prof-lastname').val() || '').trim();
    student.phone = normalizeDigits(String($('#st-prof-phone').val() || ''));
    saveDbState(state);
    renderActiveStudentSection();
    showToast('پروفایل بروزرسانی شد', 'اطلاعات شما با موفقیت ذخیره گردید.', 'success');
  });

  $(document).on('submit', '#form-student-change-pass', function (e) {
    e.preventDefault();
    const newPass = String($('#st-new-pass').val() || '');
    const confirmPass = String($('#st-confirm-pass').val() || '');
    if (newPass.length < 6 || newPass !== confirmPass) {
      showToast('خطا در رمز عبور', 'رمز عبور باید حداقل ۶ کاراکتر و با تکرار آن یکسان باشد.', 'error');
      return;
    }
    const state = loadDbState();
    const student = getActiveStudent(state);
    student.password = newPass;
    saveDbState(state);
    renderActiveStudentSection();
    showToast('رمز عبور تغییر کرد', 'رمز عبور جدید شما با موفقیت ثبت شد.', 'success');
  });
}
