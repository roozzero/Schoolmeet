import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { Request, Response } from 'express';
import fs from 'fs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import path from 'path';
import { getAssignmentLockState } from '../js/validation';
import { getDbInfo, pool, testDatabaseConnection } from './db';
import {
  ensureDefaultClassesSeeded,
  REQUIRED_DEFAULT_CLASS_CODES,
  runMigrations,
} from './migrations';

const app = express();
const PORT = Number(process.env.API_PORT || 3001);

function getAssignmentLockStatusServer(
  hw: { status?: string; dueDate?: string },
  nowMs: number = Date.now()
): { locked: boolean; reason: string } {
  const lock = getAssignmentLockState(hw, nowMs);
  if (lock.isClosedByAdmin) {
    return { locked: true, reason: 'ASSIGNMENT_CLOSED' };
  }
  if (lock.isDeadlineExpired) {
    return { locked: true, reason: 'ASSIGNMENT_DEADLINE_EXPIRED' };
  }
  return { locked: false, reason: '' };
}

function formatAssignmentStatusError(reason: string): string {
  if (reason === 'ASSIGNMENT_CLOSED') {
    return 'این تکلیف توسط مدرس بسته شده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.';
  }
  return 'مهلت تحویل این تکلیف به پایان رسیده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.';
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Serve uploaded files from `/uploads/:filename` with optional `?download=1&name=...`
 */
app.get('/uploads/:filename', (req: Request, res: Response) => {
  const safeFile = path.basename(String(req.params.filename || ''));
  const fullPath = path.join(UPLOADS_DIR, safeFile);
  if (!safeFile || !fs.existsSync(fullPath)) {
    res.status(404).json({
      success: false,
      message: 'فایل مورد نظر در سرور یافت نشد.',
    });
    return;
  }

  const downloadName = String(req.query.name || safeFile).replace(/["\r\n]/g, '');
  if (req.query.download === '1') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
  }
  res.sendFile(fullPath);
});

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function normalizeDigitsServer(input: unknown): string {
  let result = String(input ?? '').trim();
  PERSIAN_DIGITS.forEach((d, idx) => {
    result = result.replace(new RegExp(d, 'g'), String(idx));
  });
  ARABIC_DIGITS.forEach((d, idx) => {
    result = result.replace(new RegExp(d, 'g'), String(idx));
  });
  return result;
}

function toPersianDigitsServer(input: string | number): string {
  return String(input ?? '').replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Normalize Iranian mobile phone numbers to canonical 11-digit ASCII `09xxxxxxxxx`.
 * Accepts `09xxxxxxxxx`, `+989xxxxxxxxx`, `00989xxxxxxxxx`, `989xxxxxxxxx`, `9xxxxxxxxx`
 * with Persian, Arabic, or ASCII digits.
 */
export function normalizeIranianPhoneServer(input: unknown): string {
  const ascii = normalizeDigitsServer(input).replace(/[\s\-().]/g, '');
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

export function isValidIranianPhoneServer(input: unknown): boolean {
  const normalized = normalizeIranianPhoneServer(input);
  return /^09\d{9}$/.test(normalized);
}

export function isValidEmailServer(email: string): boolean {
  const cleaned = normalizeDigitsServer(email).trim();
  if (!cleaned) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
}

/**
 * Format a real Date or MySQL TIMESTAMP into a Persian date + time string (`۱۴۰۵/۰۸/۱۷ · ساعت ۱۴:۳۰`).
 * Replaces any legacy hardcoded `'۱۴۰۵/۰۸/۱۵'` or `'هم‌اکنون'` with the actual DB timestamp.
 */
function formatServerPersianDateTime(
  dbTimestamp?: Date | string | number | null,
  storedLabel?: string | null
): string {
  const cleanStored = String(storedLabel || '').trim();
  const hasHardcodedPlaceholder =
    !cleanStored ||
    cleanStored.includes('هم‌اکنون') ||
    cleanStored === '۱۴۰۵/۰۸/۱۵' ||
    cleanStored === '1405/08/15';

  if (!hasHardcodedPlaceholder && cleanStored.includes('·')) {
    return toPersianDigitsServer(cleanStored);
  }

  let dateObj: Date = new Date();
  if (dbTimestamp instanceof Date && !isNaN(dbTimestamp.getTime())) {
    dateObj = dbTimestamp;
  } else if (typeof dbTimestamp === 'string' || typeof dbTimestamp === 'number') {
    const parsed = new Date(dbTimestamp);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
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
    return `${toPersianDigitsServer(datePart)} · ساعت ${toPersianDigitsServer(timePart)}`;
  } catch {
    const d = dateObj.toLocaleDateString('fa-IR');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${toPersianDigitsServer(d)} · ساعت ${toPersianDigitsServer(`${hh}:${mm}`)}`;
  }
}

function formatServerPersianDateOnly(dbTimestamp?: Date | string | number | null): string {
  let dateObj: Date = new Date();
  if (dbTimestamp instanceof Date && !isNaN(dbTimestamp.getTime())) {
    dateObj = dbTimestamp;
  } else if (dbTimestamp) {
    const parsed = new Date(dbTimestamp);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }
  try {
    return toPersianDigitsServer(
      new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dateObj)
    );
  } catch {
    return toPersianDigitsServer(dateObj.toLocaleDateString('fa-IR'));
  }
}

/**
 * Safely delete an uploaded file from `/uploads` if it is no longer referenced by any student or admin
 */
async function deleteUnreferencedUploadFile(avatarUrl?: string | null): Promise<boolean> {
  if (!avatarUrl || typeof avatarUrl !== 'string') return false;
  const cleanUrl = avatarUrl.split('?')[0].trim();
  if (!cleanUrl.startsWith('/uploads/')) return false;

  const fileName = path.basename(cleanUrl);
  if (!fileName) return false;

  const [studentRefs] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS cnt FROM `students` WHERE `avatar_url` LIKE ?',
    [`/uploads/${fileName}%`]
  );
  const [adminRefs] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS cnt FROM `admins` WHERE `avatar_url` LIKE ?',
    [`/uploads/${fileName}%`]
  );

  const totalRefs =
    Number(studentRefs[0]?.cnt || 0) + Number(adminRefs[0]?.cnt || 0);
  if (totalRefs > 0) {
    return false;
  }

  const fullPath = path.join(UPLOADS_DIR, fileName);
  if (fs.existsSync(fullPath)) {
    try {
      await fs.promises.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Verify that a student exists in MySQL and has `status === 'approved'`.
 */
async function verifyApprovedStudent(studentId: number): Promise<{
  allowed: boolean;
  httpStatus: number;
  code?: string;
  message?: string;
  studentRow?: RowDataPacket;
}> {
  if (!studentId || isNaN(studentId) || studentId <= 0) {
    return {
      allowed: false,
      httpStatus: 401,
      code: 'STUDENT_AUTH_REQUIRED',
      message: 'لطفاً ابتدا وارد حساب کاربری دانش‌آموزی خود شوید.',
    };
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM `students` WHERE `id` = ? LIMIT 1',
    [studentId]
  );
  if (rows.length === 0) {
    return {
      allowed: false,
      httpStatus: 404,
      code: 'STUDENT_NOT_FOUND',
      message: 'حساب کاربری دانش‌آموز در پایگاه داده یافت نشد.',
    };
  }

  const studentRow = rows[0];
  const stStatus = String(studentRow.status || 'pending');
  if (stStatus === 'pending') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'ACCOUNT_PENDING_APPROVAL',
      message:
        'حساب کاربری شما ثبت شده و در انتظار تأیید مدیر سامانه است. پس از تأیید مدیریت می‌توانید به پنل دانش‌آموزی دسترسی داشته باشید.',
    };
  }

  if (stStatus !== 'approved') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'ACCOUNT_REJECTED',
      message: 'درخواست عضویت حساب کاربری شما توسط مدیریت تأیید نشده است.',
    };
  }

  return {
    allowed: true,
    httpStatus: 200,
    studentRow,
  };
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * One-time automatic migration of any existing non-demo records from legacy `app_extended_state`
 * into the relational MySQL tables if the relational tables are currently empty.
 */
async function migrateLegacyExtendedStateOnce(): Promise<void> {
  const [settingsRows] = await pool.query<RowDataPacket[]>(
    "SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'app_extended_state' LIMIT 1"
  );
  if (settingsRows.length === 0) return;

  const rawJson = String(settingsRows[0].setting_value || '');
  const parsed = safeJsonParse<Record<string, unknown>>(rawJson, {});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Assignments
    const [hwCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `assignments`'
    );
    if (Number(hwCountRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.assignments)) {
      for (const a of parsed.assignments as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`assignments\`
            (\`id\`, \`title\`, \`description\`, \`class_code\`, \`target_student_id\`, \`target_student_name\`, \`due_date\`, \`max_score\`, \`attachment_name\`, \`attachment_url\`, \`status\`, \`closed_at\`, \`created_at_fa\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(a.id) || Date.now(),
            String(a.title || ''),
            String(a.description || ''),
            String(a.classCode || 'all'),
            a.targetStudentId ? Number(a.targetStudentId) : null,
            a.targetStudentName ? String(a.targetStudentName) : null,
            String(a.dueDate || ''),
            Number(a.maxScore ?? 20),
            String(a.attachmentName || ''),
            a.attachmentDataUrl ? String(a.attachmentDataUrl) : null,
            a.status === 'closed' ? 'closed' : 'active',
            a.closedAt ? String(a.closedAt) : null,
            formatServerPersianDateTime(new Date(), String(a.createdAt || '')),
          ]
        );
      }
    }

    // 2. Submissions
    const [subCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `assignment_submissions`'
    );
    if (Number(subCountRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.submissions)) {
      for (const s of parsed.submissions as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`assignment_submissions\`
            (\`id\`, \`assignment_id\`, \`student_id\`, \`student_name\`, \`class_code\`, \`file_name\`, \`file_content\`, \`file_url\`, \`submitted_at\`, \`score\`, \`teacher_feedback\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(s.id) || Date.now(),
            Number(s.assignmentId || 0),
            Number(s.studentId || 0),
            String(s.studentName || ''),
            String(s.classCode || ''),
            String(s.fileName || ''),
            String(s.fileContent || ''),
            s.fileDataUrl ? String(s.fileDataUrl) : null,
            formatServerPersianDateTime(new Date(), String(s.submittedAt || '')),
            s.score !== null && s.score !== undefined ? Number(s.score) : null,
            String(s.teacherFeedback || ''),
            s.status === 'graded' ? 'graded' : 'pending',
          ]
        );
      }
    }

    // 3. Resources
    const [resCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `educational_resources`'
    );
    if (Number(resCountRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.resources)) {
      for (const r of parsed.resources as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`educational_resources\`
            (\`id\`, \`title\`, \`category\`, \`class_code\`, \`target_student_id\`, \`target_student_name\`, \`url_or_filename\`, \`file_url\`, \`file_size\`, \`description\`, \`viewers_json\`, \`created_at\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(r.id) || Date.now(),
            String(r.title || ''),
            String(r.category || 'جزوه PDF'),
            String(r.classCode || 'all'),
            r.targetStudentId ? Number(r.targetStudentId) : null,
            r.targetStudentName ? String(r.targetStudentName) : null,
            String(r.urlOrFileName || ''),
            r.fileDataUrl ? String(r.fileDataUrl) : null,
            String(r.fileSize || 'فایل پیوست'),
            String(r.description || ''),
            JSON.stringify(Array.isArray(r.viewers) ? r.viewers : []),
            formatServerPersianDateTime(new Date(), String(r.createdAt || '')),
          ]
        );
      }
    }

    // 4. Announcements
    const [annCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `announcements`'
    );
    if (Number(annCountRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.announcements)) {
      for (const an of parsed.announcements as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`announcements\`
            (\`id\`, \`title\`, \`content\`, \`target_classes\`, \`target_student_id\`, \`target_student_name\`, \`assignment_id\`, \`notification_type\`, \`priority\`, \`created_at\`, \`readers_json\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(an.id) || Date.now(),
            String(an.title || ''),
            String(an.content || ''),
            String(an.targetClasses || 'all'),
            an.targetStudentId ? Number(an.targetStudentId) : null,
            an.targetStudentName ? String(an.targetStudentName) : null,
            an.assignmentId ? Number(an.assignmentId) : null,
            String(an.notificationType || 'general'),
            String(an.priority || 'عادی'),
            formatServerPersianDateTime(new Date(), String(an.createdAt || '')),
            JSON.stringify(Array.isArray(an.readers) ? an.readers : []),
          ]
        );
      }
    }

    // 5. Tickets & Ticket Messages
    const [tkCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `tickets`'
    );
    if (Number(tkCountRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.tickets)) {
      for (const tk of parsed.tickets as Array<Record<string, unknown>>) {
        const tkId = Number(tk.id) || Date.now();
        await conn.query(
          `INSERT IGNORE INTO \`tickets\`
            (\`id\`, \`student_id\`, \`student_name\`, \`student_phone\`, \`class_code\`, \`subject\`, \`priority\`, \`status\`, \`created_at\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tkId,
            Number(tk.studentId || 0),
            String(tk.studentName || ''),
            normalizeIranianPhoneServer(tk.studentPhone || ''),
            String(tk.classCode || ''),
            String(tk.subject || ''),
            String(tk.priority || 'عادی'),
            String(tk.status || 'در انتظار پاسخ'),
            formatServerPersianDateTime(new Date(), String(tk.createdAt || '')),
          ]
        );
        if (Array.isArray(tk.messages)) {
          for (const m of tk.messages as Array<Record<string, unknown>>) {
            await conn.query(
              `INSERT IGNORE INTO \`ticket_messages\`
                (\`id\`, \`ticket_id\`, \`sender_role\`, \`sender_name\`, \`message\`, \`sent_at\`, \`attachment_name\`, \`attachment_url\`)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                Number(m.id) || Date.now() + Math.floor(Math.random() * 1000),
                tkId,
                m.senderRole === 'admin' ? 'admin' : 'student',
                String(m.senderName || ''),
                String(m.message || ''),
                formatServerPersianDateTime(new Date(), String(m.sentAt || '')),
                m.attachmentName ? String(m.attachmentName) : null,
                m.attachmentDataUrl ? String(m.attachmentDataUrl) : null,
              ]
            );
          }
        }
      }
    }

    // 6. Gradebook Sessions & Entries
    const [gbSesRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `gradebook_sessions`'
    );
    if (Number(gbSesRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.gradebookSessions)) {
      for (const gs of parsed.gradebookSessions as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`gradebook_sessions\`
            (\`id\`, \`class_code\`, \`title\`, \`session_date\`, \`topic\`)
           VALUES (?, ?, ?, ?, ?)`,
          [
            Number(gs.id) || Date.now(),
            String(gs.classCode || '901'),
            String(gs.title || ''),
            String(gs.sessionDate || ''),
            String(gs.topic || ''),
          ]
        );
      }
    }

    const [gbEntRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM `gradebook_entries`'
    );
    if (Number(gbEntRows[0]?.cnt || 0) === 0 && Array.isArray(parsed.gradebookEntries)) {
      for (const ge of parsed.gradebookEntries as Array<Record<string, unknown>>) {
        await conn.query(
          `INSERT IGNORE INTO \`gradebook_entries\`
            (\`id\`, \`session_id\`, \`student_id\`, \`class_code\`, \`attendance\`, \`positive_count\`, \`negative_count\`, \`class_score\`, \`teacher_note\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(ge.id) || Date.now(),
            Number(ge.sessionId || 0),
            Number(ge.studentId || 0),
            String(ge.classCode || '901'),
            ge.attendance === 'absent' || ge.attendance === 'late' ? ge.attendance : 'present',
            Number(ge.positiveCount || 0),
            Number(ge.negativeCount || 0),
            ge.classScore !== null && ge.classScore !== undefined ? Number(ge.classScore) : null,
            String(ge.teacherNote || ''),
          ]
        );
      }
    }

    // Remove the legacy blob key so relational tables are the sole source of truth
    await conn.query(
      "DELETE FROM `system_settings` WHERE `setting_key` = 'app_extended_state'"
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[ScoolMeet] Error migrating legacy app_extended_state:', err);
  } finally {
    conn.release();
  }
}

/**
 * 0. Upload File Endpoint (POST /api/upload)
 */
app.post('/api/upload', async (req: Request, res: Response) => {
  try {
    const fileName = String(req.body?.fileName || 'attachment.bin').trim();
    const dataUrl = String(req.body?.dataUrl || '');

    if (!dataUrl || !dataUrl.startsWith('data:')) {
      res.status(400).json({
        success: false,
        message: 'فرمت فایل ارسالی نامعتبر است.',
      });
      return;
    }

    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      res.status(400).json({
        success: false,
        message: 'محتوای باینری فایل قابل استخراج نیست.',
      });
      return;
    }

    const base64Data = dataUrl.slice(commaIndex + 1);
    const buffer = Buffer.from(base64Data, 'base64');

    const [settingRows] = await pool.query<RowDataPacket[]>(
      "SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'maxUploadSizeMb' LIMIT 1"
    );
    const maxUploadMb = Math.max(
      1,
      Number(settingRows[0]?.setting_value || 25) || 25
    );
    const maxBytes = maxUploadMb * 1024 * 1024;

    if (buffer.byteLength > maxBytes) {
      res.status(413).json({
        success: false,
        message: `حجم فایل بیش از سقف مجاز سامانه (${maxUploadMb} مگابایت) است.`,
      });
      return;
    }

    const ext = path.extname(fileName).replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const base = path
      .basename(fileName, path.extname(fileName))
      .replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')
      .slice(0, 50);
    const storedFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${base || 'file'}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, storedFileName);

    await fs.promises.writeFile(targetPath, buffer);

    const sizeMb = Math.round((buffer.byteLength / (1024 * 1024)) * 100) / 100;
    const formattedSize =
      sizeMb >= 0.1
        ? `${sizeMb} مگابایت`
        : `${Math.max(1, Math.round(buffer.byteLength / 1024))} کیلوبایت`;

    res.json({
      success: true,
      fileName,
      fileUrl: `/uploads/${storedFileName}`,
      fileSize: formattedSize,
      bytes: buffer.byteLength,
      message: 'فایل با موفقیت در سرور ذخیره گردید.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در ذخیره فایل روی سرور.',
    });
  }
});

/**
 * 1. Health & Database Connection Verification Endpoint
 * GET /api/test-db
 */
app.get('/api/test-db', async (_req: Request, res: Response) => {
  const result = await testDatabaseConnection();
  const info = getDbInfo();

  if (result.connected) {
    res.json({
      success: true,
      connected: true,
      database: info.database,
      host: info.host,
      port: info.port,
      message: `اتصال بک‌اند Node.js به پایگاه داده MySQL (${info.database}) برقرار است.`,
    });
  } else {
    res.status(500).json({
      success: false,
      connected: false,
      database: info.database,
      host: info.host,
      port: info.port,
      error: result.error,
      message:
        'خطا در اتصال به دیتابیس MySQL. لطفاً روشن بودن سرویس MySQL و تنظیمات فایل .env را بررسی کنید.',
    });
  }
});

/**
 * 2. Full Relational Application State Endpoint (GET /api/state)
 * Reconstructs application state directly from relational MySQL tables.
 * Enforces student approval (`status === 'approved'`) and scopes student data when called by a student.
 */
app.get('/api/state', async (req: Request, res: Response) => {
  try {
    await migrateLegacyExtendedStateOnce();

    const callerRole = String(req.headers['x-user-role'] || req.query.role || '').trim();
    const callerStudentId = Number(
      req.headers['x-student-id'] || req.query.studentId || 0
    );

    let scopedStudentRow: RowDataPacket | null = null;
    if (callerRole === 'student') {
      const check = await verifyApprovedStudent(callerStudentId);
      if (!check.allowed) {
        res.status(check.httpStatus).json({
          success: false,
          code: check.code,
          message: check.message,
        });
        return;
      }
      scopedStudentRow = check.studentRow || null;
    }

    await ensureDefaultClassesSeeded();

    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `admins` ORDER BY `id` ASC LIMIT 1'
    );
    const [classRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `classes` ORDER BY `code` ASC'
    );
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `students` ORDER BY `id` DESC'
    );
    const [assignmentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `assignments` ORDER BY `id` DESC'
    );
    const [submissionRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `assignment_submissions` ORDER BY `id` DESC'
    );
    const [resourceRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `educational_resources` ORDER BY `id` DESC'
    );
    const [announcementRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `announcements` ORDER BY `id` DESC'
    );
    const [ticketRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `tickets` ORDER BY `id` DESC'
    );
    const [ticketMessageRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `ticket_messages` ORDER BY `id` ASC'
    );
    const [gbSessionRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `gradebook_sessions` ORDER BY `id` ASC'
    );
    const [gbEntryRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `gradebook_entries` ORDER BY `id` ASC'
    );
    const [activityRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `activity_logs` ORDER BY `id` DESC LIMIT 50'
    );
    const [settingRows] = await pool.query<RowDataPacket[]>(
      "SELECT `setting_key`, `setting_value` FROM `system_settings` WHERE `setting_key` != 'app_extended_state'"
    );

    const adminRow = adminRows[0];
    const admin = adminRow
      ? {
          firstName: String(adminRow.first_name || ''),
          lastName: String(adminRow.last_name || ''),
          phone: normalizeIranianPhoneServer(adminRow.phone || ''),
          email: String(adminRow.email || ''),
          roleTitle: String(adminRow.role_title || ''),
          bio: String(adminRow.bio || ''),
          password: '',
          avatarUrl: String(adminRow.avatar_url || ''),
        }
      : {
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          roleTitle: '',
          bio: '',
          password: '',
          avatarUrl: '',
        };

    const classes = classRows.map((c) => ({
      code: String(c.code),
      title: String(c.title || ''),
      gradeLevel: String(c.grade_level || ''),
      instructorName: String(c.instructor_name || ''),
      capacity: Number(c.capacity) || 30,
      roomOrLink: String(c.room_or_link || ''),
      scheduleSummary: String(c.schedule_summary || ''),
      description: String(c.description || ''),
    }));

    // Build student lookup map for resolving recipient names & submission student names
    const studentMap = new Map<
      number,
      {
        id: number;
        firstName: string;
        lastName: string;
        phone: string;
        email: string;
        bio: string;
        classCode: string;
        status: string;
        notes: string;
        avatarUrl: string;
        avatarRemoved: boolean;
        createdAt: string;
      }
    >();

    const allStudents = studentRows.map((s) => {
      const mapped = {
        id: Number(s.id),
        firstName: String(s.first_name || ''),
        lastName: String(s.last_name || ''),
        phone: normalizeIranianPhoneServer(s.phone || ''),
        email: String(s.email || ''),
        bio: String(s.bio || ''),
        classCode: String(s.class_code ?? ''),
        status: String(s.status || 'pending'),
        notes: String(s.notes || ''),
        avatarUrl: s.avatar_removed ? '' : String(s.avatar_url || ''),
        avatarRemoved: Boolean(s.avatar_removed),
        createdAt: formatServerPersianDateOnly(s.created_at),
      };
      studentMap.set(mapped.id, mapped);
      return mapped;
    });

    const allAssignments = assignmentRows.map((a) => {
      const targetStId = a.target_student_id ? Number(a.target_student_id) : undefined;
      const targetStObj = targetStId ? studentMap.get(targetStId) : undefined;
      const targetStName = targetStObj
        ? `${targetStObj.firstName} ${targetStObj.lastName}`.trim()
        : a.target_student_name
        ? String(a.target_student_name)
        : undefined;

      return {
        id: Number(a.id),
        title: String(a.title || ''),
        description: String(a.description || ''),
        classCode: String(a.class_code || 'all'),
        targetStudentId: targetStId,
        targetStudentName: targetStName,
        dueDate: String(a.due_date || ''),
        maxScore: Number(a.max_score ?? 20),
        attachmentName: String(a.attachment_name || ''),
        attachmentDataUrl: a.attachment_url ? String(a.attachment_url) : undefined,
        status: (a.status === 'closed' ? 'closed' : 'active') as 'active' | 'closed',
        closedAt: a.closed_at ? String(a.closed_at) : undefined,
        createdAt: formatServerPersianDateTime(a.created_at, a.created_at_fa),
      };
    });

    const allSubmissions = submissionRows.map((sub) => {
      const stId = Number(sub.student_id);
      const stObj = studentMap.get(stId);
      const stName =
        String(sub.student_name || '').trim() ||
        (stObj ? `${stObj.firstName} ${stObj.lastName}`.trim() : 'دانش‌آموز');
      const clsCode =
        String(sub.class_code || '').trim() || (stObj ? stObj.classCode : '');

      return {
        id: Number(sub.id),
        assignmentId: Number(sub.assignment_id),
        studentId: stId,
        studentName: stName,
        classCode: clsCode,
        fileName: String(sub.file_name || ''),
        fileContent: String(sub.file_content || ''),
        fileDataUrl: sub.file_url ? String(sub.file_url) : undefined,
        submittedAt: formatServerPersianDateTime(sub.created_at_ts, sub.submitted_at),
        score:
          sub.score !== null && sub.score !== undefined ? Number(sub.score) : null,
        teacherFeedback: String(sub.teacher_feedback || ''),
        status: (sub.status === 'graded' ? 'graded' : 'pending') as
          | 'pending'
          | 'graded',
      };
    });

    const allResources = resourceRows.map((r) => {
      const targetStId = r.target_student_id ? Number(r.target_student_id) : undefined;
      const targetStObj = targetStId ? studentMap.get(targetStId) : undefined;
      const targetStName = targetStObj
        ? `${targetStObj.firstName} ${targetStObj.lastName}`.trim()
        : r.target_student_name
        ? String(r.target_student_name)
        : undefined;

      return {
        id: Number(r.id),
        title: String(r.title || ''),
        category: String(r.category || 'جزوه PDF'),
        classCode: String(r.class_code || 'all'),
        targetStudentId: targetStId,
        targetStudentName: targetStName,
        urlOrFileName: String(r.url_or_filename || ''),
        fileDataUrl: r.file_url ? String(r.file_url) : undefined,
        fileSize: String(r.file_size || 'فایل پیوست'),
        description: String(r.description || ''),
        createdAt: formatServerPersianDateTime(r.created_at_ts, r.created_at),
        viewers: safeJsonParse<Array<Record<string, unknown>>>(r.viewers_json, []),
      };
    });

    const allAnnouncements = announcementRows.map((an) => {
      const targetStId = an.target_student_id
        ? Number(an.target_student_id)
        : undefined;
      const targetStObj = targetStId ? studentMap.get(targetStId) : undefined;
      const targetStName = targetStObj
        ? `${targetStObj.firstName} ${targetStObj.lastName}`.trim()
        : an.target_student_name
        ? String(an.target_student_name)
        : undefined;

      return {
        id: Number(an.id),
        title: String(an.title || ''),
        content: String(an.content || ''),
        targetClasses: String(an.target_classes || 'all'),
        targetStudentId: targetStId,
        targetStudentName: targetStName,
        assignmentId: an.assignment_id ? Number(an.assignment_id) : undefined,
        notificationType: String(an.notification_type || 'general'),
        priority: String(an.priority || 'عادی'),
        createdAt: formatServerPersianDateTime(an.created_at_ts, an.created_at),
        readers: safeJsonParse<Array<Record<string, unknown>>>(
          an.readers_json,
          []
        ),
      };
    });

    const messagesByTicketId = new Map<number, Array<Record<string, unknown>>>();
    for (const m of ticketMessageRows) {
      const tId = Number(m.ticket_id);
      if (!messagesByTicketId.has(tId)) {
        messagesByTicketId.set(tId, []);
      }
      messagesByTicketId.get(tId)!.push({
        id: Number(m.id),
        senderRole: m.sender_role === 'admin' ? 'admin' : 'student',
        senderName: String(m.sender_name || ''),
        message: String(m.message || ''),
        sentAt: formatServerPersianDateTime(m.created_at_ts, m.sent_at),
        attachmentName: m.attachment_name ? String(m.attachment_name) : undefined,
        attachmentDataUrl: m.attachment_url
          ? String(m.attachment_url)
          : undefined,
      });
    }

    const allTickets = ticketRows.map((tk) => {
      const stId = Number(tk.student_id);
      const stObj = studentMap.get(stId);
      const stName =
        String(tk.student_name || '').trim() ||
        (stObj ? `${stObj.firstName} ${stObj.lastName}`.trim() : 'دانش‌آموز');
      const stPhone =
        normalizeIranianPhoneServer(tk.student_phone || '') ||
        (stObj ? stObj.phone : '');
      const clsCode =
        String(tk.class_code || '').trim() || (stObj ? stObj.classCode : '');

      return {
        id: Number(tk.id),
        studentId: stId,
        studentName: stName,
        studentPhone: stPhone,
        classCode: clsCode,
        subject: String(tk.subject || ''),
        priority: String(tk.priority || 'عادی'),
        status: String(tk.status || 'در انتظار پاسخ'),
        createdAt: formatServerPersianDateTime(tk.created_at_ts, tk.created_at),
        messages: messagesByTicketId.get(Number(tk.id)) || [],
      };
    });

    const allGradebookSessions = gbSessionRows.map((gs) => ({
      id: Number(gs.id),
      classCode: String(gs.class_code || '901'),
      title: String(gs.title || ''),
      sessionDate: String(gs.session_date || ''),
      topic: String(gs.topic || ''),
    }));

    const allGradebookEntries = gbEntryRows.map((ge) => ({
      id: Number(ge.id),
      sessionId: Number(ge.session_id),
      studentId: Number(ge.student_id),
      classCode: String(ge.class_code || '901'),
      attendance: String(ge.attendance || 'present'),
      positiveCount: Number(ge.positive_count || 0),
      negativeCount: Number(ge.negative_count || 0),
      classScore:
        ge.class_score !== null && ge.class_score !== undefined
          ? Number(ge.class_score)
          : null,
      teacherNote: String(ge.teacher_note || ''),
    }));

    const allActivities = activityRows.map((act) => ({
      id: Number(act.id),
      title: String(act.title || ''),
      detail: String(act.detail || ''),
      timeAgo: formatServerPersianDateTime(act.created_at, act.time_ago),
      category: String(act.category || 'student'),
    }));

    const settingsMap: Record<string, string> = {};
    settingRows.forEach((row) => {
      settingsMap[String(row.setting_key)] = String(row.setting_value ?? '');
    });

    const settings = {
      platformName: settingsMap.platformName || 'پلتفرم آموزشی اسکول میت',
      academicYear: settingsMap.academicYear || '۱۴۰۵–۱۴۰۶',
      allowNewRegistrations:
        settingsMap.allowNewRegistrations !== undefined
          ? settingsMap.allowNewRegistrations === 'true'
          : true,
      requireAdminApproval:
        settingsMap.requireAdminApproval !== undefined
          ? settingsMap.requireAdminApproval === 'true'
          : true,
      maxUploadSizeMb: Number(settingsMap.maxUploadSizeMb) || 15,
      supportPhone: settingsMap.supportPhone || admin.phone || '',
    };

    // If requested by an approved student, strictly scope the returned data to that student
    if (callerRole === 'student' && scopedStudentRow) {
      const myId = Number(scopedStudentRow.id);
      const myClassCode = String(scopedStudentRow.class_code || '');

      const myStudentList = allStudents.filter((s) => s.id === myId);
      const myAssignments = allAssignments.filter((a) => {
        if (a.targetStudentId && Number(a.targetStudentId) > 0) {
          return Number(a.targetStudentId) === myId;
        }
        return a.classCode === 'all' || a.classCode === myClassCode;
      });
      const mySubmissions = allSubmissions.filter((s) => s.studentId === myId);
      const myResources = allResources.filter((r) => {
        if (r.targetStudentId && Number(r.targetStudentId) > 0) {
          return Number(r.targetStudentId) === myId;
        }
        return r.classCode === 'all' || r.classCode === myClassCode;
      });
      const myAnnouncements = allAnnouncements.filter((an) => {
        if (an.targetStudentId && Number(an.targetStudentId) > 0) {
          return Number(an.targetStudentId) === myId;
        }
        return an.targetClasses === 'all' || an.targetClasses === myClassCode;
      });
      const myTickets = allTickets.filter((t) => t.studentId === myId);
      const myGradebookEntries = allGradebookEntries.filter(
        (e) => e.studentId === myId
      );
      const myGradebookSessions = allGradebookSessions.filter(
        (gs) => gs.classCode === myClassCode
      );

      res.json({
        success: true,
        serverNowMs: Date.now(),
        state: {
          admin: {
            firstName: admin.firstName,
            lastName: admin.lastName,
            phone: '',
            email: '',
            roleTitle: admin.roleTitle,
            bio: admin.bio,
            password: '',
            avatarUrl: admin.avatarUrl,
          },
          activeStudentId: myId,
          classes,
          students: myStudentList,
          gradebookSessions: myGradebookSessions,
          gradebookEntries: myGradebookEntries,
          assignments: myAssignments,
          submissions: mySubmissions,
          resources: myResources,
          announcements: myAnnouncements,
          tickets: myTickets,
          activities: [],
          settings,
        },
      });
      return;
    }

    res.json({
      success: true,
      serverNowMs: Date.now(),
      state: {
        admin,
        activeStudentId: allStudents[0]?.id || 0,
        classes,
        students: allStudents,
        gradebookSessions: allGradebookSessions,
        gradebookEntries: allGradebookEntries,
        assignments: allAssignments,
        submissions: allSubmissions,
        resources: allResources,
        announcements: allAnnouncements,
        tickets: allTickets,
        activities: allActivities,
        settings,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطا در خواندن وضعیت سامانه از پایگاه داده MySQL.',
    });
  }
});

/**
 * 3. Persist Application State to MySQL Relational Tables (POST /api/state)
 */
app.post('/api/state', async (req: Request, res: Response) => {
  const incomingState = req.body?.state;
  const callerRole = String(req.headers['x-user-role'] || req.body?.role || '').trim();
  const callerStudentId = Number(
    req.headers['x-student-id'] || incomingState?.activeStudentId || 0
  );

  if (!incomingState) {
    res.status(400).json({
      success: false,
      message: 'داده‌های ارسالی برای ذخیره‌سازی معتبر نیست.',
    });
    return;
  }

  // When called by a student, verify approval and only persist student-authorized updates
  if (callerRole === 'student') {
    const check = await verifyApprovedStudent(callerStudentId);
    if (!check.allowed || !check.studentRow) {
      res.status(check.httpStatus).json({
        success: false,
        code: check.code,
        message: check.message,
      });
      return;
    }

    const myId = Number(check.studentRow.id);
    const myFullName = `${String(check.studentRow.first_name || '')} ${String(check.studentRow.last_name || '')}`.trim();
    const myPhone = normalizeIranianPhoneServer(check.studentRow.phone || '');
    const myClassCode = String(check.studentRow.class_code || '');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Sync student's announcement read status
      if (Array.isArray(incomingState.announcements)) {
        for (const an of incomingState.announcements) {
          const annId = Number(an.id);
          if (!annId) continue;
          const incomingReaders = Array.isArray(an.readers) ? an.readers : [];
          const myReadEntry = incomingReaders.find(
            (r: { studentId?: number }) => Number(r.studentId) === myId
          );
          if (myReadEntry) {
            const [existingRows] = await conn.query<RowDataPacket[]>(
              'SELECT `readers_json` FROM `announcements` WHERE `id` = ? LIMIT 1',
              [annId]
            );
            if (existingRows.length > 0) {
              const currentReaders = safeJsonParse<
                Array<{
                  studentId: number;
                  studentName: string;
                  classCode: string;
                  readAt: string;
                }>
              >(existingRows[0].readers_json, []);
              if (!currentReaders.some((r) => Number(r.studentId) === myId)) {
                currentReaders.push({
                  studentId: myId,
                  studentName: myFullName,
                  classCode: myClassCode,
                  readAt: formatServerPersianDateTime(new Date()),
                });
                await conn.query(
                  'UPDATE `announcements` SET `readers_json` = ? WHERE `id` = ?',
                  [JSON.stringify(currentReaders), annId]
                );
              }
            }
          }
        }
      }

      // 2. Sync student's educational resource view status
      if (Array.isArray(incomingState.resources)) {
        for (const resItem of incomingState.resources) {
          const resId = Number(resItem.id);
          if (!resId) continue;
          const incomingViewers = Array.isArray(resItem.viewers)
            ? resItem.viewers
            : [];
          const myViewEntry = incomingViewers.find(
            (v: { studentId?: number }) => Number(v.studentId) === myId
          );
          if (myViewEntry) {
            const [existingRows] = await conn.query<RowDataPacket[]>(
              'SELECT `viewers_json` FROM `educational_resources` WHERE `id` = ? LIMIT 1',
              [resId]
            );
            if (existingRows.length > 0) {
              const currentViewers = safeJsonParse<
                Array<{
                  studentId: number;
                  studentName: string;
                  classCode: string;
                  viewedAt: string;
                }>
              >(existingRows[0].viewers_json, []);
              if (!currentViewers.some((v) => Number(v.studentId) === myId)) {
                currentViewers.push({
                  studentId: myId,
                  studentName: myFullName,
                  classCode: myClassCode,
                  viewedAt: formatServerPersianDateTime(new Date()),
                });
                await conn.query(
                  'UPDATE `educational_resources` SET `viewers_json` = ? WHERE `id` = ?',
                  [JSON.stringify(currentViewers), resId]
                );
              }
            }
          }
        }
      }

      // 3. Sync any new ticket created by this student
      if (Array.isArray(incomingState.tickets)) {
        for (const tk of incomingState.tickets) {
          if (Number(tk.studentId) !== myId) continue;
          const tkId = Number(tk.id);
          if (!tkId) continue;

          const [existingTk] = await conn.query<RowDataPacket[]>(
            'SELECT `id`, `status` FROM `tickets` WHERE `id` = ? LIMIT 1',
            [tkId]
          );
          if (existingTk.length === 0) {
            const nowFa = formatServerPersianDateTime(new Date());
            await conn.query(
              `INSERT INTO \`tickets\`
                (\`id\`, \`student_id\`, \`student_name\`, \`student_phone\`, \`class_code\`, \`subject\`, \`priority\`, \`status\`, \`created_at\`)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'در انتظار پاسخ', ?)`,
              [
                tkId,
                myId,
                myFullName,
                myPhone,
                myClassCode,
                String(tk.subject || '').trim(),
                String(tk.priority || 'عادی'),
                nowFa,
              ]
            );

            if (Array.isArray(tk.messages)) {
              for (const msg of tk.messages) {
                await conn.query(
                  `INSERT INTO \`ticket_messages\`
                    (\`id\`, \`ticket_id\`, \`sender_role\`, \`sender_name\`, \`message\`, \`sent_at\`, \`attachment_name\`, \`attachment_url\`)
                   VALUES (?, ?, 'student', ?, ?, ?, ?, ?)`,
                  [
                    Number(msg.id) || Date.now(),
                    tkId,
                    myFullName,
                    String(msg.message || '').trim(),
                    nowFa,
                    msg.attachmentName ? String(msg.attachmentName) : null,
                    msg.attachmentDataUrl ? String(msg.attachmentDataUrl) : null,
                  ]
                );
              }
            }
          }
        }
      }

      await conn.commit();
      res.json({
        success: true,
        message: 'اطلاعات شما با موفقیت در پایگاه داده MySQL ثبت گردید.',
      });
      return;
    } catch (err) {
      await conn.rollback();
      res.status(500).json({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'خطا در ذخیره‌سازی اطلاعات دانش‌آموز در پایگاه داده.',
      });
      return;
    } finally {
      conn.release();
    }
  }

  // Admin state synchronization across relational MySQL tables
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Update Admin Profile if provided
    if (incomingState.admin) {
      const a = incomingState.admin;
      const adminPhone = normalizeIranianPhoneServer(a.phone || '');
      const [existingAdmins] = await conn.query<RowDataPacket[]>(
        'SELECT `id`, `password_hash`, `avatar_url` FROM `admins` ORDER BY `id` ASC LIMIT 1'
      );

      if (existingAdmins.length > 0 && adminPhone) {
        const adminId = existingAdmins[0].id;
        const previousAvatarUrl = String(existingAdmins[0].avatar_url || '');
        const nextAvatarUrl = String(a.avatarUrl || '');
        let passwordHash = String(existingAdmins[0].password_hash);
        if (a.password && String(a.password).trim().length >= 6) {
          passwordHash = await bcrypt.hash(String(a.password).trim(), 10);
        }

        await conn.query(
          `UPDATE \`admins\`
           SET \`first_name\` = ?, \`last_name\` = ?, \`phone\` = ?, \`email\` = ?, \`role_title\` = ?, \`bio\` = ?, \`avatar_url\` = ?, \`password_hash\` = ?
           WHERE \`id\` = ?`,
          [
            String(a.firstName || '').trim(),
            String(a.lastName || '').trim(),
            adminPhone,
            String(a.email || '').trim(),
            String(a.roleTitle || '').trim(),
            String(a.bio || '').trim(),
            nextAvatarUrl,
            passwordHash,
            adminId,
          ]
        );

        if (previousAvatarUrl && previousAvatarUrl !== nextAvatarUrl) {
          setImmediate(() => {
            void deleteUnreferencedUploadFile(previousAvatarUrl);
          });
        }
      }
    }

    // 2. Sync Classes (never delete required default classes 901, 902, 903 via bulk state sync)
    if (Array.isArray(incomingState.classes)) {
      const incomingCodes = incomingState.classes
        .map((c: { code?: string }) => String(c.code || '').trim())
        .filter(Boolean);

      const protectedCodes = Array.from(
        new Set([...REQUIRED_DEFAULT_CLASS_CODES, ...incomingCodes])
      );
      if (incomingCodes.length > 0 && protectedCodes.length > 0) {
        const placeholders = protectedCodes.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`classes\` WHERE \`code\` NOT IN (${placeholders})`,
          protectedCodes
        );
      }

      for (const c of incomingState.classes) {
        const code = String(c.code || '').trim();
        if (!code) continue;
        await conn.query(
          `INSERT INTO \`classes\` (\`code\`, \`title\`, \`grade_level\`, \`instructor_name\`, \`capacity\`, \`room_or_link\`, \`schedule_summary\`, \`description\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`title\` = VALUES(\`title\`),
             \`grade_level\` = VALUES(\`grade_level\`),
             \`instructor_name\` = VALUES(\`instructor_name\`),
             \`capacity\` = VALUES(\`capacity\`),
             \`room_or_link\` = VALUES(\`room_or_link\`),
             \`schedule_summary\` = VALUES(\`schedule_summary\`),
             \`description\` = VALUES(\`description\`)`,
          [
            code,
            String(c.title || ''),
            String(c.gradeLevel || 'پایه نهم'),
            String(c.instructorName || ''),
            Number(c.capacity) || 30,
            String(c.roomOrLink || ''),
            String(c.scheduleSummary || ''),
            String(c.description || ''),
          ]
        );
      }

      await ensureDefaultClassesSeeded(conn);
    }

    // 3. Sync Students
    if (Array.isArray(incomingState.students)) {
      const [existingStudents] = await conn.query<RowDataPacket[]>(
        'SELECT `id`, `phone`, `email`, `bio`, `password_hash`, `avatar_url`, `avatar_removed` FROM `students`'
      );
      const existingById = new Map<number, RowDataPacket>();
      const existingByPhone = new Map<string, RowDataPacket>();
      existingStudents.forEach((row) => {
        existingById.set(Number(row.id), row);
        existingByPhone.set(normalizeIranianPhoneServer(row.phone), row);
      });

      const keptIds: number[] = [];

      for (const st of incomingState.students) {
        const phone = normalizeIranianPhoneServer(st.phone || '');
        if (!phone) continue;

        const existing =
          existingById.get(Number(st.id)) || existingByPhone.get(phone);
        let passwordHash = existing
          ? String(existing.password_hash)
          : await bcrypt.hash('123456', 10);

        if (st.password && String(st.password).trim().length >= 6) {
          passwordHash = await bcrypt.hash(String(st.password).trim(), 10);
        }

        const validStatus =
          st.status === 'approved' || st.status === 'rejected'
            ? st.status
            : 'pending';

        const avatarRemoved = Boolean(st.avatarRemoved);
        const avatarUrl = avatarRemoved ? null : st.avatarUrl || null;
        const emailVal =
          st.email !== undefined
            ? normalizeDigitsServer(st.email).trim()
            : String(existing?.email || '');
        const bioVal =
          st.bio !== undefined
            ? String(st.bio).trim()
            : String(existing?.bio || '');

        if (existing) {
          await conn.query(
            `UPDATE \`students\`
             SET \`first_name\` = ?, \`last_name\` = ?, \`phone\` = ?, \`email\` = ?, \`class_code\` = ?, \`status\` = ?, \`notes\` = ?, \`bio\` = ?, \`avatar_url\` = ?, \`avatar_removed\` = ?, \`password_hash\` = ?
             WHERE \`id\` = ?`,
            [
              String(st.firstName || '').trim(),
              String(st.lastName || '').trim(),
              phone,
              emailVal,
              String(st.classCode ?? ''),
              validStatus,
              String(st.notes || ''),
              bioVal,
              avatarUrl,
              avatarRemoved ? 1 : 0,
              passwordHash,
              existing.id,
            ]
          );
          keptIds.push(Number(existing.id));
        } else {
          const [insertResult] = await conn.query<ResultSetHeader>(
            `INSERT INTO \`students\` (\`first_name\`, \`last_name\`, \`phone\`, \`email\`, \`class_code\`, \`status\`, \`notes\`, \`bio\`, \`avatar_url\`, \`avatar_removed\`, \`password_hash\`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              String(st.firstName || '').trim(),
              String(st.lastName || '').trim(),
              phone,
              emailVal,
              String(st.classCode ?? ''),
              validStatus,
              String(st.notes || ''),
              bioVal,
              avatarUrl,
              avatarRemoved ? 1 : 0,
              passwordHash,
            ]
          );
          keptIds.push(Number(insertResult.insertId));
        }
      }

      if (keptIds.length > 0) {
        const placeholders = keptIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`students\` WHERE \`id\` NOT IN (${placeholders})`,
          keptIds
        );
      } else {
        await conn.query('DELETE FROM `students`');
      }
    }

    // 4. Sync Assignments in relational `assignments` table
    if (Array.isArray(incomingState.assignments)) {
      const keptHwIds: number[] = [];
      for (const a of incomingState.assignments) {
        const hwId = Number(a.id) || Date.now();
        keptHwIds.push(hwId);
        const createdFa = formatServerPersianDateTime(new Date(), a.createdAt);
        await conn.query(
          `INSERT INTO \`assignments\`
            (\`id\`, \`title\`, \`description\`, \`class_code\`, \`target_student_id\`, \`target_student_name\`, \`due_date\`, \`max_score\`, \`attachment_name\`, \`attachment_url\`, \`status\`, \`closed_at\`, \`created_at_fa\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`title\` = VALUES(\`title\`),
             \`description\` = VALUES(\`description\`),
             \`class_code\` = VALUES(\`class_code\`),
             \`target_student_id\` = VALUES(\`target_student_id\`),
             \`target_student_name\` = VALUES(\`target_student_name\`),
             \`due_date\` = VALUES(\`due_date\`),
             \`max_score\` = VALUES(\`max_score\`),
             \`attachment_name\` = VALUES(\`attachment_name\`),
             \`attachment_url\` = VALUES(\`attachment_url\`),
             \`status\` = VALUES(\`status\`),
             \`closed_at\` = VALUES(\`closed_at\`)`,
          [
            hwId,
            String(a.title || ''),
            String(a.description || ''),
            String(a.classCode || 'all'),
            a.targetStudentId ? Number(a.targetStudentId) : null,
            a.targetStudentName ? String(a.targetStudentName) : null,
            String(a.dueDate || ''),
            Number(a.maxScore ?? 20),
            String(a.attachmentName || ''),
            a.attachmentDataUrl ? String(a.attachmentDataUrl) : null,
            a.status === 'closed' ? 'closed' : 'active',
            a.closedAt ? String(a.closedAt) : null,
            createdFa,
          ]
        );
      }

      if (keptHwIds.length > 0) {
        const placeholders = keptHwIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`assignments\` WHERE \`id\` NOT IN (${placeholders})`,
          keptHwIds
        );
      } else {
        await conn.query('DELETE FROM `assignments`');
      }
    }

    // 5. Sync Assignment Submissions in relational `assignment_submissions` table
    if (Array.isArray(incomingState.submissions)) {
      const keptSubIds: number[] = [];
      for (const s of incomingState.submissions) {
        const subId = Number(s.id) || Date.now();
        keptSubIds.push(subId);
        const submittedFa = formatServerPersianDateTime(
          new Date(),
          s.submittedAt
        );
        await conn.query(
          `INSERT INTO \`assignment_submissions\`
            (\`id\`, \`assignment_id\`, \`student_id\`, \`student_name\`, \`class_code\`, \`file_name\`, \`file_content\`, \`file_url\`, \`submitted_at\`, \`score\`, \`teacher_feedback\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`file_name\` = VALUES(\`file_name\`),
             \`file_content\` = VALUES(\`file_content\`),
             \`file_url\` = VALUES(\`file_url\`),
             \`score\` = VALUES(\`score\`),
             \`teacher_feedback\` = VALUES(\`teacher_feedback\`),
             \`status\` = VALUES(\`status\`)`,
          [
            subId,
            Number(s.assignmentId || 0),
            Number(s.studentId || 0),
            String(s.studentName || ''),
            String(s.classCode || ''),
            String(s.fileName || ''),
            String(s.fileContent || ''),
            s.fileDataUrl ? String(s.fileDataUrl) : null,
            submittedFa,
            s.score !== null && s.score !== undefined ? Number(s.score) : null,
            String(s.teacherFeedback || ''),
            s.status === 'graded' ? 'graded' : 'pending',
          ]
        );
      }

      if (keptSubIds.length > 0) {
        const placeholders = keptSubIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`assignment_submissions\` WHERE \`id\` NOT IN (${placeholders})`,
          keptSubIds
        );
      } else {
        await conn.query('DELETE FROM `assignment_submissions`');
      }
    }

    // 6. Sync Educational Resources in relational `educational_resources` table
    if (Array.isArray(incomingState.resources)) {
      const keptResIds: number[] = [];
      for (const r of incomingState.resources) {
        const resId = Number(r.id) || Date.now();
        keptResIds.push(resId);
        const createdFa = formatServerPersianDateTime(new Date(), r.createdAt);
        await conn.query(
          `INSERT INTO \`educational_resources\`
            (\`id\`, \`title\`, \`category\`, \`class_code\`, \`target_student_id\`, \`target_student_name\`, \`url_or_filename\`, \`file_url\`, \`file_size\`, \`description\`, \`viewers_json\`, \`created_at\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`title\` = VALUES(\`title\`),
             \`category\` = VALUES(\`category\`),
             \`class_code\` = VALUES(\`class_code\`),
             \`target_student_id\` = VALUES(\`target_student_id\`),
             \`target_student_name\` = VALUES(\`target_student_name\`),
             \`url_or_filename\` = VALUES(\`url_or_filename\`),
             \`file_url\` = VALUES(\`file_url\`),
             \`file_size\` = VALUES(\`file_size\`),
             \`description\` = VALUES(\`description\`),
             \`viewers_json\` = VALUES(\`viewers_json\`)`,
          [
            resId,
            String(r.title || ''),
            String(r.category || 'جزوه PDF'),
            String(r.classCode || 'all'),
            r.targetStudentId ? Number(r.targetStudentId) : null,
            r.targetStudentName ? String(r.targetStudentName) : null,
            String(r.urlOrFileName || ''),
            r.fileDataUrl ? String(r.fileDataUrl) : null,
            String(r.fileSize || 'فایل پیوست'),
            String(r.description || ''),
            JSON.stringify(Array.isArray(r.viewers) ? r.viewers : []),
            createdFa,
          ]
        );
      }

      if (keptResIds.length > 0) {
        const placeholders = keptResIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`educational_resources\` WHERE \`id\` NOT IN (${placeholders})`,
          keptResIds
        );
      } else {
        await conn.query('DELETE FROM `educational_resources`');
      }
    }

    // 7. Sync Announcements in relational `announcements` table
    if (Array.isArray(incomingState.announcements)) {
      const keptAnnIds: number[] = [];
      for (const an of incomingState.announcements) {
        const annId = Number(an.id) || Date.now();
        keptAnnIds.push(annId);
        const createdFa = formatServerPersianDateTime(new Date(), an.createdAt);
        await conn.query(
          `INSERT INTO \`announcements\`
            (\`id\`, \`title\`, \`content\`, \`target_classes\`, \`target_student_id\`, \`target_student_name\`, \`assignment_id\`, \`notification_type\`, \`priority\`, \`created_at\`, \`readers_json\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`title\` = VALUES(\`title\`),
             \`content\` = VALUES(\`content\`),
             \`target_classes\` = VALUES(\`target_classes\`),
             \`target_student_id\` = VALUES(\`target_student_id\`),
             \`target_student_name\` = VALUES(\`target_student_name\`),
             \`assignment_id\` = VALUES(\`assignment_id\`),
             \`notification_type\` = VALUES(\`notification_type\`),
             \`priority\` = VALUES(\`priority\`),
             \`readers_json\` = VALUES(\`readers_json\`)`,
          [
            annId,
            String(an.title || ''),
            String(an.content || ''),
            String(an.targetClasses || 'all'),
            an.targetStudentId ? Number(an.targetStudentId) : null,
            an.targetStudentName ? String(an.targetStudentName) : null,
            an.assignmentId ? Number(an.assignmentId) : null,
            String(an.notificationType || 'general'),
            String(an.priority || 'عادی'),
            createdFa,
            JSON.stringify(Array.isArray(an.readers) ? an.readers : []),
          ]
        );
      }

      if (keptAnnIds.length > 0) {
        const placeholders = keptAnnIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`announcements\` WHERE \`id\` NOT IN (${placeholders})`,
          keptAnnIds
        );
      } else {
        await conn.query('DELETE FROM `announcements`');
      }
    }

    // 8. Sync Tickets & Ticket Messages in relational `tickets` & `ticket_messages` tables
    if (Array.isArray(incomingState.tickets)) {
      const keptTicketIds: number[] = [];
      for (const tk of incomingState.tickets) {
        const tkId = Number(tk.id) || Date.now();
        keptTicketIds.push(tkId);
        const createdFa = formatServerPersianDateTime(new Date(), tk.createdAt);
        await conn.query(
          `INSERT INTO \`tickets\`
            (\`id\`, \`student_id\`, \`student_name\`, \`student_phone\`, \`class_code\`, \`subject\`, \`priority\`, \`status\`, \`created_at\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`status\` = VALUES(\`status\`),
             \`priority\` = VALUES(\`priority\`),
             \`subject\` = VALUES(\`subject\`)`,
          [
            tkId,
            Number(tk.studentId || 0),
            String(tk.studentName || ''),
            normalizeIranianPhoneServer(tk.studentPhone || ''),
            String(tk.classCode || ''),
            String(tk.subject || ''),
            String(tk.priority || 'عادی'),
            String(tk.status || 'در انتظار پاسخ'),
            createdFa,
          ]
        );

        if (Array.isArray(tk.messages)) {
          for (const msg of tk.messages) {
            const msgId =
              Number(msg.id) || Date.now() + Math.floor(Math.random() * 1000);
            const sentFa = formatServerPersianDateTime(new Date(), msg.sentAt);
            await conn.query(
              `INSERT INTO \`ticket_messages\`
                (\`id\`, \`ticket_id\`, \`sender_role\`, \`sender_name\`, \`message\`, \`sent_at\`, \`attachment_name\`, \`attachment_url\`)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 \`message\` = VALUES(\`message\`),
                 \`attachment_name\` = VALUES(\`attachment_name\`),
                 \`attachment_url\` = VALUES(\`attachment_url\`)`,
              [
                msgId,
                tkId,
                msg.senderRole === 'admin' ? 'admin' : 'student',
                String(msg.senderName || ''),
                String(msg.message || ''),
                sentFa,
                msg.attachmentName ? String(msg.attachmentName) : null,
                msg.attachmentDataUrl ? String(msg.attachmentDataUrl) : null,
              ]
            );
          }
        }
      }

      if (keptTicketIds.length > 0) {
        const placeholders = keptTicketIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`ticket_messages\` WHERE \`ticket_id\` NOT IN (${placeholders})`,
          keptTicketIds
        );
        await conn.query(
          `DELETE FROM \`tickets\` WHERE \`id\` NOT IN (${placeholders})`,
          keptTicketIds
        );
      } else {
        await conn.query('DELETE FROM `ticket_messages`');
        await conn.query('DELETE FROM `tickets`');
      }
    }

    // 9. Sync Gradebook Sessions & Entries in relational `gradebook_sessions` & `gradebook_entries`
    if (Array.isArray(incomingState.gradebookSessions)) {
      const keptSessionIds: number[] = [];
      for (const gs of incomingState.gradebookSessions) {
        const sesId = Number(gs.id) || Date.now();
        keptSessionIds.push(sesId);
        await conn.query(
          `INSERT INTO \`gradebook_sessions\`
            (\`id\`, \`class_code\`, \`title\`, \`session_date\`, \`topic\`)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`class_code\` = VALUES(\`class_code\`),
             \`title\` = VALUES(\`title\`),
             \`session_date\` = VALUES(\`session_date\`),
             \`topic\` = VALUES(\`topic\`)`,
          [
            sesId,
            String(gs.classCode || '901'),
            String(gs.title || ''),
            String(gs.sessionDate || ''),
            String(gs.topic || ''),
          ]
        );
      }

      if (keptSessionIds.length > 0) {
        const placeholders = keptSessionIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM \`gradebook_entries\` WHERE \`session_id\` NOT IN (${placeholders})`,
          keptSessionIds
        );
        await conn.query(
          `DELETE FROM \`gradebook_sessions\` WHERE \`id\` NOT IN (${placeholders})`,
          keptSessionIds
        );
      } else {
        await conn.query('DELETE FROM `gradebook_entries`');
        await conn.query('DELETE FROM `gradebook_sessions`');
      }
    }

    if (Array.isArray(incomingState.gradebookEntries)) {
      for (const ge of incomingState.gradebookEntries) {
        const entryId = Number(ge.id) || Date.now();
        const attendanceVal =
          ge.attendance === 'absent' || ge.attendance === 'late'
            ? ge.attendance
            : 'present';
        await conn.query(
          `INSERT INTO \`gradebook_entries\`
            (\`id\`, \`session_id\`, \`student_id\`, \`class_code\`, \`attendance\`, \`positive_count\`, \`negative_count\`, \`class_score\`, \`teacher_note\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`attendance\` = VALUES(\`attendance\`),
             \`positive_count\` = VALUES(\`positive_count\`),
             \`negative_count\` = VALUES(\`negative_count\`),
             \`class_score\` = VALUES(\`class_score\`),
             \`teacher_note\` = VALUES(\`teacher_note\`)`,
          [
            entryId,
            Number(ge.sessionId || 0),
            Number(ge.studentId || 0),
            String(ge.classCode || '901'),
            attendanceVal,
            attendanceVal === 'absent' ? 0 : Number(ge.positiveCount || 0),
            attendanceVal === 'absent' ? 0 : Number(ge.negativeCount || 0),
            attendanceVal === 'absent'
              ? null
              : ge.classScore !== null && ge.classScore !== undefined
              ? Number(ge.classScore)
              : null,
            String(ge.teacherNote || ''),
          ]
        );
      }
    }

    // 10. Sync Activity Logs in relational `activity_logs`
    if (Array.isArray(incomingState.activities)) {
      for (const act of incomingState.activities.slice(0, 40)) {
        const actId = Number(act.id) || Date.now();
        await conn.query(
          `INSERT IGNORE INTO \`activity_logs\`
            (\`id\`, \`title\`, \`detail\`, \`time_ago\`, \`category\`)
           VALUES (?, ?, ?, ?, ?)`,
          [
            actId,
            String(act.title || ''),
            String(act.detail || ''),
            formatServerPersianDateTime(new Date(), act.timeAgo),
            String(act.category || 'student'),
          ]
        );
      }
    }

    // 11. Sync System Settings
    if (incomingState.settings) {
      const s = incomingState.settings;
      const entries: Array<[string, string]> = [
        ['platformName', String(s.platformName || 'پلتفرم آموزشی اسکول میت')],
        ['academicYear', String(s.academicYear || '۱۴۰۵–۱۴۰۶')],
        ['allowNewRegistrations', String(Boolean(s.allowNewRegistrations))],
        ['requireAdminApproval', String(Boolean(s.requireAdminApproval))],
        ['maxUploadSizeMb', String(Number(s.maxUploadSizeMb) || 15)],
        ['supportPhone', normalizeIranianPhoneServer(s.supportPhone || '')],
      ];

      for (const [key, val] of entries) {
        await conn.query(
          `INSERT INTO \`system_settings\` (\`setting_key\`, \`setting_value\`)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE \`setting_value\` = VALUES(\`setting_value\`)`,
          [key, val]
        );
      }
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'تغییرات با موفقیت در جداول پایگاه داده MySQL ذخیره گردید.',
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطا در ذخیره‌سازی تغییرات در پایگاه داده MySQL.',
    });
  } finally {
    conn.release();
  }
});

