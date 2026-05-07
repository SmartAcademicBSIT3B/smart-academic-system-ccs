<?php
session_start();

header('Content-Type: application/json');

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

$current_password = $_POST['current_password'] ?? '';
$new_password     = $_POST['new_password'] ?? '';

if (empty($current_password) || empty($new_password)) {
    echo json_encode(['success' => false, 'message' => 'All fields are required.']);
    exit();
}

if (strlen($new_password) < 8) {
    echo json_encode(['success' => false, 'message' => 'New password must be at least 8 characters.']);
    exit();
}
if (!preg_match('/[0-9]/', $new_password)) {
    echo json_encode(['success' => false, 'message' => 'New password must contain at least one number.']);
    exit();
}
if (!preg_match('/[^a-zA-Z0-9]/', $new_password)) {
    echo json_encode(['success' => false, 'message' => 'New password must contain at least one special character.']);
    exit();
}

$conn = include("config.php");
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

try {
    // Verify current password (system now uses SHA-256)
    $hashed_current = hash('sha256', $current_password);
    $stmt = $conn->prepare("SELECT student_id FROM students_user WHERE student_id = ? AND password = ?");
    $stmt->bind_param("ss", $_SESSION['student_id'], $hashed_current);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        $stmt->close();
        $conn->close();
        echo json_encode(['success' => false, 'message' => 'Current password is incorrect.']);
        exit();
    }
    $stmt->close();

    // Update to new password (SHA-256)
    $hashed_new = hash('sha256', $new_password);
    $upd = $conn->prepare("UPDATE students_user SET password = ? WHERE student_id = ?");
    $upd->bind_param("ss", $hashed_new, $_SESSION['student_id']);
    $upd->execute();
    $upd->close();
    $conn->close();

    echo json_encode(['success' => true]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
