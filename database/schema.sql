-- ============================================================================
-- ScoolMeet | اسکول میت — Complete MySQL 8.0+ Database Schema
-- Charset: utf8mb4 / Collation: utf8mb4_persian_ci
-- Includes: Admins, Classes (901/902/903), Students, Assignments, Submissions,
--           Class Schedules, Educational Resources, Announcements, Tickets,
--           Ticket Messages, Activity Logs, and System Settings.
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
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admins_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- ایجاد حساب پیش‌فرض ادمین (شماره تلفن: 09120000000 | رمز عبور: admin1234)
INSERT INTO `admins` (`first_name`, `last_name`, `phone`, `email`, `role_title`, `bio`, `password_hash`)
VALUES (
  'روزبه',
  'توکلی',
  '09120000000',
  'admin@scoolmeet.ir',
  'مدیر سامانه و مدرس دوره',
  'مدرس و مدیر آموزشی پلتفرم اسکول میت — مدیریت کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳.',
  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
) ON DUPLICATE KEY UPDATE `email` = VALUES(`email`);

-- 2. جدول کلاس‌ها (Classes: 901, 902, 903)
CREATE TABLE IF NOT EXISTS `classes` (
  `code` ENUM('901', '902', '903') NOT NULL,
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

INSERT INTO `classes` (`code`, `title`, `grade_level`, `instructor_name`, `capacity`, `room_or_link`, `schedule_summary`, `description`)
VALUES
  ('901', 'کلاس ۹۰۱ — ریاضی و الگوریتم پیشرفته', 'پایه نهم · گروه الف', 'استاد روزبه توکلی', 30, 'اتاق ۳۰۱ / کلاس آنلاین اول', 'شنبه‌ها و دوشنبه‌ها ساعت ۱۶:۰۰ تا ۱۷:۳۰', 'تمرکز بر مبانی منطق ریاضی، حل مسئله، فلوچارت و طراحی الگوریتم‌های پایه.'),
  ('902', 'کلاس ۹۰۲ — برنامه‌نویسی و علوم کامپیوتر', 'پایه نهم · گروه ب', 'استاد روزبه توکلی', 30, 'کارگاه کامپیوتر ۲ / کلاس آنلاین دوم', 'یکشنبه‌ها و سه‌شنبه‌ها ساعت ۱۶:۰۰ تا ۱۷:۳۰', 'آموزش عملی ساختار داده، مفاهیم وب، منطق شرطی و پروژه‌های گروهی.'),
  ('903', 'کلاس ۹۰۳ — المپیاد و حل تمرین تخصصی', 'پایه نهم · گروه ج', 'استاد روزبه توکلی', 25, 'اتاق ۳۰۵ / کلاس آنلاین سوم', 'چهارشنبه‌ها ساعت ۱۵:۳۰ تا ۱۸:۰۰', 'حل مسائل ترکیبیاتی، نظریه اعداد و آمادگی آزمون‌های پیشرفت تحصیلی.')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

-- 3. جدول دانش‌آموزان (Students)
CREATE TABLE IF NOT EXISTS `students` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NOT NULL,
  `class_code` ENUM('901', '902', '903') NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `national_code` VARCHAR(20) NULL,
  `parent_phone` VARCHAR(15) NULL,
  `notes` TEXT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_students_phone` (`phone`),
  KEY `idx_students_class` (`class_code`),
  KEY `idx_students_status` (`status`),
  CONSTRAINT `fk_students_class` FOREIGN KEY (`class_code`) REFERENCES `classes` (`code`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 4. جدول تکالیف (Assignments)
CREATE TABLE IF NOT EXISTS `assignments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `class_code` ENUM('901', '902', '903', 'all') NOT NULL DEFAULT 'all',
  `due_date` VARCHAR(50) NOT NULL,
  `max_score` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  `attachment_name` VARCHAR(255) NULL,
  `status` ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assignments_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 5. جدول ارسال تکالیف و تصحیح (Assignment Submissions)
CREATE TABLE IF NOT EXISTS `assignment_submissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_id` INT UNSIGNED NOT NULL,
  `student_id` INT UNSIGNED NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_content` TEXT NOT NULL,
  `submitted_at` VARCHAR(60) NOT NULL,
  `score` DECIMAL(5,2) NULL,
  `teacher_feedback` TEXT NULL,
  `status` ENUM('pending', 'graded') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `idx_sub_assignment` (`assignment_id`),
  KEY `idx_sub_student` (`student_id`),
  CONSTRAINT `fk_sub_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 6. جدول برنامه هفتگی و جلسات کلاس‌ها (Class Schedules)
CREATE TABLE IF NOT EXISTS `class_schedules` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_code` ENUM('901', '902', '903') NOT NULL,
  `day_of_week` VARCHAR(30) NOT NULL,
  `start_time` VARCHAR(20) NOT NULL,
  `end_time` VARCHAR(20) NOT NULL,
  `topic` VARCHAR(180) NOT NULL,
  `session_type` ENUM('حضوری', 'آنلاین', 'آزمون و حل تمرین') NOT NULL DEFAULT 'حضوری',
  `location_or_link` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_schedule_class` (`class_code`),
  CONSTRAINT `fk_schedule_class` FOREIGN KEY (`class_code`) REFERENCES `classes` (`code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 7. جدول منابع آموزشی (Educational Resources)
CREATE TABLE IF NOT EXISTS `educational_resources` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `category` ENUM('جزوه PDF', 'فایل تمرین', 'لینک آموزشی', 'ویدیو ضبط‌شده') NOT NULL,
  `class_code` ENUM('901', '902', '903', 'all') NOT NULL DEFAULT 'all',
  `url_or_filename` VARCHAR(255) NOT NULL,
  `file_size` VARCHAR(40) NOT NULL DEFAULT '۲.۴ مگابایت',
  `description` TEXT NOT NULL,
  `created_at` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resources_class` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 8. جدول اطلاعیه‌ها (Announcements)
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `content` TEXT NOT NULL,
  `target_classes` VARCHAR(50) NOT NULL COMMENT '901, 902, 903 or all (یک یا سه کلاس)',
  `priority` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
  `created_at` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 9. جدول تیکت‌های پشتیبانی و پرسش دانش‌آموزان (Tickets)
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `class_code` ENUM('901', '902', '903') NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `priority` ENUM('عادی', 'مهم', 'فوری') NOT NULL DEFAULT 'عادی',
  `status` ENUM('در انتظار پاسخ', 'پاسخ داده شده', 'بسته شده') NOT NULL DEFAULT 'در انتظار پاسخ',
  `created_at` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_student` (`student_id`),
  CONSTRAINT `fk_tickets_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 10. جدول پیام‌های هر تیکت (Ticket Messages)
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` INT UNSIGNED NOT NULL,
  `sender_role` ENUM('student', 'admin') NOT NULL,
  `sender_name` VARCHAR(120) NOT NULL,
  `message` TEXT NOT NULL,
  `sent_at` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_msg_ticket` (`ticket_id`),
  CONSTRAINT `fk_msg_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- 11. جدول تنظیمات سامانه (System Settings)
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
