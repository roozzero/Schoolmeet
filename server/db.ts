import dotenv from 'dotenv';
import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_DATABASE || 'scoolmeet_db',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD ?? '',
};

/**
 * Centralized MySQL Connection Pool (mysql2/promise)
 */
export const pool: Pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export function getDbInfo() {
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
  };
}

/**
 * Verify MySQL connection by executing a lightweight query
 */
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  database: string;
  host: string;
  port: number;
  error?: string;
}> {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      return {
        connected: true,
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
      };
    } finally {
      connection.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown MySQL connection error';
    return {
      connected: false,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      error: message,
    };
  }
}

/**
 * Ensure required tables and initial seed records exist in scoolmeet_db
 * without dropping or altering existing tables.
 */
export async function ensureDatabaseSeeded(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // 1. Ensure default classes 901, 902, 903 exist
    await conn.query(`
      INSERT IGNORE INTO classes (code, title, grade_level, instructor_name, capacity, room_or_link, schedule_summary, description)
      VALUES
        ('901', 'کلاس ۹۰۱ - برنامه‌نویسی', 'پایه نهم · گروه الف', 'استاد روزبه توکلی', 30, 'اتاق ۳۰۱ / تالار آنلاین اول', 'شنبه‌ها و دوشنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰', 'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.'),
        ('902', 'کلاس ۹۰۲ - برنامه‌نویسی', 'پایه نهم · گروه ب', 'استاد روزبه توکلی', 30, 'کارگاه کامپیوتر ۲ / تالار آنلاین دوم', 'یکشنبه‌ها و سه‌شنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰', 'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.'),
        ('903', 'کلاس ۹۰۳ - برنامه‌نویسی', 'پایه نهم · گروه ج', 'استاد روزبه توکلی', 25, 'اتاق ۳۰۵ / تالار آنلاین سوم', 'چهارشنبه‌ها · ساعت ۱۵:۳۰ تا ۱۸:۰۰', 'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.')
    `);

    // 2. Ensure default admin account exists (09120000000 / admin1234)
    const [adminRows] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM admins WHERE phone = ? LIMIT 1',
      ['09120000000']
    );
    if (adminRows.length === 0) {
      const adminHash = await bcrypt.hash('admin1234', 10);
      await conn.query(
        `INSERT INTO admins (first_name, last_name, phone, email, role_title, bio, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'روزبه',
          'توکلی',
          '09120000000',
          'admin@scoolmeet.ir',
          'مدیر ارشد اسکول میت',
          'مدرس و مدیر آموزشی پلتفرم اسکول میت — مدیریت یکپارچه کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳، بررسی تکالیف و پشتیبانی مستمر دانش‌آموزان.',
          adminHash,
        ]
      );
    }

    // 3. Ensure default test student exists if students table is empty
    const [studentCountRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM students'
    );
    const totalStudents = Number(studentCountRows[0]?.cnt ?? 0);

    if (totalStudents === 0) {
      const studentHash = await bcrypt.hash('student1234', 10);
      const initialStudents = [
        [101, 'امیرحسین', 'رضایی', '09121112233', '901', 'approved', 'دانش‌آموز منظم و فعال در پروژه‌های طراحی وب (اکانت دانش‌آموز تست).', studentHash],
        [102, 'سارا', 'محمدی', '09122223344', '901', 'approved', 'مشارکت عالی در تمرین‌های گروهی کلاس ۹۰۱.', studentHash],
        [103, 'محمدمهدی', 'کریمی', '09123334455', '902', 'approved', 'علاقه‌مند به مباحث برنامه‌نویسی وب و ساختار داده.', studentHash],
        [104, 'نازنین', 'احمدی', '09124445566', '902', 'pending', 'ثبت‌نام جدید از طریق فرم عمومی سامانه — در انتظار بررسی.', studentHash],
        [105, 'کیان', 'صادقی', '09125556677', '903', 'approved', 'عضو فعال کلاس ۹۰۳.', studentHash],
        [106, 'هلیا', 'موسوی', '09126667788', '903', 'pending', 'درخواست عضویت در کلاس ۹۰۳.', studentHash],
        [107, 'پویا', 'حسینی', '09127778899', '901', 'pending', 'ثبت‌نام جدید کلاس ۹۰۱.', studentHash],
      ];

      for (const st of initialStudents) {
        await conn.query(
          `INSERT IGNORE INTO students (id, first_name, last_name, phone, class_code, status, notes, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          st
        );
      }
    }
  } finally {
    conn.release();
  }
}
