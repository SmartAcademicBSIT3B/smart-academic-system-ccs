<?php
// Verify OTP and unlock account
header('Content-Type: application/json');

$conn = include("../php/config.php");
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database error.']);
    exit();
}

$email = trim($_POST['email'] ?? '');
$otp = trim($_POST['otp'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $otp)) {
    echo json_encode(['success' => false, 'message' => 'Invalid input.']);
    exit();
}


// Get latest unused OTP for this email
$stmt = $conn->prepare("SELECT id, otp_code, otp_expires FROM account_reactivation WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->bind_result($otp_id, $db_otp, $db_expires);
$found = $stmt->fetch();
$stmt->close();

if (!$found) {
    echo json_encode(['success' => false, 'message' => 'No OTP found.']);
    exit();
}
if ($otp !== $db_otp) {
    echo json_encode(['success' => false, 'message' => 'Incorrect OTP.']);
    exit();
}
if (strtotime($db_expires) < time()) {
    echo json_encode(['success' => false, 'message' => 'OTP expired.']);
    exit();
}
// Mark OTP as used
$stmt = $conn->prepare("UPDATE account_reactivation SET used = 1 WHERE id = ?");
$stmt->bind_param("i", $otp_id);
$stmt->execute();
$stmt->close();
// Unlock account
$stmt = $conn->prepare("UPDATE students_user SET failed_attempts = 0, locked_until = NULL WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true, 'message' => 'Account reactivated! You may now log in.']);
