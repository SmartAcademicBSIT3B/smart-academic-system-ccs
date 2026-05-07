<?php
session_start();

// Include database configuration
$conn = include("../php/config.php");

if (!$conn) {
    die("Database connection failed");
}

// Validate and sanitize input
$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

if (empty($email) || empty($password)) {
    header("Location: ../login.php?error=Email and password are required");
    exit();
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header("Location: ../login.php?error=Invalid email format");
    exit();
}

// Brute force protection logic
$sql = "SELECT student_id, name, email, password, status, failed_attempts, locked_until FROM students_user WHERE email = ? LIMIT 1";
$stmt = $conn->prepare($sql);
if (!$stmt) {
    die("Prepare failed: " . $conn->error);
}
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    // Email not found
    header("Location: ../login.php?error=Invalid Email or Password");
    exit();
}

$row = $result->fetch_assoc();

// Check if account is locked
if (!empty($row['locked_until']) && strtotime($row['locked_until']) > time()) {
    header("Location: ../login.php?error=locked&email=" . urlencode($email));
    exit();
}

// Check if account is inactive
if ($row['status'] !== 'active') {
    header("Location: ../login.php?error=Account is not active.");
    exit();
}

// Hash the password using SHA-256 and compare
$hashedPassword = hash('sha256', $password);
if ($hashedPassword === $row['password']) {
    // Successful login: reset failed_attempts and locked_until
    $resetSql = "UPDATE students_user SET failed_attempts = 0, locked_until = NULL WHERE student_id = ?";
    $resetStmt = $conn->prepare($resetSql);
    $resetStmt->bind_param("s", $row['student_id']);
    $resetStmt->execute();
    $resetStmt->close();

    // Set session variables
    $_SESSION['student_id'] = $row['student_id'];
    $_SESSION['name'] = $row['name'];
    $_SESSION['email'] = $row['email'];

    // Redirect to main menu
    header("Location: ../html/mainmenu.php");
    exit();
} else {
    // Failed login: increment failed_attempts
    $failed_attempts = (int)$row['failed_attempts'] + 1;
    $lock = false;
    $locked_until = null;
    if ($failed_attempts >= 5) {
        // Lock account for 15 minutes (or until OTP reactivation)
        $lock = true;
        $locked_until = date('Y-m-d H:i:s', time() + 15 * 60);
    }
    $updateSql = "UPDATE students_user SET failed_attempts = ?, locked_until = ? WHERE student_id = ?";
    $updateStmt = $conn->prepare($updateSql);
    $updateStmt->bind_param("iss", $failed_attempts, $locked_until, $row['student_id']);
    $updateStmt->execute();
    $updateStmt->close();

    if ($lock) {
        header("Location: ../login.php?error=Account locked after 5 failed attempts. Please reactivate via OTP.");
    } else {
        header("Location: ../login.php?error=Invalid Email or Password");
    }
    exit();
}

$stmt->close();
$conn->close();
?>