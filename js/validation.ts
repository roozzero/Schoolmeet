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
 * Validate optional or required email address format
 */
export function isValidEmail(email: string): boolean {
  const trimmed = String(email || '').trim();
  if (!trimmed) return true; // Optional when empty; check length separately if required
  if (trimmed.length > 150) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Convert Solar Hijri (Jalali) date (jy, jm, jd) to Gregorian (gy, gm, gd)
 */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
): { gy: number; gm: number; gd: number } {
  const jyAdj = jy - (jy > 979 ? 979 : 0);
  let days =
    365 * jyAdj +
    Math.floor(jyAdj / 33) * 8 +
    Math.floor(((jyAdj % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = (jy > 979 ? 1600 : 621) + 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const monthDays = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > monthDays[gm]; gm++) {
    gd -= monthDays[gm];
  }
  return { gy, gm, gd };
}

/**
 * Convert Persian/Arabic numerals in a string to ASCII while preserving spaces and punctuation
 */
export function toAsciiDigitsPreservingFormat(input: string): string {
  let out = String(input || '').trim();
  for (let i = 0; i < 10; i++) {
    out = out.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i));
    out = out.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }
  return out;
}

/**
 * Parse an assignment dueDate string (supporting both Persian Jalali strings like
 * "۱۴۰۵/۰۸/۲۸ · ساعت ۱۸:۰۰" or "1404/01/15" and Gregorian/ISO strings like "2025-10-12 18:00")
 * into a Unix timestamp in milliseconds (Asia/Tehran +03:30).
 */
export function parseAssignmentDeadlineMs(dueDateStr: string): number | null {
  const ascii = toAsciiDigitsPreservingFormat(dueDateStr);
  if (!ascii) return null;

  const dateMatch = ascii.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!dateMatch) {
    const direct = Date.parse(ascii);
    return Number.isNaN(direct) ? null : direct;
  }

  const rawYear = Number(dateMatch[1]);
  const rawMonth = Number(dateMatch[2]);
  const rawDay = Number(dateMatch[3]);
  if (rawMonth < 1 || rawMonth > 12 || rawDay < 1 || rawDay > 31) {
    return null;
  }

  // Extract optional HH:mm(:ss) after the date portion
  const afterDate = ascii.slice((dateMatch.index || 0) + dateMatch[0].length);
  const timeMatch = afterDate.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hour = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 23;
  const minute = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 59;
  const second = timeMatch && timeMatch[3] ? Math.min(59, Math.max(0, Number(timeMatch[3]))) : 59;

  let gy = rawYear;
  let gm = rawMonth;
  let gd = rawDay;

  if (rawYear >= 1300 && rawYear <= 1600) {
    const greg = jalaliToGregorian(rawYear, rawMonth, rawDay);
    gy = greg.gy;
    gm = greg.gm;
    gd = greg.gd;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const isoTehran = `${gy}-${pad(gm)}-${pad(gd)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:30`;
  const parsed = Date.parse(isoTehran);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Evaluate whether an assignment is closed by the instructor or expired past its deadline
 */
export function getAssignmentLockState(
  hw: { status?: string; dueDate: string },
  nowMs: number = Date.now()
): {
  isClosedByAdmin: boolean;
  isDeadlineExpired: boolean;
  isLocked: boolean;
  badgeText: string;
  reasonMessage: string;
} {
  const isClosedByAdmin = hw.status === 'closed';
  const deadlineMs = parseAssignmentDeadlineMs(hw.dueDate || '');
  const isDeadlineExpired = deadlineMs !== null && nowMs > deadlineMs;
  const isLocked = isClosedByAdmin || isDeadlineExpired;

  if (isClosedByAdmin) {
    return {
      isClosedByAdmin: true,
      isDeadlineExpired,
      isLocked: true,
      badgeText: 'بسته شده توسط مدرس',
      reasonMessage: 'این تکلیف توسط مدرس بسته شده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
    };
  }

  if (isDeadlineExpired) {
    return {
      isClosedByAdmin: false,
      isDeadlineExpired: true,
      isLocked: true,
      badgeText: 'مهلت به پایان رسیده',
      reasonMessage: 'مهلت ارسال این تکلیف به پایان رسیده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
    };
  }

  return {
    isClosedByAdmin: false,
    isDeadlineExpired: false,
    isLocked: false,
    badgeText: 'فعال (در حال دریافت)',
    reasonMessage: '',
  };
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