/**
 * 4. Authentication: Login (POST /api/auth/login)
 * Enforces Iranian mobile phone normalization & validation and blocks unapproved students.
 */
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');

    if (!isValidIranianPhoneServer(rawPhone)) {
      res.status(422).json({
        success: false,
        message:
          'شماره موبایل واردشده معتبر نیست. لطفاً یک شماره همراه معتبر ایران (مثال: ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.',
      });
      return;
    }

    if (password.length < 4) {
      res.status(422).json({
        success: false,
        message: 'لطفاً رمز عبور خود را به درستی وارد نمایید.',
      });
      return;
    }

    const phone = normalizeIranianPhoneServer(rawPhone);

    // 1. Check Admins table first
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `admins` WHERE `phone` = ? LIMIT 1',
      [phone]
    );

    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const storedHash = String(admin.password_hash || '');
      const isMatch = storedHash.startsWith('$2')
        ? await bcrypt.compare(password, storedHash)
        : password === storedHash;

      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: 'رمز عبور مدیریت نادرست است.',
        });
        return;
      }

      res.json({
        success: true,
        role: 'admin',
        message: 'ورود مدیر سامانه با موفقیت انجام شد.',
        admin: {
          firstName: String(admin.first_name),
          lastName: String(admin.last_name),
          phone: normalizeIranianPhoneServer(admin.phone),
          email: String(admin.email),
          roleTitle: String(admin.role_title),
          bio: String(admin.bio || ''),
          avatarUrl: String(admin.avatar_url || ''),
        },
      });
      return;
    }

    // 2. Check Students table
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `students` WHERE `phone` = ? LIMIT 1',
      [phone]
    );

    if (studentRows.length === 0) {
      res.status(404).json({
        success: false,
        message:
          'کاربری با این شماره تلفن در پایگاه داده یافت نشد. ابتدا ثبت‌نام کنید.',
      });
      return;
    }

    const student = studentRows[0];
    const storedHash = String(student.password_hash || '');
    const isMatch = storedHash.startsWith('$2')
      ? await bcrypt.compare(password, storedHash)
      : password === storedHash;

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'رمز عبور واردشده نادرست است.',
      });
      return;
    }

    // Requirement #6: Restrict student access until admin approval
    if (student.status === 'pending') {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_APPROVAL',
        message:
          'حساب کاربری شما ثبت شده و در انتظار تأیید مدیر سامانه است. پس از تأیید مدیریت می‌توانید وارد پنل دانش‌آموزی شوید.',
      });
      return;
    }

    if (student.status === 'rejected') {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message:
          'درخواست عضویت حساب کاربری شما توسط مدیریت تأیید نشده است. جهت بررسی با پشتیبانی تماس بگیرید.',
      });
      return;
    }

    res.json({
      success: true,
      role: 'student',
      message: `${student.first_name} ${student.last_name} عزیز، به اسکول میت خوش آمدید.`,
      student: {
        id: Number(student.id),
        firstName: String(student.first_name),
        lastName: String(student.last_name),
        phone: normalizeIranianPhoneServer(student.phone),
        email: String(student.email || ''),
        bio: String(student.bio || ''),
        classCode: String(student.class_code || ''),
        status: String(student.status) as 'pending' | 'approved' | 'rejected',
        avatarUrl: student.avatar_removed ? '' : String(student.avatar_url || ''),
        avatarRemoved: Boolean(student.avatar_removed),
        createdAt: formatServerPersianDateOnly(student.created_at),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطای سرور در بررسی اطلاعات ورود.',
    });
  }
});

