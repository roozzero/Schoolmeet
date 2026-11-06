import express, { Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getDbInfo, pool, testDatabaseConnection } from './db';
import { runMigrations } from './migrations';

export const app = express();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Safely serve uploaded files from /uploads with nosniff and safe headers
 * so uploaded files can never execute as server-side code.
 */
app.get('/uploads/:filename', (req: Request, res: Response): void => {
  const rawName = String(req.params.filename || '');
  const safeName = path.basename(rawName);
  if (!safeName || safeName !== rawName || safeName.startsWith('.')) {
    res.status(400).send('Invalid file name');
    return;
  }
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('File not found');
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  if (req.query.download === '1') {
    const downloadName = String(req.query.name || safeName).replace(/["\r\n]/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
  }
  res.sendFile(filePath);
});

/**
 * Helper: Convert Persian/Arabic digits to English ASCII digits
 */
function normalizeDigitsServer(input: string): string {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let out = String(input || '').trim();
  for (let i = 0; i < 10; i++) {
    out = out
      .replace(new RegExp(persian[i], 'g'), String(i))
      .replace(new RegExp(arabic[i], 'g'), String(i));
  }
  return out;
}

/**
 * Helper: Format byte size in Persian human-readable units
 */
function formatFileSizePersian(bytes: number): string {
  const toFa = (val: string) =>
    val.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] || d);
  if (bytes < 1024) {
    return `${toFa(String(bytes))} بایت`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${toFa(kb.toFixed(1))} کیلوبایت`;
  }
  const mb = kb / 1024;
  return `${toFa(mb.toFixed(1))} مگابایت`;
}

/**
 * Helper: Strictly verify password against bcrypt hash stored in MySQL
 * (supports $2y$, $2a$, and $2b$ prefixes).
 */
async function verifyPasswordHash(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  const normalizedHash = hash.startsWith('$2y$')
    ? '$2a$' + hash.slice(4)
    : hash;
  try {
    return await bcrypt.compare(plain, normalizedHash);
  } catch {
    return false;
  }
}

/**
 * Helper: Read and write `app_extended_state` in `system_settings`
 */
async function readExtendedState(): Promise<Record<string, unknown>> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      ['app_extended_state']
    );
    if (rows.length > 0 && rows[0].setting_value) {
      return JSON.parse(String(rows[0].setting_value)) as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

async function writeExtendedState(stateObj: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES ('app_extended_state', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [JSON.stringify(stateObj)]
  );
}

/**
 * Helper: Validate email format when non-empty (max 150 chars)
 */
function isValidEmailServer(email: string): boolean {
  const trimmed = String(email || '').trim();
  if (!trimmed) return true;
  if (trimmed.length > 150) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Helper: Convert Jalali (Solar Hijri) date to Gregorian date on the server
 */
function jalaliToGregorianServer(
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
 * Helper: Parse assignment dueDate (Persian Jalali or Gregorian) into Unix ms in Asia/Tehran (+03:30)
 */
export function parseAssignmentDeadlineMsServer(dueDateStr: string): number | null {
  const ascii = normalizeDigitsServer(dueDateStr);
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

  const afterDate = ascii.slice((dateMatch.index || 0) + dateMatch[0].length);
  const timeMatch = afterDate.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hour = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 23;
  const minute = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 59;
  const second = timeMatch && timeMatch[3] ? Math.min(59, Math.max(0, Number(timeMatch[3]))) : 59;

  let gy = rawYear;
  let gm = rawMonth;
  let gd = rawDay;

  if (rawYear >= 1300 && rawYear <= 1600) {
    const greg = jalaliToGregorianServer(rawYear, rawMonth, rawDay);
    gy = greg.gy;
    gm = greg.gm;
    gd = greg.gd;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const isoTehran = `${gy}-${pad(gm)}-${pad(gd)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:30`;
  const parsed = Date.parse(isoTehran);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isAssignmentExpiredServer(
  dueDateStr: string,
  nowMs: number = Date.now()
): boolean {
  const deadlineMs = parseAssignmentDeadlineMsServer(dueDateStr);
  return deadlineMs !== null && nowMs > deadlineMs;
}

/**
 * Helper: Safely delete an uploaded physical file from /uploads only when it is inside UPLOADS_DIR
 * and is not referenced by any other student, admin, or extended state record.
 */
async function safeDeleteUploadedFileIfUnreferenced(
  oldUrl: string | null | undefined,
  excludeStudentId?: number
): Promise<boolean> {
  if (!oldUrl || typeof oldUrl !== 'string') return false;
  const cleanPath = oldUrl.split('?')[0].trim();
  if (!cleanPath.startsWith('/uploads/')) return false;

  const baseName = path.basename(cleanPath);
  if (!baseName || baseName.startsWith('.') || cleanPath !== `/uploads/${baseName}`) {
    return false;
  }

  const fullPath = path.resolve(UPLOADS_DIR, baseName);
  if (!fullPath.startsWith(UPLOADS_DIR) || !fs.existsSync(fullPath)) {
    return false;
  }

  try {
    const likePattern = `%/uploads/${baseName}%`;
    const [otherStudents] = await pool.query<RowDataPacket[]>(
      excludeStudentId
        ? 'SELECT id FROM students WHERE id <> ? AND avatar_url LIKE ? LIMIT 1'
        : 'SELECT id FROM students WHERE avatar_url LIKE ? LIMIT 1',
      excludeStudentId ? [excludeStudentId, likePattern] : [likePattern]
    );
    if (otherStudents.length > 0) return false;

    const [otherAdmins] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM admins WHERE avatar_url LIKE ? LIMIT 1',
      [likePattern]
    );
    if (otherAdmins.length > 0) return false;

    const extState = await readExtendedState();
    const extJson = JSON.stringify({
      assignments: extState.assignments || [],
      submissions: extState.submissions || [],
      resources: extState.resources || [],
      tickets: extState.tickets || [],
    });
    if (extJson.includes(`/uploads/${baseName}`)) {
      return false;
    }

    fs.unlinkSync(fullPath);
    return true;
  } catch (err) {
    console.warn('[Safe File Cleanup Warning]:', err);
    return false;
  }
}

/**
 * Helper: Synchronize a single updated/created student record inside `app_extended_state`
 */
async function syncStudentIntoExtendedState(studentObj: Record<string, unknown>): Promise<void> {
  try {
    const extState = await readExtendedState();
    if (!extState || Object.keys(extState).length === 0) return;
    const list = Array.isArray(extState.students)
      ? ([...extState.students] as Record<string, unknown>[])
      : [];
    const idx = list.findIndex((s) => Number(s.id) === Number(studentObj.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...studentObj };
    } else {
      list.unshift(studentObj);
    }
    extState.students = list;
    await writeExtendedState(extState);
  } catch {
    // Ignore if extended state is not initialized yet
  }
}

/**
 * 0. Binary File Upload Endpoint (Supports >1MB up to 100MB with real XHR progress)
 * POST /api/upload
 */
const FORBIDDEN_EXTENSIONS = new Set([
  '.php',
  '.phtml',
  '.phar',
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.cgi',
  '.pl',
  '.jsp',
  '.asp',
  '.aspx',
  '.dll',
  '.msi',
]);

app.post(
  '/api/upload',
  express.raw({
    type: ['application/octet-stream', '*/*'],
    limit: '100mb',
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawHeaderName = String(
        req.headers['x-file-name'] || req.query.fileName || 'file.bin'
      );
      let originalName = 'file.bin';
      try {
        originalName = decodeURIComponent(rawHeaderName);
      } catch {
        originalName = rawHeaderName;
      }
      originalName = path.basename(originalName).replace(/[\r\n"<>|:*?\\/]/g, '_');

      const ext = path.extname(originalName).toLowerCase();
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        res.status(415).json({
          success: false,
          message: 'فرمت فایل انتخابی به دلایل امنیتی مجاز نیست.',
        });
        return;
      }

      const bodyBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : null;

      if (!bodyBuffer || bodyBuffer.length === 0) {
        res.status(400).json({
          success: false,
          message: 'فایلی دریافت نشد یا حجم فایل صفر است.',
        });
        return;
      }

      // Check configured maxUploadSizeMb from system settings (minimum 25MB allowed for resources/tickets)
      const extState = await readExtendedState();
      const settingsObj = (extState.settings || {}) as Record<string, unknown>;
      const configuredMaxMb = Number(settingsObj.maxUploadSizeMb) || 50;
      const effectiveMaxMb = Math.max(configuredMaxMb, 25);
      const maxBytes = effectiveMaxMb * 1024 * 1024;

      if (bodyBuffer.length > maxBytes) {
        res.status(413).json({
          success: false,
          message: `حجم فایل بیش از حد مجاز (${effectiveMaxMb} مگابایت) است.`,
        });
        return;
      }

      const safeBase = path
        .basename(originalName, ext)
        .replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')
        .slice(0, 50) || 'upload';
      const uniqueFileName = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safeBase}${ext}`;
      const targetPath = path.join(UPLOADS_DIR, uniqueFileName);

      await fs.promises.writeFile(targetPath, bodyBuffer);

      const fileUrl = `/uploads/${encodeURIComponent(uniqueFileName)}`;
      const fileSize = formatFileSizePersian(bodyBuffer.length);

      res.status(201).json({
        success: true,
        fileUrl,
        fileName: originalName,
        storedFileName: uniqueFileName,
        fileSize,
        sizeBytes: bodyBuffer.length,
        message: 'فایل با موفقیت در سرور ذخیره شد.',
      });
    } catch (err: unknown) {
      console.error('[Upload Error]:', err);
      res.status(500).json({
        success: false,
        message: 'خطا در آپلود و ذخیره‌سازی فایل در سرور.',
      });
    }
  }
);

