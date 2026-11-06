<?php
declare(strict_types=1);

/**
 * ScoolMeet | اسکول میت — Database Connection Test Endpoint
 * Verifies that the .env file is loaded and PHP PDO can connect to MySQL.
 * Does not expose passwords or sensitive server details.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success'   => false,
        'connected' => false,
        'message'   => 'Only GET requests are allowed.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

try {
    $pdo = Database::getConnection();
    $pdo->query('SELECT 1');

    echo json_encode([
        'success'   => true,
        'connected' => true,
        'database'  => $_ENV['DB_DATABASE'] ?? 'scoolmeet_db',
        'message'   => 'اتصال به پایگاه داده MySQL با موفقیت برقرار شد. (MySQL database connection succeeded)',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success'   => false,
        'connected' => false,
        'message'   => 'خطا در اتصال به پایگاه داده MySQL. لطفاً روشن بودن MySQL در XAMPP و تنظیمات فایل .env را بررسی کنید.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success'   => false,
        'connected' => false,
        'message'   => 'خطای غیرمنتظره در بررسی اتصال پایگاه داده رخ داد.',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}