/**
 * 5. Authentication: Register Student (POST /api/auth/register)
 * Enforces Iranian mobile phone normalization, mandatory valid email, and sets status based on `requireAdminApproval`.
 */
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const email = normalizeDigitsServer(req.body?.email || '').trim();
    const classCode = String(req.body?.classCode || '').trim();
    const password = String(req.body?.password || '');

    if (!firstName || firstName.length < 2 || !lastName || lastName.length < 2) {
      res.status(422).json({
        success: false,
        message: 'وارد کردن نام و نام خانوادگی (حداقل ۲ کاراکتر) الزامی است.',
      });
      return;
    }

    if (!rawPhone || !isValidIranianPhoneServer(rawPhone)) {
      res.status(422).json({
        success: false,
        message:
          'شماره موبایل واردشده معتبر نیست. لطفاً یک شماره همراه معتبر ایران (مثال: ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.',
      });
      return;
    }

    if (!classCode) {
      res.status(422).json({
        success: false,
        message: 'انتخاب کلاس برای ثبت‌نام الزامی است.',
      });
      return;
    }

    if (email && !isValidEmailServer(email)) {
      res.status(422).json({
        success: false,
        message: 'فرمت آدرس ایمیل واردشده معتبر نیست.',
      });
      return;
    }

    if (!password || password.length < 6) {
      res.status(422).json({
        success: false,
        message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
      });
      return;
    }

    const phone = normalizeIranianPhoneServer(rawPhone);

    const [dupStudent] = await pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `students` WHERE `phone` = ? LIMIT 1',
      [phone]
    );
    const [dupAdmin] = await pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `admins` WHERE `phone` = ? LIMIT 1',
      [phone]
    );

    if (dupStudent.length > 0 || dupAdmin.length > 0) {
      res.status(409).json({
        success: false,
        message: 'این شماره موبایل قبلاً در سامانه ثبت‌نام شده است.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Check requireAdminApproval setting (defaults to 'pending' so students require admin approval)
    const [approvalSetting] = await pool.query<RowDataPacket[]>(
      "SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'requireAdminApproval' LIMIT 1"
    );
    const requireApproval =
      approvalSetting.length === 0 ||
      String(approvalSetting[0].setting_value) !== 'false';
    const initialStatus: 'pending' | 'approved' = requireApproval
      ? 'pending'
      : 'approved';

    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO \`students\` (\`first_name\`, \`last_name\`, \`phone\`, \`email\`, \`class_code\`, \`status\`, \`notes\`, \`bio\`, \`password_hash\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      [
        firstName,
        lastName,
        phone,
        email,
        classCode,
        initialStatus,
        'ثبت‌نام آنلاین از طریق درگاه اسکول میت',
        passwordHash,
      ]
    );

    // Log registration activity in relational activity_logs
    await pool.query(
      `INSERT INTO \`activity_logs\` (\`title\`, \`detail\`, \`time_ago\`, \`category\`)
       VALUES (?, ?, ?, 'student')`,
      [
        `ثبت‌نام دانش‌آموز جدید (${firstName} ${lastName} — کلاس ${classCode || 'بدون کلاس'})`,
        `شماره همراه: ${phone} · ایمیل: ${email} · وضعیت: در انتظار تأیید مدیر`,
        formatServerPersianDateTime(new Date()),
      ]
    );

    res.status(201).json({
      success: true,
      role: 'student',
      code:
        initialStatus === 'pending' ? 'ACCOUNT_PENDING_APPROVAL' : 'APPROVED',
      message:
        initialStatus === 'pending'
          ? 'ثبت‌نام شما با موفقیت انجام شد. حساب کاربری شما در انتظار تأیید مدیر سامانه است و پس از تأیید مدیریت می‌توانید وارد پنل شوید.'
          : 'ثبت‌نام شما در پایگاه داده MySQL با موفقیت انجام شد.',
      student: {
        id: Number(insertResult.insertId),
        firstName,
        lastName,
        phone,
        email,
        bio: '',
        classCode,
        status: initialStatus,
        notes: 'ثبت‌نام آنلاین از طریق درگاه اسکول میت',
        createdAt: formatServerPersianDateOnly(new Date()),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطای سرور در ثبت‌نام دانش‌آموز جدید.',
    });
  }
});

