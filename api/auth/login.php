<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'متد درخواست مجاز نیست.']);
    exit;
}

$input    = json_decode((string) file_get_contents('php://input'), true) ?? [];
$phone    = trim((string) ($input['phone'] ?? ''));
$password = (string) ($input['password'] ?? '');

if (!preg_match('/^09\d{9}$/', $phone) || $password === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'شماره تلفن یا رمز عبور نامعتبر است.']);
    exit;
}

try {
    $pdo  = Database::getConnection();
    $stmt = $pdo->prepare('SELECT id, first_name, last_name, phone, class_code, password_hash, created_at FROM students WHERE phone = :phone LIMIT 1');
    $stmt->execute(['phone' => $phone]);
    $student = $stmt->fetch();

    if (!$student || !password_verify($password, (string) $student['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'شماره تلفن یا رمز عبور اشتباه است.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'ورود با موفقیت انجام شد.',
        'student' => [
            'id'        => (int) $student['id'],
            'firstName' => $student['first_name'],
            'lastName'  => $student['last_name'],
            'phone'     => $student['phone'],
            'classCode' => $student['class_code'],
            'createdAt' => $student['created_at'],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'خطا در ارتباط با پایگاه داده MySQL.']);
}
