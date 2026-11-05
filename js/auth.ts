import $ from 'jquery';
import { loginStudentApi, registerStudentApi } from './api';
import {
  closeCongratulationModal,
  closeForgotPasswordModal,
  openCongratulationModal,
  openForgotPasswordModal,
  showToast,
} from './modal';
import {
  clearFieldError,
  isValidClassCode,
  isValidPhone,
  normalizeDigits,
  setFieldError,
} from './validation';

/**
 * Switch between the 2 tabs: 'login' and 'register'
 */
function switchAuthTab(targetTab: 'login' | 'register'): void {
  $('.mode-tab-btn').removeClass('is-active').attr('aria-selected', 'false');

  if (targetTab === 'login') {
    $('#tab-btn-login').addClass('is-active').attr('aria-selected', 'true');
    $('#panel-register').hide();
    $('#panel-login').stop(true, true).fadeIn(160);
  } else {
    $('#tab-btn-register').addClass('is-active').attr('aria-selected', 'true');
    $('#panel-login').hide();
    $('#panel-register').stop(true, true).fadeIn(160);
  }
}

$(function () {
  // 1. Tab Switching (Only 2 sections: ورود به حساب | ثبت‌نام دانش‌آموز)
  $('#tab-btn-login').on('click', () => switchAuthTab('login'));
  $('#tab-btn-register').on('click', () => switchAuthTab('register'));

  // 2. Password Visibility Toggle
  $('.school-password-toggle').on('click', function () {
    const $btn = $(this);
    const targetSelector = $btn.data('target') as string;
    const $input = $(targetSelector);
    if (!$input.length) return;

    const isPassword = $input.attr('type') === 'password';
    $input.attr('type', isPassword ? 'text' : 'password');
    $btn.attr('aria-pressed', isPassword ? 'true' : 'false');
    $btn.find('.icon-eye-open').toggleClass('hidden', !isPassword);
    $btn.find('.icon-eye-closed').toggleClass('hidden', isPassword);
  });

  // 3. Clear Validation Errors on Input
  $('.school-input, .school-select').on('input change', function () {
    const val = String($(this).val() || '').trim();
    if (val.length > 0) {
      clearFieldError($(this));
    }
  });

  // 4. Forgot Password Modal (Triggered below Password input)
  $('#btn-forgot-password').on('click', () => {
    openForgotPasswordModal();
  });

  $('#btn-close-forgot-modal, #forgot-modal').on('click', function (e) {
    if (e.target === this) {
      closeForgotPasswordModal();
    }
  });

  $('#form-forgot-password').on('submit', function (e) {
    e.preventDefault();
    const phoneVal = String($('#recovery-phone-input').val() || '').trim();
    if (!isValidPhone(phoneVal)) {
      showToast('شماره تلفن نامعتبر', 'لطفاً شماره موبایل ۱۱ رقمی معتبر وارد کنید.', 'error');
      return;
    }
    closeForgotPasswordModal();
    $('#recovery-phone-input').val('');
    showToast(
      'کد بازیابی ارسال شد',
      `کد بازنشانی رمز عبور به شماره ${normalizeDigits(phoneVal)} پیامک شد.`,
      'success'
    );
  });

  // 5. Congratulatory Modal Controls
  $('#btn-congrats-go-login, #congrats-modal').on('click', function (e) {
    if (e.target === this || $(this).attr('id') === 'btn-congrats-go-login') {
      const registeredPhone = $('#modal-student-phone').text().trim();
      closeCongratulationModal();
      switchAuthTab('login');
      if (registeredPhone) {
        $('#login-phone').val(registeredPhone);
        $('#login-password').trigger('focus');
      }
    }
  });

  // 6. Login Form Submission (1st input: Phone Number, 2nd input: Password)
  $('#form-login').on('submit', async function (e) {
    e.preventDefault();

    const $phoneInput = $('#login-phone');
    const $passInput = $('#login-password');
    const phone = String($phoneInput.val() || '').trim();
    const password = String($passInput.val() || '');

    let isValid = true;

    if (!isValidPhone(phone)) {
      setFieldError($phoneInput, 'شماره تلفن همراه را به‌درستی وارد کنید (مثال: ۰۹۱۲۳۴۵۶۷۸۹).');
      isValid = false;
    } else {
      clearFieldError($phoneInput, true);
    }

    if (!password || password.length < 6) {
      setFieldError($passInput, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      isValid = false;
    } else {
      clearFieldError($passInput, true);
    }

    if (!isValid) return;

    const $submitBtn = $('#btn-submit-login');
    const originalHtml = $submitBtn.html();
    $submitBtn
      .prop('disabled', true)
      .html('<span class="btn-spinner" aria-hidden="true"></span><span>در حال ورود...</span>');

    try {
      const response = await loginStudentApi({ phone, password });
      if (response.success) {
        showToast('ورود موفقیت‌آمیز', response.message, 'success');
      } else {
        setFieldError($passInput, response.message);
        showToast('خطا در ورود', response.message, 'error');
      }
    } finally {
      $submitBtn.prop('disabled', false).html(originalHtml);
    }
  });

  // 7. Student Registration Form Submission
  $('#form-student-register').on('submit', async function (e) {
    e.preventDefault();

    const $firstName = $('#reg-firstname');
    const $lastName = $('#reg-lastname');
    const $phone = $('#reg-phone');
    const $classCode = $('#reg-class');
    const $password = $('#reg-password');
    const $passwordConfirm = $('#reg-password-confirm');

    const firstName = String($firstName.val() || '').trim();
    const lastName = String($lastName.val() || '').trim();
    const phone = String($phone.val() || '').trim();
    const classCodeVal = String($classCode.val() || '').trim();
    const password = String($password.val() || '');
    const passwordConfirmation = String($passwordConfirm.val() || '');

    let isValid = true;

    if (firstName.length < 2) {
      setFieldError($firstName, 'لطفاً نام خود را وارد کنید.');
      isValid = false;
    } else {
      clearFieldError($firstName, true);
    }

    if (lastName.length < 2) {
      setFieldError($lastName, 'لطفاً نام خانوادگی خود را وارد کنید.');
      isValid = false;
    } else {
      clearFieldError($lastName, true);
    }

    if (!isValidPhone(phone)) {
      setFieldError($phone, 'شماره تلفن همراه ۱۱ رقمی معتبر وارد کنید.');
      isValid = false;
    } else {
      clearFieldError($phone, true);
    }

    if (!isValidClassCode(classCodeVal)) {
      setFieldError($classCode, 'لطفاً یکی از کلاس‌های ۹۰۱، ۹۰۲ یا ۹۰۳ را انتخاب کنید.');
      isValid = false;
    } else {
      clearFieldError($classCode, true);
    }

    if (password.length < 6) {
      setFieldError($password, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      isValid = false;
    } else {
      clearFieldError($password, true);
    }

    if (!passwordConfirmation || passwordConfirmation !== password) {
      setFieldError($passwordConfirm, 'تکرار رمز عبور با رمز عبور مطابقت ندارد.');
      isValid = false;
    } else {
      clearFieldError($passwordConfirm, true);
    }

    if (!isValid || !isValidClassCode(classCodeVal)) return;

    const $submitBtn = $('#btn-submit-register');
    const originalHtml = $submitBtn.html();
    $submitBtn
      .prop('disabled', true)
      .html('<span class="btn-spinner" aria-hidden="true"></span><span>در حال ایجاد حساب...</span>');

    try {
      const response = await registerStudentApi({
        firstName,
        lastName,
        phone,
        classCode: classCodeVal,
        password,
        passwordConfirmation,
      });

      if (response.success && response.student) {
        ($('#form-student-register')[0] as HTMLFormElement | undefined)?.reset();
        $('#form-student-register .school-input, #form-student-register .school-select').removeClass(
          'is-valid has-error'
        );
        openCongratulationModal(response.student);
      }
    } finally {
      $submitBtn.prop('disabled', false).html(originalHtml);
    }
  });
});
