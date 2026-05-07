<?php
session_start();

header('Content-Type: application/json');

$cloudinary_cloud_name = 'diujat7xu';
$cloudinary_api_key = '183859447426441';
$cloudinary_api_secret = 'ZlclHl6jA8-Epmmtax3zVpjCWqk';

if (!function_exists('curl_init')) {
    echo json_encode(['success' => false, 'message' => 'cURL is not enabled on the server.']);
    exit();
}

$conn = include("config.php");
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

// Auth check
if (!isset($_SESSION['student_id'])) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

if (!isset($_FILES['profile_image']) || $_FILES['profile_image']['error'] !== UPLOAD_ERR_OK) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error']);
    exit();
}

$file = $_FILES['profile_image'];

// Validate MIME type (don't trust $_FILES['type'])
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
$allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$ext_map = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
];

if (!in_array($mime, $allowed_mimes)) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'Invalid file type. Only JPG, PNG, GIF, WEBP allowed.']);
    exit();
}

// Max 5MB
if ($file['size'] > 5 * 1024 * 1024) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'File too large. Max 5MB.']);
    exit();
}

$student_id_safe = preg_replace('/[^a-zA-Z0-9_-]/', '', $_SESSION['student_id']);
$timestamp = time();
$folder = 'HTA Files/OJT Requirements/' . $student_id_safe . '/Profile';
$public_id = $folder . '/photo';
$student_name = isset($_SESSION['name']) ? trim($_SESSION['name']) : '';
$context_parts = ['student_id=' . $student_id_safe];
if ($student_name !== '') {
    $context_parts[] = 'student_name=' . preg_replace('/[|=]/', ' ', $student_name);
}

$params = [
    'context' => implode('|', $context_parts),
    'folder' => $folder,
    'invalidate' => 'true',
    'overwrite' => 'true',
    'public_id' => 'photo',
    'timestamp' => $timestamp,
    'use_filename' => 'false',
];

ksort($params);
$signature_base = [];
foreach ($params as $key => $value) {
    $signature_base[] = $key . '=' . $value;
}
$signature = sha1(implode('&', $signature_base) . $cloudinary_api_secret);

$payload = [
    'api_key' => $cloudinary_api_key,
    'context' => $params['context'],
    'file' => new CURLFile($file['tmp_name'], $mime, $file['name']),
    'folder' => $folder,
    'invalidate' => 'true',
    'overwrite' => 'true',
    'public_id' => 'photo',
    'signature' => $signature,
    'timestamp' => $timestamp,
    'use_filename' => 'false',
];

$ch = curl_init('https://api.cloudinary.com/v1_1/' . $cloudinary_cloud_name . '/image/upload');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$response = curl_exec($ch);
$http_code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($response === false) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'Cloudinary upload failed: ' . $curl_error]);
    exit();
}

$data = json_decode($response, true);
if ($http_code < 200 || $http_code >= 300 || !is_array($data) || empty($data['secure_url'])) {
    $message = 'Cloudinary upload failed.';
    if (is_array($data) && isset($data['error']['message'])) {
        $message = $data['error']['message'];
    }
    $conn->close();
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

try {
    $conn->query("ALTER TABLE students_user ADD COLUMN profile_image_url VARCHAR(255) NULL");
} catch (Throwable $e) {
    // Ignore if the column already exists.
}

$stored_url = $data['secure_url'];
$stmt = $conn->prepare("UPDATE students_user SET profile_image_url = ? WHERE student_id = ?");
if (!$stmt) {
    $conn->close();
    echo json_encode(['success' => false, 'message' => 'Failed to prepare profile image update.']);
    exit();
}

$stmt->bind_param("ss", $stored_url, $_SESSION['student_id']);
$stmt->execute();
$stmt->close();
$conn->close();

echo json_encode([
    'success' => true,
    'path' => $stored_url,
    'public_id' => $data['public_id'] ?? $public_id,
]);
