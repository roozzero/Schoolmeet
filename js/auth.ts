import $ from 'jquery';
import {
  initAdminPanelEvents,
  navigateAdminSection,
  renderActiveSection,
} from './admin';
import { loginStudentApi, registerStudentApi } from './api';
import {
  closeCongratulationModal,
  closeForgotPasswordModal,
  openCongratulationModal,
  openForgotPasswordModal,
  showToast,
} from './modal';
import {
  parseCurrentLocation,
  updateBrowserUrl,
} from './router';
import {
  getActiveUserRole,
  loadDbState,
  onDbStateSynced,
  setActiveStudentSessionId,
  setActiveUserRole,
  syncStateFromBackend,
} from './store';
import {
  initStudentPanelEvents,
  navigateStudentSection,
  renderActiveStudentSection,
} from './student';
import {
  AdminSectionId,
  ClassRoomCode,
  StudentRegistrationPayload,
  StudentSectionId,
} from './types';
import {
  isValidClassCode,
  isValidFullName,
  isValidPassword,
  isValidPhone,
  normalizeDigits,
  normalizeIranianPhone,
  toPersianDigits,
} from './validation';

function setFieldInvalid($input: JQuery<HTMLElement>, message: string): void {
  const $group = $input.closest('.scool-input-group');
  $input.addClass('has-error');
  $group.addClass('is-invalid');
  $group.find('.field-error-msg').text(message);
}

function clearFieldInvalid($input: JQuery<HTMLElement>): void {
  const $group = $input.closest('.scool-input-group');
  $input.removeClass('has-error');
  $group.removeClass('is-invalid');
  $group.find('.field-error-msg').text('');
}

function showPendingApprovalBanner(customMessage?: string): void {
  const $banner = $('#auth-pending-approval-banner');
  if (customMessage) {
    $('#auth-pending-approval-text').text(customMessage);
  }
  $banner.removeClass('hidden');
}

function hidePendingApprovalBanner(): void {
  $('#auth-pending-approval-banner').addClass('hidden');
}

/**
 * Populate registration class select dynamically from backend classes
 */
function syncRegistrationClassOptions(): void {
  const state = loadDbState();
  const $select = $('#reg-class');
  if (!$select.length) return;
  const currentVal = String($select.val() || '');

  if (state.classes.length > 0) {
    const optionsHtml =
      `<option value="">انتخاب کلاس</option>` +
      state.classes
        .map(
          (c) =>
            `<option value="${c.code}">${toPersianDigits(c.code)} — ${toPersianDigits(c.title)}</option>`
        )
        .join('');
    $select.html(optionsHtml);
    if (currentVal) {
      $select.val(currentVal);
    }
  }
}

export function switchPublicTab(
  mode: 'login' | 'register',
  updateUrl = true
): void {
  const isLogin = mode === 'login';

  $('#tab-btn-login')
    .toggleClass('is-active', isLogin)
    .attr('aria-selected', String(isLogin));
  $('#tab-btn-register')
    .toggleClass('is-active', !isLogin)
    .attr('aria-selected', String(!isLogin));

  $('#panel-login').toggleClass('hidden', !isLogin);
  $('#panel-register').toggleClass('hidden', isLogin);

  if (updateUrl) {
    updateBrowserUrl(isLogin ? '/login' : '/register');
  }
}

export function enterAdminWorkspace(
  sectionId: AdminSectionId = 'dashboard',
  updateUrl = true,
  subPage?: string
): void {
  setActiveUserRole('admin');
  hidePendingApprovalBanner();
  $('#public-auth-view').addClass('view-hidden');
  $('#student-workspace-view').addClass('view-hidden');
  $('#admin-workspace-view').removeClass('view-hidden');

  navigateAdminSection(sectionId, updateUrl, subPage);
  renderActiveSection();
}

