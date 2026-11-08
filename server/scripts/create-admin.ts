import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import bcrypt from 'bcryptjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getDbInfo, pool, testDatabaseConnection } from '../db';
import { runMigrations } from '../migrations';

function normalizeDigits(str: string): string {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let out = String(str || '').trim();
  for (let i = 0; i < 10; i++) {
    out = out
      .replace(new RegExp(persian[i], 'g'), String(i))
      .replace(new RegExp(arabic[i], 'g'), String(i));
  }
  return out;
}

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) {
    return prefixed.slice(flag.length + 1);
  }
  return undefined;
}

async function createFirstAdmin(): Promise<void> {
  const info = getDbInfo();
  console.log(
    `[ScoolMeet Admin Setup] Connecting to MySQL (${info.user}@${info.host}:${info.port}/${info.database})...`
  );

  const status = await testDatabaseConnection();
  if (!status.connected) {
    console.error(
      `[ScoolMeet Admin Setup] Failed to connect to MySQL: ${status.error || 'Unknown error'}`
    );
    process.exit(1);
  }

  await runMigrations();

  try {
    // Check if an admin account already exists in `admins`
    const [existingAdmins] = await pool.query<RowDataPacket[]>(
      'SELECT id, first_name, last_name, phone, email FROM admins ORDER BY id ASC'
    );

    if (existingAdmins.length > 0) {
      const existing = existingAdmins[0];
      console.log(
        `[ScoolMeet Admin Setup] Admin account already exists (ID: ${existing.id}, Phone: ${existing.phone}, Name: ${existing.first_name} ${existing.last_name}).`
      );
    } else {
      let phone = normalizeDigits(
        getCliArg('--phone') || process.env.ADMIN_PHONE || '09360302652'
      );
      let password = getCliArg('--password') || process.env.ADMIN_PASSWORD || '123456';
      let firstName = (
        getCliArg('--first-name') ||
        process.env.ADMIN_FIRST_NAME ||
        'روزبه'
      ).trim();
      let lastName = (
        getCliArg('--last-name') ||
        process.env.ADMIN_LAST_NAME ||
        'توکلی'
      ).trim();
      let email = (
        getCliArg('--email') ||
        process.env.ADMIN_EMAIL ||
        'a@gmail.com'
      ).trim();
      const roleTitle = (
        getCliArg('--role-title') ||
        process.env.ADMIN_ROLE_TITLE ||
        'مدیر'
      ).trim();

      if (!phone || !password || !firstName || !lastName || !email) {
        if (!process.stdin.isTTY) {
          console.error(
            '[ScoolMeet Admin Setup] Missing required admin credentials. Set ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL in .env or pass --phone, --password, --first-name, --last-name, --email.'
          );
          process.exitCode = 1;
          return;
        }

        const rl = readline.createInterface({ input, output });
        try {
          console.log('\n--- Create Initial ScoolMeet Admin Account ---');
          if (!firstName) {
            firstName = (await rl.question('First Name (نام): ')).trim();
          }
          if (!lastName) {
            lastName = (
              await rl.question('Last Name (نام خانوادگی): ')
            ).trim();
          }
          if (!phone) {
            phone = normalizeDigits(
              await rl.question('Phone Number (11 digits, e.g. 09120000000): ')
            );
          }
          if (!email) {
            email = (
              await rl.question('Email (e.g. admin@scoolmeet.ir): ')
            ).trim();
          }
          if (!password) {
            password = await rl.question('Password (minimum 6 characters): ');
          }
        } finally {
          rl.close();
        }
      }

      if (!firstName || !lastName) {
        console.error(
          '[ScoolMeet Admin Setup] First name and last name are required.'
        );
        process.exitCode = 1;
        return;
      }

      if (!/^09\d{9}$/.test(phone)) {
        console.error(
          '[ScoolMeet Admin Setup] Invalid phone number. Must be 11 digits starting with 09 (e.g. 09120000000).'
        );
        process.exitCode = 1;
        return;
      }

      if (!email || !email.includes('@')) {
        console.error(
          '[ScoolMeet Admin Setup] A valid email address is required.'
        );
        process.exitCode = 1;
        return;
      }

      if (!password || password.length < 6) {
        console.error(
          '[ScoolMeet Admin Setup] Password must be at least 6 characters long.'
        );
        process.exitCode = 1;
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [res] = await pool.query<ResultSetHeader>(
        `INSERT INTO admins (first_name, last_name, phone, email, role_title, bio, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          firstName,
          lastName,
          phone,
          email,
          roleTitle,
          'مدرس و مدیر سامانه آموزشی اسکول میت',
          passwordHash,
        ]
      );

      console.log(
        `\n[ScoolMeet Admin Setup] Admin account created successfully (ID: ${res.insertId}, Phone: ${phone}, Name: ${firstName} ${lastName}).`
      );
    }

    // Ensure the approved test student account exists as well
    const studentPhone = normalizeDigits(
      process.env.TEST_STUDENT_PHONE || '09121234567'
    );
    const studentPassword = process.env.TEST_STUDENT_PASSWORD || '123456';
    const studentFirstName = (
      process.env.TEST_STUDENT_FIRST_NAME || 'امیرحسین'
    ).trim();
    const studentLastName = (
      process.env.TEST_STUDENT_LAST_NAME || 'رضایی'
    ).trim();
    const studentEmail = (
      process.env.TEST_STUDENT_EMAIL || 'student@scoolmeet.ir'
    ).trim();
    const studentClass = (process.env.TEST_STUDENT_CLASS || '901').trim();

    const [existingSt] = await pool.query<RowDataPacket[]>(
      'SELECT id, phone, first_name, last_name FROM students WHERE phone = ? LIMIT 1',
      [studentPhone]
    );
    if (existingSt.length === 0) {
      const stHash = await bcrypt.hash(studentPassword, 10);
      const [stRes] = await pool.query<ResultSetHeader>(
        `INSERT INTO students (first_name, last_name, phone, email, class_code, status, notes, bio, password_hash)
         VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
        [
          studentFirstName,
          studentLastName,
          studentPhone,
          studentEmail,
          studentClass,
          'حساب دانش‌آموز تست (تأیید شده)',
          'دانش‌آموز کلاس برنامه‌نویسی و طراحی وب',
          stHash,
        ]
      );
      console.log(
        `[ScoolMeet Admin Setup] Test student account created successfully (ID: ${stRes.insertId}, Phone: ${studentPhone}, Name: ${studentFirstName} ${studentLastName}, Class: ${studentClass}).`
      );
    } else {
      console.log(
        `[ScoolMeet Admin Setup] Test student account already exists (ID: ${existingSt[0].id}, Phone: ${existingSt[0].phone}, Name: ${existingSt[0].first_name} ${existingSt[0].last_name}).`
      );
    }
  } catch (err) {
    console.error('[ScoolMeet Admin Setup] Failed to create accounts:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void createFirstAdmin();
