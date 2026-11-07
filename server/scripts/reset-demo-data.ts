import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getDbInfo, pool, testDatabaseConnection } from '../db';
import {
  ensureDefaultClassesSeeded,
  REQUIRED_DEFAULT_CLASS_CODES,
  runMigrations,
} from '../migrations';

/**
 * Controlled One-Time Cleanup Script (`npm run db:reset-demo` or `npm run db:cleanup`)
 *
 * Safely removes unwanted demo and test records in foreign-key-safe order inside a transaction
 * while strictly preserving:
 * - The database schema, tables, columns, indexes, and `schema_migrations`
 * - The administrator account(s) in `admins`
 * - The required default classes (`901`, `902`, `903`) and any legitimate classes with students
 * - Real registered student accounts and their class memberships (unless `--all-test-records` is explicitly passed)
 *
 * Does NOT run automatically on server startup and is NOT exposed as a public API endpoint.
 */
export const DEMO_ADMIN_PHONE = '09120000000';
export const DEMO_ADMIN_EMAIL = 'admin@scoolmeet.ir';

/**
 * Known disposable demo student phone numbers from legacy sample seeds
 */
export const DEMO_STUDENT_PHONES = [
  '09121111111',
  '09122222222',
  '09123333333',
  '09124444444',
  '09125555555',
  '09126666666',
  '09127777777',
  '09128888888',
  '09129999999',
  '09120000001',
  '09120000002',
  '09120000003',
  '09120000004',
  '09120000005',
  '09120000006',
  '09123456789',
];

