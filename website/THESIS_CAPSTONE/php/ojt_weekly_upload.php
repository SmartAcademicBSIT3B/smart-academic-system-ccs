<?php
header('Content-Type: application/json');

date_default_timezone_set('Asia/Manila');
error_reporting(0);
ini_set('display_errors', 0);

session_start();
require_once __DIR__ . '/ojt_policy_settings.php';
if (!isset($_SESSION['student_id'])) {
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit();
}

$student_id = trim((string)($_SESSION['student_id'] ?? ''));
$action = strtolower(trim((string)($_REQUEST['action'] ?? 'list')));

$conn = include('config.php');
if (!$conn) {
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit();
}

function ensure_weekly_reports_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS ojt_weekly_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      week_number INT NOT NULL,
      week_start_date DATE NULL,
      file_url VARCHAR(512) NULL,
      cloudinary_public_id VARCHAR(512) NULL,
      folder_path VARCHAR(512) NULL,
      file_name VARCHAR(255) NULL,
      status VARCHAR(32) NULL,
      submitted_at DATETIME NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_owr_student_week (ojt_student_id, week_number),
      INDEX idx_owr_student (ojt_student_id),
      INDEX idx_owr_dept (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    return $conn->query($sql);
}

function ensure_weekly_reports_columns($conn) {
    $columnsToEnsure = [
        'week_start_date' => "ALTER TABLE ojt_weekly_reports ADD COLUMN week_start_date DATE NULL",
        'file_url' => "ALTER TABLE ojt_weekly_reports ADD COLUMN file_url VARCHAR(512) NULL",
        'cloudinary_public_id' => "ALTER TABLE ojt_weekly_reports ADD COLUMN cloudinary_public_id VARCHAR(512) NULL",
        'folder_path' => "ALTER TABLE ojt_weekly_reports ADD COLUMN folder_path VARCHAR(512) NULL",
        'file_name' => "ALTER TABLE ojt_weekly_reports ADD COLUMN file_name VARCHAR(255) NULL",
        'status' => "ALTER TABLE ojt_weekly_reports ADD COLUMN status VARCHAR(32) NULL",
        'submitted_at' => "ALTER TABLE ojt_weekly_reports ADD COLUMN submitted_at DATETIME NULL",
        'department' => "ALTER TABLE ojt_weekly_reports ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS'",
        'created_at' => "ALTER TABLE ojt_weekly_reports ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        'updated_at' => "ALTER TABLE ojt_weekly_reports ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ];

    foreach ($columnsToEnsure as $columnName => $alterSql) {
        $check = $conn->query("SHOW COLUMNS FROM ojt_weekly_reports LIKE '" . $conn->real_escape_string($columnName) . "'");
        if (!$check || $check->num_rows === 0) {
            if (!$conn->query($alterSql)) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Emit real-time notification to coordinators
 */
function emitWeeklyReportNotification($student_id, $student_name, $dept, $week_number, $status) {
    // Determine backend API URL (should work in both dev and production)
    $backend_url = getenv('API_BASE_URL') ?: 'http://localhost:3000';
    $notification_url = $backend_url . '/api/ojt-coordinator/emit-notification';
    
    $payload = [
        'type' => 'weekly_report',
        'student_id' => $student_id,
        'student_name' => $student_name,
        'department' => $dept,
        'week_number' => $week_number,
        'status' => $status
    ];
    
    // Send notification asynchronously (non-blocking)
    $ch = curl_init($notification_url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Short timeout for async call
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    
    @curl_exec($ch);
    curl_close($ch);
}

function uploadWeeklyReportToCloudinary($tmpPath, $student_id, $fileName) {
    if (!function_exists('curl_init')) {
        return ['error' => 'cURL is not enabled on the server.'];
    }

    include_once('cloudinary_config.php');

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmpPath);
    $allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!in_array($mime, $allowed, true)) {
        return ['error' => 'Invalid weekly report file type. Use an image or PDF.'];
    }

    $studentSafe = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$student_id);
    $folder = 'HTA Files/OJT Requirements/' . $studentSafe . '/Weekly Reports';
    $timestamp = time();
    $publicId = 'weekly_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo((string)$fileName, PATHINFO_FILENAME)) . '_' . uniqid();

    $params = [
        'folder' => $folder,
        'public_id' => $publicId,
        'timestamp' => $timestamp,
        'use_filename' => 'false',
        'overwrite' => 'true',
    ];

    ksort($params);
    $signatureParts = [];
    foreach ($params as $key => $value) {
        $signatureParts[] = $key . '=' . $value;
    }
    $signature = sha1(implode('&', $signatureParts) . CLOUDINARY_API_SECRET);

    $payload = [
        'api_key' => CLOUDINARY_API_KEY,
        'file' => new CURLFile($tmpPath, $mime, $fileName),
        'folder' => $folder,
        'public_id' => $publicId,
        'signature' => $signature,
        'timestamp' => $timestamp,
        'use_filename' => 'false',
        'overwrite' => 'true',
    ];

    $ch = curl_init('https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/auto/upload');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['error' => 'Cloudinary upload failed: ' . $curlError];
    }

    $data = json_decode($response, true);
    if ($httpCode < 200 || $httpCode >= 300 || !is_array($data) || empty($data['secure_url'])) {
        $message = 'Cloudinary upload failed.';
        if (is_array($data) && isset($data['error']['message'])) {
            $message = $data['error']['message'];
        }
        return ['error' => $message];
    }

    return [
        'url' => $data['secure_url'],
        'public_id' => $data['public_id'] ?? $publicId,
        'folder' => $folder,
    ];
}

