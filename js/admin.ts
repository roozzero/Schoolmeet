import $ from 'jquery';
import { showToast } from './modal';
import { AppRoutePath, updateBrowserUrl } from './router';
import { loadDbState, logAdminActivity, saveDbState } from './store';
import {
  AdminSectionId,
  ClassRoomCode,
  DatabaseState,
  TargetClassScope,
} from './types';
import { normalizeDigits } from './validation';

let activeSection: AdminSectionId = 'dashboard';
let selectedClassTab: ClassRoomCode = '901';
let studentFilter: 'all' | 'pending' | ClassRoomCode = 'all';
let studentSearchQuery = '';
let assignmentFilter: 'all' | ClassRoomCode = 'all';
let scheduleFilter: 'all' | ClassRoomCode = 'all';
let resourceFilter: 'all' | ClassRoomCode = 'all';
let ticketFilter: 'all' | 'در انتظار پاسخ' | 'پاسخ داده شده' = 'all';
let activeTicketId: number | null = null;
let editingAssignmentId: number | null = null;

function formatClassLabel(code: TargetClassScope): string {
  if (code === 'all') return 'هر سه کلاس (۹۰۱، ۹۰۲ و ۹۰۳)';
  return `کلاس ${code}`;
}

function formatStatusLabel(status: 'pending' | 'approved' | 'rejected'): string {
  if (status === 'pending') return 'در انتظار تأیید';
  if (status === 'approved') return 'تأیید شده';
  return 'رد شده';
}

/**
 * Update Sidebar Counters & Topbar Admin Info
 */
function syncAdminChrome(state: DatabaseState): void {
  const pendingStudents = state.students.filter((s) => s.status === 'pending').length;
  const pendingSubmissions = state.submissions.filter((s) => s.status === 'pending').length;
  const openTickets = state.tickets.filter((t) => t.status === 'در انتظار پاسخ').length;

  $('#nav-badge-students').text(pendingStudents > 0 ? `${pendingStudents} جدید` : '');
  $('#nav-badge-assignments').text(pendingSubmissions > 0 ? `${pendingSubmissions} بررسی` : '');
  $('#nav-badge-tickets').text(openTickets > 0 ? `${openTickets} باز` : '');

  $('#topbar-admin-name').text(`${state.admin.firstName} ${state.admin.lastName}`);
  $('#topbar-admin-role').text(state.admin.roleTitle);
}

/**
 * Switch Active Section in the Admin Workspace and update browser URL
 */
export function navigateAdminSection(
  sectionId: AdminSectionId,
  updateHistory = true
): void {
  activeSection = sectionId;
  $('.admin-nav-btn').removeClass('is-active');
  $(`.admin-nav-btn[data-section="${sectionId}"]`).addClass('is-active');

  const sectionTitles: Record<AdminSectionId, string> = {
    dashboard: 'داشبورد و نمای کلی سامانه',
    classes: 'مدیریت کلاس‌ها (۹۰۱، ۹۰۲ و ۹۰۳)',
    students: 'مدیریت دانش‌آموزان و تأیید ثبت‌نام‌ها',
    assignments: 'مدیریت تکالیف، تصحیح و نمره‌دهی',
    schedule: 'برنامه هفتگی و جلسات کلاس‌ها',
    resources: 'منابع آموزشی، جزوه‌ها و لینک‌ها',
    announcements: 'ارسال و مدیریت اطلاعیه‌ها',
    tickets: 'تیکت‌ها و پرسش‌های دانش‌آموزان',
    profile: 'پروفایل مدیر و مدرس',
    settings: 'تنظیمات کلاس‌ها و سامانه',
  };

  $('#admin-breadcrumb-current').text(sectionTitles[sectionId]);
  $('#admin-sidebar').removeClass('is-mobile-open');

  if (updateHistory) {
    updateBrowserUrl(`/admin/${sectionId}` as AppRoutePath);
  }

  renderActiveSection();
}

/**
 * Render the currently selected Admin Section into #admin-main-viewport
 */
export function renderActiveSection(): void {
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
    case 'assignments':
      renderAssignmentsSection($viewport, state);
      break;
    case 'schedule':
      renderScheduleSection($viewport, state);
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
}

/* ============================================================================
   1. داشبورد: آمار، فعالیت‌های اخیر، کارهای در انتظار
   ============================================================================ */
function renderDashboardSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const totalStudents = state.students.length;
  const approvedStudents = state.students.filter((s) => s.status === 'approved').length;
  const pendingStudentsList = state.students.filter((s) => s.status === 'pending');
  const pendingSubmitsList = state.submissions.filter((s) => s.status === 'pending');
  const openTicketsList = state.tickets.filter((t) => t.status === 'در انتظار پاسخ');

  const classCounts = {
    '901': state.students.filter((s) => s.classCode === '901' && s.status === 'approved').length,
    '902': state.students.filter((s) => s.classCode === '902' && s.status === 'approved').length,
    '903': state.students.filter((s) => s.classCode === '903' && s.status === 'approved').length,
  };

  const pendingTasksHtml = [
    ...pendingStudentsList.map(
      (st) => `
      <div class="p-3.5 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] flex items-center justify-between gap-3">
        <div>
          <div class="text-xs font-extrabold text-[#10375C]">
            تأیید ثبت‌نام دانش‌آموز: ${st.firstName} ${st.lastName}
          </div>
          <div class="text-[11px] text-[#274C6E] mt-0.5 tabular-nums">
            کلاس ${st.classCode} · تلفن: ${st.phone} · تاریخ: ${st.createdAt}
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn-admin-success js-quick-approve-student" data-id="${st.id}">
            تأیید سریع
          </button>
          <button type="button" class="btn-admin-action js-go-section" data-section="students">
            مشاهده
          </button>
        </div>
      </div>`
    ),
    ...pendingSubmitsList.map(
      (sub) => `
      <div class="p-3.5 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] flex items-center justify-between gap-3">
        <div>
          <div class="text-xs font-extrabold text-[#10375C]">
            تصحیح تکلیف: ${sub.studentName} (کلاس ${sub.classCode})
          </div>
          <div class="text-[11px] text-[#274C6E] mt-0.5">
            فایل: <span class="tabular-nums font-semibold">${sub.fileName}</span> · ارسال: ${sub.submittedAt}
          </div>
        </div>
        <button type="button" class="btn-admin-action js-open-grade-modal" data-id="${sub.id}">
          مشاهده فایل و تصحیح
        </button>
      </div>`
    ),
    ...openTicketsList.map(
      (tk) => `
      <div class="p-3.5 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] flex items-center justify-between gap-3">
        <div>
          <div class="text-xs font-extrabold text-[#10375C]">
            پاسخ به تیکت: ${tk.subject}
          </div>
          <div class="text-[11px] text-[#274C6E] mt-0.5">
            فرستنده: ${tk.studentName} (کلاس ${tk.classCode}) · اولویت: ${tk.priority}
          </div>
        </div>
        <button type="button" class="btn-admin-action js-open-ticket-direct" data-id="${tk.id}">
          پاسخ‌گویی
        </button>
      </div>`
    ),
  ].join('');

  $container.html(`
    <div class="space-y-5">
      <!-- ردیف کارت‌های آمار کلیدی -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="admin-surface-card">
          <div class="text-xs font-bold text-[#274C6E]">کل دانش‌آموزان سامانه</div>
          <div class="text-2xl font-black text-[#10375C] mt-2 tabular-nums">${totalStudents} نفر</div>
          <div class="text-[11px] text-[#0D9488] font-bold mt-1.5 tabular-nums">
            ${approvedStudents} دانش‌آموز تأییدشده در ۳ کلاس
          </div>
        </div>

        <div class="admin-surface-card">
          <div class="text-xs font-bold text-[#274C6E]">ثبت‌نام‌های در انتظار تأیید</div>
          <div class="text-2xl font-black text-[#D97706] mt-2 tabular-nums">${pendingStudentsList.length} مورد</div>
          <div class="text-[11px] text-[#274C6E] mt-1.5">
            نیازمند بررسی و تأیید حساب کاربری
          </div>
        </div>

        <div class="admin-surface-card">
          <div class="text-xs font-bold text-[#274C6E]">تکالیف در انتظار تصحیح</div>
          <div class="text-2xl font-black text-[#10375C] mt-2 tabular-nums">${pendingSubmitsList.length} فایل</div>
          <div class="text-[11px] text-[#274C6E] mt-1.5 tabular-nums">
            از مجموع ${state.submissions.length} تکلیف ارسال‌شده
          </div>
        </div>

        <div class="admin-surface-card">
          <div class="text-xs font-bold text-[#274C6E]">تیکت‌های در انتظار پاسخ</div>
          <div class="text-2xl font-black text-[#DC2626] mt-2 tabular-nums">${openTicketsList.length} تیکت</div>
          <div class="text-[11px] text-[#274C6E] mt-1.5 tabular-nums">
            کل تیکت‌های ثبت‌شده: ${state.tickets.length}
          </div>
        </div>
      </div>

      <!-- خلاصه وضعیت سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳ -->
      <div class="admin-surface-card">
        <div class="flex items-center justify-between mb-3.5">
          <h2 class="text-sm font-extrabold text-[#10375C] m-0">وضعیت کلی کلاس‌های سه‌گانه (۹۰۱، ۹۰۲ و ۹۰۳)</h2>
          <button type="button" class="btn-admin-action js-go-section" data-section="classes">
            مدیریت کامل کلاس‌ها
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          ${state.classes
            .map(
              (cls) => `
              <div class="p-4 rounded-xl bg-[#F4F9FD] border border-[#DCEAF6]">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-black text-[#10375C]">${cls.title}</span>
                  <span class="text-xs font-extrabold text-[#0D9488] tabular-nums">
                    ${classCounts[cls.code]} / ${cls.capacity} نفر
                  </span>
                </div>
                <div class="text-xs text-[#274C6E] mt-1.5">${cls.scheduleSummary}</div>
                <div class="text-[11px] text-[#274C6E] mt-1">${cls.roomOrLink}</div>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <!-- کارهای در انتظار و فعالیت‌های اخیر -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- کارهای در انتظار -->
        <div class="lg:col-span-7 admin-surface-card">
          <div class="flex items-center justify-between mb-3.5">
            <h2 class="text-sm font-extrabold text-[#10375C] m-0">
              کارهای در انتظار اقدام (${pendingStudentsList.length + pendingSubmitsList.length + openTicketsList.length} مورد)
            </h2>
          </div>
          <div class="space-y-2.5">
            ${
              pendingTasksHtml ||
              `<div class="p-6 text-center text-xs text-[#274C6E] bg-[#F8FBFE] rounded-xl">
                تمامی کارهای در انتظار بررسی و تکمیل شده‌اند.
              </div>`
            }
          </div>
        </div>

        <!-- فعالیت‌های اخیر -->
        <div class="lg:col-span-5 admin-surface-card">
          <h2 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">فعالیت‌های اخیر سامانه</h2>
          <div class="space-y-3">
            ${state.activities
              .slice(0, 6)
              .map(
                (act) => `
                <div class="pb-3 border-b border-[#EDF4FA] last:border-none last:pb-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-[#10375C]">${act.title}</span>
                    <span class="text-[11px] text-[#6B8BA4] shrink-0">${act.timeAgo}</span>
                  </div>
                  <p class="text-[11px] text-[#274C6E] mt-1 m-0 leading-relaxed">${act.detail}</p>
                </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   2. مدیریت کلاس‌ها: سه کلاس (۹۰۱، ۹۰۲، ۹۰۳)، اعضا و اطلاعات هر کلاس
   ============================================================================ */
function renderClassesSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const currentClass =
    state.classes.find((c) => c.code === selectedClassTab) || state.classes[0];
  const classMembers = state.students.filter((s) => s.classCode === currentClass.code);
  const classAssignments = state.assignments.filter(
    (a) => a.classCode === currentClass.code || a.classCode === 'all'
  );
  const classSchedules = state.schedules.filter((s) => s.classCode === currentClass.code);

  $container.html(`
    <div class="space-y-5">
      <!-- انتخاب‌گر سه کلاس ۹۰۱ / ۹۰۲ / ۹۰۳ -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${state.classes
          .map((cls) => {
            const count = state.students.filter((s) => s.classCode === cls.code).length;
            const isSelected = cls.code === currentClass.code;
            return `
              <div
                class="admin-surface-card cursor-pointer transition-all js-select-class-card ${
                  isSelected ? '!border-[#10375C] !bg-[#EEF7FD]' : ''
                }"
                data-code="${cls.code}"
              >
                <div class="flex items-center justify-between">
                  <span class="text-base font-black text-[#10375C]">کلاس ${cls.code}</span>
                  <span class="text-xs font-extrabold text-[#0D9488] tabular-nums">
                    ${count} عضو از ${cls.capacity} نفر
                  </span>
                </div>
                <div class="text-xs font-bold text-[#10375C] mt-1.5">${cls.title}</div>
                <p class="text-[11px] text-[#274C6E] mt-1 m-0 leading-relaxed">${cls.description}</p>
                <div class="mt-3 pt-2.5 border-t border-[#DCEAF6] flex items-center justify-between text-[11px] text-[#274C6E]">
                  <span>${cls.gradeLevel}</span>
                  <span class="font-bold text-[#10375C]">مشاهده اعضا و جزئیات ←</span>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <!-- اطلاعات جامع و اعضای کلاس انتخاب‌شده -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- مشخصات و ویرایش سریع کلاس -->
        <div class="lg:col-span-5 admin-surface-card">
          <h3 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">
            اطلاعات و مشخصات کلاس ${currentClass.code}
          </h3>
          <form id="form-update-class-info" data-code="${currentClass.code}" class="space-y-3">
            <div>
              <label class="scool-field-label">عنوان کلاس</label>
              <input type="text" id="cls-edit-title" class="school-input" value="${currentClass.title}" required />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="scool-field-label">پایه و گروه</label>
                <input type="text" id="cls-edit-grade" class="school-input" value="${currentClass.gradeLevel}" required />
              </div>
              <div>
                <label class="scool-field-label">ظرفیت مجاز (نفر)</label>
                <input type="number" id="cls-edit-capacity" class="school-input tabular-nums" value="${currentClass.capacity}" required />
              </div>
            </div>
            <div>
              <label class="scool-field-label">محل برگزاری یا لینک کلاس</label>
              <input type="text" id="cls-edit-room" class="school-input" value="${currentClass.roomOrLink}" required />
            </div>
            <div>
              <label class="scool-field-label">زمان‌بندی هفتگی</label>
              <input type="text" id="cls-edit-schedule" class="school-input" value="${currentClass.scheduleSummary}" required />
            </div>
            <div>
              <label class="scool-field-label">توضیحات کلاس</label>
              <textarea id="cls-edit-desc" class="school-textarea !min-h-[68px]">${currentClass.description}</textarea>
            </div>
            <div class="pt-1 flex items-center justify-between text-xs text-[#274C6E]">
              <span>تکالیف مرتبط: <strong class="tabular-nums">${classAssignments.length}</strong> · جلسات هفتگی: <strong class="tabular-nums">${classSchedules.length}</strong></span>
              <button type="submit" class="btn-admin-primary">ذخیره تغییرات کلاس ${currentClass.code}</button>
            </div>
          </form>
        </div>

        <!-- لیست اعضای کلاس انتخاب‌شده -->
        <div class="lg:col-span-7 admin-surface-card">
          <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
            <h3 class="text-sm font-extrabold text-[#10375C] m-0">
              اعضای کلاس ${currentClass.code} (${classMembers.length} دانش‌آموز)
            </h3>
            <button type="button" class="btn-admin-action js-open-add-student-modal" data-class="${currentClass.code}">
              + افزودن دانش‌آموز به کلاس ${currentClass.code}
            </button>
          </div>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>نام و نام خانوادگی</th>
                  <th>شماره تلفن</th>
                  <th>وضعیت</th>
                  <th>تغییر کلاس</th>
                  <th>پروفایل</th>
                </tr>
              </thead>
              <tbody>
                ${
                  classMembers.length
                    ? classMembers
                        .map(
                          (st) => `
                          <tr>
                            <td class="font-bold text-[#10375C]">${st.firstName} ${st.lastName}</td>
                            <td class="tabular-nums">${st.phone}</td>
                            <td>
                              <span class="font-bold ${
                                st.status === 'approved'
                                  ? 'text-[#0D9488]'
                                  : st.status === 'pending'
                                  ? 'text-[#D97706]'
                                  : 'text-[#DC2626]'
                              }">
                                ${formatStatusLabel(st.status)}
                              </span>
                            </td>
                            <td>
                              <select class="school-select !h-8 !py-0 !text-xs js-change-student-class" data-id="${st.id}">
                                <option value="901" ${st.classCode === '901' ? 'selected' : ''}>کلاس ۹۰۱</option>
                                <option value="902" ${st.classCode === '902' ? 'selected' : ''}>کلاس ۹۰۲</option>
                                <option value="903" ${st.classCode === '903' ? 'selected' : ''}>کلاس ۹۰۳</option>
                              </select>
                            </td>
                            <td>
                              <button type="button" class="btn-admin-action js-open-student-profile" data-id="${st.id}">
                                پروفایل
                              </button>
                            </td>
                          </tr>`
                        )
                        .join('')
                    : `<tr><td colspan="5" class="text-center py-6">هیچ دانش‌آموزی در این کلاس ثبت نشده است.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   3. دانش‌آموزان: لیست، ثبت‌نام‌های جدید، تأیید و پروفایل
   ============================================================================ */
function renderStudentsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const pendingCount = state.students.filter((s) => s.status === 'pending').length;

  const filteredStudents = state.students.filter((st) => {
    if (studentFilter === 'pending' && st.status !== 'pending') return false;
    if (
      (studentFilter === '901' || studentFilter === '902' || studentFilter === '903') &&
      st.classCode !== studentFilter
    ) {
      return false;
    }
    if (studentSearchQuery.trim() !== '') {
      const q = studentSearchQuery.trim();
      const full = `${st.firstName} ${st.lastName} ${st.phone}`;
      if (!full.includes(q)) return false;
    }
    return true;
  });

  $container.html(`
    <div class="space-y-4">
      <!-- نوار ابزار فیلتر و جستجوی دانش‌آموزان -->
      <div class="admin-surface-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div class="admin-segmented-bar flex-wrap">
          <button type="button" class="admin-seg-btn js-student-filter ${studentFilter === 'all' ? 'is-active' : ''}" data-filter="all">
            همه دانش‌آموزان (${state.students.length})
          </button>
          <button type="button" class="admin-seg-btn js-student-filter ${studentFilter === 'pending' ? 'is-active' : ''}" data-filter="pending">
            ثبت‌نام‌های جدید (${pendingCount})
          </button>
          <button type="button" class="admin-seg-btn js-student-filter ${studentFilter === '901' ? 'is-active' : ''}" data-filter="901">
            کلاس ۹۰۱
          </button>
          <button type="button" class="admin-seg-btn js-student-filter ${studentFilter === '902' ? 'is-active' : ''}" data-filter="902">
            کلاس ۹۰۲
          </button>
          <button type="button" class="admin-seg-btn js-student-filter ${studentFilter === '903' ? 'is-active' : ''}" data-filter="903">
            کلاس ۹۰۳
          </button>
        </div>

        <div class="flex items-center gap-2.5">
          <input
            type="search"
            id="student-search-input"
            class="school-input !h-9 !w-52 text-xs"
            placeholder="جستجوی نام یا شماره تلفن..."
            value="${studentSearchQuery}"
          />
          <button type="button" class="btn-admin-primary !h-9 js-open-add-student-modal" data-class="901">
            + ثبت دانش‌آموز جدید
          </button>
        </div>
      </div>

      <!-- جدول کامل دانش‌آموزان -->
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>شناسه</th>
              <th>نام و نام خانوادگی</th>
              <th>شماره تلفن</th>
              <th>کلاس</th>
              <th>تاریخ ثبت‌نام</th>
              <th>وضعیت تأیید</th>
              <th>عملیات و پروفایل</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredStudents.length
                ? filteredStudents
                    .map(
                      (st) => `
                      <tr>
                        <td class="tabular-nums font-bold">#${st.id}</td>
                        <td class="font-extrabold text-[#10375C]">${st.firstName} ${st.lastName}</td>
                        <td class="tabular-nums">${st.phone}</td>
                        <td class="font-bold text-[#10375C]">کلاس ${st.classCode}</td>
                        <td class="tabular-nums">${st.createdAt}</td>
                        <td>
                          <span class="font-extrabold ${
                            st.status === 'approved'
                              ? 'text-[#0D9488]'
                              : st.status === 'pending'
                              ? 'text-[#D97706]'
                              : 'text-[#DC2626]'
                          }">
                            ${formatStatusLabel(st.status)}
                          </span>
                        </td>
                        <td>
                          <div class="flex items-center gap-1.5">
                            ${
                              st.status !== 'approved'
                                ? `<button type="button" class="btn-admin-success js-quick-approve-student" data-id="${st.id}">تأیید عضویت</button>`
                                : ''
                            }
                            ${
                              st.status === 'pending'
                                ? `<button type="button" class="btn-admin-danger js-reject-student" data-id="${st.id}">رد</button>`
                                : ''
                            }
                            <button type="button" class="btn-admin-action js-open-student-profile" data-id="${st.id}">
                              مشاهده پروفایل
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
   4. تکالیف: ایجاد، ویرایش و مدیریت تکالیف، مشاهده فایل، تصحیح، نمره و بازخورد
   ============================================================================ */
function renderAssignmentsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const editingItem = editingAssignmentId
    ? state.assignments.find((a) => a.id === editingAssignmentId) || null
    : null;

  const filteredAssignments = state.assignments.filter((a) => {
    if (assignmentFilter === 'all') return true;
    return a.classCode === assignmentFilter || a.classCode === 'all';
  });

  const filteredSubmissions = state.submissions.filter((sub) => {
    if (assignmentFilter === 'all') return true;
    return sub.classCode === assignmentFilter;
  });

  $container.html(`
    <div class="space-y-5">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- فرم ایجاد یا ویرایش تکلیف -->
        <div class="lg:col-span-5 admin-surface-card">
          <div class="flex items-center justify-between mb-3.5">
            <h3 class="text-sm font-extrabold text-[#10375C] m-0">
              ${editingItem ? `ویرایش تکلیف: ${editingItem.title}` : 'ایجاد تکلیف جدید'}
            </h3>
            ${
              editingItem
                ? `<button type="button" id="btn-cancel-edit-assignment" class="btn-admin-action">لغو ویرایش</button>`
                : ''
            }
          </div>

          <form id="form-save-assignment" class="space-y-3">
            <div>
              <label class="scool-field-label">عنوان تکلیف</label>
              <input
                type="text"
                id="hw-title"
                class="school-input"
                placeholder="مثلاً: تمرین دوم الگوریتم و فلوچارت"
                value="${editingItem ? editingItem.title : ''}"
                required
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="scool-field-label">کلاس هدف</label>
                <select id="hw-class" class="school-select" required>
                  <option value="all" ${editingItem?.classCode === 'all' ? 'selected' : ''}>هر سه کلاس (۹۰۱، ۹۰۲، ۹۰۳)</option>
                  <option value="901" ${editingItem?.classCode === '901' ? 'selected' : ''}>فقط کلاس ۹۰۱</option>
                  <option value="902" ${editingItem?.classCode === '902' ? 'selected' : ''}>فقط کلاس ۹۰۲</option>
                  <option value="903" ${editingItem?.classCode === '903' ? 'selected' : ''}>فقط کلاس ۹۰۳</option>
                </select>
              </div>
              <div>
                <label class="scool-field-label">مهلت تحویل</label>
                <input
                  type="text"
                  id="hw-duedate"
                  class="school-input"
                  placeholder="۱۴۰۵/۰۸/۲۸ · ساعت ۱۸:۰۰"
                  value="${editingItem ? editingItem.dueDate : '۱۴۰۵/۰۸/۲۸ · ساعت ۱۸:۰۰'}"
                  required
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="scool-field-label">بارم نمره</label>
                <input
                  type="number"
                  id="hw-maxscore"
                  class="school-input tabular-nums"
                  value="${editingItem ? editingItem.maxScore : 20}"
                  required
                />
              </div>
              <div>
                <label class="scool-field-label">نام فایل پیوست مدرس</label>
                <input
                  type="text"
                  id="hw-attachment"
                  class="school-input"
                  placeholder="homework-sheet.pdf"
                  value="${editingItem ? editingItem.attachmentName : 'tamrin-jadid.pdf'}"
                />
              </div>
            </div>

            <div>
              <label class="scool-field-label">توضیحات و راهنمای انجام تکلیف</label>
              <textarea
                id="hw-desc"
                class="school-textarea !min-h-[74px]"
                placeholder="شرح کامل سوالات و نحوه ارسال فایل توسط دانش‌آموز..."
                required
              >${editingItem ? editingItem.description : ''}</textarea>
            </div>

            <button type="submit" class="btn-admin-primary w-full">
              ${editingItem ? 'ذخیره تغییرات تکلیف' : 'انتشار تکلیف جدید'}
            </button>
          </form>
        </div>

        <!-- لیست تکالیف تعریف‌شده -->
        <div class="lg:col-span-7 admin-surface-card">
          <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
            <h3 class="text-sm font-extrabold text-[#10375C] m-0">لیست تکالیف تعریف‌شده</h3>
            <div class="admin-segmented-bar">
              <button type="button" class="admin-seg-btn js-hw-filter ${assignmentFilter === 'all' ? 'is-active' : ''}" data-filter="all">همه</button>
              <button type="button" class="admin-seg-btn js-hw-filter ${assignmentFilter === '901' ? 'is-active' : ''}" data-filter="901">۹۰۱</button>
              <button type="button" class="admin-seg-btn js-hw-filter ${assignmentFilter === '902' ? 'is-active' : ''}" data-filter="902">۹۰۲</button>
              <button type="button" class="admin-seg-btn js-hw-filter ${assignmentFilter === '903' ? 'is-active' : ''}" data-filter="903">۹۰۳</button>
            </div>
          </div>

          <div class="space-y-2.5">
            ${filteredAssignments
              .map(
                (hw) => `
                <div class="p-3.5 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] flex items-start justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-extrabold text-[#10375C]">${hw.title}</span>
                      <span class="text-[11px] font-bold text-[#0D9488]">(${formatClassLabel(hw.classCode)})</span>
                    </div>
                    <p class="text-[11px] text-[#274C6E] mt-1 m-0 leading-relaxed">${hw.description}</p>
                    <div class="text-[11px] text-[#6B8BA4] mt-1.5 tabular-nums">
                      مهلت تحویل: ${hw.dueDate} · نمره کل: ${hw.maxScore} · فایل: ${hw.attachmentName}
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" class="btn-admin-action js-edit-assignment" data-id="${hw.id}">ویرایش</button>
                    <button type="button" class="btn-admin-danger js-delete-assignment" data-id="${hw.id}">حذف</button>
                  </div>
                </div>`
              )
              .join('')}
          </div>
        </div>
      </div>

      <!-- جدول فایل‌های ارسالی دانش‌آموزان، تصحیح، ثبت نمره و بازخورد -->
      <div class="admin-surface-card">
        <div class="flex items-center justify-between mb-3.5">
          <h3 class="text-sm font-extrabold text-[#10375C] m-0">
            پاسخ‌های ارسالی دانش‌آموزان — مشاهده فایل، تصحیح، ثبت نمره و بازخورد
          </h3>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>کلاس</th>
                <th>عنوان تکلیف</th>
                <th>فایل ارسالی</th>
                <th>زمان ارسال</th>
                <th>نمره (از ۲۰)</th>
                <th>وضعیت</th>
                <th>مشاهده و تصحیح</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSubmissions
                .map((sub) => {
                  const hwTitle =
                    state.assignments.find((a) => a.id === sub.assignmentId)?.title || 'تکلیف کلاسی';
                  return `
                    <tr>
                      <td class="font-extrabold text-[#10375C]">${sub.studentName}</td>
                      <td class="font-bold">کلاس ${sub.classCode}</td>
                      <td>${hwTitle}</td>
                      <td class="tabular-nums font-semibold text-[#10375C]">${sub.fileName}</td>
                      <td class="tabular-nums">${sub.submittedAt}</td>
                      <td class="tabular-nums font-extrabold ${
                        sub.score !== null ? 'text-[#0D9488]' : 'text-[#D97706]'
                      }">
                        ${sub.score !== null ? `${sub.score} از ۲۰` : 'ثبت‌نشده'}
                      </td>
                      <td>
                        <span class="font-bold ${
                          sub.status === 'graded' ? 'text-[#0D9488]' : 'text-[#D97706]'
                        }">
                          ${sub.status === 'graded' ? 'تصحیح شده' : 'در انتظار تصحیح'}
                        </span>
                      </td>
                      <td>
                        <button type="button" class="btn-admin-action js-open-grade-modal" data-id="${sub.id}">
                          مشاهده فایل و نمره‌دهی
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   5. برنامه کلاس‌ها: جلسات و زمان‌بندی
   ============================================================================ */
function renderScheduleSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const list = state.schedules.filter((item) =>
    scheduleFilter === 'all' ? true : item.classCode === scheduleFilter
  );

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- فرم افزودن جلسه به برنامه هفتگی -->
      <div class="lg:col-span-4 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">افزودن جلسه به برنامه کلاس‌ها</h3>
        <form id="form-add-schedule" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">انتخاب کلاس</label>
              <select id="sch-class" class="school-select" required>
                <option value="901">کلاس ۹۰۱</option>
                <option value="902">کلاس ۹۰۲</option>
                <option value="903">کلاس ۹۰۳</option>
              </select>
            </div>
            <div>
              <label class="scool-field-label">روز هفته</label>
              <select id="sch-day" class="school-select" required>
                <option value="شنبه">شنبه</option>
                <option value="یکشنبه">یکشنبه</option>
                <option value="دوشنبه">دوشنبه</option>
                <option value="سه‌شنبه">سه‌شنبه</option>
                <option value="چهارشنبه">چهارشنبه</option>
                <option value="پنج‌شنبه">پنج‌شنبه</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">ساعت شروع</label>
              <input type="text" id="sch-start" class="school-input tabular-nums" placeholder="۱۶:۰۰" value="۱۶:۰۰" required />
            </div>
            <div>
              <label class="scool-field-label">ساعت پایان</label>
              <input type="text" id="sch-end" class="school-input tabular-nums" placeholder="۱۷:۳۰" value="۱۷:۳۰" required />
            </div>
          </div>

          <div>
            <label class="scool-field-label">موضوع و مبحث جلسه</label>
            <input type="text" id="sch-topic" class="school-input" placeholder="مثلاً: حل تمرین فصل سوم" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">نوع برگزاری</label>
              <select id="sch-type" class="school-select">
                <option value="حضوری">حضوری</option>
                <option value="آنلاین">آنلاین</option>
                <option value="آزمون و حل تمرین">آزمون و حل تمرین</option>
              </select>
            </div>
            <div>
              <label class="scool-field-label">اتاق یا لینک کلاس</label>
              <input type="text" id="sch-location" class="school-input" placeholder="اتاق ۳۰۱" required />
            </div>
          </div>

          <button type="submit" class="btn-admin-primary w-full">ثبت در برنامه هفتگی</button>
        </form>
      </div>

      <!-- جدول زمان‌بندی جلسات -->
      <div class="lg:col-span-8 admin-surface-card">
        <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <h3 class="text-sm font-extrabold text-[#10375C] m-0">جدول جلسات و زمان‌بندی کلاس‌ها</h3>
          <div class="admin-segmented-bar">
            <button type="button" class="admin-seg-btn js-sch-filter ${scheduleFilter === 'all' ? 'is-active' : ''}" data-filter="all">همه کلاس‌ها</button>
            <button type="button" class="admin-seg-btn js-sch-filter ${scheduleFilter === '901' ? 'is-active' : ''}" data-filter="901">کلاس ۹۰۱</button>
            <button type="button" class="admin-seg-btn js-sch-filter ${scheduleFilter === '902' ? 'is-active' : ''}" data-filter="902">کلاس ۹۰۲</button>
            <button type="button" class="admin-seg-btn js-sch-filter ${scheduleFilter === '903' ? 'is-active' : ''}" data-filter="903">کلاس ۹۰۳</button>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>کلاس</th>
                <th>روز هفته</th>
                <th>ساعت</th>
                <th>موضوع جلسه</th>
                <th>نوع</th>
                <th>محل / لینک</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (item) => `
                  <tr>
                    <td class="font-extrabold text-[#10375C]">کلاس ${item.classCode}</td>
                    <td class="font-bold">${item.dayOfWeek}</td>
                    <td class="tabular-nums">${item.startTime} تا ${item.endTime}</td>
                    <td class="font-semibold text-[#10375C]">${item.topic}</td>
                    <td>${item.sessionType}</td>
                    <td>${item.locationOrLink}</td>
                    <td>
                      <button type="button" class="btn-admin-danger js-delete-schedule" data-id="${item.id}">حذف</button>
                    </td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   6. منابع آموزشی: فایل‌ها، جزوه‌ها و لینک‌ها
   ============================================================================ */
function renderResourcesSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const list = state.resources.filter((res) =>
    resourceFilter === 'all' ? true : res.classCode === resourceFilter || res.classCode === 'all'
  );

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- فرم افزودن منبع آموزشی -->
      <div class="lg:col-span-4 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">افزودن فایل، جزوه یا لینک آموزشی</h3>
        <form id="form-add-resource" class="space-y-3">
          <div>
            <label class="scool-field-label">عنوان منبع آموزشی</label>
            <input type="text" id="res-title" class="school-input" placeholder="مثلاً: جزوه فصل چهارم الگوریتم" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">نوع منبع</label>
              <select id="res-category" class="school-select">
                <option value="جزوه PDF">جزوه PDF</option>
                <option value="فایل تمرین">فایل تمرین</option>
                <option value="لینک آموزشی">لینک آموزشی</option>
                <option value="ویدیو ضبط‌شده">ویدیو ضبط‌شده</option>
              </select>
            </div>
            <div>
              <label class="scool-field-label">کلاس هدف</label>
              <select id="res-class" class="school-select">
                <option value="all">هر سه کلاس (۹۰۱ تا ۹۰۳)</option>
                <option value="901">کلاس ۹۰۱</option>
                <option value="902">کلاس ۹۰۲</option>
                <option value="903">کلاس ۹۰۳</option>
              </select>
            </div>
          </div>

          <div>
            <label class="scool-field-label">نام فایل یا آدرس لینک</label>
            <input type="text" id="res-url" class="school-input" placeholder="chapter4-notes.pdf" required />
          </div>

          <div>
            <label class="scool-field-label">توضیحات کوتاه</label>
            <textarea id="res-desc" class="school-textarea !min-h-[68px]" placeholder="توضیح مختصر درباره محتوای این فایل یا جزوه..." required></textarea>
          </div>

          <button type="submit" class="btn-admin-primary w-full">انتشار در منابع آموزشی</button>
        </form>
      </div>

      <!-- لیست منابع آموزشی -->
      <div class="lg:col-span-8 admin-surface-card">
        <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <h3 class="text-sm font-extrabold text-[#10375C] m-0">بانک فایل‌ها، جزوه‌ها و لینک‌های آموزشی</h3>
          <div class="admin-segmented-bar">
            <button type="button" class="admin-seg-btn js-res-filter ${resourceFilter === 'all' ? 'is-active' : ''}" data-filter="all">همه</button>
            <button type="button" class="admin-seg-btn js-res-filter ${resourceFilter === '901' ? 'is-active' : ''}" data-filter="901">۹۰۱</button>
            <button type="button" class="admin-seg-btn js-res-filter ${resourceFilter === '902' ? 'is-active' : ''}" data-filter="902">۹۰۲</button>
            <button type="button" class="admin-seg-btn js-res-filter ${resourceFilter === '903' ? 'is-active' : ''}" data-filter="903">۹۰۳</button>
          </div>
        </div>

        <div class="space-y-3">
          ${list
            .map(
              (res) => `
              <div class="p-4 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-extrabold text-[#10375C]">${res.title}</span>
                    <span class="text-[11px] font-bold text-[#0D9488]">${res.category}</span>
                    <span class="text-[11px] text-[#274C6E]">· ${formatClassLabel(res.classCode)}</span>
                  </div>
                  <p class="text-xs text-[#274C6E] mt-1 m-0 leading-relaxed">${res.description}</p>
                  <div class="text-[11px] text-[#6B8BA4] mt-1.5 tabular-nums">
                    فایل / آدرس: ${res.urlOrFileName} · حجم: ${res.fileSize} · تاریخ ثبت: ${res.createdAt}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" class="btn-admin-action js-preview-resource" data-title="${res.title}" data-file="${res.urlOrFileName}">
                    دریافت / مشاهده
                  </button>
                  <button type="button" class="btn-admin-danger js-delete-resource" data-id="${res.id}">حذف</button>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   7. اطلاعیه‌ها: ارسال اطلاعیه به یک یا سه کلاس
   ============================================================================ */
function renderAnnouncementsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- فرم ارسال اطلاعیه به یک یا هر سه کلاس -->
      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">
          ارسال اطلاعیه جدید (به یک کلاس یا هر سه کلاس)
        </h3>
        <form id="form-add-announcement" class="space-y-3">
          <div>
            <label class="scool-field-label">عنوان اطلاعیه</label>
            <input type="text" id="ann-title" class="school-input" placeholder="مثلاً: تغییر ساعت جلسه حل تمرین" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">گیرندگان اطلاعیه</label>
              <select id="ann-target" class="school-select" required>
                <option value="all">هر سه کلاس (۹۰۱، ۹۰۲ و ۹۰۳)</option>
                <option value="901">فقط کلاس ۹۰۱</option>
                <option value="902">فقط کلاس ۹۰۲</option>
                <option value="903">فقط کلاس ۹۰۳</option>
              </select>
            </div>
            <div>
              <label class="scool-field-label">سطح اهمیت</label>
              <select id="ann-priority" class="school-select">
                <option value="عادی">عادی</option>
                <option value="مهم">مهم</option>
                <option value="فوری">فوری</option>
              </select>
            </div>
          </div>

          <div>
            <label class="scool-field-label">متن کامل اطلاعیه</label>
            <textarea id="ann-content" class="school-textarea !min-h-[96px]" placeholder="متن اطلاعیه را جهت نمایش در پنل دانش‌آموزان وارد کنید..." required></textarea>
          </div>

          <button type="submit" class="btn-admin-primary w-full">ارسال و انتشار اطلاعیه</button>
        </form>
      </div>

      <!-- لیست اطلاعیه‌های ارسال‌شده -->
      <div class="lg:col-span-7 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-3.5 m-0">
          اطلاعیه‌های ارسال‌شده (${state.announcements.length} مورد)
        </h3>
        <div class="space-y-3">
          ${state.announcements
            .map(
              (ann) => `
              <div class="p-4 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6]">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-extrabold text-[#10375C]">${ann.title}</span>
                    <span class="text-[11px] font-bold ${
                      ann.priority === 'فوری'
                        ? 'text-[#DC2626]'
                        : ann.priority === 'مهم'
                        ? 'text-[#D97706]'
                        : 'text-[#0D9488]'
                    }">
                      [اولویت ${ann.priority}]
                    </span>
                  </div>
                  <button type="button" class="btn-admin-danger js-delete-announcement" data-id="${ann.id}">حذف</button>
                </div>
                <p class="text-xs text-[#274C6E] mt-2 m-0 leading-relaxed">${ann.content}</p>
                <div class="mt-2.5 pt-2 border-t border-[#E6F0F8] flex items-center justify-between text-[11px] text-[#6B8BA4]">
                  <span>مخاطبان: <strong class="text-[#10375C]">${formatClassLabel(ann.targetClasses)}</strong></span>
                  <span class="tabular-nums">${ann.createdAt}</span>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   8. تیکت: مشاهده و پاسخ‌گویی به تیکت‌های دانش‌آموزان
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

  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- لیست تیکت‌ها -->
      <div class="lg:col-span-5 admin-surface-card">
        <div class="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
          <h3 class="text-sm font-extrabold text-[#10375C] m-0">صندوق تیکت‌ها</h3>
          <div class="admin-segmented-bar">
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'all' ? 'is-active' : ''}" data-filter="all">همه</button>
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'در انتظار پاسخ' ? 'is-active' : ''}" data-filter="در انتظار پاسخ">در انتظار پاسخ</button>
            <button type="button" class="admin-seg-btn js-ticket-filter ${ticketFilter === 'پاسخ داده شده' ? 'is-active' : ''}" data-filter="پاسخ داده شده">پاسخ‌داده‌شده</button>
          </div>
        </div>

        <div class="space-y-2.5">
          ${filteredTickets
            .map(
              (tk) => `
              <div
                class="p-3.5 rounded-xl border cursor-pointer transition-all js-select-ticket ${
                  currentTicket?.id === tk.id
                    ? 'bg-[#EEF7FD] border-[#10375C]'
                    : 'bg-[#F8FBFE] border-[#DCEAF6]'
                }"
                data-id="${tk.id}"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-extrabold text-[#10375C]">${tk.subject}</span>
                  <span class="text-[11px] font-bold ${
                    tk.status === 'در انتظار پاسخ' ? 'text-[#D97706]' : 'text-[#0D9488]'
                  }">${tk.status}</span>
                </div>
                <div class="text-[11px] text-[#274C6E] mt-1 tabular-nums">
                  ${tk.studentName} · کلاس ${tk.classCode} · ${tk.createdAt}
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <!-- جزئیات گفت‌وگو و ارسال پاسخ ادمین -->
      <div class="lg:col-span-7 admin-surface-card">
        ${
          currentTicket
            ? `
            <div class="pb-3.5 mb-3.5 border-b border-[#DCEAF6] flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 class="text-sm font-extrabold text-[#10375C] m-0">${currentTicket.subject}</h3>
                <div class="text-xs text-[#274C6E] mt-1 tabular-nums">
                  دانش‌آموز: <strong>${currentTicket.studentName}</strong> (کلاس ${currentTicket.classCode}) · تلفن: ${currentTicket.studentPhone}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-admin-action js-toggle-ticket-close" data-id="${currentTicket.id}">
                  ${currentTicket.status === 'بسته شده' ? 'بازگشایی تیکت' : 'بستن تیکت'}
                </button>
              </div>
            </div>

            <div class="space-y-3 mb-4 max-h-[260px] overflow-y-auto pr-1">
              ${currentTicket.messages
                .map(
                  (msg) => `
                  <div class="p-3.5 rounded-xl border ${
                    msg.senderRole === 'admin'
                      ? 'bg-[#EEF7FD] border-[#B8D9F0]'
                      : 'bg-[#F8FBFE] border-[#DCEAF6]'
                  }">
                    <div class="flex items-center justify-between text-[11px] font-bold text-[#10375C] mb-1">
                      <span>${msg.senderName} (${msg.senderRole === 'admin' ? 'مدیر / مدرس' : 'دانش‌آموز'})</span>
                      <span class="tabular-nums text-[#6B8BA4]">${msg.sentAt}</span>
                    </div>
                    <p class="text-xs text-[#274C6E] m-0 leading-relaxed">${msg.message}</p>
                  </div>`
                )
                .join('')}
            </div>

            <form id="form-reply-ticket" data-id="${currentTicket.id}" class="space-y-3">
              <div>
                <label class="scool-field-label">پاسخ شما به دانش‌آموز</label>
                <textarea
                  id="ticket-reply-text"
                  class="school-textarea !min-h-[78px]"
                  placeholder="پاسخ راهنمایی یا آموزشی خود را بنویسید..."
                  required
                ></textarea>
              </div>
              <button type="submit" class="btn-admin-primary">ارسال پاسخ و ثبت وضعیت «پاسخ داده شده»</button>
            </form>
          `
            : `<div class="p-8 text-center text-xs text-[#274C6E]">تیکتی برای نمایش وجود ندارد.</div>`
        }
      </div>
    </div>
  `);
}

/* ============================================================================
   9. پروفایل: مشخصات ادمین و تغییر رمز عبور
   ============================================================================ */
function renderProfileSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const admin = state.admin;
  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div class="lg:col-span-7 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-4 m-0">ویرایش اطلاعات پروفایل مدیر</h3>
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
              <input type="tel" id="prof-phone" class="school-input tabular-nums" value="${admin.phone}" required />
            </div>
            <div>
              <label class="scool-field-label">پست الکترونیک</label>
              <input type="email" id="prof-email" class="school-input" value="${admin.email}" required />
            </div>
          </div>

          <div>
            <label class="scool-field-label">سمت آموزشی</label>
            <input type="text" id="prof-role" class="school-input" value="${admin.roleTitle}" required />
          </div>

          <div>
            <label class="scool-field-label">بیوگرافی و معرفی مدرس</label>
            <textarea id="prof-bio" class="school-textarea">${admin.bio}</textarea>
          </div>

          <button type="submit" class="btn-admin-primary">ذخیره اطلاعات پروفایل</button>
        </form>
      </div>

      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-4 m-0">امنیت و تغییر رمز عبور مدیر</h3>
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

        <div class="mt-5 p-3.5 rounded-xl bg-[#F4F9FD] border border-[#DCEAF6] text-xs text-[#274C6E]">
          <div class="font-extrabold text-[#10375C] mb-1">مشخصات فعلی ورود ادمین:</div>
          <div class="tabular-nums">شماره تلفن: <strong>${admin.phone}</strong></div>
          <div class="tabular-nums mt-0.5">رمز عبور: <strong>${admin.password}</strong></div>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================================
   10. تنظیمات: مشخصات کلاس‌ها و تنظیمات سامانه
   ============================================================================ */
function renderSettingsSection($container: JQuery<HTMLElement>, state: DatabaseState): void {
  const s = state.settings;
  $container.html(`
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- تنظیمات عمومی سامانه -->
      <div class="lg:col-span-5 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-4 m-0">تنظیمات کلی سامانه اسکول میت</h3>
        <form id="form-system-settings" class="space-y-3.5">
          <div>
            <label class="scool-field-label">عنوان سامانه</label>
            <input type="text" id="set-platform-name" class="school-input" value="${s.platformName}" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="scool-field-label">سال تحصیلی جاری</label>
              <input type="text" id="set-academic-year" class="school-input tabular-nums" value="${s.academicYear}" required />
            </div>
            <div>
              <label class="scool-field-label">حداکثر حجم فایل تکلیف (MB)</label>
              <input type="number" id="set-max-upload" class="school-input tabular-nums" value="${s.maxUploadSizeMb}" required />
            </div>
          </div>
          <div>
            <label class="scool-field-label">شماره پشتیبانی سامانه</label>
            <input type="tel" id="set-support-phone" class="school-input tabular-nums" value="${s.supportPhone}" required />
          </div>

          <div class="space-y-2 pt-1">
            <label class="flex items-center gap-2.5 text-xs font-bold text-[#10375C] cursor-pointer">
              <input type="checkbox" id="set-allow-reg" class="w-4 h-4" ${s.allowNewRegistrations ? 'checked' : ''} />
              <span>امکان ثبت‌نام دانش‌آموزان جدید در صفحه ورود فعال باشد</span>
            </label>
            <label class="flex items-center gap-2.5 text-xs font-bold text-[#10375C] cursor-pointer">
              <input type="checkbox" id="set-require-approval" class="w-4 h-4" ${s.requireAdminApproval ? 'checked' : ''} />
              <span>حساب دانش‌آموزان جدید نیازمند تأیید ادمین باشد</span>
            </label>
          </div>

          <div class="pt-2 flex items-center gap-2">
            <button type="submit" class="btn-admin-primary flex-1">ذخیره تنظیمات سامانه</button>
            <button type="button" id="btn-reset-demo-db" class="btn-admin-danger !h-[38px]">بازنشانی داده‌ها</button>
          </div>
        </form>
      </div>

      <!-- مشخصات سریع هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳ -->
      <div class="lg:col-span-7 admin-surface-card">
        <h3 class="text-sm font-extrabold text-[#10375C] mb-4 m-0">مشخصات کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳</h3>
        <form id="form-all-classes-settings" class="space-y-4">
          ${state.classes
            .map(
              (cls) => `
              <div class="p-3.5 rounded-xl bg-[#F8FBFE] border border-[#DCEAF6] space-y-2.5">
                <div class="text-xs font-black text-[#10375C]">کلاس ${cls.code}</div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label class="scool-field-label">عنوان کلاس</label>
                    <input type="text" class="school-input !h-9 text-xs js-cls-set-title" data-code="${cls.code}" value="${cls.title}" required />
                  </div>
                  <div>
                    <label class="scool-field-label">ظرفیت</label>
                    <input type="number" class="school-input !h-9 text-xs tabular-nums js-cls-set-cap" data-code="${cls.code}" value="${cls.capacity}" required />
                  </div>
                  <div>
                    <label class="scool-field-label">زمان‌بندی</label>
                    <input type="text" class="school-input !h-9 text-xs js-cls-set-sch" data-code="${cls.code}" value="${cls.scheduleSummary}" required />
                  </div>
                </div>
              </div>`
            )
            .join('')}
          <button type="submit" class="btn-admin-primary">بروزرسانی مشخصات هر سه کلاس</button>
        </form>
      </div>
    </div>
  `);
}

/* ============================================================================
   Modals for Student Profile, Add Student, and Submission Grading
   ============================================================================ */
function openGradeSubmissionModal(submissionId: number): void {
  const state = loadDbState();
  const sub = state.submissions.find((s) => s.id === submissionId);
  if (!sub) return;

  const hw = state.assignments.find((a) => a.id === sub.assignmentId);

  $('#grade-modal-sub-id').val(String(sub.id));
  $('#grade-modal-student').text(`${sub.studentName} (کلاس ${sub.classCode})`);
  $('#grade-modal-hw-title').text(hw ? hw.title : 'تکلیف کلاسی');
  $('#grade-modal-filename').text(sub.fileName);
  $('#grade-modal-filecontent').text(sub.fileContent);
  $('#grade-modal-score').val(sub.score !== null ? String(sub.score) : '20');
  $('#grade-modal-feedback').val(
    sub.teacherFeedback || 'تکلیف شما بررسی شد. راه‌حل و فلوچارت ارائه‌شده صحیح و کامل است.'
  );

  $('#admin-grade-modal').addClass('is-open').attr('aria-hidden', 'false');
}

function openStudentProfileModal(studentId: number): void {
  const state = loadDbState();
  const st = state.students.find((s) => s.id === studentId);
  if (!st) return;

  $('#prof-modal-student-id').val(String(st.id));
  $('#prof-modal-firstname').val(st.firstName);
  $('#prof-modal-lastname').val(st.lastName);
  $('#prof-modal-phone').val(st.phone);
  $('#prof-modal-class').val(st.classCode);
  $('#prof-modal-status').val(st.status);
  $('#prof-modal-national').val(st.nationalCode || '');
  $('#prof-modal-parent').val(st.parentPhone || '');
  $('#prof-modal-notes').val(st.notes || '');

  $('#admin-student-modal').addClass('is-open').attr('aria-hidden', 'false');
}

/**
 * Bind Delegated Event Listeners for the Admin Panel
 */
export function initAdminPanelEvents(): void {
  // Sidebar section navigation
  $(document).on('click', '.admin-nav-btn, .js-go-section', function () {
    const sec = $(this).data('section') as AdminSectionId;
    if (sec) {
      navigateAdminSection(sec);
    }
  });

  // Mobile sidebar toggle
  $('#btn-toggle-mobile-sidebar').on('click', () => {
    $('#admin-sidebar').toggleClass('is-mobile-open');
  });

  // Logout from Admin Panel back to Auth View (/login)
  $('#btn-admin-logout').on('click', () => {
    $('#admin-workspace-view').addClass('view-hidden');
    $('#public-auth-view').removeClass('view-hidden');
    updateBrowserUrl('/login');
    showToast('خروج از پنل مدیریت', 'با موفقیت از حساب مدیریت خارج شدید.', 'info');
  });

  // Quick Approve Student
  $(document).on('click', '.js-quick-approve-student', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.status = 'approved';
    logAdminActivity(
      state,
      `تأیید عضویت دانش‌آموز (${st.firstName} ${st.lastName})`,
      `حساب دانش‌آموز در کلاس ${st.classCode} فعال شد.`,
      'student'
    );
    saveDbState(state);
    renderActiveSection();
    showToast('دانش‌آموز تأیید شد', `حساب ${st.firstName} ${st.lastName} فعال گردید.`, 'success');
  });

  // Reject Student
  $(document).on('click', '.js-reject-student', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.status = 'rejected';
    saveDbState(state);
    renderActiveSection();
    showToast('وضعیت بروزرسانی شد', `درخواست ${st.firstName} ${st.lastName} رد شد.`, 'info');
  });

  // Classes Section: Select Class Card (901 / 902 / 903)
  $(document).on('click', '.js-select-class-card', function () {
    const code = String($(this).data('code')) as ClassRoomCode;
    selectedClassTab = code;
    renderActiveSection();
  });

  // Classes Section: Update Class Info
  $(document).on('submit', '#form-update-class-info', function (e) {
    e.preventDefault();
    const code = String($(this).data('code')) as ClassRoomCode;
    const state = loadDbState();
    const cls = state.classes.find((c) => c.code === code);
    if (!cls) return;

    cls.title = String($('#cls-edit-title').val() || '').trim();
    cls.gradeLevel = String($('#cls-edit-grade').val() || '').trim();
    cls.capacity = Number($('#cls-edit-capacity').val() || 30);
    cls.roomOrLink = String($('#cls-edit-room').val() || '').trim();
    cls.scheduleSummary = String($('#cls-edit-schedule').val() || '').trim();
    cls.description = String($('#cls-edit-desc').val() || '').trim();

    saveDbState(state);
    renderActiveSection();
    showToast('مشخصات کلاس ذخیره شد', `اطلاعات کلاس ${code} با موفقیت بروزرسانی گردید.`, 'success');
  });

  // Change Student Class Directly from Table
  $(document).on('change', '.js-change-student-class', function () {
    const id = Number($(this).data('id'));
    const newClass = String($(this).val()) as ClassRoomCode;
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.classCode = newClass;
    saveDbState(state);
    renderActiveSection();
    showToast('انتقال کلاس انجام شد', `${st.firstName} ${st.lastName} به کلاس ${newClass} منتقل شد.`, 'success');
  });

  // Students Filters & Search
  $(document).on('click', '.js-student-filter', function () {
    studentFilter = $(this).data('filter') as typeof studentFilter;
    renderActiveSection();
  });

  $(document).on('input', '#student-search-input', function () {
    studentSearchQuery = String($(this).val() || '');
    renderActiveSection();
  });

  // Open Student Profile Modal
  $(document).on('click', '.js-open-student-profile', function () {
    const id = Number($(this).data('id'));
    openStudentProfileModal(id);
  });

  $('#btn-close-student-modal').on('click', () => {
    $('#admin-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
  });

  // Save Student Profile Modal
  $('#form-edit-student-profile').on('submit', function (e) {
    e.preventDefault();
    const id = Number($('#prof-modal-student-id').val());
    const state = loadDbState();
    const st = state.students.find((s) => s.id === id);
    if (!st) return;

    st.firstName = String($('#prof-modal-firstname').val() || '').trim();
    st.lastName = String($('#prof-modal-lastname').val() || '').trim();
    st.phone = normalizeDigits(String($('#prof-modal-phone').val() || ''));
    st.classCode = String($('#prof-modal-class').val()) as ClassRoomCode;
    st.status = String($('#prof-modal-status').val()) as typeof st.status;
    st.nationalCode = String($('#prof-modal-national').val() || '').trim();
    st.parentPhone = normalizeDigits(String($('#prof-modal-parent').val() || ''));
    st.notes = String($('#prof-modal-notes').val() || '').trim();

    saveDbState(state);
    $('#admin-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast('پروفایل بروزرسانی شد', `اطلاعات ${st.firstName} ${st.lastName} ذخیره گردید.`, 'success');
  });

  // Delete Student from Profile Modal
  $('#btn-delete-student').on('click', () => {
    const id = Number($('#prof-modal-student-id').val());
    const state = loadDbState();
    state.students = state.students.filter((s) => s.id !== id);
    saveDbState(state);
    $('#admin-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast('دانش‌آموز حذف شد', 'رکورد دانش‌آموز از سامانه حذف گردید.', 'info');
  });

  // Add New Student Modal
  $(document).on('click', '.js-open-add-student-modal', function () {
    const cls = String($(this).data('class') || '901') as ClassRoomCode;
    $('#add-st-class').val(cls);
    $('#admin-add-student-modal').addClass('is-open').attr('aria-hidden', 'false');
  });

  $('#btn-close-add-student-modal').on('click', () => {
    $('#admin-add-student-modal').removeClass('is-open').attr('aria-hidden', 'true');
  });

  $('#form-admin-add-student').on('submit', function (e) {
    e.preventDefault();
    const firstName = String($('#add-st-firstname').val() || '').trim();
    const lastName = String($('#add-st-lastname').val() || '').trim();
    const phone = normalizeDigits(String($('#add-st-phone').val() || ''));
    const classCode = String($('#add-st-class').val() || '901') as ClassRoomCode;

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
    showToast('دانش‌آموز اضافه شد', `${firstName} ${lastName} به کلاس ${classCode} اضافه گردید.`, 'success');
  });

  // Assignments CRUD
  $(document).on('click', '.js-hw-filter', function () {
    assignmentFilter = $(this).data('filter') as typeof assignmentFilter;
    renderActiveSection();
  });

  $(document).on('click', '.js-edit-assignment', function () {
    editingAssignmentId = Number($(this).data('id'));
    renderActiveSection();
  });

  $(document).on('click', '#btn-cancel-edit-assignment', () => {
    editingAssignmentId = null;
    renderActiveSection();
  });

  $(document).on('click', '.js-delete-assignment', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    state.assignments = state.assignments.filter((a) => a.id !== id);
    saveDbState(state);
    renderActiveSection();
    showToast('تکلیف حذف شد', 'تکلیف مورد نظر از لیست حذف گردید.', 'info');
  });

  $(document).on('submit', '#form-save-assignment', function (e) {
    e.preventDefault();
    const title = String($('#hw-title').val() || '').trim();
    const classCode = String($('#hw-class').val() || 'all') as TargetClassScope;
    const dueDate = String($('#hw-duedate').val() || '').trim();
    const maxScore = Number($('#hw-maxscore').val() || 20);
    const attachmentName = String($('#hw-attachment').val() || 'worksheet.pdf').trim();
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

    saveDbState(state);
    renderActiveSection();
  });

  // Open Submission Grading Modal
  $(document).on('click', '.js-open-grade-modal', function () {
    const subId = Number($(this).data('id'));
    if (activeSection !== 'assignments' && activeSection !== 'dashboard') {
      navigateAdminSection('assignments');
    }
    openGradeSubmissionModal(subId);
  });

  $('#btn-close-grade-modal').on('click', () => {
    $('#admin-grade-modal').removeClass('is-open').attr('aria-hidden', 'true');
  });

  $('#form-grade-submission').on('submit', function (e) {
    e.preventDefault();
    const subId = Number($('#grade-modal-sub-id').val());
    const score = Number($('#grade-modal-score').val());
    const feedback = String($('#grade-modal-feedback').val() || '').trim();

    const state = loadDbState();
    const sub = state.submissions.find((s) => s.id === subId);
    if (!sub) return;

    sub.score = score;
    sub.teacherFeedback = feedback;
    sub.status = 'graded';

    logAdminActivity(
      state,
      `ثبت نمره تکلیف برای ${sub.studentName} (کلاس ${sub.classCode})`,
      `نمره ثبت‌شده: ${score} از ۲۰`,
      'assignment'
    );
    saveDbState(state);
    $('#admin-grade-modal').removeClass('is-open').attr('aria-hidden', 'true');
    renderActiveSection();
    showToast('نمره و بازخورد ثبت شد', `نمره ${score} برای ${sub.studentName} ذخیره گردید.`, 'success');
  });

  // Schedule CRUD
  $(document).on('click', '.js-sch-filter', function () {
    scheduleFilter = $(this).data('filter') as typeof scheduleFilter;
    renderActiveSection();
  });

  $(document).on('submit', '#form-add-schedule', function (e) {
    e.preventDefault();
    const classCode = String($('#sch-class').val() || '901') as ClassRoomCode;
    const dayOfWeek = String($('#sch-day').val() || 'شنبه');
    const startTime = String($('#sch-start').val() || '۱۶:۰۰').trim();
    const endTime = String($('#sch-end').val() || '۱۷:۳۰').trim();
    const topic = String($('#sch-topic').val() || '').trim();
    const sessionType = String($('#sch-type').val() || 'حضوری') as
      | 'حضوری'
      | 'آنلاین'
      | 'آزمون و حل تمرین';
    const locationOrLink = String($('#sch-location').val() || '').trim();

    if (!topic) return;

    const state = loadDbState();
    state.schedules.push({
      id: Date.now(),
      classCode,
      dayOfWeek,
      startTime,
      endTime,
      topic,
      sessionType,
      locationOrLink,
    });
    saveDbState(state);
    renderActiveSection();
    showToast('جلسه ثبت شد', `جلسه جدید برای کلاس ${classCode} در روز ${dayOfWeek} اضافه شد.`, 'success');
  });

  $(document).on('click', '.js-delete-schedule', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    state.schedules = state.schedules.filter((s) => s.id !== id);
    saveDbState(state);
    renderActiveSection();
    showToast('جلسه حذف شد', 'جلسه از برنامه هفتگی حذف گردید.', 'info');
  });

  // Educational Resources CRUD
  $(document).on('click', '.js-res-filter', function () {
    resourceFilter = $(this).data('filter') as typeof resourceFilter;
    renderActiveSection();
  });

  $(document).on('submit', '#form-add-resource', function (e) {
    e.preventDefault();
    const title = String($('#res-title').val() || '').trim();
    const category = String($('#res-category').val() || 'جزوه PDF') as
      | 'جزوه PDF'
      | 'فایل تمرین'
      | 'لینک آموزشی'
      | 'ویدیو ضبط‌شده';
    const classCode = String($('#res-class').val() || 'all') as TargetClassScope;
    const urlOrFileName = String($('#res-url').val() || '').trim();
    const description = String($('#res-desc').val() || '').trim();

    if (!title || !urlOrFileName) return;

    const state = loadDbState();
    state.resources.unshift({
      id: Date.now(),
      title,
      category,
      classCode,
      urlOrFileName,
      fileSize: category === 'لینک آموزشی' ? 'لینک وب' : '۳.۱ مگابایت',
      description,
      createdAt: '۱۴۰۵/۰۸/۱۵',
    });
    saveDbState(state);
    renderActiveSection();
    showToast('منبع آموزشی اضافه شد', `«${title}» در بخش منابع قرار گرفت.`, 'success');
  });

  $(document).on('click', '.js-preview-resource', function () {
    const title = String($(this).data('title'));
    const file = String($(this).data('file'));
    showToast(title, `فایل / لینک «${file}» آماده مشاهده و دریافت است.`, 'info');
  });

  $(document).on('click', '.js-delete-resource', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    state.resources = state.resources.filter((r) => r.id !== id);
    saveDbState(state);
    renderActiveSection();
    showToast('منبع حذف شد', 'آیتم انتخاب‌شده از منابع آموزشی حذف گردید.', 'info');
  });

  // Announcements CRUD (1 or 3 classes)
  $(document).on('submit', '#form-add-announcement', function (e) {
    e.preventDefault();
    const title = String($('#ann-title').val() || '').trim();
    const targetClasses = String($('#ann-target').val() || 'all') as TargetClassScope;
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
    renderActiveSection();
    showToast(
      'اطلاعیه ارسال شد',
      `اطلاعیه «${title}» برای ${formatClassLabel(targetClasses)} منتشر گردید.`,
      'success'
    );
  });

  $(document).on('click', '.js-delete-announcement', function () {
    const id = Number($(this).data('id'));
    const state = loadDbState();
    state.announcements = state.announcements.filter((a) => a.id !== id);
    saveDbState(state);
    renderActiveSection();
    showToast('اطلاعیه حذف شد', 'اطلاعیه مورد نظر حذف گردید.', 'info');
  });

  // Tickets Section
  $(document).on('click', '.js-ticket-filter', function () {
    ticketFilter = $(this).data('filter') as typeof ticketFilter;
    renderActiveSection();
  });

  $(document).on('click', '.js-select-ticket', function () {
    activeTicketId = Number($(this).data('id'));
    renderActiveSection();
  });

  $(document).on('click', '.js-open-ticket-direct', function () {
    activeTicketId = Number($(this).data('id'));
    navigateAdminSection('tickets');
  });

  $(document).on('click', '.js-toggle-ticket-close', function () {
    const id = Number($(this).data('id'));
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
    const id = Number($(this).data('id'));
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
    });
    tk.status = 'پاسخ داده شده';

    logAdminActivity(
      state,
      `پاسخ به تیکت ${tk.studentName} (کلاس ${tk.classCode})`,
      `موضوع: ${tk.subject}`,
      'ticket'
    );
    saveDbState(state);
    renderActiveSection();
    showToast('پاسخ ارسال شد', `پاسخ شما برای ${tk.studentName} ثبت گردید.`, 'success');
  });

  // Admin Profile Section
  $(document).on('submit', '#form-admin-profile', function (e) {
    e.preventDefault();
    const state = loadDbState();
    state.admin.firstName = String($('#prof-firstname').val() || '').trim();
    state.admin.lastName = String($('#prof-lastname').val() || '').trim();
    state.admin.phone = normalizeDigits(String($('#prof-phone').val() || ''));
    state.admin.email = String($('#prof-email').val() || '').trim();
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

  // System & Classes Settings Section
  $(document).on('submit', '#form-system-settings', function (e) {
    e.preventDefault();
    const state = loadDbState();
    state.settings.platformName = String($('#set-platform-name').val() || '').trim();
    state.settings.academicYear = String($('#set-academic-year').val() || '').trim();
    state.settings.maxUploadSizeMb = Number($('#set-max-upload').val() || 15);
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
      const code = String($(this).data('code')) as ClassRoomCode;
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.title = String($(this).val() || '').trim();
    });

    $('.js-cls-set-cap').each(function () {
      const code = String($(this).data('code')) as ClassRoomCode;
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.capacity = Number($(this).val() || 30);
    });

    $('.js-cls-set-sch').each(function () {
      const code = String($(this).data('code')) as ClassRoomCode;
      const cls = state.classes.find((c) => c.code === code);
      if (cls) cls.scheduleSummary = String($(this).val() || '').trim();
    });

    saveDbState(state);
    renderActiveSection();
    showToast('مشخصات کلاس‌ها بروزرسانی شد', 'اطلاعات هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳ ذخیره گردید.', 'success');
  });

  $(document).on('click', '#btn-reset-demo-db', () => {
    window.localStorage.removeItem('scoolmeet_mysql_full_state_v2');
    renderActiveSection();
    showToast('بازنشانی انجام شد', 'داده‌های نمونه سامانه به حالت اولیه بازگردانده شدند.', 'info');
  });
}
