<?php
session_start();

// Include PHPMailer
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require '../php/PHPMailer/src/Exception.php';
require '../php/PHPMailer/src/PHPMailer.php';
require '../php/PHPMailer/src/SMTP.php';

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

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Please enter a valid email address']);
    exit();
}

// Check if email exists in students_user table
$sql = "SELECT student_id, name FROM students_user WHERE email = ? AND status = 'active'";
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
$name = $user['name'];

// Generate 6-digit OTP
$otp = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);

// Set expiration time (10 minutes from now)
$expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));

// Insert OTP into database
$sql = "INSERT INTO student_otp (student_id, otp_code, expires_at) VALUES (?, ?, ?)";
$stmt = $conn->prepare($sql);
$stmt->bind_param("sss", $student_id, $otp, $expires_at);

if (!$stmt->execute()) {
    echo json_encode(['success' => false, 'message' => 'Failed to generate OTP']);
    exit();
}

// Send email with OTP
$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = 'smartacademicbsit3b@gmail.com';
    $mail->Password = 'uxwv qwii eymz phmj';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = 587;

    // Recipients
    $mail->setFrom('smartacademicbsit3b@gmail.com', 'PLP Thesis/Capstone System');
    $mail->addAddress($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = 'Password Reset OTP - PLP Thesis/Capstone System';
    $mail->Body = "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
            <h2 style='color: #333;'>Password Reset Request</h2>
            <p>Hello {$name},</p>
            <p>You have requested to reset your password for the PLP Thesis/Capstone Archiving and Host Training Establishment System.</p>
            <p>Your One-Time Password (OTP) is:</p>
            <div style='background-color: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;'>
                <h1 style='color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;'>{$otp}</h1>
            </div>
            <p>This OTP will expire in 10 minutes.</p>
            <p>If you did not request this password reset, please ignore this email.</p>
            <p>Best regards,<br>PLP Thesis/Capstone System Team</p>
        </div>
    ";
    $mail->AltBody = "Hello {$name},\n\nYour OTP for password reset is: {$otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.";

    $mail->send();
    echo json_encode(['success' => true, 'message' => 'OTP sent successfully to your email']);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Failed to send email: ' . $mail->ErrorInfo]);
}

$stmt->close();
$conn->close();
?>