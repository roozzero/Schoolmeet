import express, { Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  ensureDatabaseSeeded,
  getDbInfo,
  pool,
  testDatabaseConnection,
} from './db';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
 * Helper: Verify bcrypt hash (supports PHP $2y$ and Node $2a$/$2b$)
 */
async function verifyPasswordHash(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (plain === hash) return true;
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
 * 1. Database Connection Test Endpoint
 * GET /api/test-db (also /api/health & /api/test-db.php)
 */
async function handleTestDb(_req: Request, res: Response): Promise<void> {
  const status = await testDatabaseConnection();
  if (status.connected) {
    try {
      await ensureDatabaseSeeded();
    } catch {
      // Ignore seed error if tables are not yet imported from schema.sql
    }
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
    await ensureDatabaseSeeded();

    // Check Admin credentials in `admins` table
    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, first_name, last_name, phone, email, role_title, bio, password_hash FROM admins WHERE phone = ? LIMIT 1',
      [phone]
    );

    if (adminRows.length > 0 || phone === '09120000000') {
      const admin = adminRows[0];
      const hashValid = admin
        ? await verifyPasswordHash(password, String(admin.password_hash || ''))
        : false;
      const isDefaultAdminPass =
        password === 'admin1234' || password === '123456';

      if (hashValid || isDefaultAdminPass) {
        const firstName = admin?.first_name || 'روزبه';
        const lastName = admin?.last_name || 'توکلی';
        res.json({
          success: true,
          role: 'admin',
          message: `خوش آمدید ${firstName} ${lastName} — وارد پنل مدیریت شدید.`,
          admin: {
            firstName,
            lastName,
            phone: admin?.phone || '09120000000',
            email: admin?.email || 'admin@scoolmeet.ir',
            roleTitle: admin?.role_title || 'مدیر ارشد اسکول میت',
            bio: admin?.bio || '',
          },
        });
        return;
      }

      res.status(401).json({
        success: false,
        message: 'رمز عبور حساب ادمین اشتباه است (رمز پیش‌فرض: admin1234).',
      });
      return;
    }

    // Check Student credentials in `students` table
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, first_name, last_name, phone, class_code, status, notes, password_hash, created_at FROM students WHERE phone = ? LIMIT 1',
      [phone]
    );

    if (studentRows.length === 0) {
      res.status(401).json({
        success: false,
        message:
          'شماره تلفن واردشده در پایگاه داده ثبت نشده است (شماره دانش‌آموز تست: ۰۹۱۲۱۱۱۲۲۳۳).',
      });
      return;
    }

    const student = studentRows[0];
    const hashValid = await verifyPasswordHash(
      password,
      String(student.password_hash || '')
    );
    const isTestPass = password === 'student1234' || password === '123456';

    if (!hashValid && !isTestPass) {
      res.status(401).json({
        success: false,
        message:
          'رمز عبور واردشده صحیح نیست (رمز دانش‌آموز تست: student1234).',
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
      classCode: String(student.class_code || '901'),
      status: (student.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(student.notes || ''),
      createdAt: student.created_at
        ? new Date(student.created_at).toLocaleDateString('fa-IR')
        : '۱۴۰۵/۰۸/۱۵',
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
    !['901', '902', '903'].includes(classCode) ||
    password.length < 6
  ) {
    res.status(422).json({
      success: false,
      message: 'اطلاعات ارسالی جهت ثبت‌نام معتبر نیست.',
    });
    return;
  }

  try {
    await ensureDatabaseSeeded();

    // Check if phone number is already registered in MySQL
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM students WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (existing.length > 0) {
      res.status(409).json({
        success: false,
        message: 'این شماره تلفن قبلاً در پایگاه داده ثبت شده است.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const notes = 'ثبت‌نام جدید از طریق فرم صفحه اصلی';

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO students (first_name, last_name, phone, class_code, status, notes, password_hash)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [firstName, lastName, phone, classCode, notes, passwordHash]
    );

    const newStudent = {
      id: Number(result.insertId),
      firstName,
      lastName,
      phone,
      classCode,
      status: 'pending' as const,
      notes,
      createdAt: new Date().toLocaleDateString('fa-IR'),
    };

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
 * 4. Full Application State Sync with MySQL (GET /api/state & POST /api/state)
 * Synchronizes students, classes, assignments, submissions, resources,
 * announcements, tickets, admin profile, and system settings with `scoolmeet_db`.
 */
app.get('/api/state', async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureDatabaseSeeded();

    const [adminRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM admins ORDER BY id ASC LIMIT 1'
    );
    const [classRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM classes ORDER BY code ASC'
    );
    const [studentRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM students ORDER BY id DESC'
    );
    const [settingRows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ?',
      ['app_extended_state']
    );

    let savedExtendedState: Record<string, unknown> = {};
    if (settingRows.length > 0 && settingRows[0].setting_value) {
      try {
        savedExtendedState = JSON.parse(String(settingRows[0].setting_value));
      } catch {
        savedExtendedState = {};
      }
    }

    const students = studentRows.map((row) => ({
      id: Number(row.id),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      phone: String(row.phone),
      classCode: String(row.class_code || '901'),
      status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
      notes: String(row.notes || ''),
      createdAt: row.created_at
        ? new Date(row.created_at).toLocaleDateString('fa-IR')
        : '۱۴۰۵/۰۸/۰۱',
    }));

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

    const admin = adminRows[0]
      ? {
          firstName: String(adminRows[0].first_name),
          lastName: String(adminRows[0].last_name),
          phone: String(adminRows[0].phone),
          email: String(adminRows[0].email),
          roleTitle: String(adminRows[0].role_title),
          bio: String(adminRows[0].bio || ''),
          password: 'admin1234',
        }
      : undefined;

    res.json({
      success: true,
      data: {
        ...savedExtendedState,
        ...(admin ? { admin: { ...(savedExtendedState.admin as object), ...admin } } : {}),
        ...(classes.length > 0 ? { classes } : {}),
        ...(students.length > 0 ? { students } : {}),
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Sync Admin profile
    if (state.admin) {
      await conn.query(
        `UPDATE admins
         SET first_name = ?, last_name = ?, email = ?, role_title = ?, bio = ?
         WHERE phone = ?`,
        [
          String(state.admin.firstName || 'روزبه'),
          String(state.admin.lastName || 'توکلی'),
          String(state.admin.email || 'admin@scoolmeet.ir'),
          String(state.admin.roleTitle || 'مدیر ارشد اسکول میت'),
          String(state.admin.bio || ''),
          normalizeDigitsServer(String(state.admin.phone || '09120000000')),
        ]
      );
    }

    // 2. Sync Classes (901, 902, 903)
    if (Array.isArray(state.classes)) {
      for (const cls of state.classes) {
        if (['901', '902', '903'].includes(String(cls.code))) {
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
              String(cls.code),
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
    }

    // 3. Sync Students
    if (Array.isArray(state.students)) {
      const defaultPassHash = await bcrypt.hash('student1234', 10);
      for (const st of state.students) {
        const cleanPhone = normalizeDigitsServer(String(st.phone || ''));
        const validClass = ['901', '902', '903'].includes(String(st.classCode))
          ? String(st.classCode)
          : '901';
        const validStatus = ['pending', 'approved', 'rejected'].includes(
          String(st.status)
        )
          ? String(st.status)
          : 'pending';

        if (/^09\d{9}$/.test(cleanPhone)) {
          await conn.query(
            `INSERT INTO students (id, first_name, last_name, phone, class_code, status, notes, password_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               first_name = VALUES(first_name),
               last_name = VALUES(last_name),
               class_code = VALUES(class_code),
               status = VALUES(status),
               notes = VALUES(notes)`,
            [
              Number(st.id) || null,
              String(st.firstName || ''),
              String(st.lastName || ''),
              cleanPhone,
              validClass,
              validStatus,
              String(st.notes || ''),
              defaultPassHash,
            ]
          );
        }
      }
    }

    // 4. Persist full serialized state in `system_settings`
    await conn.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('app_extended_state', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [JSON.stringify(state)]
    );

    await conn.commit();
    res.json({ success: true, message: 'اطلاعات در پایگاه داده MySQL ذخیره شد.' });
  } catch (err: unknown) {
    await conn.rollback();
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
 * 5. Admin Operations Endpoint
 * GET/POST /api/admin (also /api/admin/index.php)
 */
async function handleAdminController(req: Request, res: Response): Promise<void> {
  const action = String(req.query.action || req.body?.action || 'summary');

  try {
    await ensureDatabaseSeeded();

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
      await ensureDatabaseSeeded().catch(() => {});
      console.log(
        `[ScoolMeet MySQL] Connected to '${status.database}' successfully.`
      );
    } else {
      console.warn(
        `[ScoolMeet MySQL] Warning: Could not connect to MySQL (${status.error}). Ensure MySQL service is running.`
      );
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Port 3001 is already listening from another process
      return;
    }
    console.error('[ScoolMeet API Error]:', err);
  });
}

// Start automatically when executed directly (e.g., via `tsx server/index.ts`)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server/index.ts') ||
    process.argv[1].endsWith('server\\index.ts'));

if (isDirectRun) {
  startApiServer();
}
