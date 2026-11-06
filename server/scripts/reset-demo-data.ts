import { ResultSetHeader } from 'mysql2/promise';
import { getDbInfo, pool, testDatabaseConnection } from '../db';
import { runMigrations } from '../migrations';

/**
 * Known Demo / Seed Phone Numbers from the legacy seed state
 */
export const DEMO_STUDENT_PHONES = [
  '09121112233', // امیرحسین رضایی
  '09122223344', // سارا محمدی
  '09123334455', // محمدمهدی کریمی
  '09124445566', // نازنین احمدی
  '09125556677', // کیان صادقی
  '09126667788', // هلیا موسوی
  '09127778899', // پویا حسینی
];

export const DEMO_ADMIN_PHONE = '09120000000';
export const DEMO_ADMIN_EMAIL = 'admin@scoolmeet.ir';

async function resetDemoData(): Promise<void> {
  const info = getDbInfo();
  console.log(
    `[ScoolMeet Reset] Connecting to MySQL (${info.user}@${info.host}:${info.port}/${info.database})...`
  );

  const status = await testDatabaseConnection();
  if (!status.connected) {
    console.error(
      `[ScoolMeet Reset] Failed to connect to MySQL: ${status.error || 'Unknown error'}`
    );
    process.exit(1);
  }

  await runMigrations();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Remove known demo students (cascades to their submissions/tickets if any)
    const placeholders = DEMO_STUDENT_PHONES.map(() => '?').join(', ');
    const [studentRes] = await conn.query<ResultSetHeader>(
      `DELETE FROM students WHERE phone IN (${placeholders})`,
      DEMO_STUDENT_PHONES
    );

    // 2. Remove default hardcoded demo admin account (09120000000 / admin@scoolmeet.ir)
    const [adminRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM admins WHERE phone = ? AND email = ?',
      [DEMO_ADMIN_PHONE, DEMO_ADMIN_EMAIL]
    );

    // 3. Remove default demo classes seeded with instructor 'استاد روزبه توکلی'
    const [classRes] = await conn.query<ResultSetHeader>(
      "DELETE FROM classes WHERE code IN ('901', '902', '903') AND instructor_name = 'استاد روزبه توکلی'"
    );

    // 4. Remove cached demo state in system_settings
    const [settingsRes] = await conn.query<ResultSetHeader>(
      "DELETE FROM system_settings WHERE setting_key = 'app_extended_state'"
    );

    await conn.commit();

    console.log('[ScoolMeet Reset] Development demo data cleanup completed:');
    console.log(`  - Removed demo students: ${studentRes.affectedRows}`);
    console.log(`  - Removed demo admins:   ${adminRes.affectedRows}`);
    console.log(`  - Removed demo classes:  ${classRes.affectedRows}`);
    console.log(`  - Cleared cached state:  ${settingsRes.affectedRows}`);
    console.log(
      '[ScoolMeet Reset] Real user records and database tables were preserved.'
    );
  } catch (err) {
    await conn.rollback();
    console.error('[ScoolMeet Reset] Error cleaning demo data:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

void resetDemoData();
