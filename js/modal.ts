import $ from 'jquery';
import { StudentRecord } from './types';
import { toPersianDigits } from './validation';

/**
 * Show an RTL Persian Toast Notification (with Persian digits)
 */
export function showToast(
  title: string,
  message: string,
  type: 'success' | 'error' | 'info' = 'info'
): void {
  const $stack = $('#toast-stack');
  if (!$stack.length) return;

  const styles: Record<typeof type, { bg: string; color: string; svg: string }> = {
    success: {
      bg: '#ECFDF5',
      color: '#059669',
      svg: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
    },
    error: {
      bg: '#FFF1F2',
      color: '#E11D48',
      svg: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>',
    },
    info: {
      bg: '#EEF2FF',
      color: '#4F46E5',
      svg: '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    },
  };

  const conf = styles[type];

  const $toast = $(`
    <div class="scool-toast" role="status" aria-live="polite" dir="rtl">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${conf.bg}; color:${conf.color}">
        ${conf.svg}
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-extrabold text-[#1E293B] leading-snug">${toPersianDigits(title)}</div>
        <div class="text-[11px] text-[#475569] mt-0.5 leading-relaxed">${toPersianDigits(message)}</div>
      </div>
    </div>
  `);

  $stack.append($toast);
  window.requestAnimationFrame(() => $toast.addClass('is-visible'));

  window.setTimeout(() => {
    $toast.removeClass('is-visible');
    window.setTimeout(() => $toast.remove(), 180);
  }, 4000);
}

/**
 * Open the Congratulatory Account Created Modal
 */
export function openCongratulationModal(student: StudentRecord): void {
  $('#modal-student-fullname').text(`${student.firstName} ${student.lastName}`);
  $('#modal-student-phone').text(toPersianDigits(student.phone));
  $('#modal-student-class').text(`کلاس ${toPersianDigits(student.classCode)}`);
  $('#congrats-modal').addClass('is-open').attr('aria-hidden', 'false');
}

/**
 * Close the Congratulatory Modal
 */
export function closeCongratulationModal(): void {
  $('#congrats-modal').removeClass('is-open').attr('aria-hidden', 'true');
}

/**
 * Open / Close Forgot Password Modal
 */
export function openForgotPasswordModal(): void {
  $('#forgot-modal').addClass('is-open').attr('aria-hidden', 'false');
  $('#recovery-phone-input').trigger('focus');
}

export function closeForgotPasswordModal(): void {
  $('#forgot-modal').removeClass('is-open').attr('aria-hidden', 'true');
}