/**
 * 6. Update Student Profile (PUT /api/student/profile)
 * Enforces:
 * - Student must be `'approved'`
 * - Student phone number is strictly read-only
 * - Email is mandatory and must be valid
 */
app.put('/api/student/profile', async (req: Request, res: Response) => {
  try {
    const id = Number(req.body?.id);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = normalizeDigitsServer(req.body?.email || '').trim();
    const bio = String(req.body?.bio || '').trim();
    const avatarUrl =
      req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl) : undefined;
    const avatarRemoved =
      req.body?.avatarRemoved !== undefined
        ? Boolean(req.body.avatarRemoved)
        : undefined;

    const approvalCheck = await verifyApprovedStudent(id);
    if (!approvalCheck.allowed || !approvalCheck.studentRow) {
      res.status(approvalCheck.httpStatus).json({
        success: false,
        code: approvalCheck.code,
        message: approvalCheck.message,
      });
      return;
    }

    if (!firstName || !lastName || firstName.length < 2 || lastName.length < 2) {
      res.status(422).json({
        success: false,
        message: 'لطفاً نام و نام خانوادگی معتبر (حداقل ۲ کاراکتر) وارد نمایید.',
      });
      return;
    }

    if (email && !isValidEmailServer(email)) {
      res.status(422).json({
        success: false,
        message: 'فرمت آدرس پست الکترونیکی (ایمیل) واردشده در پروفایل معتبر نیست.',
      });
      return;
    }

    if (bio.length > 500) {
      res.status(422).json({
        success: false,
        message: 'متن بیوگرافی نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.',
      });
      return;
    }

    const current = approvalCheck.studentRow;
    const previousAvatarUrl = String(current.avatar_url || '');
    const finalAvatarRemoved =
      avatarRemoved !== undefined ? avatarRemoved : Boolean(current.avatar_removed);
    const finalAvatarUrl = finalAvatarRemoved
      ? null
      : avatarUrl !== undefined
      ? avatarUrl || null
      : current.avatar_url;

    // Phone is NOT updated here — student's registered phone is immutable
    await pool.query(
      `UPDATE \`students\`
       SET \`first_name\` = ?, \`last_name\` = ?, \`email\` = ?, \`bio\` = ?, \`avatar_url\` = ?, \`avatar_removed\` = ?
       WHERE \`id\` = ?`,
      [
        firstName,
        lastName,
        email,
        bio,
        finalAvatarUrl,
        finalAvatarRemoved ? 1 : 0,
        id,
      ]
    );

    if (previousAvatarUrl && previousAvatarUrl !== String(finalAvatarUrl || '')) {
      setImmediate(() => {
        void deleteUnreferencedUploadFile(previousAvatarUrl);
      });
    }

    res.json({
      success: true,
      message: 'مشخصات پروفایل دانش‌آموز در پایگاه داده بروزرسانی شد.',
      student: {
        id,
        firstName,
        lastName,
        phone: normalizeIranianPhoneServer(current.phone),
        email,
        bio,
        classCode: String(current.class_code || ''),
        status: String(current.status || 'approved'),
        avatarUrl: finalAvatarRemoved ? '' : String(finalAvatarUrl || ''),
        avatarRemoved: finalAvatarRemoved,
        createdAt: formatServerPersianDateOnly(current.created_at),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطا در بروزرسانی پروفایل دانش‌آموز.',
    });
  }
});