/**
 * 1. Database Connection Test Endpoint
 * GET /api/test-db (also /api/health & /api/test-db.php)
 */
async function handleTestDb(_req: Request, res: Response): Promise<void> {
  const status = await testDatabaseConnection();
  if (status.connected) {
    res.json({
      success: true,
      connected: true,
      database: status.database,
      host: status.host,
      port: status.port,
      message:
        'اتصال بک‌اند Node.js به پایگاه داده MySQL (scoolmeet_db) با موفقیت برقرار شد.',
    });
  } else {
    res.status(500).json({
      success: false,
      connected: false,
      database: status.database,
      host: status.host,
      port: status.port,
      message:
        'خطا در اتصال به پایگاه داده MySQL. لطفاً روشن بودن سرویس MySQL و تنظیمات فایل .env را بررسی کنید.',
      error: status.error,
    });
  }
}

app.get('/api/test-db', handleTestDb);
app.get('/api/test-db.php', handleTestDb);
app.get('/api/health', handleTestDb);

/**
 * 2. Login Endpoint (Admin & Student)
 * POST /api/auth/login (also /api/auth/login.php)
 * Strictly verifies credentials against bcrypt password hashes stored in MySQL.
 */
async function handleLogin(req: Request, res: Response): Promise<void> {
  const rawPhone = String(req.body?.phone ?? '');
  const phone = normalizeDigitsServer(rawPhone);
  const password = String(req.body?.password ?? '');

  if (!/^09\d{9}$/.test(phone) || !password) {
    res.status(422).json({
      success: false,
      message: 'شماره تلفن یا رمز عبور نامعتبر است.',
    });
    return;
  }

  try {
    // 1. Check Admin credentials in `admins` table
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, first_name, last_name, phone, email, role_title, bio, avatar_url, password_hash FROM admins WHERE phone = ? LIMIT 1',
      [phone]
    );

    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const hashValid = await verifyPasswordHash(
        password,
        String(admin.password_hash || '')
      );

      if (!hashValid) {
        res.status(401).json({
          success: false,
          message: 'رمز عبور حساب مدیر اشتباه است.',
        });
        return;
      }

      const firstName = String(admin.first_name);
      const lastName = String(admin.last_name);
      res.json({
        success: true,
        role: 'admin',
        message: `خوش آمدید ${firstName} ${lastName} — وارد پنل مدیریت شدید.`,
        admin: {
          firstName,
          lastName,
          phone: String(admin.phone),
          email: String(admin.email),
          roleTitle: String(admin.role_title || 'مدیر و مدرس ارشد'),
          bio: String(admin.bio || ''),
          avatarUrl: admin.avatar_url ? String(admin.avatar_url) : '',
        },
      });
      return;
    }

    // 2. Check Student credentials in `students` table
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, first_name, last_name, phone, class_code, status, notes, avatar_url, avatar_removed, password_hash, created_at FROM students WHERE phone = ? LIMIT 1',
      [phone]
    );

    if (studentRows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'حساب کاربری با این شماره تلفن در پایگاه داده یافت نشد.',
      });
      return;
    }

    const student = studentRows[0];
    const hashValid = await verifyPasswordHash(
      password,
      String(student.password_hash || '')
    );

    if (!hashValid) {
      res.status(401).json({
        success: false,
        message: 'رمز عبور واردشده صحیح نیست.',
      });
      return;
    }

    if (student.status === 'rejected') {
      res.status(403).json({
        success: false,
        message: 'درخواست عضویت این حساب توسط مدیر تأیید نشده است.',
      });
      return;
    }

    const studentRecord = {
      id: Number(student.id),
      firstName: String(student.first_name),
      lastName: String(student.last_name),
      phone: String(student.phone),
      email: String(student.email || ''),
      bio: String(student.bio || ''),
      classCode: String(student.class_code ?? ''),
      status: (student.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(student.notes || ''),
      avatarUrl:
        student.avatar_removed || !student.avatar_url
          ? undefined
          : String(student.avatar_url),
      avatarRemoved: Boolean(student.avatar_removed),
      createdAt: student.created_at
        ? new Date(student.created_at).toLocaleDateString('fa-IR')
        : new Date().toLocaleDateString('fa-IR'),
    };

    res.json({
      success: true,
      role: 'student',
      message: `خوش آمدید ${studentRecord.firstName} ${studentRecord.lastName} — وارد پنل دانش‌آموزی شدید.`,
      student: studentRecord,
    });
  } catch (err: unknown) {
    console.error('[MySQL Login Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ارتباط با پایگاه داده MySQL.',
    });
  }
}

app.post('/api/auth/login', handleLogin);
app.post('/api/auth/login.php', handleLogin);

/**
 * 3. Student Registration Endpoint
 * POST /api/auth/register (also /api/auth/register.php)
 */
