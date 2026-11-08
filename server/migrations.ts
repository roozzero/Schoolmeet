import bcrypt from 'bcryptjs';
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
  {
    name: '005_student_email_bio_and_security',
    up: async (conn: PoolConnection) => {
      // 1. Add email and bio columns to students if missing
      const [studentCols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME IN ('email', 'bio')`
      );
      const existingCols = new Set(studentCols.map((r) => String(r.COLUMN_NAME)));
      if (!existingCols.has('email')) {
        await conn.query(
          `ALTER TABLE \`students\` ADD COLUMN \`email\` VARCHAR(150) NULL DEFAULT '' AFTER \`phone\``
        );
      }
      if (!existingCols.has('bio')) {
        await conn.query(
          `ALTER TABLE \`students\` ADD COLUMN \`bio\` TEXT NULL AFTER \`notes\``
        );
      }

      // 2. Ensure assignments.status supports 'active' and 'closed'
      const [hwCols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assignments' AND COLUMN_NAME = 'status'`
      );
      if (hwCols.length === 0) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`status\` VARCHAR(20) NOT NULL DEFAULT 'active' AFTER \`attachment_name\``
        );
      } else {
        await conn.query(
          `ALTER TABLE \`assignments\` MODIFY COLUMN \`status\` VARCHAR(20) NOT NULL DEFAULT 'active'`
        );
      }
    },
  },
  {
    name: '006_full_relational_persistence_and_recipients',
    up: async (conn: PoolConnection) => {
      async function hasCol(table: string, col: string): Promise<boolean> {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
          [table, col]
        );
        return rows.length > 0;
      }

      async function dropFkIfExists(table: string, fkName: string): Promise<void> {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
          [table, fkName]
        );
        if (rows.length > 0) {
          await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName}\``);
        }
      }

      await dropFkIfExists('assignment_submissions', 'fk_sub_assignment');
      await dropFkIfExists('assignment_submissions', 'fk_sub_student');
      await dropFkIfExists('tickets', 'fk_tickets_student');
      await dropFkIfExists('ticket_messages', 'fk_msg_ticket');

      // 1. Upgrade assignments
      await conn.query(
        `ALTER TABLE \`assignments\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT 'all',
         MODIFY COLUMN \`due_date\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('assignments', 'attachment_url'))) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`attachment_url\` LONGTEXT NULL AFTER \`attachment_name\``
        );
      }
      if (!(await hasCol('assignments', 'target_student_id'))) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`target_student_id\` BIGINT UNSIGNED NULL AFTER \`class_code\``
        );
      }
      if (!(await hasCol('assignments', 'target_student_name'))) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`target_student_name\` VARCHAR(150) NULL AFTER \`target_student_id\``
        );
      }
      if (!(await hasCol('assignments', 'closed_at'))) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`closed_at\` VARCHAR(80) NULL AFTER \`status\``
        );
      }
      if (!(await hasCol('assignments', 'created_at_fa'))) {
        await conn.query(
          `ALTER TABLE \`assignments\` ADD COLUMN \`created_at_fa\` VARCHAR(80) NULL AFTER \`closed_at\``
        );
      }

      // 2. Upgrade assignment_submissions
      await conn.query(
        `ALTER TABLE \`assignment_submissions\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`assignment_id\` BIGINT UNSIGNED NOT NULL,
         MODIFY COLUMN \`student_id\` INT UNSIGNED NOT NULL,
         MODIFY COLUMN \`submitted_at\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('assignment_submissions', 'student_name'))) {
        await conn.query(
          `ALTER TABLE \`assignment_submissions\` ADD COLUMN \`student_name\` VARCHAR(150) NULL AFTER \`student_id\``
        );
      }
      if (!(await hasCol('assignment_submissions', 'class_code'))) {
        await conn.query(
          `ALTER TABLE \`assignment_submissions\` ADD COLUMN \`class_code\` VARCHAR(20) NULL AFTER \`student_name\``
        );
      }
      if (!(await hasCol('assignment_submissions', 'file_url'))) {
        await conn.query(
          `ALTER TABLE \`assignment_submissions\` ADD COLUMN \`file_url\` LONGTEXT NULL AFTER \`file_content\``
        );
      }
      if (!(await hasCol('assignment_submissions', 'created_at_ts'))) {
        await conn.query(
          `ALTER TABLE \`assignment_submissions\` ADD COLUMN \`created_at_ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }

      // 3. Upgrade educational_resources
      await conn.query(
        `ALTER TABLE \`educational_resources\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT 'all',
         MODIFY COLUMN \`created_at\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('educational_resources', 'target_student_id'))) {
        await conn.query(
          `ALTER TABLE \`educational_resources\` ADD COLUMN \`target_student_id\` BIGINT UNSIGNED NULL AFTER \`class_code\``
        );
      }
      if (!(await hasCol('educational_resources', 'target_student_name'))) {
        await conn.query(
          `ALTER TABLE \`educational_resources\` ADD COLUMN \`target_student_name\` VARCHAR(150) NULL AFTER \`target_student_id\``
        );
      }
      if (!(await hasCol('educational_resources', 'file_url'))) {
        await conn.query(
          `ALTER TABLE \`educational_resources\` ADD COLUMN \`file_url\` LONGTEXT NULL AFTER \`url_or_filename\``
        );
      }
      if (!(await hasCol('educational_resources', 'viewers_json'))) {
        await conn.query(
          `ALTER TABLE \`educational_resources\` ADD COLUMN \`viewers_json\` LONGTEXT NULL AFTER \`description\``
        );
      }
      if (!(await hasCol('educational_resources', 'created_at_ts'))) {
        await conn.query(
          `ALTER TABLE \`educational_resources\` ADD COLUMN \`created_at_ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }

      // 4. Upgrade announcements
      await conn.query(
        `ALTER TABLE \`announcements\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`target_classes\` VARCHAR(50) NOT NULL DEFAULT 'all',
         MODIFY COLUMN \`created_at\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('announcements', 'target_student_id'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`target_student_id\` BIGINT UNSIGNED NULL AFTER \`target_classes\``
        );
      }
      if (!(await hasCol('announcements', 'target_student_name'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`target_student_name\` VARCHAR(150) NULL AFTER \`target_student_id\``
        );
      }
      if (!(await hasCol('announcements', 'assignment_id'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`assignment_id\` BIGINT UNSIGNED NULL AFTER \`target_student_name\``
        );
      }
      if (!(await hasCol('announcements', 'notification_type'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`notification_type\` VARCHAR(30) NOT NULL DEFAULT 'general' AFTER \`assignment_id\``
        );
      }
      if (!(await hasCol('announcements', 'readers_json'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`readers_json\` LONGTEXT NULL AFTER \`created_at\``
        );
      }
      if (!(await hasCol('announcements', 'created_at_ts'))) {
        await conn.query(
          `ALTER TABLE \`announcements\` ADD COLUMN \`created_at_ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }

      // 5. Upgrade tickets & ticket_messages
      await conn.query(
        `ALTER TABLE \`tickets\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`class_code\` VARCHAR(20) NOT NULL DEFAULT '',
         MODIFY COLUMN \`created_at\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('tickets', 'student_name'))) {
        await conn.query(
          `ALTER TABLE \`tickets\` ADD COLUMN \`student_name\` VARCHAR(150) NULL AFTER \`student_id\``
        );
      }
      if (!(await hasCol('tickets', 'student_phone'))) {
        await conn.query(
          `ALTER TABLE \`tickets\` ADD COLUMN \`student_phone\` VARCHAR(20) NULL AFTER \`student_name\``
        );
      }
      if (!(await hasCol('tickets', 'created_at_ts'))) {
        await conn.query(
          `ALTER TABLE \`tickets\` ADD COLUMN \`created_at_ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }

      await conn.query(
        `ALTER TABLE \`ticket_messages\`
         MODIFY COLUMN \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         MODIFY COLUMN \`ticket_id\` BIGINT UNSIGNED NOT NULL,
         MODIFY COLUMN \`sent_at\` VARCHAR(80) NOT NULL`
      );
      if (!(await hasCol('ticket_messages', 'attachment_name'))) {
        await conn.query(
          `ALTER TABLE \`ticket_messages\` ADD COLUMN \`attachment_name\` VARCHAR(255) NULL AFTER \`sent_at\``
        );
      }
      if (!(await hasCol('ticket_messages', 'attachment_url'))) {
        await conn.query(
          `ALTER TABLE \`ticket_messages\` ADD COLUMN \`attachment_url\` LONGTEXT NULL AFTER \`attachment_name\``
        );
      }
      if (!(await hasCol('ticket_messages', 'created_at_ts'))) {
        await conn.query(
          `ALTER TABLE \`ticket_messages\` ADD COLUMN \`created_at_ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
      }

      // 6. Create gradebook_sessions, gradebook_entries, and activity_logs tables
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`gradebook_sessions\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`class_code\` VARCHAR(20) NOT NULL,
          \`title\` VARCHAR(180) NOT NULL,
          \`session_date\` VARCHAR(60) NOT NULL,
          \`topic\` TEXT NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_gb_sessions_class\` (\`class_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`gradebook_entries\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`session_id\` BIGINT UNSIGNED NOT NULL,
          \`student_id\` INT UNSIGNED NOT NULL,
          \`class_code\` VARCHAR(20) NOT NULL,
          \`attendance\` ENUM('present', 'absent', 'late') NOT NULL DEFAULT 'present',
          \`positive_count\` INT NOT NULL DEFAULT 0,
          \`negative_count\` INT NOT NULL DEFAULT 0,
          \`class_score\` DECIMAL(5,2) NULL,
          \`teacher_note\` TEXT NULL,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`idx_gb_entry_session_student\` (\`session_id\`, \`student_id\`),
          KEY \`idx_gb_entry_student\` (\`student_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`activity_logs\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`title\` VARCHAR(255) NOT NULL,
          \`detail\` TEXT NOT NULL,
          \`time_ago\` VARCHAR(80) NOT NULL,
          \`category\` VARCHAR(30) NOT NULL DEFAULT 'student',
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
      `);
    },
  },
  {
    name: '007_restore_required_default_classes',
    up: async (conn: PoolConnection) => {
      await ensureDefaultClassesSeeded(conn);
    },
  },
  {
    name: '008_add_student_name_to_gradebook_entries',
    up: async (conn: PoolConnection) => {
      const [gbCols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gradebook_entries' AND COLUMN_NAME = 'student_name' LIMIT 1`
      );
      if (gbCols.length === 0) {
        await conn.query(
          `ALTER TABLE \`gradebook_entries\` ADD COLUMN \`student_name\` VARCHAR(150) NOT NULL DEFAULT '' AFTER \`student_id\``
        );
      }

      // Backfill student_name in gradebook_entries from students
      await conn.query(`
        UPDATE \`gradebook_entries\` ge
        INNER JOIN \`students\` s ON s.\`id\` = ge.\`student_id\`
        SET ge.\`student_name\` = TRIM(CONCAT(s.\`first_name\`, ' ', s.\`last_name\`))
        WHERE ge.\`student_name\` IS NULL OR ge.\`student_name\` = ''
      `);

      // Backfill student_name in assignment_submissions from students
      await conn.query(`
        UPDATE \`assignment_submissions\` sub
        INNER JOIN \`students\` s ON s.\`id\` = sub.\`student_id\`
        SET sub.\`student_name\` = TRIM(CONCAT(s.\`first_name\`, ' ', s.\`last_name\`))
        WHERE sub.\`student_name\` IS NULL OR sub.\`student_name\` = ''
      `);
    },
  },
  {
    name: '009_seed_test_admin_and_student',
    up: async (conn: PoolConnection) => {
      await ensureTestAccountsSeeded(conn, true);
    },
  },
];

export const REQUIRED_DEFAULT_CLASS_CODES = ['901', '902', '903'] as const;

export interface DefaultClassSeed {
  code: string;
  title: string;
  gradeLevel: string;
  instructorName: string;
  capacity: number;
  roomOrLink: string;
  scheduleSummary: string;
  description: string;
}

export const DEFAULT_SCHOOLMEET_CLASSES: DefaultClassSeed[] = [
  {
    code: '901',
    title: 'کلاس ۹۰۱ - برنامه‌نویسی',
    gradeLevel: 'پایه نهم',
    instructorName: 'روزبه توکلی',
    capacity: 30,
    roomOrLink: 'اتاق ۳۰۱ / تالار آنلاین',
    scheduleSummary: 'شنبه‌ها و دوشنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
    description:
      'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.',
  },
  {
    code: '902',
    title: 'کلاس ۹۰۲ - برنامه‌نویسی',
    gradeLevel: 'پایه نهم',
    instructorName: 'روزبه توکلی',
    capacity: 30,
    roomOrLink: 'اتاق ۳۰۲ / تالار آنلاین',
    scheduleSummary: 'یکشنبه‌ها و سه‌شنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
    description:
      'آموزش جاوااسکریپت، منطق برنامه‌نویسی و پیاده‌سازی رابط‌های کاربری تعاملی.',
  },
  {
    code: '903',
    title: 'کلاس ۹۰۳ - برنامه‌نویسی',
    gradeLevel: 'پایه نهم',
    instructorName: 'روزبه توکلی',
    capacity: 30,
    roomOrLink: 'کارگاه کامپیوتر / تالار آنلاین',
    scheduleSummary: 'دوشنبه‌ها و چهارشنبه‌ها · ساعت ۱۷:۳۰ تا ۱۹:۰۰',
    description:
      'کارگاه عملی پروژه‌های گروهی، طراحی واکنش‌گرا و توسعه وب مدرن.',
  },
];

/**
 * Repeatable, non-destructive seeding for the required SchoolMeet default classes (`901`, `902`, `903`).
 * - Uses `INSERT IGNORE` (and checks existing class codes) so it never creates duplicate classes.
 * - Preserves any edits made by the administrator to existing class records.
 * - Preserves all custom classes and student memberships.
 */
export async function ensureDefaultClassesSeeded(
  existingConn?: PoolConnection
): Promise<{ restoredCodes: string[] }> {
  const conn = existingConn || (await pool.getConnection());
  const restoredCodes: string[] = [];

  try {
    let defaultInstructor = 'روزبه توکلی';
    try {
      const [adminRows] = await conn.query<RowDataPacket[]>(
        'SELECT `first_name`, `last_name` FROM `admins` ORDER BY `id` ASC LIMIT 1'
      );
      if (adminRows.length > 0) {
        const fullName = `${String(adminRows[0].first_name || '').trim()} ${String(
          adminRows[0].last_name || ''
        ).trim()}`.trim();
        if (fullName) {
          defaultInstructor = fullName;
        }
      }
    } catch {
      // Fallback to default instructor name if admins table is not yet populated
    }

    const [existingRows] = await conn.query<RowDataPacket[]>(
      'SELECT `code` FROM `classes` WHERE `code` IN (?, ?, ?)',
      [...REQUIRED_DEFAULT_CLASS_CODES]
    );
    const existingCodes = new Set(existingRows.map((r) => String(r.code).trim()));

    for (const cls of DEFAULT_SCHOOLMEET_CLASSES) {
      if (existingCodes.has(cls.code)) {
        continue;
      }
      await conn.query(
        `INSERT IGNORE INTO \`classes\`
          (\`code\`, \`title\`, \`grade_level\`, \`instructor_name\`, \`capacity\`, \`room_or_link\`, \`schedule_summary\`, \`description\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cls.code,
          cls.title,
          cls.gradeLevel,
          defaultInstructor || cls.instructorName,
          cls.capacity,
          cls.roomOrLink,
          cls.scheduleSummary,
          cls.description,
        ]
      );
      restoredCodes.push(cls.code);
    }

    return { restoredCodes };
  } finally {
    if (!existingConn) {
      conn.release();
    }
  }
}

/**
 * Initialize `schema_migrations` tracking table, execute any pending migrations,
 * and ensure the required default classes (`901`, `902`, `903`) exist in MySQL.
 * Preserves all existing tables and data. Does not insert any demo student/user records.
 */
export async function runMigrations(): Promise<{
  applied: string[];
  totalExecuted: number;
  restoredDefaultClasses: string[];
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

    // Always ensure the required default classes (901, 902, 903) are present in MySQL
    const seedRes = await ensureDefaultClassesSeeded(conn);
    if (seedRes.restoredCodes.length > 0) {
      console.log(
        `[ScoolMeet Migrations] Restored missing default classes: ${seedRes.restoredCodes.join(', ')}`
      );
    }

    // Ensure the requested test admin and test student accounts exist in MySQL
    await ensureTestAccountsSeeded(conn, false);

    return {
      applied: appliedNow,
      totalExecuted: executedSet.size + appliedNow.length,
      restoredDefaultClasses: seedRes.restoredCodes,
    };
  } finally {
    conn.release();
  }
}

/**
 * Ensures the test Administrator account and approved test Student account exist in MySQL.
 */
export async function ensureTestAccountsSeeded(
  existingConn?: PoolConnection,
  resetTestPasswords: boolean = false
): Promise<void> {
  const conn = existingConn || (await pool.getConnection());
  try {
    const adminPhone = (process.env.ADMIN_PHONE || '09360302652').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '123456';
    const adminFirstName = (process.env.ADMIN_FIRST_NAME || 'روزبه').trim();
    const adminLastName = (process.env.ADMIN_LAST_NAME || 'توکلی').trim();
    const adminEmail = (process.env.ADMIN_EMAIL || 'a@gmail.com').trim();
    const adminRoleTitle = (process.env.ADMIN_ROLE_TITLE || 'مدیر').trim();

    const [existingAdmin] = await conn.query<RowDataPacket[]>(
      'SELECT `id`, `password_hash` FROM `admins` WHERE `phone` = ? LIMIT 1',
      [adminPhone]
    );
    if (existingAdmin.length === 0) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await conn.query(
        `INSERT INTO \`admins\` (\`first_name\`, \`last_name\`, \`phone\`, \`email\`, \`role_title\`, \`bio\`, \`password_hash\`)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          adminFirstName,
          adminLastName,
          adminPhone,
          adminEmail,
          adminRoleTitle,
          'مدرس و مدیر سامانه آموزشی اسکول میت',
          adminHash,
        ]
      );
      console.log(
        `[ScoolMeet Seed] Created test admin account: ${adminFirstName} ${adminLastName} (${adminPhone})`
      );
    } else if (resetTestPasswords || !existingAdmin[0].password_hash) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await conn.query(
        `UPDATE \`admins\` SET \`first_name\` = ?, \`last_name\` = ?, \`email\` = ?, \`role_title\` = ?, \`password_hash\` = ? WHERE \`id\` = ?`,
        [
          adminFirstName,
          adminLastName,
          adminEmail,
          adminRoleTitle,
          adminHash,
          existingAdmin[0].id,
        ]
      );
    }

    const testStudents = [
      {
        phone: (process.env.TEST_STUDENT_PHONE || '09121234567').trim(),
        password: process.env.TEST_STUDENT_PASSWORD || '123456',
        firstName: (process.env.TEST_STUDENT_FIRST_NAME || 'امیرحسین').trim(),
        lastName: (process.env.TEST_STUDENT_LAST_NAME || 'رضایی').trim(),
        email: (process.env.TEST_STUDENT_EMAIL || 'student@scoolmeet.ir').trim(),
        classCode: (process.env.TEST_STUDENT_CLASS || '901').trim(),
      },
      {
        phone: '09123456789',
        password: '123456',
        firstName: 'علی',
        lastName: 'محمدی',
        email: 'ali@scoolmeet.ir',
        classCode: '901',
      },
    ];

    for (const ts of testStudents) {
      const [existingStudent] = await conn.query<RowDataPacket[]>(
        'SELECT `id`, `status`, `password_hash` FROM `students` WHERE `phone` = ? LIMIT 1',
        [ts.phone]
      );
      if (existingStudent.length === 0) {
        const studentHash = await bcrypt.hash(ts.password, 10);
        await conn.query(
          `INSERT INTO \`students\` (\`first_name\`, \`last_name\`, \`phone\`, \`email\`, \`class_code\`, \`status\`, \`notes\`, \`bio\`, \`password_hash\`)
           VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
          [
            ts.firstName,
            ts.lastName,
            ts.phone,
            ts.email,
            ts.classCode,
            'حساب دانش‌آموز تست (تأیید شده)',
            'دانش‌آموز کلاس برنامه‌نویسی و طراحی وب',
            studentHash,
          ]
        );
        console.log(
          `[ScoolMeet Seed] Created approved test student account: ${ts.firstName} ${ts.lastName} (${ts.phone}, Class ${ts.classCode})`
        );
      } else {
        if (resetTestPasswords || !existingStudent[0].password_hash) {
          const studentHash = await bcrypt.hash(ts.password, 10);
          await conn.query(
            "UPDATE `students` SET `status` = 'approved', `class_code` = ?, `password_hash` = ? WHERE `id` = ?",
            [ts.classCode, studentHash, existingStudent[0].id]
          );
        } else if (String(existingStudent[0].status) !== 'approved') {
          await conn.query(
            "UPDATE `students` SET `status` = 'approved', `class_code` = ? WHERE `id` = ?",
            [ts.classCode, existingStudent[0].id]
          );
        }
      }
    }
  } finally {
    if (!existingConn) {
      conn.release();
    }
  }
}