/**
 * 7. Update Student Password (POST /api/student/password)
 */
app.post('/api/student/password', async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.body?.studentId);
    const newPassword = String(req.body?.newPassword || '');

    const approvalCheck = await verifyApprovedStudent(studentId);
    if (!approvalCheck.allowed) {
      res.status(approvalCheck.httpStatus).json({
        success: false,
        code: approvalCheck.code,
        message: approvalCheck.message,
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(422).json({
        success: false,
        message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE `students` SET `password_hash` = ? WHERE `id` = ?',
      [passwordHash, studentId]
    );

    res.json({
      success: true,
      message: 'رمز عبور در پایگاه داده MySQL با موفقیت تغییر یافت.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در بروزرسانی رمز عبور.',
    });
  }
});

/**
 * 8. Update Admin Profile (PUT /api/admin/profile)
 */
app.put('/api/admin/profile', async (req: Request, res: Response) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim();
    const roleTitle = String(req.body?.roleTitle || '').trim();
    const bio = String(req.body?.bio || '').trim();
    const avatarUrl =
      req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl) : undefined;

    if (!firstName || !lastName || !isValidIranianPhoneServer(rawPhone)) {
      res.status(422).json({
        success: false,
        message:
          'لطفاً نام، نام خانوادگی و شماره موبایل معتبر ایران (مثال: ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.',
      });
      return;
    }

    const phone = normalizeIranianPhoneServer(rawPhone);

    const [admins] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `admins` ORDER BY `id` ASC LIMIT 1'
    );
    if (admins.length === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب مدیر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const currentAdmin = admins[0];
    const previousAvatarUrl = String(currentAdmin.avatar_url || '');
    const finalAvatarUrl =
      avatarUrl !== undefined ? avatarUrl : String(currentAdmin.avatar_url || '');

    await pool.query(
      `UPDATE \`admins\`
       SET \`first_name\` = ?, \`last_name\` = ?, \`phone\` = ?, \`email\` = ?, \`role_title\` = ?, \`bio\` = ?, \`avatar_url\` = ?
       WHERE \`id\` = ?`,
      [
        firstName,
        lastName,
        phone,
        email || String(currentAdmin.email || ''),
        roleTitle || String(currentAdmin.role_title || ''),
        bio,
        finalAvatarUrl,
        currentAdmin.id,
      ]
    );

    if (previousAvatarUrl && previousAvatarUrl !== finalAvatarUrl) {
      setImmediate(() => {
        void deleteUnreferencedUploadFile(previousAvatarUrl);
      });
    }

    res.json({
      success: true,
      message: 'اطلاعات پروفایل مدیر با موفقیت در پایگاه داده ذخیره گردید.',
      admin: {
        firstName,
        lastName,
        phone,
        email: email || String(currentAdmin.email || ''),
        roleTitle: roleTitle || String(currentAdmin.role_title || ''),
        bio,
        avatarUrl: finalAvatarUrl,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در بروزرسانی پروفایل مدیر.',
    });
  }
});

