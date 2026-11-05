-- ============================================================================
-- ScoolMeet | اسکول میت — MySQL 8.0+ Database Schema
-- Charset: utf8mb4 / Collation: utf8mb4_persian_ci
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `scoolmeet_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_persian_ci;

USE `scoolmeet_db`;

CREATE TABLE IF NOT EXISTS `students` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL COMMENT 'نام دانش‌آموز',
  `last_name` VARCHAR(100) NOT NULL COMMENT 'نام خانوادگی دانش‌آموز',
  `phone` VARCHAR(15) NOT NULL COMMENT 'شماره تلفن همراه',
  `class_code` ENUM('901', '902', '903') NOT NULL COMMENT 'کد کلاس (901 / 902 / 903)',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'رمزینه عبور (Bcrypt / Argon2id)',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY ` idx_students_phone ` (`phone`),
  KEY ` idx_students_class ` (`class_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
