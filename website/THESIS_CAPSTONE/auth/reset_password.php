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

// Check if user has verified OTP
if (!isset($_SESSION['reset_email'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized access']);
    exit();
}

$email = $_SESSION['reset_email'];
$password = $_POST['password'] ?? '';
$confirm_password = $_POST['confirm_password'] ?? '';

if (empty($password) || empty($confirm_password)) {
    echo json_encode(['success' => false, 'message' => 'Please fill in all fields']);
    exit();
}

if (strlen($password) < 8) {
    echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters long']);
    exit();
}

// Require at least one special character and one number
if (!preg_match('/[0-9]/', $password)) {
    echo json_encode(['success' => false, 'message' => 'Password must contain at least one number']);
    exit();
}
if (!preg_match('/[^a-zA-Z0-9]/', $password)) {
    echo json_encode(['success' => false, 'message' => 'Password must contain at least one special character']);
    exit();
}

if ($password !== $confirm_password) {
    echo json_encode(['success' => false, 'message' => 'Passwords do not match']);
    exit();
}

// Hash the password using SHA-256 (hex string) to match login and database
$hashed_password = hash('sha256', $password);

// Update password in database
$sql = "UPDATE students_user SET password = ? WHERE email = ? AND status = 'active'";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ss", $hashed_password, $email);


if ($stmt->execute()) {
    if ($stmt->affected_rows > 0) {
        // Clear the reset session
        unset($_SESSION['reset_email']);
        echo json_encode(['success' => true, 'message' => 'Password reset successfully']);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'No account was updated. This may mean the email is incorrect, the account is not active, or the password is the same as before.'
        ]);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to reset password']);
}

$stmt->close();
$conn->close();
?>