/**
 * 9. Update Admin Password (POST /api/admin/password)
 */
app.post('/api/admin/password', async (req: Request, res: Response) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 6) {
      res.status(422).json({
        success: false,
        message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
      });
      return;
    }

    const [admins] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `admins` ORDER BY `id` ASC LIMIT 1'
    );
    if (admins.length === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب مدیر یافت نشد.',
      });
      return;
    }

    const admin = admins[0];
    if (currentPassword) {
      const storedHash = String(admin.password_hash || '');
      const isMatch = storedHash.startsWith('$2')
        ? await bcrypt.compare(currentPassword, storedHash)
        : currentPassword === storedHash;
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: 'رمز عبور فعلی واردشده صحیح نیست.',
        });
        return;
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE `admins` SET `password_hash` = ? WHERE `id` = ?',
      [newHash, admin.id]
    );

    res.json({
      success: true,
      message: 'رمز عبور حساب مدیریت با موفقیت در دیتابیس بروزرسانی شد.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در تغییر رمز عبور مدیر.',
    });
  }
});

/**
 * 10. Admin: Create Student directly in MySQL (POST /api/admin/students)
 */
app.post('/api/admin/students', async (req: Request, res: Response) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const email = normalizeDigitsServer(req.body?.email || '').trim();
    const bio = String(req.body?.bio || '').trim();
    const classCode = String(req.body?.classCode ?? '').trim();
    const status =
      req.body?.status === 'pending' || req.body?.status === 'rejected'
        ? req.body.status
        : 'approved';
    const notes = String(req.body?.notes || 'ثبت‌شده توسط مدیر سامانه').trim();
    const password = String(req.body?.password || '123456');

    if (firstName.length < 2 || lastName.length < 2) {
      res.status(422).json({
        success: false,
        message: 'نام و نام خانوادگی دانش‌آموز باید حداقل ۲ کاراکتر باشد.',
      });
      return;
    }

    if (!isValidIranianPhoneServer(rawPhone)) {
      res.status(422).json({
        success: false,
        message:
          'شماره موبایل دانش‌آموز معتبر نیست. لطفاً یک شماره همراه معتبر ایران (مثال: ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.',
      });
      return;
    }

    if (!email || !isValidEmailServer(email)) {
      res.status(422).json({
        success: false,
        message: 'وارد کردن آدرس ایمیل معتبر برای ثبت دانش‌آموز الزامی است.',
      });
      return;
    }

    const phone = normalizeIranianPhoneServer(rawPhone);

    const [dup] = await pool.query<RowDataPacket[]>(
      'SELECT `id` FROM `students` WHERE `phone` = ? LIMIT 1',
      [phone]
    );
    if (dup.length > 0) {
      res.status(409).json({
        success: false,
        message: 'دانش‌آموزی با این شماره تلفن قبلاً در پایگاه داده ثبت شده است.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(
      password.length >= 6 ? password : '123456',
      10
    );

    const [insertRes] = await pool.query<ResultSetHeader>(
      `INSERT INTO \`students\`
        (\`first_name\`, \`last_name\`, \`phone\`, \`email\`, \`class_code\`, \`status\`, \`notes\`, \`bio\`, \`avatar_url\`, \`avatar_removed\`, \`password_hash\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [firstName, lastName, phone, email, classCode, status, notes, bio, passwordHash]
    );

    res.status(201).json({
      success: true,
      message: 'دانش‌آموز جدید با موفقیت در پایگاه داده MySQL ثبت گردید.',
      student: {
        id: Number(insertRes.insertId),
        firstName,
        lastName,
        phone,
        email,
        bio,
        classCode,
        status,
        notes,
        avatarUrl: '',
        avatarRemoved: false,
        createdAt: formatServerPersianDateOnly(new Date()),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در ثبت دانش‌آموز جدید.',
    });
  }
});

/**
 * 11. Admin: Update Student Profile / Class / Status / Avatar in MySQL (PUT /api/admin/students/:id)
 */
app.put('/api/admin/students/:id', async (req: Request, res: Response) => {
  try {
    const callerRole = String(req.headers['x-user-role'] || '').trim();
    if (callerRole === 'student') {
      res.status(403).json({
        success: false,
        message: 'دسترسی غیرمجاز: فقط مدیر سامانه مجاز به ویرایش کامل اطلاعات دانش‌آموز و شماره تلفن است.',
      });
      return;
    }

    const studentId = Number(req.params.id);
    if (!studentId) {
      res.status(400).json({
        success: false,
        message: 'شناسه دانش‌آموز نامعتبر است.',
      });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `students` WHERE `id` = ? LIMIT 1',
      [studentId]
    );
    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'دانش‌آموز در پایگاه داده یافت نشد.',
      });
      return;
    }

    const current = rows[0];
    const firstName =
      req.body?.firstName !== undefined
        ? String(req.body.firstName).trim()
        : String(current.first_name);
    const lastName =
      req.body?.lastName !== undefined
        ? String(req.body.lastName).trim()
        : String(current.last_name);

    let phone = normalizeIranianPhoneServer(current.phone);
    if (req.body?.phone !== undefined) {
      if (!isValidIranianPhoneServer(req.body.phone)) {
        res.status(422).json({
          success: false,
          message:
            'شماره موبایل واردشده معتبر نیست. لطفاً یک شماره همراه معتبر ایران (مثال: ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.',
        });
        return;
      }
      phone = normalizeIranianPhoneServer(req.body.phone);
    }

    const email =
      req.body?.email !== undefined
        ? normalizeDigitsServer(req.body.email).trim()
        : String(current.email || '');
    const bio =
      req.body?.bio !== undefined
        ? String(req.body.bio).trim()
        : String(current.bio || '');
    const classCode =
      req.body?.classCode !== undefined
        ? String(req.body.classCode).trim()
        : String(current.class_code || '');
    const status =
      req.body?.status === 'pending' ||
      req.body?.status === 'approved' ||
      req.body?.status === 'rejected'
        ? req.body.status
        : String(current.status || 'pending');
    const notes =
      req.body?.notes !== undefined
        ? String(req.body.notes).trim()
        : String(current.notes || '');

    // If a non-empty email was provided in the profile edit payload, require it to be valid
    if (email && !isValidEmailServer(email)) {
      res.status(422).json({
        success: false,
        message: 'فرمت آدرس پست الکترونیکی (ایمیل) واردشده برای دانش‌آموز معتبر نیست.',
      });
      return;
    }

    if (phone !== normalizeIranianPhoneServer(current.phone)) {
      const [dup] = await pool.query<RowDataPacket[]>(
        'SELECT `id` FROM `students` WHERE `phone` = ? AND `id` != ? LIMIT 1',
        [phone, studentId]
      );
      if (dup.length > 0) {
        res.status(409).json({
          success: false,
          message: 'این شماره موبایل متعلق به دانش‌آموز دیگری در سامانه است.',
        });
        return;
      }
    }

    const previousAvatarUrl = String(current.avatar_url || '');
    let finalAvatarRemoved = Boolean(current.avatar_removed);
    let finalAvatarUrl: string | null = current.avatar_url
      ? String(current.avatar_url)
      : null;

    if (req.body?.avatarRemoved !== undefined) {
      finalAvatarRemoved = Boolean(req.body.avatarRemoved);
      if (finalAvatarRemoved) {
        finalAvatarUrl = null;
      }
    }
    if (req.body?.avatarUrl !== undefined) {
      finalAvatarUrl = req.body.avatarUrl ? String(req.body.avatarUrl) : null;
      if (finalAvatarUrl) {
        finalAvatarRemoved = false;
      }
    }

    let passwordHash = String(current.password_hash);
    if (req.body?.password && String(req.body.password).trim().length >= 6) {
      passwordHash = await bcrypt.hash(String(req.body.password).trim(), 10);
    }

    await pool.query(
      `UPDATE \`students\`
       SET \`first_name\` = ?, \`last_name\` = ?, \`phone\` = ?, \`email\` = ?, \`class_code\` = ?, \`status\` = ?, \`notes\` = ?, \`bio\` = ?, \`avatar_url\` = ?, \`avatar_removed\` = ?, \`password_hash\` = ?
       WHERE \`id\` = ?`,
      [
        firstName,
        lastName,
        phone,
        email,
        classCode,
        status,
        notes,
        bio,
        finalAvatarUrl,
        finalAvatarRemoved ? 1 : 0,
        passwordHash,
        studentId,
      ]
    );

    if (previousAvatarUrl && previousAvatarUrl !== String(finalAvatarUrl || '')) {
      setImmediate(() => {
        void deleteUnreferencedUploadFile(previousAvatarUrl);
      });
    }

    res.json({
      success: true,
      message: 'اطلاعات دانش‌آموز در پایگاه داده MySQL بروزرسانی شد.',
      student: {
        id: studentId,
        firstName,
        lastName,
        phone,
        email,
        bio,
        classCode,
        status,
        notes,
        avatarUrl: finalAvatarRemoved ? '' : String(finalAvatarUrl || ''),
        avatarRemoved: finalAvatarRemoved,
        createdAt: formatServerPersianDateOnly(current.created_at),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'خطا در بروزرسانی اطلاعات دانش‌آموز.',
    });
  }
});

/**
 * 12. Admin: Remove a Student's Custom Profile Picture (DELETE /api/admin/students/:id/avatar)
 */
app.delete(
  '/api/admin/students/:id/avatar',
  async (req: Request, res: Response) => {
    try {
      const callerRole = String(req.headers['x-user-role'] || '').trim();
      if (callerRole === 'student') {
        res.status(403).json({
          success: false,
          message: 'دسترسی غیرمجاز.',
        });
        return;
      }

      const studentId = Number(req.params.id);
      if (!studentId) {
        res.status(400).json({
          success: false,
          message: 'شناسه دانش‌آموز نامعتبر است.',
        });
        return;
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `students` WHERE `id` = ? LIMIT 1',
        [studentId]
      );
      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'دانش‌آموز در پایگاه داده یافت نشد.',
        });
        return;
      }

      const current = rows[0];
      const previousAvatarUrl = String(current.avatar_url || '');

      await pool.query(
        'UPDATE `students` SET `avatar_url` = NULL, `avatar_removed` = 1 WHERE `id` = ?',
        [studentId]
      );

      let fileDeleted = false;
      if (previousAvatarUrl) {
        fileDeleted = await deleteUnreferencedUploadFile(previousAvatarUrl);
      }

      res.json({
        success: true,
        fileDeleted,
        message:
          'تصویر پروفایل دانش‌آموز حذف شد و به آیکون پیش‌فرض بازنشانی گردید.',
        student: {
          id: studentId,
          firstName: String(current.first_name),
          lastName: String(current.last_name),
          phone: normalizeIranianPhoneServer(current.phone),
          email: String(current.email || ''),
          bio: String(current.bio || ''),
          classCode: String(current.class_code || ''),
          status: String(current.status || 'approved'),
          notes: String(current.notes || ''),
          avatarUrl: '',
          avatarRemoved: true,
          createdAt: formatServerPersianDateOnly(current.created_at),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'خطا در حذف تصویر پروفایل دانش‌آموز.',
      });
    }
  }
);

