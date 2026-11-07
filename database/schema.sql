-- ============================================================================
-- ScoolMeet | اسکول میت — Complete MySQL 8.0+ Relational Database Schema
-- Charset: utf8mb4 / Collation: utf8mb4_persian_ci
-- Note: No hardcoded demo users or sample records are automatically inserted.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `scoolmeet_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_persian_ci;

USE `scoolmeet_db`;

-- 1. جدول مدیران و اساتید (Admins)
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `role_title` VARCHAR(100) NOT NULL DEFAULT 'مدیر و مدرس ارشد',
  `bio` TEXT NULL,
  `avatar_url` LONGTEXT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admins_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 2. جدول کلاس‌ها (Classes)
CREATE TABLE IF NOT EXISTS `classes` (
  `code` VARCHAR(20) NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `grade_level` VARCHAR(80) NOT NULL,
  `instructor_name` VARCHAR(120) NOT NULL,
  `capacity` INT UNSIGNED NOT NULL DEFAULT 30,
  `room_or_link` VARCHAR(255) NOT NULL,
  `schedule_summary` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 3. جدول دانش‌آموزان (Students)
CREATE TABLE IF NOT EXISTS `students` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NOT NULL,
  `email` VARCHAR(150) NULL DEFAULT '',
  `class_code` VARCHAR(20) NOT NULL DEFAULT '',
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `national_code` VARCHAR(20) NULL,
  `parent_phone` VARCHAR(15) NULL,
  `notes` TEXT NULL,
  `bio` TEXT NULL,
  `avatar_url` LONGTEXT NULL,
  `avatar_removed` TINYINT(1) NOT NULL DEFAULT 0,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_students_phone` (`phone`),
  KEY `idx_students_class` (`class_code`),
  KEY `idx_students_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 4. جدول تکالیف (Assignments)
CREATE TABLE IF NOT EXISTS `assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `class_code` VARCHAR(20) NOT NULL DEFAULT 'all',
  `target_student_id` BIGINT UNSIGNED NULL,
  `target_student_name` VARCHAR(150) NULL,
  `due_date` VARCHAR(80) NOT NULL,
  `max_score` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  `attachment_name` VARCHAR(255) NULL,
  `attachment_url` LONGTEXT NULL,
  `status` ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  `closed_at` VARCHAR(80) NULL,
  `created_at_fa` VARCHAR(80) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assignments_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 5. جدول ارسال تکالیف و تصحیح (Assignment Submissions)
CREATE TABLE IF NOT EXISTS `assignment_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_id` BIGINT UNSIGNED NOT NULL,
  `student_id` INT UNSIGNED NOT NULL,
  `student_name` VARCHAR(150) NULL,
  `class_code` VARCHAR(20) NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_content` TEXT NOT NULL,
  `file_url` LONGTEXT NULL,
  `submitted_at` VARCHAR(80) NOT NULL,
  `score` DECIMAL(5,2) NULL,
  `teacher_feedback` TEXT NULL,
  `status` ENUM('pending', 'graded') NOT NULL DEFAULT 'pending',
  `created_at_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sub_assignment` (`assignment_id`),
  KEY `idx_sub_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 6. جدول برنامه هفتگی و جلسات کلاس‌ها (Class Schedules)
CREATE TABLE IF NOT EXISTS `class_schedules` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_code` VARCHAR(20) NOT NULL,
  `day_of_week` VARCHAR(30) NOT NULL,
  `start_time` VARCHAR(20) NOT NULL,
  `end_time` VARCHAR(20) NOT NULL,
  `topic` VARCHAR(180) NOT NULL,
  `session_type` ENUM('حضوری', 'آنلاین', 'آزمون و حل تمرین') NOT NULL DEFAULT 'حضوری',
  `location_or_link` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_schedule_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 7. جدول منابع آموزشی (Educational Resources)
CREATE TABLE IF NOT EXISTS `educational_resources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `category` ENUM('جزوه PDF', 'فایل تمرین', 'لینک آموزشی', 'ویدیو ضبط‌شده') NOT NULL,
  `class_code` VARCHAR(20) NOT NULL DEFAULT 'all',
  `target_student_id` BIGINT UNSIGNED NULL,
  `target_student_name` VARCHAR(150) NULL,
  `url_or_filename` VARCHAR(255) NOT NULL,
  `file_url` LONGTEXT NULL,
  `file_size` VARCHAR(40) NOT NULL DEFAULT 'فایل پیوست',
  `description` TEXT NOT NULL,
  `viewers_json` LONGTEXT NULL,
  `created_at` VARCHAR(80) NOT NULL,
  `created_at_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resources_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 8. جدول اطلاعیه‌ها (Announcements)
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `content` TEXT NOT NULL,
  `target_classes` VARCHAR(50) NOT NULL DEFAULT 'all',
  `target_student_id` BIGINT UNSIGNED NULL,
  `target_student_name` VARCHAR(150) NULL,
  `assignment_id` BIGINT UNSIGNED NULL,
  `notification_type` VARCHAR(30) NOT NULL DEFAULT 'general',
  `priority` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
  `created_at` VARCHAR(80) NOT NULL,
  `readers_json` LONGTEXT NULL,
  `created_at_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 9. جدول تیکت‌های پشتیبانی و پرسش دانش‌آموزان (Tickets)
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `student_name` VARCHAR(150) NULL,
  `student_phone` VARCHAR(20) NULL,
  `class_code` VARCHAR(20) NOT NULL DEFAULT '',
  `subject` VARCHAR(200) NOT NULL,
  `priority` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
  `status` ENUM('در انتظار پاسخ', 'پاسخ داده شده', 'بسته شده') NOT NULL DEFAULT 'در انتظار پاسخ',
  `created_at` VARCHAR(80) NOT NULL,
  `created_at_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 10. جدول پیام‌های هر تیکت (Ticket Messages)
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` BIGINT UNSIGNED NOT NULL,
  `sender_role` ENUM('student', 'admin') NOT NULL,
  `sender_name` VARCHAR(120) NOT NULL,
  `message` TEXT NOT NULL,
  `sent_at` VARCHAR(80) NOT NULL,
  `attachment_name` VARCHAR(255) NULL,
  `attachment_url` LONGTEXT NULL,
  `created_at_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_msg_ticket` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 11. جدول جلسات دفتر نمره (Gradebook Sessions)
CREATE TABLE IF NOT EXISTS `gradebook_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_code` VARCHAR(20) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `session_date` VARCHAR(60) NOT NULL,
  `topic` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gb_sessions_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 12. جدول نمرات و حضور و غیاب جلسات (Gradebook Entries)
CREATE TABLE IF NOT EXISTS `gradebook_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `student_id` INT UNSIGNED NOT NULL,
  `class_code` VARCHAR(20) NOT NULL,
  `attendance` ENUM('present', 'absent', 'late') NOT NULL DEFAULT 'present',
  `positive_count` INT NOT NULL DEFAULT 0,
  `negative_count` INT NOT NULL DEFAULT 0,
  `class_score` DECIMAL(5,2) NULL,
  `teacher_note` TEXT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_gb_entry_session_student` (`session_id`, `student_id`),
  KEY `idx_gb_entry_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 13. جدول گزارش فعالیت‌های اخیر سامانه (Activity Logs)
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `detail` TEXT NOT NULL,
  `time_ago` VARCHAR(80) NOT NULL,
  `category` VARCHAR(30) NOT NULL DEFAULT 'student',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 14. جدول تنظیمات سامانه (System Settings)
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
