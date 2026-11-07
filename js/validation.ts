const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert Persian/Arabic digits to English ASCII digits
 */
export function normalizeDigits(input: string): string {
  let result = String(input || '').trim();
  PERSIAN_DIGITS.forEach((digit, index) => {
    result = result.replace(new RegExp(digit, 'g'), String(index));
  });
  ARABIC_DIGITS.forEach((digit, index) => {
    result = result.replace(new RegExp(digit, 'g'), String(index));
  });
  return result;
}

/**
 * Convert English ASCII digits to Persian digits for UI display
 */
export function toPersianDigits(input: string | number): string {
  return String(input ?? '').replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Normalize Iranian mobile phone numbers to canonical 11-digit format `09xxxxxxxxx`.
 * Accepts:
 * - `09123456789`
 * - `+989123456789`
 * - `00989123456789`
 * - `989123456789`
 * - `9123456789`
 * with Persian, Arabic, or ASCII digits and optional spaces/dashes.
 */
export function normalizeIranianPhone(value: string): string {
  const ascii = normalizeDigits(value).replace(/[\s\-().]/g, '');
  if (/^\+989\d{9}$/.test(ascii)) {
    return '0' + ascii.slice(3);
  }
  if (/^00989\d{9}$/.test(ascii)) {
    return '0' + ascii.slice(4);
  }
  if (/^989\d{9}$/.test(ascii)) {
    return '0' + ascii.slice(2);
  }
  if (/^9\d{9}$/.test(ascii)) {
    return '0' + ascii;
  }
  return ascii;
}

/**
 * Validate Iranian Mobile Number strictly:
 * Must normalize to 11 digits starting with `09` (`/^09\d{9}$/`).
 * Rejects landline numbers (e.g. `021...`), incomplete numbers, and non-numeric strings.
 */
export function isValidPhone(value: string): boolean {
  const normalized = normalizeIranianPhone(value);
  return /^09\d{9}$/.test(normalized);
}

export function isValidEmail(value: string): boolean {
  const cleaned = normalizeDigits(value).trim();
  if (!cleaned) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
}

export function isValidRequiredEmail(value: string): boolean {
  return isValidEmail(value);
}

export function isValidFullName(value: string): boolean {
  return value.trim().length >= 2;
}

export function isValidClassCode(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidPassword(value: string): boolean {
  return value.length >= 6;
}

/**
 * Format a real Date or timestamp into a Persian date + time string (e.g. `۱۴۰۵/۰۸/۱۷ · ساعت ۱۴:۳۰`).
 * Never returns hardcoded `'هم‌اکنون'` or `'۱۴۰۵/۰۸/۱۵'`.
 */
export function formatPersianDateTime(input?: Date | string | number | null): string {
  let dateObj: Date;
  if (input instanceof Date && !isNaN(input.getTime())) {
    dateObj = input;
  } else if (typeof input === 'number' && !isNaN(input)) {
    dateObj = new Date(input);
  } else if (typeof input === 'string' && input.trim()) {
    const raw = input.trim();
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime()) && (raw.includes('-') || raw.includes('T') || raw.includes(':'))) {
      dateObj = parsed;
    } else {
      // Already a formatted Persian date string: strip any legacy 'هم‌اکنون' suffix
      const cleaned = raw
        .replace(/·\s*هم‌اکنون/g, '')
        .replace(/هم‌اکنون/g, '')
        .trim();
      return toPersianDigits(cleaned || raw);
    }
  } else {
    dateObj = new Date();
  }

  try {
    const datePart = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dateObj);
    const timePart = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dateObj);
    return `${toPersianDigits(datePart)} · ساعت ${toPersianDigits(timePart)}`;
  } catch {
    const fallbackDate = dateObj.toLocaleDateString('fa-IR');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${toPersianDigits(fallbackDate)} · ساعت ${toPersianDigits(`${hh}:${mm}`)}`;
  }
}

/**
 * Format the target recipient audience label for an announcement, assignment, or educational resource.
 * Distinguishes accurately between:
 * 1) An individual student (`targetStudentId` / `targetStudentName`)
 * 2) A specific class (`901`, `902`, `903`, or custom class code)
 * 3) All students (`all`)
 */
export function formatRecipientLabel(options: {
  targetClassOrAll?: string | null;
  classCodeOrTarget?: string | null;
  targetStudentId?: number | null;
  targetStudentName?: string | null;
  students?: Array<{
    id: number;
    firstName: string;
    lastName: string;
    classCode?: string;
  }>;
  classes?: Array<{
    code: string;
    title?: string;
  }>;
}): string {
  const rawScope = options.targetClassOrAll ?? options.classCodeOrTarget ?? 'all';
  const studentId = Number(options.targetStudentId || 0);
  if (studentId > 0) {
    const foundStudent = (options.students || []).find(
      (s) => Number(s.id) === studentId
    );
    if (foundStudent) {
      const fullName = `${foundStudent.firstName} ${foundStudent.lastName}`.trim();
      const clsPart = foundStudent.classCode
        ? ` (کلاس ${toPersianDigits(foundStudent.classCode)})`
        : '';
      return `دانش‌آموز: ${fullName}${clsPart}`;
    }
    if (options.targetStudentName && options.targetStudentName.trim()) {
      const clsCode = String(rawScope || '').trim();
      const clsPart =
        clsCode && clsCode !== 'all' ? ` (کلاس ${toPersianDigits(clsCode)})` : '';
      return `دانش‌آموز: ${options.targetStudentName.trim()}${clsPart}`;
    }
    return `دانش‌آموز اختصاصی (شناسه ${toPersianDigits(studentId)})`;
  }

  const scope = String(rawScope || 'all').trim();
  if (!scope || scope === '-') {
    return 'بدون کلاس';
  }
  if (scope === 'all') {
    return 'همه دانش‌آموزان سامانه';
  }

  return `کلاس ${toPersianDigits(scope)}`;
}

/**
 * Convert a Jalali (Solar Hijri) date (jY, jM, jD) to a Gregorian Date object (end of day 23:59:59 local time,
 * or specific hour/minute if provided).
 * Uses standard Jalali calendar leap-year and day-of-year conversion.
 */
export function jalaliToGregorianDate(
  jYear: number,
  jMonth: number,
  jDay: number,
  hour = 23,
  minute = 59,
  second = 59
): Date | null {
  if (
    !Number.isInteger(jYear) ||
    !Number.isInteger(jMonth) ||
    !Number.isInteger(jDay) ||
    jYear < 1300 ||
    jYear > 1500 ||
    jMonth < 1 ||
    jMonth > 12 ||
    jDay < 1 ||
    jDay > 31
  ) {
    return null;
  }
  if (jMonth > 6 && jDay === 31) return null;

  const jy = jYear - 979;
  const jm = jMonth - 1;
  const jd = jDay - 1;

  let jDayNo =
    365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jm; ++i) {
    jDayNo += i < 6 ? 31 : 30;
  }
  jDayNo += jd;

  let gDayNo = jDayNo + 79;
  let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
  gDayNo = gDayNo % 146097;

  let leap = true;
  if (gDayNo >= 36525) {
    gDayNo--;
    gy += 100 * Math.floor(gDayNo / 36524);
    gDayNo = gDayNo % 36524;

    if (gDayNo >= 365) {
      gDayNo++;
    } else {
      leap = false;
    }
  }

  gy += 4 * Math.floor(gDayNo / 1461);
  gDayNo %= 1461;

  if (gDayNo >= 366) {
    leap = false;
    gDayNo--;
    gy += Math.floor(gDayNo / 365);
    gDayNo = gDayNo % 365;
  }

  const gDaysInMonth = [
    31,
    leap ? 29 : 28,
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
  while (gm < 12 && gDayNo >= gDaysInMonth[gm]) {
    gDayNo -= gDaysInMonth[gm];
    gm++;
  }
  const gd = gDayNo + 1;

  return new Date(gy, gm, gd, hour, minute, second, 999);
}

/**
 * Parse a dueDate string (Jalali `1405/08/25`, `۱۴۰۵/۰۸/۲۵ - ۲۳:۵۹`, or ISO/Gregorian `2026-11-16`)
 * into a timestamp in milliseconds. Returns null if unparseable.
 */
export function parseAssignmentDueDateMs(dueDateStr: string): number | null {
  const normalized = normalizeDigits(String(dueDateStr || '')).trim();
  if (!normalized) return null;

  // Extract optional HH:MM time if present (default to 23:59:59)
  let hour = 23;
  let minute = 59;
  const timeMatch = normalized.match(/(?:ساعت|-|،|\s)(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const h = Number(timeMatch[1]);
    const m = Number(timeMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hour = h;
      minute = m;
    }
  }

  // Match YYYY/MM/DD or YYYY-MM-DD
  const dateMatch = normalized.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);

    if (year >= 1300 && year <= 1500) {
      const dt = jalaliToGregorianDate(year, month, day, hour, minute, 59);
      return dt ? dt.getTime() : null;
    }

    if (year >= 1970 && year <= 2100) {
      const dt = new Date(year, month - 1, day, hour, minute, 59, 999);
      return isNaN(dt.getTime()) ? null : dt.getTime();
    }
  }

  const parsedIso = Date.parse(normalized);
  if (!isNaN(parsedIso)) {
    return parsedIso;
  }

  return null;
}

/**
 * Determine whether an assignment is locked for student submissions/edits:
 * - Closed manually by admin (`status === 'closed'`)
 * - Or deadline has passed (`nowMs > dueDateMs`)
 */
export function getAssignmentLockState(
  assignment: { status?: 'active' | 'closed' | string; dueDate?: string },
  nowMs: number = Date.now()
): {
  isClosedByAdmin: boolean;
  isDeadlineExpired: boolean;
  isLocked: boolean;
  reasonLabel: string;
  reasonMessage: string;
} {
  const isClosedByAdmin = assignment.status === 'closed';
  const dueMs = parseAssignmentDueDateMs(assignment.dueDate || '');
  const isDeadlineExpired = dueMs !== null && nowMs > dueMs;
  const isLocked = isClosedByAdmin || isDeadlineExpired;

  let reasonLabel = 'فعال و باز';
  let reasonMessage = '';

  if (isClosedByAdmin) {
    reasonLabel = 'بسته شده توسط مدرس';
    reasonMessage =
      'این تکلیف توسط مدرس بسته شده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.';
  } else if (isDeadlineExpired) {
    reasonLabel = 'مهلت به پایان رسیده';
    reasonMessage =
      'مهلت تحویل این تکلیف به پایان رسیده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.';
  }

  return {
    isClosedByAdmin,
    isDeadlineExpired,
    isLocked,
    reasonLabel,
    reasonMessage,
  };
}
