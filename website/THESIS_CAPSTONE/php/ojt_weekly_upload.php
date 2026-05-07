<?php
// ojt_weekly_upload.php: Handles weekly report upload, remove, and submit actions
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Show detailed SQL errors for debugging
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
set_exception_handler(function($e) {
    if ($e instanceof mysqli_sql_exception) {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'SQL ERROR: ' . $e->getMessage()]);
        exit();
    }
    throw $e;
});

session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['error' => 'Not authenticated']);
    exit();
}

$student_id = $_SESSION['student_id'];
$action = $_POST['action'] ?? 'upload';
$week_number = intval($_POST['week_number'] ?? 0);

if ($week_number <= 0) {
    echo json_encode(['error' => 'Invalid week number']);
    exit();
}

$conn = include('config.php');
if (!$conn) {
    echo json_encode(['error' => 'Database connection failed']);
    exit();
}

// Get ojt_student_id
$ojt_student_id = null;
$stmt = $conn->prepare('SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id);
$stmt->fetch();
$stmt->close();
if (!$ojt_student_id) {
    echo json_encode(['error' => 'Student OJT record not found']);
    exit();
}

// --- REMOVE LOGIC ---
if ($action === 'remove') {
    $stmt = $conn->prepare("UPDATE ojt_weekly_reports SET file_url=NULL, file_name=NULL, cloudinary_public_id=NULL, status='Pending', updated_at=NOW() WHERE ojt_student_id=? AND week_number=? AND (status IS NULL OR status='Pending')");
    $stmt->bind_param('ii', $ojt_student_id, $week_number);
    if (!$stmt->execute()) {
        echo json_encode(['error' => 'DB error: ' . $stmt->error]);
        exit();
    }
    if ($stmt->affected_rows === 0) {
        echo json_encode(['error' => 'Cannot remove: already submitted or not found.']);
        exit();
    }
    $stmt->close();
    echo json_encode(['success' => true]);
    exit();
}

// --- SUBMIT LOGIC ---
if ($action === 'submit') {
    $stmt = $conn->prepare("UPDATE ojt_weekly_reports SET status='Submitted', submitted_at=NOW(), updated_at=NOW() WHERE ojt_student_id=? AND week_number=? AND file_url IS NOT NULL AND status IS NULL");
    $stmt->bind_param('ii', $ojt_student_id, $week_number);
    if (!$stmt->execute()) {
        echo json_encode(['error' => 'DB error: ' . $stmt->error]);
        exit();
    }
    $stmt->close();
    echo json_encode(['success' => true]);
    exit();
}

// --- UPLOAD LOGIC ---
if ($action === 'upload' && isset($_FILES['file'])) {
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['error' => 'File upload error']);
        exit();
    }
    // Cloudinary config
    $cloud_name = 'diujat7xu';
    $api_key = '183859447426441';
    $api_secret = 'ZlclHl6jA8-Epmmtax3zVpjCWqk';
    $folder = "HTA Files/OJT Requirements/$student_id/Weekly Reports";
    $publicId = 'week' . $week_number . '_' . uniqid();
    // Upload to Cloudinary
    function uploadToCloudinarySimple($filePath, $folder, $publicId = null) {
        global $cloud_name, $api_key, $api_secret;
        $timestamp = time();
        $params = [
            'timestamp' => $timestamp,
            'folder' => $folder,
        ];
        if ($publicId) {
            $params['public_id'] = $publicId;
        }
        ksort($params);
        $toSign = '';
        foreach ($params as $k => $v) {
            $toSign .= $k . '=' . $v . '&';
        }
        $toSign = rtrim($toSign, '&') . $api_secret;
        $signature = sha1($toSign);
        $params['api_key'] = $api_key;
        $params['signature'] = $signature;
        $params['file'] = new CURLFile($filePath);
        $url = "https://api.cloudinary.com/v1_1/$cloud_name/auto/upload";
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        if (curl_errno($ch)) {
            return ['error' => curl_error($ch)];
        }
        curl_close($ch);
        return json_decode($response, true);
    }
    $result = uploadToCloudinarySimple($file['tmp_name'], $folder, $publicId);
    if (isset($result['secure_url'])) {
        $url = $result['secure_url'];
        $public_id = $result['public_id'];
        $file_name = $file['name'];
        $now = date('Y-m-d H:i:s');
        // Upsert logic
        $stmt = $conn->prepare("SELECT id FROM ojt_weekly_reports WHERE ojt_student_id=? AND week_number=?");
        $stmt->bind_param('ii', $ojt_student_id, $week_number);
        $stmt->execute();
        $stmt->store_result();
        if ($stmt->num_rows > 0) {
            $stmt->close();
            $stmt2 = $conn->prepare("UPDATE ojt_weekly_reports SET file_url=?, cloudinary_public_id=?, file_name=?, student_id_ref=?, status='Pending', updated_at=? WHERE ojt_student_id=? AND week_number=? AND (status IS NULL OR status='Pending')");
            $stmt2->bind_param('ssssssi', $url, $public_id, $file_name, $student_id, $now, $ojt_student_id, $week_number);
            if (!$stmt2->execute()) {
                echo json_encode(['error' => 'DB error: ' . $stmt2->error]);
                exit();
            }
            $stmt2->close();
        } else {
            $stmt->close();
            $pending = 'Pending';
            $stmt2 = $conn->prepare("INSERT INTO ojt_weekly_reports (ojt_student_id, student_id_ref, week_number, file_url, cloudinary_public_id, file_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt2->bind_param('isissssss', $ojt_student_id, $student_id, $week_number, $url, $public_id, $file_name, $pending, $now, $now);
            if (!$stmt2->execute()) {
                echo json_encode(['error' => 'DB error: ' . $stmt2->error]);
                exit();
            }
            $stmt2->close();
        }
        echo json_encode([
            'success' => true,
            'url' => $url,
            'file_name' => $file_name,
            'status' => null
        ]);
        exit();
    } else {
        echo json_encode(['error' => $result['error'] ?? 'Cloudinary upload failed']);
        exit();
    }
}

echo json_encode(['error' => 'Invalid request']);
exit();