async function handleRegister(req: Request, res: Response): Promise<void> {
  const firstName = String(
    req.body?.firstName ?? req.body?.first_name ?? ''
  ).trim();
  const lastName = String(
    req.body?.lastName ?? req.body?.last_name ?? ''
  ).trim();
  const phone = normalizeDigitsServer(String(req.body?.phone ?? ''));
  const classCode = normalizeDigitsServer(
    String(req.body?.classCode ?? req.body?.class_code ?? '')
  );
  const password = String(req.body?.password ?? '');

  if (
    firstName.length < 2 ||
    lastName.length < 2 ||
    !/^09\d{9}$/.test(phone) ||
    !classCode ||
    password.length < 6
  ) {
    res.status(422).json({
      success: false,
      message: 'اطلاعات ارسالی جهت ثبت‌نام معتبر نیست.',
    });
    return;
  }

  try {
    // Check if phone number is already registered in `students` or `admins`
    const [existingStudent] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM students WHERE phone = ? LIMIT 1',
      [phone]
    );
    const [existingAdmin] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM admins WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (existingStudent.length > 0 || existingAdmin.length > 0) {
      res.status(409).json({
        success: false,
        message: 'این شماره تلفن قبلاً در پایگاه داده ثبت شده است.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const notes = 'ثبت‌نام جدید از طریق فرم صفحه اصلی';

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO students (first_name, last_name, phone, email, class_code, status, notes, bio, avatar_url, avatar_removed, password_hash)
       VALUES (?, ?, ?, '', ?, 'pending', ?, '', NULL, 0, ?)`,
      [firstName, lastName, phone, classCode, notes, passwordHash]
    );

    const newStudent = {
      id: Number(result.insertId),
      firstName,
      lastName,
      phone,
      email: '',
      bio: '',
      classCode,
      status: 'pending' as const,
      notes,
      avatarUrl: undefined,
      avatarRemoved: false,
      createdAt: new Date().toLocaleDateString('fa-IR'),
    };

    await syncStudentIntoExtendedState(newStudent);

    res.status(201).json({
      success: true,
      role: 'student',
      message: 'تبریک! حساب کاربری شما با موفقیت در پایگاه داده MySQL ایجاد شد.',
      student: newStudent,
    });
  } catch (err: unknown) {
    console.error('[MySQL Register Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ارتباط با پایگاه داده MySQL هنگام ثبت‌نام.',
    });
  }
}

app.post('/api/auth/register', handleRegister);
app.post('/api/auth/register.php', handleRegister);

/**
 * 4. Dedicated Student Profile & Password Endpoints
 * Strictly prevents students from modifying their registered phone number or class!
 */
app.put('/api/student/profile', async (req: Request, res: Response): Promise<void> => {
  const studentId = Number(req.body?.id ?? req.body?.studentId ?? 0);
  const firstName = String(req.body?.firstName ?? '').trim();
  const lastName = String(req.body?.lastName ?? '').trim();
  const rawEmail =
    req.body?.email !== undefined ? String(req.body.email ?? '').trim() : undefined;
  const rawBio =
    req.body?.bio !== undefined ? String(req.body.bio ?? '').trim() : undefined;
  const avatarUrl =
    req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '') : undefined;
  const avatarRemoved =
    req.body?.avatarRemoved !== undefined ? Boolean(req.body.avatarRemoved) : undefined;

  if (!studentId || firstName.length < 2 || lastName.length < 2) {
    res.status(422).json({
      success: false,
      message: 'نام و نام خانوادگی باید حداقل ۲ کاراکتر باشند.',
    });
    return;
  }

  if (rawEmail !== undefined && !isValidEmailServer(rawEmail)) {
    res.status(422).json({
      success: false,
      message: 'فرمت آدرس ایمیل واردشده معتبر نیست.',
    });
    return;
  }

  if (rawBio !== undefined && rawBio.length > 500) {
    res.status(422).json({
      success: false,
      message: 'متن بیوگرافی نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.',
    });
    return;
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'دانش‌آموز در پایگاه داده یافت نشد.',
      });
      return;
    }

    const existing = rows[0];
    // Explicitly enforce phone immutability on the backend:
    if (
      req.body?.phone !== undefined &&
      normalizeDigitsServer(String(req.body.phone)) !== String(existing.phone)
    ) {
      res.status(403).json({
        success: false,
        message: 'تغییر شماره موبایل ثبت‌نامی توسط دانش‌آموز مجاز نیست.',
      });
      return;
    }

    const oldAvatarUrl = existing.avatar_url ? String(existing.avatar_url) : null;
    const nextEmail = rawEmail !== undefined ? rawEmail : String(existing.email || '');
    const nextBio = rawBio !== undefined ? rawBio : String(existing.bio || '');
    const nextAvatarRemoved =
      avatarRemoved !== undefined
        ? avatarRemoved
          ? 1
          : 0
        : Number(existing.avatar_removed || 0);
    const nextAvatarUrl = nextAvatarRemoved
      ? null
      : avatarUrl !== undefined
      ? avatarUrl || null
      : oldAvatarUrl;

    await pool.query(
      `UPDATE students
       SET first_name = ?, last_name = ?, email = ?, bio = ?, avatar_url = ?, avatar_removed = ?
       WHERE id = ?`,
      [firstName, lastName, nextEmail, nextBio, nextAvatarUrl, nextAvatarRemoved, studentId]
    );

    if (oldAvatarUrl && oldAvatarUrl !== nextAvatarUrl) {
      await safeDeleteUploadedFileIfUnreferenced(oldAvatarUrl, studentId);
    }

    const updatedStudent = {
      id: Number(existing.id),
      firstName,
      lastName,
      phone: String(existing.phone), // Immutable
      email: nextEmail,
      bio: nextBio,
      classCode: String(existing.class_code ?? ''),
      status: (existing.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(existing.notes || ''),
      avatarUrl: nextAvatarUrl || undefined,
      avatarRemoved: Boolean(nextAvatarRemoved),
      createdAt: existing.created_at
        ? new Date(existing.created_at).toLocaleDateString('fa-IR')
        : '',
    };

    await syncStudentIntoExtendedState(updatedStudent);

    res.json({
      success: true,
      message: 'مشخصات پروفایل شما در پایگاه داده بروزرسانی شد.',
      student: updatedStudent,
    });
  } catch (err: unknown) {
    console.error('[Student Profile Update Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در بروزرسانی پروفایل دانش‌آموز در پایگاه داده.',
    });
  }
});

app.post('/api/student/password', async (req: Request, res: Response): Promise<void> => {
  const studentId = Number(req.body?.studentId ?? req.body?.id ?? 0);
  const newPassword = String(req.body?.newPassword ?? req.body?.password ?? '');

  if (!studentId || newPassword.length < 6) {
    res.status(422).json({
      success: false,
      message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
    });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE students SET password_hash = ? WHERE id = ?',
      [passwordHash, studentId]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب دانش‌آموز در پایگاه داده یافت نشد.',
      });
      return;
    }
    res.json({
      success: true,
      message: 'رمز عبور جدید شما با موفقیت در پایگاه داده ثبت شد.',
    });
  } catch (err: unknown) {
    console.error('[Student Password Update Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در تغییر رمز عبور دانش‌آموز.',
    });
  }
});

/**
 * 5. Dedicated Admin Profile, Password, and Student Management Endpoints
 */
app.put('/api/admin/profile', async (req: Request, res: Response): Promise<void> => {
  const firstName = String(req.body?.firstName ?? '').trim();
  const lastName = String(req.body?.lastName ?? '').trim();
  const phone = normalizeDigitsServer(String(req.body?.phone ?? ''));
  const email = String(req.body?.email ?? '').trim();
  const roleTitle = String(req.body?.roleTitle ?? '').trim();
  const bio = String(req.body?.bio ?? '').trim();
  const avatarUrl =
    req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '') : undefined;

  if (firstName.length < 2 || lastName.length < 2 || !/^09\d{9}$/.test(phone)) {
    res.status(422).json({
      success: false,
      message: 'نام، نام خانوادگی یا شماره همراه مدیر معتبر نیست.',
    });
    return;
  }

  try {
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM admins ORDER BY id ASC LIMIT 1'
    );
    if (adminRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب مدیر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const currentAdmin = adminRows[0];
    const nextAvatarUrl =
      avatarUrl !== undefined
        ? avatarUrl || null
        : currentAdmin.avatar_url
        ? String(currentAdmin.avatar_url)
        : null;

    await pool.query(
      `UPDATE admins
       SET first_name = ?, last_name = ?, phone = ?, email = ?, role_title = ?, bio = ?, avatar_url = ?
       WHERE id = ?`,
      [
        firstName,
        lastName,
        phone,
        email,
        roleTitle || 'مدیر و مدرس ارشد',
        bio,
        nextAvatarUrl,
        currentAdmin.id,
      ]
    );

    const updatedAdmin = {
      firstName,
      lastName,
      phone,
      email,
      roleTitle: roleTitle || 'مدیر و مدرس ارشد',
      bio,
      password: '',
      avatarUrl: nextAvatarUrl || '',
    };

    res.json({
      success: true,
      message: 'اطلاعات پروفایل مدیر در پایگاه داده MySQL ذخیره شد.',
      admin: updatedAdmin,
    });
  } catch (err: unknown) {
    console.error('[Admin Profile Update Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در بروزرسانی پروفایل مدیر در پایگاه داده.',
    });
  }
});

app.post('/api/admin/password', async (req: Request, res: Response): Promise<void> => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (newPassword.length < 6) {
    res.status(422).json({
      success: false,
      message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
    });
    return;
  }

  try {
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, password_hash FROM admins ORDER BY id ASC LIMIT 1'
    );
    if (adminRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب مدیر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const admin = adminRows[0];
    if (currentPassword) {
      const isValid = await verifyPasswordHash(
        currentPassword,
        String(admin.password_hash || '')
      );
      if (!isValid) {
        res.status(401).json({
          success: false,
          message: 'رمز عبور فعلی واردشده صحیح نیست.',
        });
        return;
      }
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [
      newHash,
      admin.id,
    ]);

    res.json({
      success: true,
      message: 'رمز عبور مدیریت با موفقیت در پایگاه داده بروزرسانی شد.',
    });
  } catch (err: unknown) {
    console.error('[Admin Password Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در تغییر رمز عبور مدیر.',
    });
  }
});

app.post('/api/admin/students', async (req: Request, res: Response): Promise<void> => {
  if (String(req.headers['x-user-role'] || '') === 'student') {
    res.status(403).json({
      success: false,
      message: 'فقط مدیر سامانه مجاز به ایجاد دانش‌آموز جدید است.',
    });
    return;
  }

  const firstName = String(req.body?.firstName ?? '').trim();
  const lastName = String(req.body?.lastName ?? '').trim();
  const phone = normalizeDigitsServer(String(req.body?.phone ?? ''));
  const email = String(req.body?.email ?? '').trim();
  const bio = String(req.body?.bio ?? '').trim();
  const classCode = normalizeDigitsServer(String(req.body?.classCode ?? ''));
  const status = ['pending', 'approved', 'rejected'].includes(String(req.body?.status))
    ? (String(req.body.status) as 'pending' | 'approved' | 'rejected')
    : 'approved';
  const notes = String(req.body?.notes ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (
    firstName.length < 2 ||
    lastName.length < 2 ||
    !/^09\d{9}$/.test(phone) ||
    password.length < 6
  ) {
    res.status(422).json({
      success: false,
      message: 'اطلاعات دانش‌آموز نامعتبر است (نام، شماره همراه ۱۱ رقمی و رمز حداقل ۶ کاراکتر الزامی است).',
    });
    return;
  }

  if (!isValidEmailServer(email)) {
    res.status(422).json({
      success: false,
      message: 'فرمت آدرس ایمیل دانش‌آموز معتبر نیست.',
    });
    return;
  }

  if (bio.length > 500) {
    res.status(422).json({
      success: false,
      message: 'متن بیوگرافی دانش‌آموز نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.',
    });
    return;
  }

  try {
    const [dupSt] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM students WHERE phone = ? LIMIT 1',
      [phone]
    );
    const [dupAd] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM admins WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (dupSt.length > 0 || dupAd.length > 0) {
      res.status(409).json({
        success: false,
        message: 'این شماره موبایل قبلاً در سامانه ثبت شده است.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO students (first_name, last_name, phone, email, class_code, status, notes, bio, avatar_url, avatar_removed, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [firstName, lastName, phone, email, classCode, status, notes, bio, passwordHash]
    );

    const createdStudent = {
      id: Number(result.insertId),
      firstName,
      lastName,
      phone,
      email,
      bio,
      classCode,
      status,
      notes,
      avatarUrl: undefined,
      avatarRemoved: false,
      createdAt: new Date().toLocaleDateString('fa-IR'),
    };

    await syncStudentIntoExtendedState(createdStudent);

    res.status(201).json({
      success: true,
      message: 'دانش‌آموز جدید با موفقیت در پایگاه داده MySQL ثبت شد.',
      student: createdStudent,
    });
  } catch (err: unknown) {
    console.error('[Admin Create Student Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت دانش‌آموز در پایگاه داده.',
    });
  }
});

app.put('/api/admin/students/:id', async (req: Request, res: Response): Promise<void> => {
  if (String(req.headers['x-user-role'] || '') === 'student') {
    res.status(403).json({
      success: false,
      message: 'فقط مدیر سامانه مجاز به ویرایش اطلاعات مدیریتی دانش‌آموز است.',
    });
    return;
  }

  const studentId = Number(req.params.id || 0);
  if (!studentId) {
    res.status(400).json({ success: false, message: 'شناسه دانش‌آموز نامعتبر است.' });
    return;
  }

  try {
    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'دانش‌آموز مورد نظر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const existing = existingRows[0];
    const firstName =
      req.body?.firstName !== undefined
        ? String(req.body.firstName).trim()
        : String(existing.first_name);
    const lastName =
      req.body?.lastName !== undefined
        ? String(req.body.lastName).trim()
        : String(existing.last_name);
    const phone =
      req.body?.phone !== undefined
        ? normalizeDigitsServer(String(req.body.phone))
        : String(existing.phone);
    const email =
      req.body?.email !== undefined
        ? String(req.body.email).trim()
        : String(existing.email || '');
    const bio =
      req.body?.bio !== undefined
        ? String(req.body.bio).trim()
        : String(existing.bio || '');
    const classCode =
      req.body?.classCode !== undefined
        ? normalizeDigitsServer(String(req.body.classCode))
        : String(existing.class_code ?? '');
    const status =
      req.body?.status !== undefined &&
      ['pending', 'approved', 'rejected'].includes(String(req.body.status))
        ? (String(req.body.status) as 'pending' | 'approved' | 'rejected')
        : (existing.status as 'pending' | 'approved' | 'rejected');
    const notes =
      req.body?.notes !== undefined
        ? String(req.body.notes).trim()
        : String(existing.notes || '');

    const oldAvatarUrl = existing.avatar_url ? String(existing.avatar_url) : null;
    const nextAvatarRemoved =
      req.body?.avatarRemoved !== undefined
        ? req.body.avatarRemoved
          ? 1
          : 0
        : Number(existing.avatar_removed || 0);
    const nextAvatarUrl = nextAvatarRemoved
      ? null
      : req.body?.avatarUrl !== undefined
      ? req.body.avatarUrl
        ? String(req.body.avatarUrl)
        : null
      : oldAvatarUrl;

    if (firstName.length < 2 || lastName.length < 2 || !/^09\d{9}$/.test(phone)) {
      res.status(422).json({
        success: false,
        message: 'نام، نام خانوادگی یا شماره موبایل دانش‌آموز معتبر نیست.',
      });
      return;
    }

    if (!isValidEmailServer(email)) {
      res.status(422).json({
        success: false,
        message: 'فرمت آدرس ایمیل دانش‌آموز معتبر نیست.',
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

    // Check phone uniqueness if phone changed
    if (phone !== String(existing.phone)) {
      const [dupSt] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM students WHERE phone = ? AND id <> ? LIMIT 1',
        [phone, studentId]
      );
      const [dupAd] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM admins WHERE phone = ? LIMIT 1',
        [phone]
      );
      if (dupSt.length > 0 || dupAd.length > 0) {
        res.status(409).json({
          success: false,
          message: 'این شماره موبایل متعلق به کاربر دیگری در سامانه است.',
        });
        return;
      }
    }

    const rawPassword = String(req.body?.password ?? '').trim();
    if (rawPassword.length >= 6) {
      const passwordHash = await bcrypt.hash(rawPassword, 12);
      await pool.query(
        `UPDATE students
         SET first_name = ?, last_name = ?, phone = ?, email = ?, class_code = ?, status = ?, notes = ?, bio = ?, avatar_url = ?, avatar_removed = ?, password_hash = ?
         WHERE id = ?`,
        [
          firstName,
          lastName,
          phone,
          email,
          classCode,
          status,
          notes,
          bio,
          nextAvatarUrl,
          nextAvatarRemoved,
          passwordHash,
          studentId,
        ]
      );
    } else {
      await pool.query(
        `UPDATE students
         SET first_name = ?, last_name = ?, phone = ?, email = ?, class_code = ?, status = ?, notes = ?, bio = ?, avatar_url = ?, avatar_removed = ?
         WHERE id = ?`,
        [
          firstName,
          lastName,
          phone,
          email,
          classCode,
          status,
          notes,
          bio,
          nextAvatarUrl,
          nextAvatarRemoved,
          studentId,
        ]
      );
    }

    if (oldAvatarUrl && oldAvatarUrl !== nextAvatarUrl) {
      await safeDeleteUploadedFileIfUnreferenced(oldAvatarUrl, studentId);
    }

    const updatedStudent = {
      id: studentId,
      firstName,
      lastName,
      phone,
      email,
      bio,
      classCode,
      status,
      notes,
      avatarUrl: nextAvatarUrl || undefined,
      avatarRemoved: Boolean(nextAvatarRemoved),
      createdAt: existing.created_at
        ? new Date(existing.created_at).toLocaleDateString('fa-IR')
        : '',
    };

    await syncStudentIntoExtendedState(updatedStudent);

    res.json({
      success: true,
      message: 'اطلاعات دانش‌آموز با موفقیت در پایگاه داده MySQL بروزرسانی شد.',
      student: updatedStudent,
    });
  } catch (err: unknown) {
    console.error('[Admin Update Student Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در بروزرسانی اطلاعات دانش‌آموز در پایگاه داده.',
    });
  }
});

/**
 * 5B. Admin Remove Student Profile Picture Endpoint (DELETE /api/admin/students/:id/avatar)
 * Reverts student's profile picture to the default account icon, updates MySQL, and safely deletes unreferenced physical file.
 */
app.delete('/api/admin/students/:id/avatar', async (req: Request, res: Response): Promise<void> => {
  if (String(req.headers['x-user-role'] || '') === 'student') {
    res.status(403).json({
      success: false,
      message: 'فقط مدیر سامانه مجاز به حذف تصویر پروفایل دانش‌آموز است.',
    });
    return;
  }

  const studentId = Number(req.params.id || 0);
  if (!studentId) {
    res.status(400).json({ success: false, message: 'شناسه دانش‌آموز نامعتبر است.' });
    return;
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'دانش‌آموز مورد نظر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const existing = rows[0];
    const oldAvatarUrl = existing.avatar_url ? String(existing.avatar_url) : null;

    await pool.query(
      'UPDATE students SET avatar_url = NULL, avatar_removed = 1 WHERE id = ?',
      [studentId]
    );

    const fileDeleted = await safeDeleteUploadedFileIfUnreferenced(oldAvatarUrl, studentId);

    const updatedStudent = {
      id: studentId,
      firstName: String(existing.first_name),
      lastName: String(existing.last_name),
      phone: String(existing.phone),
      email: String(existing.email || ''),
      bio: String(existing.bio || ''),
      classCode: String(existing.class_code ?? ''),
      status: (existing.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(existing.notes || ''),
      avatarUrl: undefined,
      avatarRemoved: true,
      createdAt: existing.created_at
        ? new Date(existing.created_at).toLocaleDateString('fa-IR')
        : '',
    };

    await syncStudentIntoExtendedState(updatedStudent);

    res.json({
      success: true,
      fileDeleted,
      message: 'تصویر پروفایل دانش‌آموز حذف شد و آیکون پیش‌فرض حساب جایگزین گردید.',
      student: updatedStudent,
    });
  } catch (err: unknown) {
    console.error('[Admin Delete Student Avatar Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در حذف تصویر پروفایل دانش‌آموز.',
    });
  }
});

/**
 * 5C. Admin Close / Reopen Assignment Endpoint (POST /api/admin/assignments/:id/status)
 */
app.post('/api/admin/assignments/:id/status', async (req: Request, res: Response): Promise<void> => {
  if (String(req.headers['x-user-role'] || '') === 'student') {
    res.status(403).json({
      success: false,
      message: 'فقط مدیر یا مدرس مجاز به بستن یا بازگشایی تکلیف است.',
    });
    return;
  }

  const assignmentId = Number(req.params.id || 0);
  const nextStatus = String(req.body?.status || 'closed') === 'active' ? 'active' : 'closed';

  if (!assignmentId) {
    res.status(400).json({ success: false, message: 'شناسه تکلیف نامعتبر است.' });
    return;
  }

  try {
    const extState = await readExtendedState();
    const assignmentsList = Array.isArray(extState.assignments)
      ? ([...extState.assignments] as Record<string, unknown>[])
      : [];
    const targetIdx = assignmentsList.findIndex((a) => Number(a.id) === assignmentId);

    const [relRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM assignments WHERE id = ? LIMIT 1',
      [assignmentId]
    );

    if (targetIdx < 0 && relRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'تکلیف مورد نظر در پایگاه داده یافت نشد.',
      });
      return;
    }

    await pool.query('UPDATE assignments SET status = ? WHERE id = ?', [
      nextStatus,
      assignmentId,
    ]);

    let updatedHw: Record<string, unknown> | undefined;
    if (targetIdx >= 0) {
      assignmentsList[targetIdx] = {
        ...assignmentsList[targetIdx],
        status: nextStatus,
        closedAt:
          nextStatus === 'closed'
            ? new Date().toLocaleDateString('fa-IR')
            : undefined,
      };
      updatedHw = assignmentsList[targetIdx];
      extState.assignments = assignmentsList;
      await writeExtendedState(extState);
    } else if (relRows.length > 0) {
      updatedHw = {
        id: assignmentId,
        title: String(relRows[0].title || ''),
        description: String(relRows[0].description || ''),
        classCode: String(relRows[0].class_code || 'all'),
        dueDate: String(relRows[0].due_date || ''),
        maxScore: Number(relRows[0].max_score || 20),
        attachmentName: String(relRows[0].attachment_name || ''),
        status: nextStatus,
      };
    }

    res.json({
      success: true,
      status: nextStatus,
      assignment: updatedHw,
      message:
        nextStatus === 'closed'
          ? 'تکلیف با موفقیت بسته شد و ارسال یا ویرایش پاسخ برای دانش‌آموزان غیرفعال گردید.'
          : 'تکلیف مجدداً برای دریافت پاسخ دانش‌آموزان فعال شد.',
    });
  } catch (err: unknown) {
    console.error('[Admin Assignment Status Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در تغییر وضعیت تکلیف در پایگاه داده.',
    });
  }
});

/**
 * 5D. Student Submit / Edit Assignment Endpoint (POST /api/student/assignments/:id/submit)
 * Strictly enforces:
 *   1) Assignment exists
 *   2) Assignment is NOT closed by administrator (status !== 'closed')
 *   3) Assignment deadline has NOT passed relative to server time
 *   4) Existing submission has NOT already been graded
 */
app.post('/api/student/assignments/:id/submit', async (req: Request, res: Response): Promise<void> => {
  const assignmentId = Number(req.params.id || 0);
  const studentId = Number(req.body?.studentId ?? req.body?.student_id ?? 0);
  const fileName = String(req.body?.fileName ?? '').trim();
  const fileContent = String(req.body?.fileContent ?? '').trim();
  const fileDataUrl = req.body?.fileDataUrl ? String(req.body.fileDataUrl) : undefined;
  const submittedAt =
    String(req.body?.submittedAt || '').trim() ||
    `${new Date().toLocaleDateString('fa-IR')} · هم‌اکنون`;

  if (!assignmentId || !studentId || (!fileName && !fileContent)) {
    res.status(422).json({
      success: false,
      message: 'اطلاعات ارسالی تکلیف ناقص است.',
    });
    return;
  }

  try {
    const [stRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    if (stRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'حساب دانش‌آموز در پایگاه داده یافت نشد.',
      });
      return;
    }
    const studentRow = stRows[0];

    const extState = await readExtendedState();
    const assignmentsList = Array.isArray(extState.assignments)
      ? (extState.assignments as Record<string, unknown>[])
      : [];
    const extHw = assignmentsList.find((a) => Number(a.id) === assignmentId);

    const [relHwRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM assignments WHERE id = ? LIMIT 1',
      [assignmentId]
    );
    const relHw = relHwRows[0];

    if (!extHw && !relHw) {
      res.status(404).json({
        success: false,
        message: 'تکلیف مورد نظر در پایگاه داده یافت نشد.',
      });
      return;
    }

    const hwStatus = String(extHw?.status || relHw?.status || 'active');
    const hwDueDate = String(extHw?.dueDate || relHw?.due_date || '');
    const hwTitle = String(extHw?.title || relHw?.title || 'تکلیف');

    // Backend Enforcement #1: Closed by Administrator
    if (hwStatus === 'closed') {
      res.status(403).json({
        success: false,
        code: 'ASSIGNMENT_CLOSED',
        message:
          'این تکلیف توسط مدرس بسته شده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
      });
      return;
    }

    // Backend Enforcement #2: Deadline Expired (compared against authoritative server time)
    if (isAssignmentExpiredServer(hwDueDate, Date.now())) {
      res.status(403).json({
        success: false,
        code: 'ASSIGNMENT_EXPIRED',
        message:
          'مهلت ارسال این تکلیف به پایان رسیده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
      });
      return;
    }

    const submissionsList = Array.isArray(extState.submissions)
      ? ([...extState.submissions] as Record<string, unknown>[])
      : [];
    const existingIdx = submissionsList.findIndex(
      (s) =>
        Number(s.assignmentId) === assignmentId && Number(s.studentId) === studentId
    );

    if (existingIdx >= 0 && submissionsList[existingIdx].status === 'graded') {
      res.status(403).json({
        success: false,
        code: 'SUBMISSION_ALREADY_GRADED',
        message:
          'پاسخ شما قبلاً توسط مدرس تصحیح و نمره‌دهی شده است و امکان ویرایش مجدد ندارد.',
      });
      return;
    }

    const studentFullName = `${String(studentRow.first_name)} ${String(studentRow.last_name)}`;
    const studentClassCode = String(studentRow.class_code || '901');
    const resolvedFileName = fileName || 'پاسخ-متنی-دانش‌آموز.txt';
    const resolvedContent = fileContent || `فایل پیوست: ${resolvedFileName}`;

    let submissionObj: Record<string, unknown>;
    if (existingIdx >= 0) {
      submissionObj = {
        ...submissionsList[existingIdx],
        fileName: resolvedFileName,
        fileContent: resolvedContent,
        fileDataUrl: fileDataUrl || submissionsList[existingIdx].fileDataUrl,
        submittedAt,
        status: 'pending',
      };
      submissionsList[existingIdx] = submissionObj;
    } else {
      submissionObj = {
        id: Date.now(),
        assignmentId,
        studentId,
        studentName: studentFullName,
        classCode: studentClassCode,
        fileName: resolvedFileName,
        fileContent: resolvedContent,
        fileDataUrl,
        submittedAt,
        score: null,
        teacherFeedback: '',
        status: 'pending',
      };
      submissionsList.unshift(submissionObj);
    }

    // Persist in relational `assignment_submissions` table as well
    try {
      const [existingSubRows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1',
        [assignmentId, studentId]
      );
      if (existingSubRows.length > 0) {
        await pool.query(
          `UPDATE assignment_submissions
           SET file_name = ?, file_content = ?, submitted_at = ?, status = 'pending'
           WHERE id = ?`,
          [resolvedFileName, resolvedContent, submittedAt, existingSubRows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO assignment_submissions (assignment_id, student_id, file_name, file_content, submitted_at, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [assignmentId, studentId, resolvedFileName, resolvedContent, submittedAt]
        );
      }
    } catch {
      // Relational assignment_submissions sync is best-effort if assignment id is timestamp-based
    }

    const activitiesList = Array.isArray(extState.activities)
      ? ([...extState.activities] as Record<string, unknown>[])
      : [];
    activitiesList.unshift({
      id: Date.now() + 1,
      title: `${existingIdx >= 0 ? 'ویرایش' : 'ارسال'} تکلیف توسط ${studentFullName}`,
      detail: `تکلیف: ${hwTitle} (کلاس ${studentClassCode})`,
      timeAgo: 'لحظاتی پیش',
      category: 'assignment',
    });

    extState.submissions = submissionsList;
    extState.activities = activitiesList.slice(0, 25);
    await writeExtendedState(extState);

    res.json({
      success: true,
      isEdit: existingIdx >= 0,
      submission: submissionObj,
      message:
        existingIdx >= 0
          ? 'پاسخ تکلیف شما با موفقیت بروزرسانی شد.'
          : 'پاسخ تکلیف شما با موفقیت ثبت و برای مدرس ارسال گردید.',
    });
  } catch (err: unknown) {
    console.error('[Student Assignment Submit Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت پاسخ تکلیف در پایگاه داده.',
    });
  }
});

/**
 * 5E. Student Reply to Ticket Endpoint (POST /api/student/tickets/:id/reply)
 * Strictly prevents students from replying or attaching files to closed tickets ('بسته شده')!
 */
app.post('/api/student/tickets/:id/reply', async (req: Request, res: Response): Promise<void> => {
  const ticketId = Number(req.params.id || 0);
  const studentId = Number(req.body?.studentId ?? req.body?.student_id ?? 0);
  const message = String(req.body?.message ?? '').trim();
  const attachmentName = req.body?.attachmentName
    ? String(req.body.attachmentName).trim()
    : undefined;
  const attachmentDataUrl = req.body?.attachmentDataUrl
    ? String(req.body.attachmentDataUrl)
    : undefined;
  const sentAt =
    String(req.body?.sentAt || '').trim() ||
    `${new Date().toLocaleDateString('fa-IR')} · هم‌اکنون`;

  if (!ticketId || !studentId || !message) {
    res.status(422).json({
      success: false,
      message: 'متن پیام پاسخ تیکت الزامی است.',
    });
    return;
  }

  try {
    const extState = await readExtendedState();
    const ticketsList = Array.isArray(extState.tickets)
      ? ([...extState.tickets] as Record<string, unknown>[])
      : [];
    const tkIdx = ticketsList.findIndex((t) => Number(t.id) === ticketId);

    if (tkIdx < 0) {
      res.status(404).json({
        success: false,
        message: 'تیکت مورد نظر یافت نشد.',
      });
      return;
    }

    const tk = ticketsList[tkIdx];
    if (Number(tk.studentId) !== studentId) {
      res.status(403).json({
        success: false,
        message: 'شما مجاز به ارسال پیام در این تیکت نیستید.',
      });
      return;
    }

    // Backend Enforcement: Reject student replies to closed tickets
    if (String(tk.status) === 'بسته شده') {
      res.status(403).json({
        success: false,
        code: 'TICKET_CLOSED',
        message:
          'این تیکت توسط مدیریت بسته شده است و امکان ارسال پیام یا فایل جدید در آن وجود ندارد.',
      });
      return;
    }

    const messages = Array.isArray(tk.messages)
      ? ([...tk.messages] as Record<string, unknown>[])
      : [];
    const newMsg = {
      id: Date.now(),
      senderRole: 'student',
      senderName: String(tk.studentName || 'دانش‌آموز'),
      message,
      sentAt,
      attachmentName,
      attachmentDataUrl,
    };
    messages.push(newMsg);

    const updatedTicket = {
      ...tk,
      status: 'در انتظار پاسخ',
      messages,
    };
    ticketsList[tkIdx] = updatedTicket;
    extState.tickets = ticketsList;
    await writeExtendedState(extState);

    res.json({
      success: true,
      ticket: updatedTicket,
      message: 'پیام شما در تیکت ثبت و برای مدرس ارسال گردید.',
    });
  } catch (err: unknown) {
    console.error('[Student Ticket Reply Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ثبت پاسخ تیکت در پایگاه داده.',
    });
  }
});

/**
 * 6. Full Application State Sync with MySQL (GET /api/state & POST /api/state)
 */
app.get('/api/state', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM admins ORDER BY id ASC LIMIT 1'
    );
    const [classRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM classes ORDER BY code ASC'
    );
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students ORDER BY id DESC'
    );
    const [assignmentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM assignments ORDER BY id DESC'
    );
    const savedExtendedState = await readExtendedState();

    // Map extended state students by id so any fallback properties are preserved,
    // while MySQL columns are the primary source of truth.
    const extStudentsMap = new Map<number, Record<string, unknown>>();
    if (Array.isArray(savedExtendedState.students)) {
      for (const s of savedExtendedState.students as Record<string, unknown>[]) {
        if (s && typeof s.id === 'number') {
          extStudentsMap.set(s.id, s);
        }
      }
    }

    const students = studentRows.map((row) => {
      const id = Number(row.id);
      const extSt = extStudentsMap.get(id) || {};
      const dbAvatarUrl = row.avatar_url ? String(row.avatar_url) : undefined;
      const dbAvatarRemoved = Boolean(row.avatar_removed);
      return {
        ...extSt,
        id,
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        phone: String(row.phone),
        email:
          row.email !== undefined && row.email !== null
            ? String(row.email)
            : String(extSt.email || ''),
        bio:
          row.bio !== undefined && row.bio !== null
            ? String(row.bio)
            : String(extSt.bio || ''),
        classCode: String(row.class_code ?? ''),
        status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
        notes: String(row.notes || ''),
        avatarUrl: dbAvatarRemoved
          ? undefined
          : dbAvatarUrl || (extSt.avatarUrl ? String(extSt.avatarUrl) : undefined),
        avatarRemoved: dbAvatarRemoved,
        createdAt: row.created_at
          ? new Date(row.created_at).toLocaleDateString('fa-IR')
          : String(extSt.createdAt || ''),
      };
    });

    // Ensure relational assignments.status is reflected in returned assignments
    const relStatusMap = new Map<number, 'active' | 'closed'>();
    for (const r of assignmentRows) {
      relStatusMap.set(
        Number(r.id),
        String(r.status) === 'closed' ? 'closed' : 'active'
      );
    }
    const extAssignments = Array.isArray(savedExtendedState.assignments)
      ? (savedExtendedState.assignments as Record<string, unknown>[]).map((hw) => {
          const hwId = Number(hw.id);
          const relSt = relStatusMap.get(hwId);
          return {
            ...hw,
            status:
              relSt || (String(hw.status) === 'closed' ? 'closed' : 'active'),
          };
        })
      : [];

    const classes = classRows.map((row) => ({
      code: String(row.code),
      title: String(row.title),
      gradeLevel: String(row.grade_level || ''),
      instructorName: String(row.instructor_name),
      capacity: Number(row.capacity || 30),
      roomOrLink: String(row.room_or_link),
      scheduleSummary: String(row.schedule_summary),
      description: String(row.description),
    }));

    const extAdmin = (savedExtendedState.admin || {}) as Record<string, unknown>;
    const admin = adminRows[0]
      ? {
          ...extAdmin,
          firstName: String(adminRows[0].first_name),
          lastName: String(adminRows[0].last_name),
          phone: String(adminRows[0].phone),
          email: String(adminRows[0].email),
          roleTitle: String(adminRows[0].role_title),
          bio: String(adminRows[0].bio || ''),
          avatarUrl: adminRows[0].avatar_url
            ? String(adminRows[0].avatar_url)
            : String(extAdmin.avatarUrl || ''),
          password: '',
        }
      : undefined;

    res.json({
      success: true,
      serverNowMs: Date.now(),
      data: {
        ...savedExtendedState,
        ...(admin ? { admin } : {}),
        classes: classes.length > 0 ? classes : savedExtendedState.classes || [],
        students,
        assignments: extAssignments,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      message: 'خطا در خواندن اطلاعات از پایگاه داده MySQL.',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/state', async (req: Request, res: Response): Promise<void> => {
  const state = req.body;
  if (!state || typeof state !== 'object') {
    res.status(400).json({ success: false, message: 'داده نامعتبر است.' });
    return;
  }

  // Enforce backend security rules on state mutations before touching the database
  const callerRole = String(req.headers['x-user-role'] || '');
  const prevExtState = await readExtendedState();
  const prevAssignments = Array.isArray(prevExtState.assignments)
    ? (prevExtState.assignments as Record<string, unknown>[])
    : [];
  const prevSubmissions = Array.isArray(prevExtState.submissions)
    ? (prevExtState.submissions as Record<string, unknown>[])
    : [];
  const prevTickets = Array.isArray(prevExtState.tickets)
    ? (prevExtState.tickets as Record<string, unknown>[])
    : [];

  // 0A. Prevent students from modifying assignment status/dueDate via /api/state
  if (callerRole === 'student' && Array.isArray(state.assignments)) {
    for (const prevHw of prevAssignments) {
      const incomingHw = (state.assignments as Record<string, unknown>[]).find(
        (a) => Number(a.id) === Number(prevHw.id)
      );
      if (
        incomingHw &&
        (String(incomingHw.status || 'active') !== String(prevHw.status || 'active') ||
          String(incomingHw.dueDate || '') !== String(prevHw.dueDate || ''))
      ) {
        res.status(403).json({
          success: false,
          message: 'دانش‌آموز مجاز به تغییر وضعیت یا مهلت تکلیف نیست.',
        });
        return;
      }
    }
  }

  // 0B. Prevent adding or editing student submissions on closed or expired assignments
  if (Array.isArray(state.submissions)) {
    const incomingSubs = state.submissions as Record<string, unknown>[];
    for (const sub of incomingSubs) {
      const subId = Number(sub.id) || 0;
      const hwId = Number(sub.assignmentId) || 0;
      const studentId = Number(sub.studentId) || 0;

      const prevSub = prevSubmissions.find(
        (p) =>
          (subId > 0 && Number(p.id) === subId) ||
          (Number(p.assignmentId) === hwId && Number(p.studentId) === studentId)
      );

      const isNewOrStudentEdited =
        !prevSub ||
        String(prevSub.fileName || '') !== String(sub.fileName || '') ||
        String(prevSub.fileContent || '') !== String(sub.fileContent || '') ||
        String(prevSub.fileDataUrl || '') !== String(sub.fileDataUrl || '');

      if (isNewOrStudentEdited) {
        const refHw =
          prevAssignments.find((a) => Number(a.id) === hwId) ||
          (Array.isArray(state.assignments)
            ? (state.assignments as Record<string, unknown>[]).find(
                (a) => Number(a.id) === hwId
              )
            : undefined);

        if (refHw) {
          if (String(refHw.status) === 'closed') {
            res.status(403).json({
              success: false,
              code: 'ASSIGNMENT_CLOSED',
              message:
                'این تکلیف توسط مدرس بسته شده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
            });
            return;
          }
          if (isAssignmentExpiredServer(String(refHw.dueDate || ''), Date.now())) {
            res.status(403).json({
              success: false,
              code: 'ASSIGNMENT_EXPIRED',
              message:
                'مهلت ارسال این تکلیف به پایان رسیده است و امکان ارسال یا ویرایش پاسخ وجود ندارد.',
            });
            return;
          }
        }
      }
    }
  }

  // 0C. Prevent student replies or reopening of closed tickets ('بسته شده')
  if (Array.isArray(state.tickets)) {
    const incomingTickets = state.tickets as Record<string, unknown>[];
    for (const tk of incomingTickets) {
      const tkId = Number(tk.id) || 0;
      const prevTk = prevTickets.find((p) => Number(p.id) === tkId);
      if (prevTk && String(prevTk.status) === 'بسته شده') {
        const prevMsgs = Array.isArray(prevTk.messages)
          ? (prevTk.messages as Record<string, unknown>[])
          : [];
        const nextMsgs = Array.isArray(tk.messages)
          ? (tk.messages as Record<string, unknown>[])
          : [];

        const addedMsgs = nextMsgs.slice(prevMsgs.length);
        const hasNewStudentReply = addedMsgs.some(
          (m) => String(m.senderRole) === 'student'
        );

        if (
          hasNewStudentReply ||
          (callerRole === 'student' &&
            (nextMsgs.length !== prevMsgs.length ||
              String(tk.status) !== 'بسته شده'))
        ) {
          res.status(403).json({
            success: false,
            code: 'TICKET_CLOSED',
            message:
              'این تیکت توسط مدیریت بسته شده است و امکان ارسال پیام یا فایل جدید در آن وجود ندارد.',
          });
          return;
        }
      }
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Sync Admin profile (match by primary admin id so phone changes also persist)
    if (state.admin && typeof state.admin === 'object') {
      const [adminRows] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM admins ORDER BY id ASC LIMIT 1'
      );
      if (adminRows.length > 0) {
        const adminId = Number(adminRows[0].id);
        const adminPhone = normalizeDigitsServer(String(state.admin.phone || ''));
        const avatarUrl = state.admin.avatarUrl
          ? String(state.admin.avatarUrl)
          : null;

        if (state.admin.password && String(state.admin.password).length >= 6) {
          const newAdminHash = await bcrypt.hash(String(state.admin.password), 12);
          await conn.query(
            `UPDATE admins
             SET first_name = ?, last_name = ?, phone = IF(? <> '', ?, phone), email = ?, role_title = ?, bio = ?, avatar_url = ?, password_hash = ?
             WHERE id = ?`,
            [
              String(state.admin.firstName || ''),
              String(state.admin.lastName || ''),
              adminPhone,
              adminPhone,
              String(state.admin.email || ''),
              String(state.admin.roleTitle || ''),
              String(state.admin.bio || ''),
              avatarUrl,
              newAdminHash,
              adminId,
            ]
          );
        } else {
          await conn.query(
            `UPDATE admins
             SET first_name = ?, last_name = ?, phone = IF(? <> '', ?, phone), email = ?, role_title = ?, bio = ?, avatar_url = ?
             WHERE id = ?`,
            [
              String(state.admin.firstName || ''),
              String(state.admin.lastName || ''),
              adminPhone,
              adminPhone,
              String(state.admin.email || ''),
              String(state.admin.roleTitle || ''),
              String(state.admin.bio || ''),
              avatarUrl,
              adminId,
            ]
          );
        }
      }
    }

    // 2. Sync Classes (support any class code and remove deleted classes)
    if (Array.isArray(state.classes)) {
      const activeCodes: string[] = [];
      for (const cls of state.classes) {
        const code = normalizeDigitsServer(String(cls.code || '')).trim();
        if (code) {
          activeCodes.push(code);
          await conn.query(
            `INSERT INTO classes (code, title, grade_level, instructor_name, capacity, room_or_link, schedule_summary, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title),
               grade_level = VALUES(grade_level),
               instructor_name = VALUES(instructor_name),
               capacity = VALUES(capacity),
               room_or_link = VALUES(room_or_link),
               schedule_summary = VALUES(schedule_summary),
               description = VALUES(description)`,
            [
              code,
              String(cls.title || ''),
              String(cls.gradeLevel || ''),
              String(cls.instructorName || ''),
              Number(cls.capacity || 30),
              String(cls.roomOrLink || ''),
              String(cls.scheduleSummary || ''),
              String(cls.description || ''),
            ]
          );
        }
      }
      if (activeCodes.length > 0) {
        await conn.query(
          `DELETE FROM classes WHERE code NOT IN (${activeCodes
            .map(() => '?')
            .join(',')})`,
          activeCodes
        );
      } else {
        await conn.query('DELETE FROM classes');
      }
    }

    // 3. Sync Students metadata (match by `id` first so phone edits, email, bio & class removals persist!)
    if (Array.isArray(state.students)) {
      for (const st of state.students) {
        const stId = Number(st.id) || 0;
        const cleanPhone = normalizeDigitsServer(String(st.phone || ''));
        const email = String(st.email || '').trim().slice(0, 150);
        const bio = String(st.bio || '').trim().slice(0, 500);
        const classCode = normalizeDigitsServer(String(st.classCode ?? ''));
        const validStatus = ['pending', 'approved', 'rejected'].includes(
          String(st.status)
        )
          ? String(st.status)
          : 'pending';
        const avatarUrl = st.avatarRemoved
          ? null
          : st.avatarUrl
          ? String(st.avatarUrl)
          : null;
        const avatarRemoved = st.avatarRemoved ? 1 : 0;

        if (!/^09\d{9}$/.test(cleanPhone)) continue;

        if (st.password && String(st.password).length >= 6) {
          const stHash = await bcrypt.hash(String(st.password), 12);
          if (stId > 0) {
            const [existingById] = await conn.query<RowDataPacket[]>(
              'SELECT id FROM students WHERE id = ? LIMIT 1',
              [stId]
            );
            if (existingById.length > 0) {
              await conn.query(
                `UPDATE students
                 SET first_name = ?, last_name = ?, phone = ?, email = ?, class_code = ?, status = ?, notes = ?, bio = ?, avatar_url = ?, avatar_removed = ?, password_hash = ?
                 WHERE id = ?`,
                [
                  String(st.firstName || ''),
                  String(st.lastName || ''),
                  cleanPhone,
                  email,
                  classCode,
                  validStatus,
                  String(st.notes || ''),
                  bio,
                  avatarUrl,
                  avatarRemoved,
                  stHash,
                  stId,
                ]
              );
              continue;
            }
          }

          await conn.query(
            `INSERT INTO students (first_name, last_name, phone, email, class_code, status, notes, bio, avatar_url, avatar_removed, password_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               first_name = VALUES(first_name),
               last_name = VALUES(last_name),
               email = VALUES(email),
               class_code = VALUES(class_code),
               status = VALUES(status),
               notes = VALUES(notes),
               bio = VALUES(bio),
               avatar_url = VALUES(avatar_url),
               avatar_removed = VALUES(avatar_removed),
               password_hash = VALUES(password_hash)`,
            [
              String(st.firstName || ''),
              String(st.lastName || ''),
              cleanPhone,
              email,
              classCode,
              validStatus,
              String(st.notes || ''),
              bio,
              avatarUrl,
              avatarRemoved,
              stHash,
            ]
          );
        } else if (stId > 0) {
          await conn.query(
            `UPDATE students
             SET first_name = ?, last_name = ?, phone = ?, email = ?, class_code = ?, status = ?, notes = ?, bio = ?, avatar_url = ?, avatar_removed = ?
             WHERE id = ?`,
            [
              String(st.firstName || ''),
              String(st.lastName || ''),
              cleanPhone,
              email,
              classCode,
              validStatus,
              String(st.notes || ''),
              bio,
              avatarUrl,
              avatarRemoved,
              stId,
            ]
          );
        } else {
          await conn.query(
            `UPDATE students
             SET first_name = ?, last_name = ?, email = ?, class_code = ?, status = ?, notes = ?, bio = ?, avatar_url = ?, avatar_removed = ?
             WHERE phone = ?`,
            [
              String(st.firstName || ''),
              String(st.lastName || ''),
              email,
              classCode,
              validStatus,
              String(st.notes || ''),
              bio,
              avatarUrl,
              avatarRemoved,
              cleanPhone,
            ]
          );
        }
      }
    }

    // 4. Sync Relational Tables (`assignments`, `educational_resources`, `announcements`) for phpMyAdmin inspection
    if (Array.isArray(state.assignments)) {
      const assignmentIds: number[] = [];
      for (const hw of state.assignments) {
        const hwId = Number(hw.id) || 0;
        if (hwId > 0) {
          assignmentIds.push(hwId);
          await conn.query(
            `INSERT INTO assignments (id, title, description, class_code, due_date, max_score, attachment_name, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title),
               description = VALUES(description),
               class_code = VALUES(class_code),
               due_date = VALUES(due_date),
               max_score = VALUES(max_score),
               attachment_name = VALUES(attachment_name),
               status = VALUES(status)`,
            [
              hwId,
              String(hw.title || ''),
              String(hw.description || ''),
              String(hw.classCode || 'all'),
              String(hw.dueDate || ''),
              Number(hw.maxScore || 20),
              String(hw.attachmentName || ''),
              hw.status === 'closed' ? 'closed' : 'active',
            ]
          );
        }
      }
      if (assignmentIds.length > 0) {
        await conn.query(
          `DELETE FROM assignments WHERE id NOT IN (${assignmentIds
            .map(() => '?')
            .join(',')})`,
          assignmentIds
        );
      } else {
        await conn.query('DELETE FROM assignments');
      }
    }

    if (Array.isArray(state.resources)) {
      const resourceIds: number[] = [];
      for (const resItem of state.resources) {
        const rId = Number(resItem.id) || 0;
        if (rId > 0) {
          resourceIds.push(rId);
          const validCat = [
            'جزوه PDF',
            'فایل تمرین',
            'لینک آموزشی',
            'ویدیو ضبط‌شده',
          ].includes(String(resItem.category))
            ? String(resItem.category)
            : 'جزوه PDF';
          await conn.query(
            `INSERT INTO educational_resources (id, title, category, class_code, url_or_filename, file_size, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title),
               category = VALUES(category),
               class_code = VALUES(class_code),
               url_or_filename = VALUES(url_or_filename),
               file_size = VALUES(file_size),
               description = VALUES(description)`,
            [
              rId,
              String(resItem.title || ''),
              validCat,
              String(resItem.classCode || 'all'),
              String(resItem.urlOrFileName || '').slice(0, 255),
              String(resItem.fileSize || '—').slice(0, 40),
              String(resItem.description || ''),
              String(resItem.createdAt || ''),
            ]
          );
        }
      }
      if (resourceIds.length > 0) {
        await conn.query(
          `DELETE FROM educational_resources WHERE id NOT IN (${resourceIds
            .map(() => '?')
            .join(',')})`,
          resourceIds
        );
      } else {
        await conn.query('DELETE FROM educational_resources');
      }
    }

    if (Array.isArray(state.announcements)) {
      const annIds: number[] = [];
      for (const ann of state.announcements) {
        const aId = Number(ann.id) || 0;
        if (aId > 0) {
          annIds.push(aId);
          const validPriority = ['عادی', 'مهم', 'فوری'].includes(
            String(ann.priority)
          )
            ? String(ann.priority)
            : 'عادی';
          await conn.query(
            `INSERT INTO announcements (id, title, content, target_classes, priority, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title),
               content = VALUES(content),
               target_classes = VALUES(target_classes),
               priority = VALUES(priority)`,
            [
              aId,
              String(ann.title || ''),
              String(ann.content || ''),
              String(ann.targetClasses || 'all'),
              validPriority,
              String(ann.createdAt || ''),
            ]
          );
        }
      }
      if (annIds.length > 0) {
        await conn.query(
          `DELETE FROM announcements WHERE id NOT IN (${annIds
            .map(() => '?')
            .join(',')})`,
          annIds
        );
      } else {
        await conn.query('DELETE FROM announcements');
      }
    }

    // 5. Persist extended state (without plain passwords) in `system_settings`
    const [latestStudents] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM students ORDER BY id DESC'
    );
    const syncedStudents = latestStudents.map((row) => ({
      id: Number(row.id),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      phone: String(row.phone),
      email: String(row.email || ''),
      bio: String(row.bio || ''),
      classCode: String(row.class_code ?? ''),
      status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(row.notes || ''),
      avatarUrl: row.avatar_removed
        ? undefined
        : row.avatar_url
        ? String(row.avatar_url)
        : undefined,
      avatarRemoved: Boolean(row.avatar_removed),
      createdAt: row.created_at
        ? new Date(row.created_at).toLocaleDateString('fa-IR')
        : '',
    }));

    const sanitizedState = {
      ...state,
      admin: state.admin ? { ...state.admin, password: '' } : undefined,
      students: syncedStudents,
    };

    await conn.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('app_extended_state', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [JSON.stringify(sanitizedState)]
    );

    await conn.commit();
    res.json({
      success: true,
      serverNowMs: Date.now(),
      message: 'اطلاعات در پایگاه داده MySQL ذخیره شد.',
      students: syncedStudents,
    });
  } catch (err: unknown) {
    await conn.rollback();
    console.error('[POST /api/state Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در ذخیره‌سازی وضعیت در MySQL.',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    conn.release();
  }
});

/**
 * 7. Admin Operations Endpoint
 * GET/POST /api/admin (also /api/admin/index.php)
 */
async function handleAdminController(req: Request, res: Response): Promise<void> {
  const action = String(req.query.action || req.body?.action || 'summary');

  try {
    if (action === 'summary') {
      const [[totalSt]] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM students'
      );
      const [[pendingSt]] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM students WHERE status = 'pending'"
      );
      const [[pendingSub]] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM assignment_submissions WHERE status = 'pending'"
      );
      const [[openTick]] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE status = 'در انتظار پاسخ'"
      );

      res.json({
        success: true,
        stats: {
          totalStudents: Number(totalSt?.cnt ?? 0),
          pendingStudents: Number(pendingSt?.cnt ?? 0),
          pendingSubmits: Number(pendingSub?.cnt ?? 0),
          openTickets: Number(openTick?.cnt ?? 0),
        },
      });
      return;
    }

    if (action === 'approve_student') {
      const studentId = Number(req.body?.student_id ?? 0);
      const status = String(req.body?.status ?? 'approved');
      await pool.query('UPDATE students SET status = ? WHERE id = ?', [
        status,
        studentId,
      ]);
      res.json({
        success: true,
        message: 'وضعیت دانش‌آموز در MySQL بروزرسانی شد.',
      });
      return;
    }

    if (action === 'grade_submission') {
      const submissionId = Number(req.body?.submission_id ?? 0);
      const score = Number(req.body?.score ?? 0);
      const feedback = String(req.body?.feedback ?? '').trim();
      await pool.query(
        "UPDATE assignment_submissions SET score = ?, teacher_feedback = ?, status = 'graded' WHERE id = ?",
        [score, feedback, submissionId]
      );
      res.json({
        success: true,
        message: 'نمره و بازخورد تکلیف با موفقیت در MySQL ثبت شد.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'سرویس مدیریت Node.js اسکول میت آماده است.',
    });
  } catch (err: unknown) {
    console.error('[MySQL Admin Error]:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در اجرای عملیات پایگاه داده MySQL.',
    });
  }
}

app.all('/api/admin', handleAdminController);
app.all('/api/admin/index.php', handleAdminController);

let serverStarted = false;

export function startApiServer(port = Number(process.env.API_PORT) || 3001): void {
  if (serverStarted) return;
  serverStarted = true;

  const server = app.listen(port, '127.0.0.1', async () => {
    const info = getDbInfo();
    console.log(
      `[ScoolMeet API] Node.js Express server running at http://127.0.0.1:${port}`
    );
    console.log(
      `[ScoolMeet MySQL] Target -> ${info.user}@${info.host}:${info.port}/${info.database}`
    );
    const status = await testDatabaseConnection();
    if (status.connected) {
      console.log(
        `[ScoolMeet MySQL] Connected to '${status.database}' successfully.`
      );
      try {
        const migrationResult = await runMigrations();
        if (migrationResult.applied.length > 0) {
          console.log(
            `[ScoolMeet Migrations] Applied ${migrationResult.applied.length} pending migration(s): ${migrationResult.applied.join(', ')}`
          );
        } else {
          console.log(
            `[ScoolMeet Migrations] Schema is up to date (${migrationResult.totalExecuted} migration(s) verified).`
          );
        }
      } catch (migErr) {
        console.error('[ScoolMeet Migrations] Error applying migrations:', migErr);
      }
    } else {
      console.warn(
        `[ScoolMeet MySQL] Warning: Could not connect to MySQL (${status.error}). Ensure MySQL service is running.`
      );
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      return;
    }
    console.error('[ScoolMeet API Error]:', err);
  });
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server/index.ts') ||
    process.argv[1].endsWith('server\\index.ts'));

if (isDirectRun) {
  startApiServer();
}
