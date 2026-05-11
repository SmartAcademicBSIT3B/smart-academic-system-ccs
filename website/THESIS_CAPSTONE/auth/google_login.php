<?php
session_start();

// ============================================
// GOOGLE OAUTH 2.0 CONFIGURATION
// ============================================
// To set up Google OAuth:
// 1. Go to https://console.cloud.google.com/
// 2. Create a new project or select existing one
// 3. Enable Google+ API
// 4. Go to "Credentials" > "Create Credentials" > "OAuth 2.0 Client ID"
// 5. Choose "Web Application"
// 6. Add Authorized Redirect URIs matching your runtime URL, for example:
//    - http://localhost:8000/auth/google_login.php (PHP built-in server)
//    - http://localhost/THESIS_CAPSTONE/auth/google_login.php (XAMPP/htdocs setup)
// 7. Copy your Client ID and Client Secret below

$client_id = '676458007174-m7nomcu3gvlnqsmpb73v4uoee7q324ld.apps.googleusercontent.com';
$client_secret = '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';

// Build redirect URI dynamically so it matches the actual request host and scheme
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$script_path = $_SERVER['SCRIPT_NAME'] ?? '/auth/google_login.php';
$redirect_uri = $scheme . '://' . $_SERVER['HTTP_HOST'] . $script_path;

// ============================================
// STEP 1: Check if returning from Google with authorization code
// ============================================
if (!isset($_GET['code'])) {
    // No authorization code yet - redirect user to Google for authentication
    
    $auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $client_id,
        'redirect_uri' => $redirect_uri,
        'scope' => 'openid email profile',
        'response_type' => 'code',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'hd' => 'plpasig.edu.ph'
    ]);

    header('Location: ' . $auth_url);
    exit();
}

// ============================================
// STEP 2: Exchange authorization code for access token
// ============================================
$code = $_GET['code'];

$token_url = 'https://oauth2.googleapis.com/token';
$token_data = [
    'client_id' => $client_id,
    'client_secret' => $client_secret,
    'code' => $code,
    'grant_type' => 'authorization_code',
    'redirect_uri' => $redirect_uri
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $token_url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($token_data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$token_response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200) {
    header("Location: ../login.php?error=Failed to authenticate with Google (Token Error)");
    exit();
}

$token_data = json_decode($token_response, true);

if (!isset($token_data['access_token'])) {
    header("Location: ../login.php?error=Failed to get access token from Google");
    exit();
}

$access_token = $token_data['access_token'];

// ============================================
// STEP 3: Get user information from Google
// ============================================
$user_info_url = 'https://www.googleapis.com/oauth2/v2/userinfo?access_token=' . $access_token;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $user_info_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$user_response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200) {
    header("Location: ../login.php?error=Failed to retrieve user information from Google");
    exit();
}

$user_data = json_decode($user_response, true);

if (!isset($user_data['email'])) {
    header("Location: ../login.php?error=Failed to get email from Google account");
    exit();
}

// ============================================
// STEP 4: Verify user exists in database
// ============================================
$conn = include("../php/config.php");

if (!$conn) {
    header("Location: ../login.php?error=Database connection failed");
    exit();
}

$email = trim($user_data['email']);
$name = $user_data['name'] ?? 'Google User';

// ✅ DOMAIN VALIDATION: Only allow plpasig.edu.ph accounts
if (!preg_match('/@plpasig\.edu\.ph$/', $email)) {
    header("Location: ../login.php?error=Only plpasig.edu.ph accounts are allowed to login.");
    exit();
}

// Check if user exists and is active
$sql = "SELECT student_id, name, email, status FROM students_user WHERE email = ? LIMIT 1";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    header("Location: ../login.php?error=Database error: " . $conn->error);
    exit();
}

$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $row = $result->fetch_assoc();

    // Check if account is active
    if ($row['status'] !== 'active') {
        header("Location: ../login.php?error=Your account is not active. Please contact the administrator.");
        exit();
    }

    // ✅ User found and active - Create session
    $_SESSION['student_id'] = $row['student_id'];
    $_SESSION['name'] = $row['name'];
    $_SESSION['email'] = $row['email'];
    $_SESSION['login_method'] = 'google';
    $_SESSION['login_time'] = date('Y-m-d H:i:s');

    $stmt->close();
    $conn->close();

    // Redirect to dashboard
    header("Location: ../html/mainmenu.php");
    exit();
} else {
    // ❌ User not found
    $stmt->close();
    $conn->close();

    header("Location: ../login.php?error=Google account not registered. Please contact the administrator to create an account.");
    exit();
}
?>