/**
 * 12B. Admin: Class Management Endpoints (GET, POST, PUT, DELETE /api/admin/classes)
 */
app.get('/api/admin/classes', async (req: Request, res: Response) => {
  try {
    const callerRole = String(req.headers['x-user-role'] || '').trim();
    if (callerRole === 'student') {
      res.status(403).json({
        success: false,
        message: 'فقط مدیر سامانه مجاز به مشاهده و مدیریت کلاس‌ها است.',
      });
      return;
    }

    await ensureDefaultClassesSeeded();

    const [classRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `classes` ORDER BY `code` ASC'
    );
    const [studentCountRows] = await pool.query<RowDataPacket[]>(
      'SELECT `class_code`, COUNT(*) AS `cnt` FROM `students` GROUP BY `class_code`'
    );
    const countByCode = new Map<string, number>();
    studentCountRows.forEach((r) => {
      countByCode.set(String(r.class_code || ''), Number(r.cnt) || 0);
    });

    const classes = classRows.map((c) => {
      const code = String(c.code);
      return {
        code,
        title: String(c.title),
        gradeLevel: String(c.grade_level || 'پایه نهم'),
        instructorName: String(c.instructor_name || ''),
        capacity: Number(c.capacity) || 30,
        roomOrLink: String(c.room_or_link || ''),
        scheduleSummary: String(c.schedule_summary || ''),
        description: String(c.description || ''),
        studentCount: countByCode.get(code) || 0,
        isDefaultClass: (REQUIRED_DEFAULT_CLASS_CODES as readonly string[]).includes(code),
      };
    });

    res.json({
      success: true,
      classes,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در دریافت لیست کلاس‌ها از پایگاه داده.',
    });
  }
});

app.post('/api/admin/classes', async (req: Request, res: Response) => {
  try {
    const callerRole = String(req.headers['x-user-role'] || '').trim();
    if (callerRole === 'student') {
      res.status(403).json({
        success: false,
        message: 'فقط مدیر سامانه مجاز به ایجاد کلاس جدید است.',
      });
      return;
    }

    const code = normalizeDigitsServer(req.body?.code || '').trim();
    const title = String(req.body?.title || '').trim();
    const gradeLevel = String(req.body?.gradeLevel || 'پایه نهم').trim() || 'پایه نهم';
    let instructorName = String(req.body?.instructorName || '').trim();
    const capacity = Math.max(1, Math.min(200, Number(req.body?.capacity) || 30));
    const roomOrLink = String(req.body?.roomOrLink || 'اتاق ۳۰۱ / تالار آنلاین').trim();
    const scheduleSummary = String(req.body?.scheduleSummary || 'شنبه‌ها ۱۶:۰۰ تا ۱۷:۳۰').trim();
    const description = String(req.body?.description || '').trim();

    if (!code || code.length < 2 || code.length > 20) {
      res.status(422).json({
        success: false,
        message: 'کد کلاس الزامی است و باید بین ۲ تا ۲۰ کاراکتر باشد (مثال: 904).',
      });
      return;
    }

    if (!title || title.length < 2) {
      res.status(422).json({
        success: false,
        message: 'عنوان کلاس الزامی است و باید حداقل ۲ کاراکتر باشد.',
      });
      return;
    }

    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT `code` FROM `classes` WHERE `code` = ? LIMIT 1',
      [code]
    );
    if (existingRows.length > 0) {
      res.status(409).json({
        success: false,
        message: `کلاسی با کد «${code}» قبلاً در پایگاه داده ثبت شده است.`,
      });
      return;
    }

    if (!instructorName) {
      const [adminRows] = await pool.query<RowDataPacket[]>(
        'SELECT `full_name` FROM `admins` ORDER BY `id` ASC LIMIT 1'
      );
      instructorName = String(adminRows[0]?.full_name || 'روزبه توکلی').trim();
    }

    await pool.query(
      `INSERT INTO \`classes\`
        (\`code\`, \`title\`, \`grade_level\`, \`instructor_name\`, \`capacity\`, \`room_or_link\`, \`schedule_summary\`, \`description\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        title,
        gradeLevel,
        instructorName,
        capacity,
        roomOrLink,
        scheduleSummary,
        description,
      ]
    );

    await pool.query(
      'INSERT INTO `activity_logs` (`text`, `created_at_label`, `type`) VALUES (?, ?, ?)',
      [
        `کلاس جدید «${title}» (کد ${code}) توسط مدیر ایجاد گردید.`,
        formatServerPersianDateTime(new Date()),
        'system',
      ]
    );

    res.status(201).json({
      success: true,
      message: `کلاس «${title}» با کد ${code} با موفقیت در پایگاه داده ایجاد شد.`,
      classItem: {
        code,
        title,
        gradeLevel,
        instructorName,
        capacity,
        roomOrLink,
        scheduleSummary,
        description,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در ایجاد کلاس جدید در پایگاه داده.',
    });
  }
});

app.put('/api/admin/classes/:code', async (req: Request, res: Response) => {
  try {
    const callerRole = String(req.headers['x-user-role'] || '').trim();
    if (callerRole === 'student') {
      res.status(403).json({
        success: false,
        message: 'فقط مدیر سامانه مجاز به ویرایش اطلاعات کلاس است.',
      });
      return;
    }

    const code = normalizeDigitsServer(req.params.code || '').trim();
    if (!code) {
      res.status(400).json({
        success: false,
        message: 'کد کلاس نامعتبر است.',
      });
      return;
    }

    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `classes` WHERE `code` = ? LIMIT 1',
      [code]
    );
    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        message: `کلاسی با کد «${code}» در پایگاه داده یافت نشد.`,
      });
      return;
    }

    const current = existingRows[0];
    const title =
      req.body?.title !== undefined
        ? String(req.body.title).trim()
        : String(current.title || '');
    const gradeLevel =
      req.body?.gradeLevel !== undefined
        ? String(req.body.gradeLevel).trim() || 'پایه نهم'
        : String(current.grade_level || 'پایه نهم');
    const instructorName =
      req.body?.instructorName !== undefined
        ? String(req.body.instructorName).trim() || String(current.instructor_name || 'روزبه توکلی')
        : String(current.instructor_name || 'روزبه توکلی');
    const capacity =
      req.body?.capacity !== undefined
        ? Math.max(1, Math.min(200, Number(req.body.capacity) || 30))
        : Number(current.capacity) || 30;
    const roomOrLink =
      req.body?.roomOrLink !== undefined
        ? String(req.body.roomOrLink).trim()
        : String(current.room_or_link || '');
    const scheduleSummary =
      req.body?.scheduleSummary !== undefined
        ? String(req.body.scheduleSummary).trim()
        : String(current.schedule_summary || '');
    const description =
      req.body?.description !== undefined
        ? String(req.body.description).trim()
        : String(current.description || '');

    if (!title || title.length < 2) {
      res.status(422).json({
        success: false,
        message: 'عنوان کلاس نمی‌تواند خالی یا کمتر از ۲ کاراکتر باشد.',
      });
      return;
    }

    await pool.query(
      `UPDATE \`classes\`
       SET \`title\` = ?, \`grade_level\` = ?, \`instructor_name\` = ?, \`capacity\` = ?, \`room_or_link\` = ?, \`schedule_summary\` = ?, \`description\` = ?
       WHERE \`code\` = ?`,
      [
        title,
        gradeLevel,
        instructorName,
        capacity,
        roomOrLink,
        scheduleSummary,
        description,
        code,
      ]
    );

    await pool.query(
      'INSERT INTO `activity_logs` (`text`, `created_at_label`, `type`) VALUES (?, ?, ?)',
      [
        `مشخصات کلاس «${title}» (کد ${code}) توسط مدیر بروزرسانی شد.`,
        formatServerPersianDateTime(new Date()),
        'system',
      ]
    );

    res.json({
      success: true,
      message: `اطلاعات کلاس «${title}» با موفقیت در پایگاه داده بروزرسانی شد.`,
      classItem: {
        code,
        title,
        gradeLevel,
        instructorName,
        capacity,
        roomOrLink,
        scheduleSummary,
        description,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در بروزرسانی اطلاعات کلاس در پایگاه داده.',
    });
  }
});