if (!ensure_weekly_reports_table($conn) || !ensure_weekly_reports_columns($conn)) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Failed to prepare weekly report table']);
    exit();
}

$ojt_student_id = null;
$department = 'CCS';
$student_name = '';
$stmt = $conn->prepare('SELECT id, department, name FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id, $department, $student_name);
$stmt->fetch();
$stmt->close();

$policy = ojt_policy_get_for_department($conn, $department);
$weeklyPolicy = ojt_policy_values_for_category($policy, 'weekly');

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Student OJT record not found']);
    exit();
}

if ($action === 'list') {
    $rows = [];
    $maxWeek = 0;
    $stmt = $conn->prepare('SELECT week_number, week_start_date, file_url, cloudinary_public_id, file_name, status, submitted_at FROM ojt_weekly_reports WHERE ojt_student_id = ? ORDER BY week_number ASC');
    $stmt->bind_param('i', $ojt_student_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($res && $row = $res->fetch_assoc()) {
        $rows[] = $row;
        $week = (int)($row['week_number'] ?? 0);
        if ($week > $maxWeek) {
            $maxWeek = $week;
        }
    }
    $stmt->close();
    $conn->close();

    echo json_encode([
        'success' => true,
        'reports' => $rows,
        'next_week_number' => max(1, $maxWeek + 1),
    ]);
    exit();
}

if ($action === 'save') {
    $week_number = (int)($_POST['week_number'] ?? 0);
    $week_start_date = trim((string)($_POST['week_start_date'] ?? ''));

    if ($week_number <= 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Invalid week number']);
        exit();
    }

    if ($week_start_date === '') {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Week start date is required']);
        exit();
    }

    $existing = null;
    $stmt = $conn->prepare('SELECT file_url, cloudinary_public_id, folder_path, file_name, status, submitted_at FROM ojt_weekly_reports WHERE ojt_student_id = ? AND week_number = ? LIMIT 1');
    $stmt->bind_param('ii', $ojt_student_id, $week_number);
    $stmt->execute();
    $res = $stmt->get_result();
    $existing = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    $file_url = $existing ? (string)($existing['file_url'] ?? '') : '';
    $cloudinary_public_id = $existing ? (string)($existing['cloudinary_public_id'] ?? '') : '';
    $folder_path = $existing ? (string)($existing['folder_path'] ?? '') : '';
    $file_name = $existing ? (string)($existing['file_name'] ?? '') : '';
    $status = $existing ? (string)($existing['status'] ?? '') : '';
    $submitted_at = $existing ? ($existing['submitted_at'] ?? null) : null;

    if (isset($_FILES['file']) && is_array($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $sizeError = ojt_policy_validate_uploaded_file_size($_FILES['file'], $weeklyPolicy['maxFileSizeMB']);
        if ($sizeError !== null) {
            $conn->close();
            echo json_encode(['success' => false, 'error' => $sizeError]);
            exit();
        }

        $limitCheck = ojt_policy_check_daily_upload_limit(
            $conn,
            $department,
            $student_id,
            $weeklyPolicy['category'],
            $weeklyPolicy['rateLimitPerDay']
        );
        if (!$limitCheck['ok']) {
            $conn->close();
            echo json_encode([
                'success' => false,
                'error' => $weeklyPolicy['label'] . ' upload limit reached (' . (int)$weeklyPolicy['rateLimitPerDay'] . ' per 24 hours).'
            ]);
            exit();
        }

        $uploaded = uploadWeeklyReportToCloudinary(
            $_FILES['file']['tmp_name'],
            $student_id,
            $_FILES['file']['name'] ?? ('week-' . $week_number)
        );

        if (!empty($uploaded['error'])) {
            $conn->close();
            echo json_encode(['success' => false, 'error' => $uploaded['error']]);
            exit();
        }

        $file_url = (string)($uploaded['url'] ?? '');
        $cloudinary_public_id = (string)($uploaded['public_id'] ?? '');
        $folder_path = (string)($uploaded['folder'] ?? '');
        $file_name = (string)($_FILES['file']['name'] ?? ('week-' . $week_number));
        $submitted_at = date('Y-m-d H:i:s');
        if ($status === '') {
            $status = 'submitted';
        }
    }

    if ($existing) {
        $stmt = $conn->prepare('UPDATE ojt_weekly_reports SET week_start_date = ?, file_url = ?, cloudinary_public_id = ?, folder_path = ?, file_name = ?, status = ?, submitted_at = ?, updated_at = NOW() WHERE ojt_student_id = ? AND week_number = ?');
        $stmt->bind_param('sssssssii', $week_start_date, $file_url, $cloudinary_public_id, $folder_path, $file_name, $status, $submitted_at, $ojt_student_id, $week_number);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare('INSERT INTO ojt_weekly_reports (ojt_student_id, student_id_ref, week_number, week_start_date, file_url, cloudinary_public_id, folder_path, file_name, status, submitted_at, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('isissssssss', $ojt_student_id, $student_id, $week_number, $week_start_date, $file_url, $cloudinary_public_id, $folder_path, $file_name, $status, $submitted_at, $department);
        $stmt->execute();
        $stmt->close();
    }

    // Emit real-time notification if file was uploaded
    if ($file_url !== '') {
        emitWeeklyReportNotification($student_id, $student_name, $department, $week_number, $status);
        ojt_policy_track_upload_activity($conn, $department, $student_id, $weeklyPolicy['category']);
    }

    $conn->close();
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'delete') {
    $week_number = (int)($_POST['week_number'] ?? 0);
    if ($week_number <= 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Invalid week number']);
        exit();
    }

    $stmt = $conn->prepare('DELETE FROM ojt_weekly_reports WHERE ojt_student_id = ? AND week_number = ?');
    $stmt->bind_param('ii', $ojt_student_id, $week_number);
    $stmt->execute();
    $stmt->close();

    $conn->close();
    echo json_encode(['success' => true]);
    exit();
}

$conn->close();
echo json_encode(['success' => false, 'error' => 'Invalid action']);
exit();