export function enterStudentWorkspace(
  sectionId: StudentSectionId = 'dashboard',
  updateUrl = true,
  subPage?: string
): void {
  const state = loadDbState();
  const activeSt = state.students.find((s) => s.id === state.activeStudentId);

  // Enforce student approval restriction before entering student workspace
  if (!activeSt || activeSt.status !== 'approved') {
    setActiveUserRole('');
    setActiveStudentSessionId(0);
    $('#admin-workspace-view').addClass('view-hidden');
    $('#student-workspace-view').addClass('view-hidden');
    $('#public-auth-view').removeClass('view-hidden');
    switchPublicTab('login', true);
    showPendingApprovalBanner(
      'حساب کاربری شما هنوز توسط مدیر سامانه تأیید نشده است. پس از تأیید مدیریت می‌توانید وارد پنل دانش‌آموزی شوید.'
    );
    return;
  }

  setActiveUserRole('student');
  hidePendingApprovalBanner();
  $('#public-auth-view').addClass('view-hidden');
  $('#admin-workspace-view').addClass('view-hidden');
  $('#student-workspace-view').removeClass('view-hidden');

  navigateStudentSection(sectionId, updateUrl, subPage);
  renderActiveStudentSection();
}

/**
 * Apply any route path (`/login`, `/register`, `/admin/*`, `/student/*`)
 */
export function applyRouteState(updateHistory = false): void {
  const resolved = parseCurrentLocation();

  if (resolved.view === 'admin') {
    if (getActiveUserRole() !== 'admin') {
      $('#admin-workspace-view').addClass('view-hidden');
      $('#student-workspace-view').addClass('view-hidden');
      $('#public-auth-view').removeClass('view-hidden');
      switchPublicTab('login', true);
      return;
    }
    enterAdminWorkspace(
      resolved.section || 'dashboard',
      updateHistory,
      resolved.subPage
    );
    return;
  }

  if (resolved.view === 'student') {
    const state = loadDbState();
    const activeSt = state.students.find((s) => s.id === state.activeStudentId);
    if (
      getActiveUserRole() !== 'student' ||
      !activeSt ||
      activeSt.status !== 'approved'
    ) {
      setActiveUserRole('');
      setActiveStudentSessionId(0);
      $('#admin-workspace-view').addClass('view-hidden');
      $('#student-workspace-view').addClass('view-hidden');
      $('#public-auth-view').removeClass('view-hidden');
      switchPublicTab('login', true);
      if (activeSt && activeSt.status === 'pending') {
        showPendingApprovalBanner();
      }
      return;
    }
    enterStudentWorkspace(
      resolved.section || 'dashboard',
      updateHistory,
      resolved.subPage
    );
    return;
  }

  // Public Login / Register View
  $('#admin-workspace-view').addClass('view-hidden');
  $('#student-workspace-view').addClass('view-hidden');
  $('#public-auth-view').removeClass('view-hidden');
  switchPublicTab(resolved.tab || 'login', updateHistory);
}

let isAppInitialized = false;