app.delete('/api/admin/classes/:code', async (req: Request, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const callerRole = String(req.headers['x-user-role'] || '').trim();
    if (callerRole === 'student') {
      conn.release();
      res.status(403).json({
        success: false,
        message: 'فقط مدیر سامانه مجاز به حذف کلاس است.',
      });
      return;
    }

    const code = normalizeDigitsServer(req.params.code || '').trim();
    if (!code) {
      conn.release();
      res.status(400).json({
        success: false,
        message: 'کد کلاس نامعتبر است.',
      });
      return;
    }

    if ((REQUIRED_DEFAULT_CLASS_CODES as readonly string[]).includes(code)) {
      conn.release();
      res.status(403).json({
        success: false,
        message: `کلاس پیش‌فرض «${code}» جزء کلاس‌های پایه سامانه است و امکان حذف آن وجود ندارد. در صورت نیاز می‌توانید مشخصات آن را ویرایش کنید.`,
      });
      return;
    }

    const [existingRows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM `classes` WHERE `code` = ? LIMIT 1',
      [code]
    );
    if (existingRows.length === 0) {
      conn.release();
      res.status(404).json({
        success: false,
        message: `کلاسی با کد «${code}» در پایگاه داده یافت نشد.`,
      });
      return;
    }

    const classTitle = String(existingRows[0].title || code);

    await conn.beginTransaction();

    // Unassign students belonging to this deleted class instead of deleting students
    const [unassignRes] = await conn.query<ResultSetHeader>(
      "UPDATE `students` SET `class_code` = '' WHERE `class_code` = ?",
      [code]
    );
    await conn.query('DELETE FROM `class_schedules` WHERE `class_code` = ?', [
      code,
    ]);
    await conn.query('DELETE FROM `classes` WHERE `code` = ?', [code]);

    await conn.query(
      'INSERT INTO `activity_logs` (`text`, `created_at_label`, `type`) VALUES (?, ?, ?)',
      [
        `کلاس «${classTitle}» (کد ${code}) توسط مدیر حذف شد (${unassignRes.affectedRows} دانش‌آموز به وضعیت بدون کلاس منتقل شدند).`,
        formatServerPersianDateTime(new Date()),
        'system',
      ]
    );

    await conn.commit();

    res.json({
      success: true,
      unassignedStudents: unassignRes.affectedRows,
      message:
        unassignRes.affectedRows > 0
          ? `کلاس «${classTitle}» حذف شد و ${unassignRes.affectedRows} دانش‌آموز عضو آن به وضعیت «بدون کلاس» منتقل شدند.`
          : `کلاس «${classTitle}» با موفقیت از پایگاه داده حذف گردید.`,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({
      success: false,
      message:
        err instanceof Error ? err.message : 'خطا در حذف کلاس از پایگاه داده.',
    });
  } finally {
    conn.release();
  }
});

/**
 * 13. Admin: Close or Reopen an Assignment (POST /api/admin/assignments/:id/status)
 */
app.post(
  '/api/admin/assignments/:id/status',
  async (req: Request, res: Response) => {
    try {
      const callerRole = String(req.headers['x-user-role'] || '').trim();
      if (callerRole === 'student') {
        res.status(403).json({
          success: false,
          message: 'فقط مدیر سامانه مجاز به بستن یا بازگشایی تکلیف است.',
        });
        return;
      }

      const assignmentId = Number(req.params.id);
      const nextStatus =
        req.body?.status === 'closed' ? 'closed' : ('active' as const);

      const [hwRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `assignments` WHERE `id` = ? LIMIT 1',
        [assignmentId]
      );
      if (hwRows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'تکلیف مورد نظر در پایگاه داده یافت نشد.',
        });
        return;
      }

      const closedAtVal =
        nextStatus === 'closed' ? formatServerPersianDateTime(new Date()) : null;

      await pool.query(
        'UPDATE `assignments` SET `status` = ?, `closed_at` = ? WHERE `id` = ?',
        [nextStatus, closedAtVal, assignmentId]
      );

      res.json({
        success: true,
        status: nextStatus,
        message:
          nextStatus === 'closed'
            ? 'تکلیف با موفقیت بسته شد و امکان ارسال یا ویرایش پاسخ برای دانش‌آموزان غیرفعال گردید.'
            : 'تکلیف مجدداً بازگشایی شد و دانش‌آموزان در صورت نگذشتن مهلت تحویل می‌توانند پاسخ ارسال کنند.',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'خطا در تغییر وضعیت تکلیف در پایگاه داده.',
      });
    }
  }
);

/**
 * 14. Student: Submit or Update Assignment Response (POST /api/student/assignments/:id/submit)
 * Enforces on backend:
 * - Student must exist and have `status === 'approved'`
 * - Assignment must exist
 * - Assignment must NOT be manually closed (`status === 'closed'`)
 * - Assignment deadline (`dueDate`) must NOT have passed
 */
app.post(
  '/api/student/assignments/:id/submit',
  async (req: Request, res: Response) => {
    try {
      const assignmentId = Number(req.params.id);
      const studentId = Number(req.body?.studentId);
      const fileName = String(req.body?.fileName || 'homework.zip').trim();
      const fileContent = String(req.body?.fileContent || '').trim();
      const fileDataUrl = req.body?.fileDataUrl
        ? String(req.body.fileDataUrl)
        : undefined;

      if (!assignmentId || !studentId || !fileContent) {
        res.status(422).json({
          success: false,
          message: 'اطلاعات ارسالی برای ثبت پاسخ تکلیف ناقص است.',
        });
        return;
      }

      // Verify student is approved
      const approvalCheck = await verifyApprovedStudent(studentId);
      if (!approvalCheck.allowed || !approvalCheck.studentRow) {
        res.status(approvalCheck.httpStatus).json({
          success: false,
          code: approvalCheck.code,
          message: approvalCheck.message,
        });
        return;
      }

      const [hwRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `assignments` WHERE `id` = ? LIMIT 1',
        [assignmentId]
      );
      if (hwRows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'تکلیف مورد نظر یافت نشد.',
        });
        return;
      }

      const hw = hwRows[0];
      const lockCheck = getAssignmentLockStatusServer(
        {
          status: String(hw.status || 'active'),
          dueDate: String(hw.due_date || ''),
        },
        Date.now()
      );
      if (lockCheck.locked) {
        res.status(403).json({
          success: false,
          code: lockCheck.reason,
          message: formatAssignmentStatusError(lockCheck.reason),
        });
        return;
      }

      const stRow = approvalCheck.studentRow;
      const studentName = `${String(stRow.first_name || '')} ${String(stRow.last_name || '')}`.trim();
      const classCode = String(stRow.class_code || '901');
      const submittedAt = formatServerPersianDateTime(new Date());

      const [existingSubs] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `assignment_submissions` WHERE `assignment_id` = ? AND `student_id` = ? LIMIT 1',
        [assignmentId, studentId]
      );

      let submissionRecord: Record<string, unknown>;
      const isEdit = existingSubs.length > 0;

      if (isEdit) {
        const existing = existingSubs[0];
        if (existing.score !== null && existing.score !== undefined) {
          res.status(403).json({
            success: false,
            code: 'ASSIGNMENT_ALREADY_GRADED',
            message:
              'این تکلیف توسط مدرس تصحیح و نمره‌دهی شده است و امکان ویرایش پاسخ وجود ندارد.',
          });
          return;
        }

        const nextFileUrl =
          fileDataUrl !== undefined
            ? fileDataUrl
            : existing.file_url
            ? String(existing.file_url)
            : null;

        await pool.query(
          `UPDATE \`assignment_submissions\`
           SET \`file_name\` = ?, \`file_content\` = ?, \`file_url\` = ?, \`submitted_at\` = ?
           WHERE \`id\` = ?`,
          [fileName, fileContent, nextFileUrl, submittedAt, existing.id]
        );

        submissionRecord = {
          id: Number(existing.id),
          assignmentId,
          studentId,
          studentName,
          classCode,
          fileName,
          fileContent,
          fileDataUrl: nextFileUrl || undefined,
          submittedAt,
          score: null,
          teacherFeedback: String(existing.teacher_feedback || ''),
          status: 'pending',
        };
      } else {
        const [ins] = await pool.query<ResultSetHeader>(
          `INSERT INTO \`assignment_submissions\`
            (\`assignment_id\`, \`student_id\`, \`student_name\`, \`class_code\`, \`file_name\`, \`file_content\`, \`file_url\`, \`submitted_at\`, \`score\`, \`teacher_feedback\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '', 'pending')`,
          [
            assignmentId,
            studentId,
            studentName,
            classCode,
            fileName,
            fileContent,
            fileDataUrl || null,
            submittedAt,
          ]
        );

        submissionRecord = {
          id: Number(ins.insertId),
          assignmentId,
          studentId,
          studentName,
          classCode,
          fileName,
          fileContent,
          fileDataUrl,
          submittedAt,
          score: null,
          teacherFeedback: '',
          status: 'pending',
        };
      }

      await pool.query(
        `INSERT INTO \`activity_logs\` (\`title\`, \`detail\`, \`time_ago\`, \`category\`)
         VALUES (?, ?, ?, 'assignment')`,
        [
          `${isEdit ? 'ویرایش پاسخ تکلیف' : 'ارسال تکلیف جدید'} توسط ${studentName}`,
          `${String(hw.title || '')} — فایل: ${fileName}`,
          submittedAt,
        ]
      );

      res.json({
        success: true,
        isEdit,
        submission: submissionRecord,
        message: isEdit
          ? 'پاسخ و فایل ارسالی شما با موفقیت در پایگاه داده بروزرسانی شد.'
          : 'پاسخ و فایل تکلیف شما با موفقیت در پایگاه داده ثبت گردید.',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'خطا در ثبت پاسخ تکلیف در پایگاه داده.',
      });
    }
  }
);

/**
 * 15. Student: Reply to a Ticket (POST /api/student/tickets/:id/reply)
 * Enforces on backend:
 * - Student must exist and have `status === 'approved'`
 * - Ticket must exist and belong to the student
 * - Ticket must NOT be closed (`status === 'بسته شده'`)
 */
app.post(
  '/api/student/tickets/:id/reply',
  async (req: Request, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const studentId = Number(req.body?.studentId);
      const messageText = String(req.body?.message || '').trim();
      const attachmentName = req.body?.attachmentName
        ? String(req.body.attachmentName).trim()
        : undefined;
      const attachmentDataUrl = req.body?.attachmentDataUrl
        ? String(req.body.attachmentDataUrl)
        : undefined;

      if (!ticketId || !studentId || !messageText) {
        res.status(422).json({
          success: false,
          message: 'متن پیام تیکت نمی‌تواند خالی باشد.',
        });
        return;
      }

      const approvalCheck = await verifyApprovedStudent(studentId);
      if (!approvalCheck.allowed || !approvalCheck.studentRow) {
        res.status(approvalCheck.httpStatus).json({
          success: false,
          code: approvalCheck.code,
          message: approvalCheck.message,
        });
        return;
      }

      const [tkRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `tickets` WHERE `id` = ? LIMIT 1',
        [ticketId]
      );
      if (tkRows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'تیکت مورد نظر در پایگاه داده یافت نشد.',
        });
        return;
      }

      const tk = tkRows[0];
      if (Number(tk.student_id) !== studentId) {
        res.status(403).json({
          success: false,
          message: 'شما مجاز به ارسال پیام در این تیکت نیستید.',
        });
        return;
      }

      if (String(tk.status) === 'بسته شده') {
        res.status(403).json({
          success: false,
          code: 'TICKET_CLOSED',
          message:
            'این تیکت توسط مدیریت بسته شده است و امکان ارسال پیام یا فایل جدید در آن وجود ندارد.',
        });
        return;
      }

      const stRow = approvalCheck.studentRow;
      const senderName = `${String(stRow.first_name || '')} ${String(stRow.last_name || '')}`.trim();
      const sentAt = formatServerPersianDateTime(new Date());

      await pool.query(
        `INSERT INTO \`ticket_messages\`
          (\`ticket_id\`, \`sender_role\`, \`sender_name\`, \`message\`, \`sent_at\`, \`attachment_name\`, \`attachment_url\`)
         VALUES (?, 'student', ?, ?, ?, ?, ?)`,
        [
          ticketId,
          senderName,
          messageText,
          sentAt,
          attachmentName || null,
          attachmentDataUrl || null,
        ]
      );

      await pool.query(
        "UPDATE `tickets` SET `status` = 'در انتظار پاسخ' WHERE `id` = ?",
        [ticketId]
      );

      res.json({
        success: true,
        message: 'پیام شما با موفقیت در تیکت ثبت گردید.',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'خطا در ارسال پیام تیکت در پایگاه داده.',
      });
    }
  }
);

let apiServerStarted = false;

/**
 * Initialize Database Schema & Migrations on Startup, then Start Server
 */
export async function startApiServer(listenPort: number = PORT): Promise<void> {
  if (apiServerStarted) return;
  apiServerStarted = true;

  const info = getDbInfo();
  const connectionStatus = await testDatabaseConnection();

  if (connectionStatus.connected) {
    try {
      const migrationResult = await runMigrations();
      await migrateLegacyExtendedStateOnce();
      console.log(
        `[ScoolMeet API] Connected to MySQL (${info.user}@${info.host}:${info.port}/${info.database}). Applied migrations now: ${migrationResult.applied.length}`
      );
    } catch (err) {
      console.error('[ScoolMeet API] Error running database migrations:', err);
    }
  } else {
    console.error(
      `[ScoolMeet API] Warning: Could not connect to MySQL (${info.host}:${info.port}/${info.database}): ${connectionStatus.error}`
    );
  }

  const server = app.listen(listenPort, () => {
    console.log(
      `[ScoolMeet API] Node.js + Express backend listening on http://localhost:${listenPort}`
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Port 3001 is already bound by an active server instance
      return;
    }
    console.error('[ScoolMeet API] Server error:', err);
  });
}

// Auto-start when run directly via tsx/node
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/index.ts')) {
  void startApiServer(PORT);
}

