<?php
header('Content-Type: application/json');

session_start();

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['error' => 'Not authenticated']);
    exit();
}

$student_id = trim((string)($_SESSION['student_id'] ?? ''));
$section = strtolower(trim((string)($_POST['section'] ?? '')));
$action = strtolower(trim((string)($_POST['action'] ?? '')));

if (!in_array($section, ['pre', 'post'], true)) {
    echo json_encode(['error' => 'Invalid section']);
    exit();
}

if (!in_array($action, ['submit', 'unsubmit'], true)) {
    echo json_encode(['error' => 'Invalid action']);
    exit();
}

$conn = include('config.php');
if (!$conn) {
    echo json_encode(['error' => 'Database connection failed']);
    exit();
}

$ojt_student_id = null;
$stmt = $conn->prepare('SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id);
$stmt->fetch();
$stmt->close();

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['error' => 'Student OJT record not found']);
    exit();
}

$stateSql = "SELECT
    SUM(CASE WHEN LOWER(s.status) IN ('submitted','verified','rejected') THEN 1 ELSE 0 END) AS submitted_count,
    SUM(CASE WHEN LOWER(s.status) IN ('verified','approved') THEN 1 ELSE 0 END) AS verified_count
FROM ojt_requirement_submissions s
INNER JOIN ojt_requirement_templates t ON t.id = s.template_id
WHERE s.ojt_student_id = ? AND LOWER(t.type) = ?";
$stateStmt = $conn->prepare($stateSql);
$stateStmt->bind_param('is', $ojt_student_id, $section);
$stateStmt->execute();
$stateResult = $stateStmt->get_result();
$state = $stateResult ? ($stateResult->fetch_assoc() ?: []) : [];
$stateStmt->close();

$submittedCount = (int)($state['submitted_count'] ?? 0);
$verifiedCount = (int)($state['verified_count'] ?? 0);

if ($action === 'submit') {
    $conn->begin_transaction();
    try {
        $updateSql = "UPDATE ojt_requirement_submissions s
                      INNER JOIN ojt_requirement_templates t ON t.id = s.template_id
                      SET s.status = 'submitted', s.updated_at = NOW()
                      WHERE s.ojt_student_id = ?
                        AND LOWER(t.type) = ?
                        AND s.file_url IS NOT NULL
                        AND TRIM(s.file_url) <> ''
                        AND LOWER(COALESCE(s.status, 'pending')) = 'pending'";
        $updateStmt = $conn->prepare($updateSql);
        $updateStmt->bind_param('is', $ojt_student_id, $section);
        $updateStmt->execute();
        $affected = $updateStmt->affected_rows;
        $updateStmt->close();

        if ($submittedCount === 0 && $affected <= 0) {
            $conn->rollback();
            echo json_encode(['error' => 'No uploaded files to submit yet.']);
            exit();
        }

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        echo json_encode(['error' => 'Submit failed: ' . $e->getMessage()]);
        exit();
    }
}

if ($action === 'unsubmit') {
    if ($verifiedCount > 0) {
        $conn->close();
        echo json_encode(['error' => 'Cannot unsubmit: at least one requirement is already verified.']);
        exit();
    }

    $unsubmitSql = "UPDATE ojt_requirement_submissions s
                    INNER JOIN ojt_requirement_templates t ON t.id = s.template_id
                    SET s.status = 'pending', s.updated_at = NOW()
                    WHERE s.ojt_student_id = ?
                      AND LOWER(t.type) = ?
                      AND LOWER(COALESCE(s.status, 'pending')) = 'submitted'";
    $unsubmitStmt = $conn->prepare($unsubmitSql);
    $unsubmitStmt->bind_param('is', $ojt_student_id, $section);
    $unsubmitStmt->execute();
    $unsubmitStmt->close();
}

$refreshStmt = $conn->prepare($stateSql);
$refreshStmt->bind_param('is', $ojt_student_id, $section);
$refreshStmt->execute();
$refreshResult = $refreshStmt->get_result();
$refreshState = $refreshResult ? ($refreshResult->fetch_assoc() ?: []) : [];
$refreshStmt->close();
$conn->close();

$newSubmitted = (int)($refreshState['submitted_count'] ?? 0);
$newVerified = (int)($refreshState['verified_count'] ?? 0);

echo json_encode([
    'success' => true,
    'section' => $section,
    'is_submitted' => $newSubmitted > 0,
    'has_verified' => $newVerified > 0,
]);
exit();