export function initScoolMeetApp(): void {
  if (isAppInitialized) return;
  isAppInitialized = true;

  // Synchronize relational state from Node.js + MySQL backend on startup
  void syncStateFromBackend().then(() => {
    syncRegistrationClassOptions();
    const resolved = parseCurrentLocation();
    if (resolved.view === 'student') {
      applyRouteState(false);
    }
  });

  onDbStateSynced(() => {
    syncRegistrationClassOptions();
  });

  // Tab buttons
  $(document).on('click', '#tab-btn-login', (e) => {
    e.preventDefault();
    switchPublicTab('login', true);
  });

  $(document).on('click', '#tab-btn-register', (e) => {
    e.preventDefault();
    switchPublicTab('register', true);
  });

  // Clear field errors on input/change
  $(document).on(
    'input change',
    '.school-input, .school-select, .school-textarea',
    function () {
      clearFieldInvalid($(this));
    }
  );

  // Convert English digits to Persian digits inside phone inputs while typing
  $(document).on(
    'input',
    '#login-phone, #reg-phone, #recovery-phone-input, #add-st-phone, #prof-modal-phone, #prof-phone',
    function () {
      const $el = $(this);
      const raw = String($el.val() || '');
      const clean = normalizeDigits(raw).replace(/[^\d+]/g, '');
      $el.val(toPersianDigits(clean));
    }
  );

  // Password visibility toggle
  $(document).on('click', '.school-password-toggle', function (e) {
    e.preventDefault();
    const $btn = $(this);
    const targetSelector = String($btn.attr('data-target') || '');
    const $input = $(targetSelector);
    if (!$input.length) return;

    const isPassword = $input.attr('type') === 'password';
    $input.attr('type', isPassword ? 'text' : 'password');
    $btn.attr('aria-pressed', String(isPassword));
    $btn.find('.icon-eye-closed').toggleClass('hidden', isPassword);
    $btn.find('.icon-eye-open').toggleClass('hidden', !isPassword);
  });

  // Login Form Submission
  $(document).on('submit', '#form-login', async (e) => {
    e.preventDefault();

    const $phone = $('#login-phone');
    const $password = $('#login-password');
    const rawPhone = String($phone.val() || '');
    const password = String($password.val() || '');

    clearFieldInvalid($phone);
    clearFieldInvalid($password);

    let valid = true;
    if (!isValidPhone(rawPhone)) {
      setFieldInvalid(
        $phone,
        'شماره موبایل معتبر ایران وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).'
      );
      valid = false;
    }
    if (!isValidPassword(password)) {
      setFieldInvalid($password, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      valid = false;
    }
    if (!valid) return;

    const normalizedPhone = normalizeIranianPhone(rawPhone);
    const $btn = $('#btn-submit-login');
    const origHtml = $btn.html();
    $btn.prop('disabled', true).html('<span>در حال بررسی...</span>');

    try {
      const response = await loginStudentApi({
        phone: normalizedPhone,
        password,
      });

      if (!response.success) {
        if (response.code === 'ACCOUNT_PENDING_APPROVAL') {
          showPendingApprovalBanner(response.message);
          showToast('در انتظار تأیید مدیر', response.message, 'info');
        } else {
          showToast('خطا در ورود', response.message, 'error');
        }
        return;
      }

      hidePendingApprovalBanner();
      showToast('خوش آمدید', response.message, 'success');

      if (response.role === 'admin') {
        enterAdminWorkspace('dashboard', true);
      } else {
        enterStudentWorkspace('dashboard', true);
      }
    } catch {
      showToast(
        'خطا در ارتباط با سرور',
        'امکان برقراری ارتباط با سرور وجود ندارد. لطفاً دوباره تلاش کنید.',
        'error'
      );
    } finally {
      $btn.prop('disabled', false).html(origHtml);
    }
  });

  // Student Registration Form Submission (All fields mandatory; email is only in profile)
  $(document).on('submit', '#form-student-register', async (e) => {
    e.preventDefault();

    const $firstName = $('#reg-firstname');
    const $lastName = $('#reg-lastname');
    const $phone = $('#reg-phone');
    const $classCode = $('#reg-class');
    const $password = $('#reg-password');
    const $confirm = $('#reg-password-confirm');

    clearFieldInvalid($firstName);
    clearFieldInvalid($lastName);
    clearFieldInvalid($phone);
    clearFieldInvalid($classCode);
    clearFieldInvalid($password);
    clearFieldInvalid($confirm);

    const rawPhoneInput = String($phone.val() || '').trim();
    const payload: StudentRegistrationPayload = {
      firstName: String($firstName.val() || '').trim(),
      lastName: String($lastName.val() || '').trim(),
      phone: normalizeIranianPhone(rawPhoneInput),
      classCode: String($classCode.val() || '').trim() as ClassRoomCode,
      password: String($password.val() || ''),
      passwordConfirmation: String($confirm.val() || ''),
    };

    let valid = true;
    if (!payload.firstName) {
      setFieldInvalid($firstName, 'وارد کردن نام الزامی است.');
      valid = false;
    } else if (!isValidFullName(payload.firstName)) {
      setFieldInvalid($firstName, 'نام باید حداقل ۲ کاراکتر باشد.');
      valid = false;
    }

    if (!payload.lastName) {
      setFieldInvalid($lastName, 'وارد کردن نام خانوادگی الزامی است.');
      valid = false;
    } else if (!isValidFullName(payload.lastName)) {
      setFieldInvalid($lastName, 'نام خانوادگی باید حداقل ۲ کاراکتر باشد.');
      valid = false;
    }

    if (!rawPhoneInput) {
      setFieldInvalid($phone, 'وارد کردن شماره موبایل الزامی است.');
      valid = false;
    } else if (!isValidPhone(payload.phone)) {
      setFieldInvalid(
        $phone,
        'شماره موبایل معتبر ایران وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).'
      );
      valid = false;
    }

    if (!isValidClassCode(payload.classCode)) {
      setFieldInvalid($classCode, 'انتخاب کلاس الزامی است.');
      valid = false;
    }

    if (!payload.password) {
      setFieldInvalid($password, 'وارد کردن رمز عبور الزامی است.');
      valid = false;
    } else if (!isValidPassword(payload.password)) {
      setFieldInvalid($password, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      valid = false;
    }

    if (!payload.passwordConfirmation) {
      setFieldInvalid($confirm, 'وارد کردن تکرار رمز عبور الزامی است.');
      valid = false;
    } else if (payload.password !== payload.passwordConfirmation) {
      setFieldInvalid($confirm, 'تکرار رمز عبور با رمز عبور یکسان نیست.');
      valid = false;
    }

    if (!valid) return;

    const $btn = $('#btn-submit-register');
    const origHtml = $btn.html();
    $btn.prop('disabled', true).html('<span>در حال ثبت‌نام...</span>');

    try {
      const response = await registerStudentApi(payload);
      if (!response.success || !response.student) {
        showToast('خطا در ثبت‌نام', response.message, 'error');
        return;
      }

      openCongratulationModal(response.student);
      showPendingApprovalBanner(response.message);
      (document.getElementById('form-student-register') as HTMLFormElement).reset();
    } catch {
      showToast(
        'خطا در ارتباط با سرور',
        'امکان برقراری ارتباط با سرور وجود ندارد. لطفاً دوباره تلاش کنید.',
        'error'
      );
    } finally {
      $btn.prop('disabled', false).html(origHtml);
    }
  });

  // Congrats Modal Button -> Switch to Login Tab (Pending Admin Approval)
  $(document).on('click', '#btn-congrats-go-login', (e) => {
    e.preventDefault();
    closeCongratulationModal();
    const state = loadDbState();
    const activeSt = state.students.find((s) => s.id === state.activeStudentId);
    if (activeSt && activeSt.status === 'approved' && getActiveUserRole() === 'student') {
      enterStudentWorkspace('dashboard', true);
    } else {
      switchPublicTab('login', true);
      showPendingApprovalBanner();
    }
  });

  // Forgot Password Modal
  $(document).on('click', '#btn-forgot-password', (e) => {
    e.preventDefault();
    openForgotPasswordModal();
  });

  $(document).on('click', '#btn-close-forgot-modal', (e) => {
    e.preventDefault();
    closeForgotPasswordModal();
  });

  // Initialize Admin Panel & Student Panel Event Listeners
  initAdminPanelEvents();
  initStudentPanelEvents();

  // Initialize URL History Router
  window.addEventListener('popstate', () => {
    applyRouteState(false);
  });
  applyRouteState(false);
}

// Automatically initialize the application when the module loads
$(function () {
  initScoolMeetApp();
});

