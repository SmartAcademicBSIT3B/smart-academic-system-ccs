<?php
session_start();

header('Content-Type: application/json');

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

$contact_no = trim($_POST['contact_no'] ?? '');

if (empty($contact_no)) {
    echo json_encode(['success' => false, 'message' => 'Contact number cannot be empty.']);
    exit();
}

if (strlen($contact_no) > 20) {
    echo json_encode(['success' => false, 'message' => 'Contact number too long.']);
    exit();
}

$conn = include("config.php");
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

try {
    $stmt = $conn->prepare("UPDATE ojt_students SET contact_no = ? WHERE student_id = ?");
    $stmt->bind_param("ss", $contact_no, $_SESSION['student_id']);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
