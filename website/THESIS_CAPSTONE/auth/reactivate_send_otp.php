<?php
// Send OTP for account reactivation
header('Content-Type: application/json');

$conn = include("../php/config.php");
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database error.']);
    exit();
}

$email = trim($_POST['email'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Invalid email.']);
    exit();
}

// Generate OTP
$otp = random_int(100000, 999999);
$expires = date('Y-m-d H:i:s', time() + 10 * 60); // 10 min expiry

// Store OTP and expiry in account_reactivation table
$stmt = $conn->prepare("INSERT INTO account_reactivation (email, otp_code, otp_expires, used) VALUES (?, ?, ?, 0)");
$stmt->bind_param("sss", $email, $otp, $expires);
$stmt->execute();
if ($stmt->affected_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'Failed to create OTP.']);
    exit();
}
$stmt->close();

// Send OTP via email (PHPMailer)
require_once __DIR__ . '/../php/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/../php/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/../php/PHPMailer/src/Exception.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);
// Enable SMTP debug output to a file
$mail->SMTPDebug = 2; // 2 = client and server messages
$mail->Debugoutput = function($str, $level) {
    file_put_contents(__DIR__ . '/../php/phpmailer_smtp_debug.log', date('Y-m-d H:i:s') . " [Level $level] $str\n", FILE_APPEND);
};
try {
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = 'smartacademicbsit3b@gmail.com';
    $mail->Password = 'uxwv qwii eymz phmj';
    $mail->SMTPSecure = 'tls';
    $mail->Port = 587;
    $mail->setFrom('smartacademicbsit3b@gmail.com', 'PLP System');
    $mail->addAddress($email);
    $mail->Subject = 'Your OTP for Account Reactivation';
    $mail->Body = "Your OTP code is: $otp\nThis code will expire in 10 minutes.";
    $mail->send();
    echo json_encode(['success' => true, 'message' => 'OTP sent to your email.']);
} catch (Exception $e) {
    // Log the error to a file for troubleshooting
    file_put_contents(__DIR__ . '/../php/phpmailer_error.log', date('Y-m-d H:i:s') . ' ' . $mail->ErrorInfo . "\n", FILE_APPEND);
    echo json_encode(['success' => false, 'message' => 'Failed to send OTP: ' . $mail->ErrorInfo]);
}
