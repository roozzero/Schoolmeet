import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getDbInfo, pool, testDatabaseConnection } from '../db';
import { runMigrations } from '../migrations';

/**
 * Controlled One-Time Cleanup Script (`npm run db:reset-demo` or `npm run db:cleanup`)
 *
 * Safely removes all test and demo application records across all MySQL tables
 * in foreign-key-safe order inside a transaction while strictly preserving:
 * - The database schema, tables, columns, indexes, and `schema_migrations`
 * - The existing administrator account in `admins`
 *
 * Does NOT run automatically on server startup and is NOT exposed as a public API endpoint.
 */
export const DEMO_ADMIN_PHONE = '09120000000';
export const DEMO_ADMIN_EMAIL = 'admin@scoolmeet.ir';

async function resetDemoAndTestData(): Promise<void> {
  const info = getDbInfo();
  console.log(
    `[ScoolMeet Cleanup] Connecting to MySQL (${info.user}@${info.host}:${info.port}/${info.database})...`
  );

  const status = await testDatabaseConnection();
  if (!status.connected) {
    console.error(
      `[ScoolMeet Cleanup] Failed to connect to MySQL: ${status.error || 'Unknown error'}`
    );
    process.exit(1);
  }

  await runMigrations();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Delete child tables first (foreign-key-safe order)
    const [ticketMsgRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `ticket_messages`'
    );
    const [ticketsRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `tickets`'
    );
    const [subRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `assignment_submissions`'
    );
    const [hwRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `assignments`'
    );
    const [resRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `educational_resources`'
    );
    const [annRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `announcements`'
    );
    const [schedRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `class_schedules`'
    );
    const [gbEntriesRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `gradebook_entries`'
    );
    const [gbSessionsRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `gradebook_sessions`'
    );
    const [actRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `activity_logs`'
    );

    // 2. Delete all test/demo students and classes
    const [studentRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `students`'
    );
    const [classRes] = await conn.query<ResultSetHeader>(
      'DELETE FROM `classes`'
    );

    // 3. Remove legacy cached JSON state in system_settings
    const [settingsRes] = await conn.query<ResultSetHeader>(
      "DELETE FROM `system_settings` WHERE `setting_key` = 'app_extended_state'"
    );

    // 4. Preserve existing administrator account(s).
    // Only remove the hardcoded demo admin (09120000000) if at least one other real admin exists.
    const [adminRows] = await conn.query<RowDataPacket[]>(
      'SELECT `id`, `phone`, `email`, `first_name`, `last_name` FROM `admins` ORDER BY `id` ASC'
    );
    const nonDemoAdmins = adminRows.filter(
      (a) =>
        String(a.phone) !== DEMO_ADMIN_PHONE ||
        String(a.email) !== DEMO_ADMIN_EMAIL
    );
    let removedDemoAdmins = 0;
    if (nonDemoAdmins.length > 0 && adminRows.length > nonDemoAdmins.length) {
      const [delAdminRes] = await conn.query<ResultSetHeader>(
        'DELETE FROM `admins` WHERE `phone` = ? AND `email` = ?',
        [DEMO_ADMIN_PHONE, DEMO_ADMIN_EMAIL]
      );
      removedDemoAdmins = delAdminRes.affectedRows;
    }

    const [remainingAdmins] = await conn.query<RowDataPacket[]>(
      'SELECT `id`, `phone`, `email`, `first_name`, `last_name` FROM `admins` ORDER BY `id` ASC'
    );

    await conn.commit();

    console.log('[ScoolMeet Cleanup] Controlled one-time test/demo data cleanup completed:');
    console.log(`  - Removed ticket messages:        ${ticketMsgRes.affectedRows}`);
    console.log(`  - Removed tickets:                ${ticketsRes.affectedRows}`);
    console.log(`  - Removed assignment submissions: ${subRes.affectedRows}`);
    console.log(`  - Removed assignments:            ${hwRes.affectedRows}`);
    console.log(`  - Removed educational resources:  ${resRes.affectedRows}`);
    console.log(`  - Removed announcements:          ${annRes.affectedRows}`);
    console.log(`  - Removed class schedules:        ${schedRes.affectedRows}`);
    console.log(`  - Removed gradebook entries:      ${gbEntriesRes.affectedRows}`);
    console.log(`  - Removed gradebook sessions:     ${gbSessionsRes.affectedRows}`);
    console.log(`  - Removed activity logs:          ${actRes.affectedRows}`);
    console.log(`  - Removed students:               ${studentRes.affectedRows}`);
    console.log(`  - Removed classes:                ${classRes.affectedRows}`);
    console.log(`  - Cleared legacy JSON state:      ${settingsRes.affectedRows}`);
    console.log(`  - Removed redundant demo admins:  ${removedDemoAdmins}`);
    console.log(
      `  - Preserved admin accounts (${remainingAdmins.length}): ${remainingAdmins
        .map((a) => `${a.first_name} ${a.last_name} (${a.phone})`)
        .join(', ')}`
    );
  } catch (err) {
    await conn.rollback();
    console.error('[ScoolMeet Cleanup] Error during database cleanup (rolled back):', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

void resetDemoAndTestData();
