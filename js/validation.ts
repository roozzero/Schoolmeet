import $ from 'jquery';
import { ClassRoomCode } from './types';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert any ASCII or Arabic digits in a string/number to Persian digits (۰-۹)
 */
export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  let str = String(input);
  str = str.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(ARABIC_DIGITS[i], 'g'), PERSIAN_DIGITS[i]);
  }
  return str;
}

/**
 * Convert Persian and Arabic numerals to standard ASCII digits for validation/math
 */
export function normalizeDigits(input: string): string {
  let output = input.trim();

  for (let i = 0; i < 10; i++) {
    output = output.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i));
    output = output.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }

  return output.replace(/\s+/g, '');
}

/**
 * Validate Iranian phone number (e.g. ۰۹۱۲۳۴۵۶۷۸۹ or 09123456789)
 */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizeDigits(phone);
  return /^09\d{9}$/.test(normalized);
}

/**
 * Validate class code (901, 902, 903)
 */
export function isValidClassCode(value: string): value is ClassRoomCode {
  return value === '901' || value === '902' || value === '903';
}

/**
 * Display inline error message under a field
 */
export function setFieldError($input: JQuery<HTMLElement>, message: string): void {
  $input.addClass('has-error').removeClass('is-valid').attr('aria-invalid', 'true');
  const $error = $input.closest('.scool-input-group').find('.field-error-msg');
  $error.text(toPersianDigits(message)).stop(true, true).slideDown(120);
}

/**
 * Clear inline error message from a field
 */
export function clearFieldError($input: JQuery<HTMLElement>, markValid = false): void {
  $input.removeClass('has-error').attr('aria-invalid', 'false');
  if (markValid) {
    $input.addClass('is-valid');
  } else {
    $input.removeClass('is-valid');
  }
  const $error = $input.closest('.scool-input-group').find('.field-error-msg');
  $error.stop(true, true).slideUp(100);
}