async function resetDemoAndTestData(): Promise<void> {
  const purgeAllTestActivity = process.argv.includes('--all-test-records');
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

    // 1. Identify disposable demo students (by known demo phones, @example.com/@demo emails, or demo notes)
    const phonePlaceholders = DEMO_STUDENT_PHONES.map(() => '?').join(',');
    const [demoStudentRows] = await conn.query<RowDataPacket[]>(
      purgeAllTestActivity
        ? 'SELECT `id`, `phone`, `first_name`, `last_name` FROM `students`'
        : `SELECT \`id\`, \`phone\`, \`first_name\`, \`last_name\`
           FROM \`students\`
           WHERE \`phone\` IN (${phonePlaceholders})
              OR \`email\` LIKE '%@example.com'
              OR \`email\` LIKE '%@demo.%'
              OR \`notes\` LIKE '%داده نمونه%'
              OR \`notes\` LIKE '%دمو%'`,
      purgeAllTestActivity ? [] : DEMO_STUDENT_PHONES
    );

    const demoStudentIds = demoStudentRows.map((r) => Number(r.id)).filter(Boolean);

    let removedTicketMessages = 0;
    let removedTickets = 0;
    let removedSubmissions = 0;
    let removedGradebookEntries = 0;
    let removedStudents = 0;

    if (demoStudentIds.length > 0) {
      const idPlaceholders = demoStudentIds.map(() => '?').join(',');

      // Delete ticket messages belonging to demo students' tickets
      const [delTm] = await conn.query<ResultSetHeader>(
        `DELETE FROM \`ticket_messages\`
         WHERE \`ticket_id\` IN (SELECT \`id\` FROM \`tickets\` WHERE \`student_id\` IN (${idPlaceholders}))`,
        demoStudentIds
      );
      removedTicketMessages += delTm.affectedRows;

      // Delete tickets belonging to demo students
      const [delTk] = await conn.query<ResultSetHeader>(
        `DELETE FROM \`tickets\` WHERE \`student_id\` IN (${idPlaceholders})`,
        demoStudentIds
      );
      removedTickets += delTk.affectedRows;

      // Delete assignment submissions belonging to demo students
      const [delSub] = await conn.query<ResultSetHeader>(
        `DELETE FROM \`assignment_submissions\` WHERE \`student_id\` IN (${idPlaceholders})`,
        demoStudentIds
      );
      removedSubmissions += delSub.affectedRows;

      // Delete gradebook entries belonging to demo students
      const [delGe] = await conn.query<ResultSetHeader>(
        `DELETE FROM \`gradebook_entries\` WHERE \`student_id\` IN (${idPlaceholders})`,
        demoStudentIds
      );
      removedGradebookEntries += delGe.affectedRows;

      // Delete the demo students
      const [delSt] = await conn.query<ResultSetHeader>(
        `DELETE FROM \`students\` WHERE \`id\` IN (${idPlaceholders})`,
        demoStudentIds
      );
      removedStudents = delSt.affectedRows;
    }

    // 2. Clean orphaned child records (referencing non-existent students/tickets/assignments/sessions)
    const [orphTm] = await conn.query<ResultSetHeader>(
      'DELETE FROM `ticket_messages` WHERE `ticket_id` NOT IN (SELECT `id` FROM `tickets`)'
    );
    removedTicketMessages += orphTm.affectedRows;

    const [orphSub] = await conn.query<ResultSetHeader>(
      'DELETE FROM `assignment_submissions` WHERE `assignment_id` NOT IN (SELECT `id` FROM `assignments`)'
    );
    removedSubmissions += orphSub.affectedRows;

    const [orphGe] = await conn.query<ResultSetHeader>(
      'DELETE FROM `gradebook_entries` WHERE `session_id` NOT IN (SELECT `id` FROM `gradebook_sessions`)'
    );
    removedGradebookEntries += orphGe.affectedRows;

    // 3. Remove demo/legacy records with hardcoded demo timestamps ('۱۴۰۵/۰۸/۱۵' or 'هم‌اکنون') if any exist
    const [hwRes] = await conn.query<ResultSetHeader>(
      purgeAllTestActivity
        ? 'DELETE FROM `assignments`'
        : "DELETE FROM `assignments` WHERE `title` LIKE '%نمونه%' OR `title` LIKE '%دمو%'"
    );
    const [resRes] = await conn.query<ResultSetHeader>(
      purgeAllTestActivity
        ? 'DELETE FROM `educational_resources`'
        : "DELETE FROM `educational_resources` WHERE `title` LIKE '%نمونه%' OR `title` LIKE '%دمو%'"
    );
    const [annRes] = await conn.query<ResultSetHeader>(
      purgeAllTestActivity
        ? 'DELETE FROM `announcements`'
        : "DELETE FROM `announcements` WHERE `title` LIKE '%نمونه%' OR `title` LIKE '%دمو%'"
    );
    const [actRes] = await conn.query<ResultSetHeader>(
      purgeAllTestActivity
        ? 'DELETE FROM `activity_logs`'
        : "DELETE FROM `activity_logs` WHERE `title` LIKE '%نمونه%' OR `title` LIKE '%دمو%'"
    );

    // 4. Preserve required default classes ('901', '902', '903') and any class that has students!
    // Never delete '901', '902', or '903'. Only remove explicitly named demo/test classes that have zero students.
    const defaultPlaceholders = REQUIRED_DEFAULT_CLASS_CODES.map(() => '?').join(',');
    const [delDemoClasses] = await conn.query<ResultSetHeader>(
      `DELETE FROM \`classes\`
       WHERE \`code\` NOT IN (${defaultPlaceholders})
         AND (\`code\` LIKE 'DEMO%' OR \`code\` LIKE 'TEST%' OR \`title\` LIKE '%نمونه%' OR \`title\` LIKE '%تست%')
         AND \`code\` NOT IN (SELECT DISTINCT \`class_code\` FROM \`students\` WHERE \`class_code\` != '')`,
      [...REQUIRED_DEFAULT_CLASS_CODES]
    );

    // Ensure the three required default classes ('901', '902', '903') exist in MySQL
    const seededClasses = await ensureDefaultClassesSeeded(conn);

    // 5. Remove legacy cached JSON state in system_settings
    const [settingsRes] = await conn.query<ResultSetHeader>(
      "DELETE FROM `system_settings` WHERE `setting_key` = 'app_extended_state'"
    );

    // 6. Preserve existing administrator account(s).
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
    const [preservedClasses] = await conn.query<RowDataPacket[]>(
      'SELECT `code`, `title` FROM `classes` ORDER BY `code` ASC'
    );

    await conn.commit();

    console.log('[ScoolMeet Cleanup] Controlled test/demo data cleanup completed:');
    console.log(`  - Removed demo students:          ${removedStudents}`);
    console.log(`  - Removed demo ticket messages:   ${removedTicketMessages}`);
    console.log(`  - Removed demo tickets:           ${removedTickets}`);
    console.log(`  - Removed demo submissions:       ${removedSubmissions}`);
    console.log(`  - Removed demo gradebook entries: ${removedGradebookEntries}`);
    console.log(`  - Removed demo assignments:       ${hwRes.affectedRows}`);
    console.log(`  - Removed demo resources:         ${resRes.affectedRows}`);
    console.log(`  - Removed demo announcements:     ${annRes.affectedRows}`);
    console.log(`  - Removed demo activity logs:     ${actRes.affectedRows}`);
    console.log(`  - Removed disposable test classes:${delDemoClasses.affectedRows}`);
    console.log(
      `  - Restored missing default classes: ${
        seededClasses.restoredCodes.length > 0
          ? seededClasses.restoredCodes.join(', ')
          : 'none (all present)'
      }`
    );
    console.log(
      `  - Preserved classes (${preservedClasses.length}): ${preservedClasses
        .map((c) => `${c.code} (${c.title})`)
        .join(', ')}`
    );
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

