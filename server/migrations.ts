import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from './db';

export interface Migration {
  name: string;
  up: (conn: PoolConnection) => Promise<void>;
}

/**
 * Ordered list of non-destructive database migrations for `scoolmeet_db`.
 * Each migration is executed at most once and recorded in `schema_migrations`.
 */
const MIGRATIONS: Migration[] = [
  {
    name: '001_create_core_tables',
    up: async (conn: PoolConnection) => {
      // 1. Admins table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`admins\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`first_name\` VARCHAR(100) NOT NULL,
          \`last_name\` VARCHAR(100) NOT NULL,
          \`phone\` VARCHAR(15) NOT NULL,
          \`email\` VARCHAR(150) NOT NULL,
          \`role_title\` VARCHAR(100) NOT NULL DEFAULT 'مدیر و مدرس ارشد',
          \`bio\` TEXT NULL,
          \`password_hash\` VARCHAR(255) NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`idx_admins_phone\` (\`phone\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 2. Classes table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`classes\` (
          \`code\` ENUM('901', '902', '903') NOT NULL,
          \`title\` VARCHAR(120) NOT NULL,
          \`grade_level\` VARCHAR(80) NOT NULL,
          \`instructor_name\` VARCHAR(120) NOT NULL,
          \`capacity\` INT UNSIGNED NOT NULL DEFAULT 30,
          \`room_or_link\` VARCHAR(255) NOT NULL,
          \`schedule_summary\` VARCHAR(180) NOT NULL,
          \`description\` TEXT NOT NULL,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 3. Students table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`students\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`first_name\` VARCHAR(100) NOT NULL,
          \`last_name\` VARCHAR(100) NOT NULL,
          \`phone\` VARCHAR(15) NOT NULL,
          \`class_code\` ENUM('901', '902', '903') NOT NULL,
          \`status\` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
          \`national_code\` VARCHAR(20) NULL,
          \`parent_phone\` VARCHAR(15) NULL,
          \`notes\` TEXT NULL,
          \`password_hash\` VARCHAR(255) NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`idx_students_phone\` (\`phone\`),
          KEY \`idx_students_class\` (\`class_code\`),
          KEY \`idx_students_status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 4. Assignments table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`assignments\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`title\` VARCHAR(180) NOT NULL,
          \`description\` TEXT NOT NULL,
          \`class_code\` ENUM('901', '902', '903', 'all') NOT NULL DEFAULT 'all',
          \`due_date\` VARCHAR(50) NOT NULL,
          \`max_score\` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
          \`attachment_name\` VARCHAR(255) NULL,
          \`status\` ENUM('active', 'closed') NOT NULL DEFAULT 'active',
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_assignments_class\` (\`class_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 5. Assignment Submissions table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`assignment_submissions\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`assignment_id\` INT UNSIGNED NOT NULL,
          \`student_id\` INT UNSIGNED NOT NULL,
          \`file_name\` VARCHAR(255) NOT NULL,
          \`file_content\` TEXT NOT NULL,
          \`submitted_at\` VARCHAR(60) NOT NULL,
          \`score\` DECIMAL(5,2) NULL,
          \`teacher_feedback\` TEXT NULL,
          \`status\` ENUM('pending', 'graded') NOT NULL DEFAULT 'pending',
          PRIMARY KEY (\`id\`),
          KEY \`idx_sub_assignment\` (\`assignment_id\`),
          KEY \`idx_sub_student\` (\`student_id\`),
          CONSTRAINT \`fk_sub_assignment\` FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignments\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_sub_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 6. Class Schedules table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`class_schedules\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`class_code\` ENUM('901', '902', '903') NOT NULL,
          \`day_of_week\` VARCHAR(30) NOT NULL,
          \`start_time\` VARCHAR(20) NOT NULL,
          \`end_time\` VARCHAR(20) NOT NULL,
          \`topic\` VARCHAR(180) NOT NULL,
          \`session_type\` ENUM('حضوری', 'آنلاین', 'آزمون و حل تمرین') NOT NULL DEFAULT 'حضوری',
          \`location_or_link\` VARCHAR(255) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_schedule_class\` (\`class_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 7. Educational Resources table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`educational_resources\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`title\` VARCHAR(180) NOT NULL,
          \`category\` ENUM('جزوه PDF', 'فایل تمرین', 'لینک آموزشی', 'ویدیو ضبط‌شده') NOT NULL,
          \`class_code\` ENUM('901', '902', '903', 'all') NOT NULL DEFAULT 'all',
          \`url_or_filename\` VARCHAR(255) NOT NULL,
          \`file_size\` VARCHAR(40) NOT NULL DEFAULT '۲.۴ مگابایت',
          \`description\` TEXT NOT NULL,
          \`created_at\` VARCHAR(50) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_resources_class\` (\`class_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 8. Announcements table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`announcements\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`title\` VARCHAR(180) NOT NULL,
          \`content\` TEXT NOT NULL,
          \`target_classes\` VARCHAR(50) NOT NULL,
          \`priority\` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
          \`created_at\` VARCHAR(50) NOT NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 9. Tickets table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`tickets\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`student_id\` INT UNSIGNED NOT NULL,
          \`class_code\` ENUM('901', '902', '903') NOT NULL,
          \`subject\` VARCHAR(200) NOT NULL,
          \`priority\` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
          \`status\` ENUM('در انتظار پاسخ', 'پاسخ داده شده', 'بسته شده') NOT NULL DEFAULT 'در انتظار پاسخ',
          \`created_at\` VARCHAR(50) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_tickets_student\` (\`student_id\`),
          CONSTRAINT \`fk_tickets_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 10. Ticket Messages table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`ticket_messages\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`ticket_id\` INT UNSIGNED NOT NULL,
          \`sender_role\` ENUM('student', 'admin') NOT NULL,
          \`sender_name\` VARCHAR(120) NOT NULL,
          \`message\` TEXT NOT NULL,
          \`sent_at\` VARCHAR(50) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_msg_ticket\` (\`ticket_id\`),
          CONSTRAINT \`fk_msg_ticket\` FOREIGN KEY (\`ticket_id\`) REFERENCES \`tickets\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      // 11. System Settings table
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`system_settings\` (
          \`setting_key\` VARCHAR(100) NOT NULL,
          \`setting_value\` LONGTEXT NOT NULL,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`setting_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);
    },
  },
  {
    name: '002_upgrade_system_settings_value_to_longtext',
    up: async (conn: PoolConnection) => {
      // Ensure setting_value can hold larger serialized state payloads without truncation
      await conn.query(`
        ALTER TABLE \`system_settings\`
        MODIFY COLUMN \`setting_value\` LONGTEXT NOT NULL;
      `);
    },
  },
  {
    name: '003_relax_class_foreign_keys',
    up: async (conn: PoolConnection) => {
      // If database/schema.sql was imported previously, drop fk_students_class and fk_schedule_class
      // so removing demo classes does not block student registration or schedule creation.
      const [constraints] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME, CONSTRAINT_NAME
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND CONSTRAINT_TYPE = 'FOREIGN KEY'
           AND CONSTRAINT_NAME IN ('fk_students_class', 'fk_schedule_class')`
      );
      for (const row of constraints) {
        const tableName = String(row.TABLE_NAME);
        const constraintName = String(row.CONSTRAINT_NAME);
        await conn.query(
          `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``
        );
      }
    },
  },
  {
    name: '004_full_persistence_and_uploads',
    up: async (conn: PoolConnection) => {
      // 1. Add avatar_url column to admins if missing
      const [adminCols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'avatar_url'`
      );
      if (adminCols.length === 0) {
        await conn.query(
          `ALTER TABLE \`admins\` ADD COLUMN \`avatar_url\` LONGTEXT NULL AFTER \`bio\``
        );
      }

      // 2. Add avatar_url and avatar_removed columns to students if missing
      const [studentCols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME IN ('avatar_url', 'avatar_removed')`
      );
      const existingStCols = new Set(studentCols.map((r) => String(r.COLUMN_NAME)));
      if (!existingStCols.has('avatar_url')) {
        await conn.query(
          `ALTER TABLE \`students\` ADD COLUMN \`avatar_url\` LONGTEXT NULL AFTER \`notes\``
        );
      }
      if (!existingStCols.has('avatar_removed')) {
        await conn.query(
          `ALTER TABLE \`students\` ADD COLUMN \`avatar_removed\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`avatar_url\``
        );
      }

      // 3. Relax ENUM columns on class_code / code so custom classes and unassigned students ('') persist in MySQL
      await conn.query(
        `ALTER TABLE \`classes\` MODIFY COLUMN \`code\` VARCHAR(20) NOT NULL`
      );
      await conn.query(
        `ALTER TABLE \`students\` MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT ''`
      );
      await conn.query(
        `ALTER TABLE \`assignments\` MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT 'all'`
      );
      await conn.query(
        `ALTER TABLE \`class_schedules\` MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT '901'`
      );
      await conn.query(
        `ALTER TABLE \`educational_resources\` MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT 'all'`
      );
      await conn.query(
        `ALTER TABLE \`tickets\` MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT ''`
      );
    },
  },
];

/**
 * Initialize `schema_migrations` tracking table and execute any pending migrations.
 * Preserves all existing tables and data. Does not insert any demo records.
 */
export async function runMigrations(): Promise<{
  applied: string[];
  totalExecuted: number;
}> {
  const conn = await pool.getConnection();
  const appliedNow: string[] = [];

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`migration_name\` VARCHAR(180) NOT NULL,
        \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_schema_migrations_name\` (\`migration_name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
    `);

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT migration_name FROM schema_migrations ORDER BY id ASC'
    );
    const executedSet = new Set(rows.map((r) => String(r.migration_name)));

    for (const migration of MIGRATIONS) {
      if (executedSet.has(migration.name)) {
        continue;
      }

      await conn.beginTransaction();
      try {
        await migration.up(conn);
        await conn.query(
          'INSERT INTO schema_migrations (migration_name) VALUES (?)',
          [migration.name]
        );
        await conn.commit();
        appliedNow.push(migration.name);
        console.log(`[ScoolMeet Migrations] Applied migration: ${migration.name}`);
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    return {
      applied: appliedNow,
      totalExecuted: executedSet.size + appliedNow.length,
    };
  } finally {
    conn.release();
  }
}
