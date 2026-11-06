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
      console.error(
        `[ScoolMeet Admin Setup] An admin account already exists (ID: ${existing.id}, Phone: ${existing.phone}, Email: ${existing.email}).`
      );
      console.error(
        '[ScoolMeet Admin Setup] Duplicate admin creation is not allowed. Run `npm run db:reset-demo` first if you need to remove a demo admin.'
      );
      process.exitCode = 1;
      return;
    }

    let phone = normalizeDigits(
      getCliArg('--phone') || process.env.ADMIN_PHONE || ''
    );
    let password = getCliArg('--password') || process.env.ADMIN_PASSWORD || '';
    let firstName = (
      getCliArg('--first-name') ||
      process.env.ADMIN_FIRST_NAME ||
      ''
    ).trim();
    let lastName = (
      getCliArg('--last-name') ||
      process.env.ADMIN_LAST_NAME ||
      ''
    ).trim();
    let email = (getCliArg('--email') || process.env.ADMIN_EMAIL || '').trim();
    const roleTitle = (
      getCliArg('--role-title') ||
      process.env.ADMIN_ROLE_TITLE ||
      'مدیر و مدرس ارشد'
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

    // Double-check uniqueness by phone
    const [dupPhone] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM admins WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (dupPhone.length > 0) {
      console.error(
        `[ScoolMeet Admin Setup] Admin with phone ${phone} already exists.`
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
        '',
        passwordHash,
      ]
    );

    console.log(
      `\n[ScoolMeet Admin Setup] Initial admin account created successfully (ID: ${res.insertId}, Phone: ${phone}, Name: ${firstName} ${lastName}).`
    );
  } catch (err) {
    console.error('[ScoolMeet Admin Setup] Failed to create admin:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void createFirstAdmin();
