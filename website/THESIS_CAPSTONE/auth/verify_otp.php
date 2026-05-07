<?php
session_start();

// Include database config
$conn = include("../php/config.php");

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit();
}

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
    exit();
}

$email = trim($_POST['email'] ?? '');
$otp = trim($_POST['otp'] ?? '');

if (empty($email) || empty($otp) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Please provide valid email and OTP']);
    exit();
}

// Get student_id from email
$sql = "SELECT student_id FROM students_user WHERE email = ? AND status = 'active'";
$stmt = $conn->prepare($sql);
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'Email address not found']);
    exit();
}

$user = $result->fetch_assoc();
$student_id = $user['student_id'];

// Check OTP
$sql = "SELECT id FROM student_otp
        WHERE student_id = ? AND otp_code = ? AND is_used = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ss", $student_id, $otp);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'Invalid or expired OTP']);
    exit();
}

$otp_record = $result->fetch_assoc();
$otp_id = $otp_record['id'];

// Mark OTP as used
$sql = "UPDATE student_otp SET is_used = TRUE WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $otp_id);
$stmt->execute();

// Store email in session for password reset
$_SESSION['reset_email'] = $email;

echo json_encode(['success' => true, 'message' => 'OTP verified successfully']);

$stmt->close();
$conn->close();
?>