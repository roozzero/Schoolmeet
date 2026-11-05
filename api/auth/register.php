<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'متد درخواست مجاز نیست.']);
    exit;
}

$input = json_decode((string) file_get_contents('php://input'), true) ?? [];
$firstName = trim((string) ($input['first_name'] ?? ''));
$lastName  = trim((string) ($input['last_name'] ?? ''));
$phone     = trim((string) ($input['phone'] ?? ''));
$classCode = trim((string) ($input['class_code'] ?? ''));
$password  = (string) ($input['password'] ?? '');

if ($firstName === '' || $lastName === '' || !preg_match('/^09\d{9}$/', $phone) || !in_array($classCode, ['901', '902', '903'], true) || strlen($password) < 6) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'اطلاعات ارسالی معتبر نیست.']);
    exit;
}

try {
    $pdo = Database::getConnection();

    $checkStmt = $pdo->prepare('SELECT id FROM students WHERE phone = :phone LIMIT 1');
    $checkStmt->execute(['phone' => $phone]);
    if ($checkStmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'این شماره تلفن قبلاً ثبت شده است.']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $insertStmt = $pdo->prepare(
        'INSERT INTO students (first_name, last_name, phone, class_code, password_hash)
         VALUES (:first_name, :last_name, :phone, :class_code, :password_hash)'
    );
    $insertStmt->execute([
        'first_name'    => $firstName,
        'last_name'     => $lastName,
        'phone'         => $phone,
        'class_code'    => $classCode,
        'password_hash' => $hash,
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'تبریک! حساب کاربری شما با موفقیت ایجاد شد.',
        'student' => [
            'id'        => (int) $pdo->lastInsertId(),
            'firstName' => $firstName,
            'lastName'  => $lastName,
            'phone'     => $phone,
            'classCode' => $classCode,
            'createdAt' => date('c'),
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'خطا در ارتباط با پایگاه داده MySQL.']);
}
