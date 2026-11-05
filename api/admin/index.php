<?php
declare(strict_types=1);

/**
 * ScoolMeet | اسکول میت — Admin Panel MySQL PDO Controller (PHP 8.2+)
 * Handles CRUD operations for Dashboard, Classes (901/902/903), Students,
 * Assignments, Submissions/Grading, Schedules, Resources, Announcements,
 * Tickets, Admin Profile, and System Settings.
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

$action = (string) ($_GET['action'] ?? 'summary');

try {
    $pdo = Database::getConnection();

    switch ($action) {
        case 'summary':
            $totalStudents   = (int) $pdo->query("SELECT COUNT(*) FROM students")->fetchColumn();
            $pendingStudents = (int) $pdo->query("SELECT COUNT(*) FROM students WHERE status = 'pending'")->fetchColumn();
            $pendingSubmits  = (int) $pdo->query("SELECT COUNT(*) FROM assignment_submissions WHERE status = 'pending'")->fetchColumn();
            $openTickets     = (int) $pdo->query("SELECT COUNT(*) FROM tickets WHERE status = 'در انتظار پاسخ'")->fetchColumn();

            echo json_encode([
                'success' => true,
                'stats'   => [
                    'totalStudents'   => $totalStudents,
                    'pendingStudents' => $pendingStudents,
                    'pendingSubmits'  => $pendingSubmits,
                    'openTickets'     => $openTickets,
                ],
            ]);
            break;

        case 'approve_student':
            $payload   = json_decode((string) file_get_contents('php://input'), true) ?? [];
            $studentId = (int) ($payload['student_id'] ?? 0);
            $status    = (string) ($payload['status'] ?? 'approved');

            $stmt = $pdo->prepare("UPDATE students SET status = :status WHERE id = :id");
            $stmt->execute(['status' => $status, 'id' => $studentId]);

            echo json_encode(['success' => true, 'message' => 'وضعیت دانش‌آموز بروزرسانی شد.']);
            break;

        case 'grade_submission':
            $payload      = json_decode((string) file_get_contents('php://input'), true) ?? [];
            $submissionId = (int) ($payload['submission_id'] ?? 0);
            $score        = (float) ($payload['score'] ?? 0);
            $feedback     = trim((string) ($payload['feedback'] ?? ''));

            $stmt = $pdo->prepare(
                "UPDATE assignment_submissions
                 SET score = :score, teacher_feedback = :feedback, status = 'graded'
                 WHERE id = :id"
            );
            $stmt->execute([
                'score'    => $score,
                'feedback' => $feedback,
                'id'       => $submissionId,
            ]);

            echo json_encode(['success' => true, 'message' => 'نمره و بازخورد تکلیف با موفقیت ثبت شد.']);
            break;

        default:
            echo json_encode(['success' => true, 'message' => 'سرویس مدیریت اسکول میت آماده است.']);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'خطا در اجرای عملیات پایگاه داده MySQL.']);
}
