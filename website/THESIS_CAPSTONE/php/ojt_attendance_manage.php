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

function ensure_schedule_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS ojt_student_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ojt_student_id INT NOT NULL,
        student_id_ref VARCHAR(120) NOT NULL,
        start_date DATE NULL,
        day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
        time_in TIME NOT NULL,
        time_out TIME NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        department VARCHAR(120) NOT NULL DEFAULT 'CCS',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_oss_student_day (ojt_student_id, day_of_week),
        INDEX idx_oss_student (ojt_student_id),
        INDEX idx_oss_day (day_of_week)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    return $conn->query($sql);
}

function ensure_schedule_start_date_column($conn) {
    $exists = false;
    $check = $conn->query("SHOW COLUMNS FROM ojt_student_schedules LIKE 'start_date'");
    if ($check && $check->num_rows > 0) {
        $exists = true;
    }
    if (!$exists) {
        return $conn->query("ALTER TABLE ojt_student_schedules ADD COLUMN start_date DATE NULL AFTER student_id_ref");
    }
    return true;
}

function ensure_attendance_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS ojt_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      attendance_date DATE NOT NULL,
      datetime_in DATETIME NULL,
      datetime_out DATETIME NULL,
      duration_minutes INT NULL,
      status ENUM('present','absent','late','half-day','excused') NOT NULL DEFAULT 'present',
      proof_url VARCHAR(512) NULL,
      proof_public_id VARCHAR(512) NULL,
      notes TEXT NULL,
      recorded_by_user_id INT NULL,
      source ENUM('coordinator','student') NOT NULL DEFAULT 'student',
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_oa_student (ojt_student_id),
      INDEX idx_oa_date (attendance_date),
      INDEX idx_oa_dept (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    return $conn->query($sql);
}

function ensure_attendance_columns($conn) {
    $columnsToEnsure = [
        'proof_public_id' => "ALTER TABLE ojt_attendance ADD COLUMN proof_public_id VARCHAR(512) NULL AFTER proof_url",
        'notes' => "ALTER TABLE ojt_attendance ADD COLUMN notes TEXT NULL",
        'source' => "ALTER TABLE ojt_attendance ADD COLUMN source ENUM('coordinator','student') NOT NULL DEFAULT 'student'",
        'department' => "ALTER TABLE ojt_attendance ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS'",
        'created_at' => "ALTER TABLE ojt_attendance ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        'updated_at' => "ALTER TABLE ojt_attendance ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ];

    foreach ($columnsToEnsure as $columnName => $alterSql) {
        $check = $conn->query("SHOW COLUMNS FROM ojt_attendance LIKE '" . $conn->real_escape_string($columnName) . "'");
        if (!$check || $check->num_rows === 0) {
            if (!$conn->query($alterSql)) {
                return false;
            }
        }
    }

    return true;
}

function uploadAttendanceProofToCloudinary($tmpPath, $student_id, $fileName) {
    if (!function_exists('curl_init')) {
        return ['error' => 'cURL is not enabled on the server.'];
    }

    include_once('cloudinary_config.php');

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmpPath);
    $allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!in_array($mime, $allowed, true)) {
        return ['error' => 'Invalid proof file type. Use an image or PDF.'];
    }

    $studentSafe = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$student_id);
    $folder = 'HTA Files/OJT Requirements/' . $studentSafe . '/Daily Reports';
    $timestamp = time();
    $publicId = 'attendance_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo((string)$fileName, PATHINFO_FILENAME)) . '_' . uniqid();

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
    $http_code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['error' => 'Cloudinary upload failed: ' . $curl_error];
    }

    $data = json_decode($response, true);
    if ($http_code < 200 || $http_code >= 300 || !is_array($data) || empty($data['secure_url'])) {
        $message = 'Cloudinary upload failed.';
        if (is_array($data) && isset($data['error']['message'])) {
            $message = $data['error']['message'];
        }
        return ['error' => $message];
    }

    return [
        'url' => $data['secure_url'],
        'public_id' => $data['public_id'] ?? $publicId,
    ];
}

function compute_duration_minutes($datetime_in, $datetime_out) {
    if (!$datetime_in || !$datetime_out) return null;
    $in = strtotime((string)$datetime_in);
    $out = strtotime((string)$datetime_out);
    if (!$in || !$out || $out <= $in) return 0;
    return (int) floor(($out - $in) / 60);
}

function get_schedule_for_date($conn, $ojt_student_id, $attendance_date) {
    $ts = strtotime((string)$attendance_date);
    if (!$ts) return null;
    $day = date('l', $ts);
    $stmt = $conn->prepare('SELECT day_of_week, time_in, time_out, start_date FROM ojt_student_schedules WHERE ojt_student_id = ? AND day_of_week = ? AND is_active = 1 LIMIT 1');
    $stmt->bind_param('is', $ojt_student_id, $day);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return $row ?: null;
}

function resolve_status($attendance_date, $datetime_in, $schedule_row) {
    if (!$datetime_in) {
        return 'absent';
    }
    if (!$schedule_row || empty($schedule_row['time_in'])) {
        return 'present';
    }

    $actualIn = strtotime((string)$datetime_in);
    $scheduledIn = strtotime((string)$attendance_date . ' ' . (string)$schedule_row['time_in']);
    if ($actualIn && $scheduledIn && $actualIn > $scheduledIn) {
        return 'late';
    }
    return 'present';
}

function current_datetime_value() {
    return date('Y-m-d H:i:s');
}

function scheduled_timeout_datetime($attendance_date, $schedule_row) {
    if (!$schedule_row || empty($schedule_row['time_out'])) {
        return null;
    }
    $scheduledOutTs = strtotime((string)$attendance_date . ' ' . (string)$schedule_row['time_out']);
    if (!$scheduledOutTs) {
        return null;
    }
    return date('Y-m-d H:i:s', $scheduledOutTs);
}

function resolve_timeout_status($attendance_date, $datetime_in, $schedule_row) {
    return resolve_status($attendance_date, $datetime_in, $schedule_row);
}

function ensure_today_auto_absent($conn, $ojt_student_id, $student_id_ref, $department) {
    $today = date('Y-m-d');
    $schedule = get_schedule_for_date($conn, $ojt_student_id, $today);
    if (!$schedule) return;

    $startDate = trim((string)($schedule['start_date'] ?? ''));
    if ($startDate === '' || strtotime($today) < strtotime($startDate)) return;

    $scheduleEnd = strtotime($today . ' ' . (string)$schedule['time_out']);
    if (!$scheduleEnd || time() <= $scheduleEnd) return;

    $checkStmt = $conn->prepare('SELECT id, datetime_in FROM ojt_attendance WHERE ojt_student_id = ? AND attendance_date = ? ORDER BY id DESC LIMIT 1');
    $checkStmt->bind_param('is', $ojt_student_id, $today);
    $checkStmt->execute();
    $res = $checkStmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $checkStmt->close();

    if ($row && !empty($row['datetime_in'])) {
        return;
    }

    if ($row) {
        $updateStmt = $conn->prepare("UPDATE ojt_attendance SET status='absent', notes=COALESCE(notes, 'Auto-marked absent by schedule.'), source='student', updated_at=NOW() WHERE id = ?");
        $updateStmt->bind_param('i', $row['id']);
        $updateStmt->execute();
        $updateStmt->close();
        return;
    }

    $insertStmt = $conn->prepare("INSERT INTO ojt_attendance (ojt_student_id, student_id_ref, attendance_date, datetime_in, datetime_out, duration_minutes, status, notes, source, department) VALUES (?, ?, ?, NULL, NULL, NULL, 'absent', 'Auto-marked absent by schedule.', 'student', ?)");
    $insertStmt->bind_param('isss', $ojt_student_id, $student_id_ref, $today, $department);
    $insertStmt->execute();
    $insertStmt->close();
}

function ensure_due_auto_timeout($conn, $ojt_student_id) {
    $nowTs = time();
    $stmt = $conn->prepare('SELECT id, attendance_date, datetime_in, datetime_out FROM ojt_attendance WHERE ojt_student_id = ? AND datetime_in IS NOT NULL AND datetime_out IS NULL ORDER BY attendance_date DESC, id DESC');
    $stmt->bind_param('i', $ojt_student_id);
    $stmt->execute();
    $res = $stmt->get_result();

    $updateStmt = $conn->prepare('UPDATE ojt_attendance SET datetime_out = ?, duration_minutes = ?, status = ?, updated_at = NOW() WHERE id = ? AND ojt_student_id = ?');
    while ($res && $row = $res->fetch_assoc()) {
        $attendanceDate = trim((string)($row['attendance_date'] ?? ''));
        $datetimeIn = trim((string)($row['datetime_in'] ?? ''));
        if ($attendanceDate === '' || $datetimeIn === '') {
            continue;
        }

        $schedule = get_schedule_for_date($conn, $ojt_student_id, $attendanceDate);
        if (!$schedule || empty($schedule['time_out'])) {
            continue;
        }

        $startDate = trim((string)($schedule['start_date'] ?? ''));
        if ($startDate !== '' && strtotime($attendanceDate) < strtotime($startDate)) {
            continue;
        }

        $scheduledOutTs = strtotime($attendanceDate . ' ' . (string)$schedule['time_out']);
        if (!$scheduledOutTs || $scheduledOutTs > $nowTs) {
            continue;
        }

        $fixedDatetimeOut = date('Y-m-d H:i:s', $scheduledOutTs);
        $durationMinutes = compute_duration_minutes($datetimeIn, $fixedDatetimeOut);
        $status = resolve_timeout_status($attendanceDate, $datetimeIn, $schedule);
        $rowId = (int)($row['id'] ?? 0);
        if ($rowId <= 0) {
            continue;
        }

        $updateStmt->bind_param('sisii', $fixedDatetimeOut, $durationMinutes, $status, $rowId, $ojt_student_id);
        $updateStmt->execute();
    }

    $updateStmt->close();
    $stmt->close();
}

if (!ensure_schedule_table($conn) || !ensure_schedule_start_date_column($conn) || !ensure_attendance_table($conn) || !ensure_attendance_columns($conn)) {
    echo json_encode(['success' => false, 'error' => 'Failed to prepare attendance tables']);
    exit();
}

$ojt_student_id = null;
$department = 'CCS';
$stmt = $conn->prepare('SELECT id, department FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id, $department);
$stmt->fetch();
$stmt->close();

$policy = ojt_policy_get_for_department($conn, $department);
$dailyPolicy = ojt_policy_values_for_category($policy, 'daily');

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Student OJT record not found']);
    exit();
}

if ($action === 'list') {
    ensure_today_auto_absent($conn, $ojt_student_id, $student_id, $department);
    ensure_due_auto_timeout($conn, $ojt_student_id);

    $rows = [];
    $stmt = $conn->prepare('SELECT id, attendance_date, datetime_in, datetime_out, duration_minutes, status, proof_url, proof_public_id, notes FROM ojt_attendance WHERE ojt_student_id = ? ORDER BY attendance_date DESC, id DESC');
    $stmt->bind_param('i', $ojt_student_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($res && $row = $res->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true, 'records' => $rows]);
    exit();
}

if ($action === 'save') {
    $payload = $_POST;
    if (empty($payload)) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string)$raw, true);
        if (is_array($decoded)) {
            $payload = $decoded;
        }
    }

    $id = isset($payload['id']) ? (int)$payload['id'] : 0;
    $attendance_date = trim((string)($payload['attendance_date'] ?? ''));
    $time_in = trim((string)($payload['time_in'] ?? ''));
    $time_out = trim((string)($payload['time_out'] ?? ''));
    $notes = trim((string)($payload['notes'] ?? ''));
    $proof_url = trim((string)($payload['proof_url'] ?? ''));
    $proof_public_id = trim((string)($payload['proof_public_id'] ?? ''));

    if ($attendance_date === '') {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Attendance date is required.']);
        exit();
    }

    $datetime_in = $time_in !== '' ? ($attendance_date . ' ' . $time_in . ':00') : null;
    $datetime_out = $time_out !== '' ? ($attendance_date . ' ' . $time_out . ':00') : null;

    if ($datetime_in && $datetime_out && strtotime($datetime_out) <= strtotime($datetime_in)) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Time out must be after time in.']);
        exit();
    }

    $proofUploadedNow = false;
    if (isset($_FILES['proof_file']) && is_array($_FILES['proof_file']) && ($_FILES['proof_file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $sizeError = ojt_policy_validate_uploaded_file_size($_FILES['proof_file'], $dailyPolicy['maxFileSizeMB']);
        if ($sizeError !== null) {
            $conn->close();
            echo json_encode(['success' => false, 'error' => $sizeError]);
            exit();
        }

        $limitCheck = ojt_policy_check_daily_upload_limit(
            $conn,
            $department,
            $student_id,
            $dailyPolicy['category'],
            $dailyPolicy['rateLimitPerDay']
        );
        if (!$limitCheck['ok']) {
            $conn->close();
            echo json_encode([
                'success' => false,
                'error' => $dailyPolicy['label'] . ' upload limit reached (' . (int)$dailyPolicy['rateLimitPerDay'] . ' per 24 hours).'
            ]);
            exit();
        }

        $uploadedProof = uploadAttendanceProofToCloudinary(
            $_FILES['proof_file']['tmp_name'],
            $student_id,
            $_FILES['proof_file']['name'] ?? 'attendance-proof',
        );

        if (!empty($uploadedProof['error'])) {
            $conn->close();
            echo json_encode(['success' => false, 'error' => $uploadedProof['error']]);
            exit();
        }

        $proof_url = (string)($uploadedProof['url'] ?? '');
        $proof_public_id = (string)($uploadedProof['public_id'] ?? '');
        $proofUploadedNow = true;
    }

    $schedule = get_schedule_for_date($conn, $ojt_student_id, $attendance_date);
    $status = resolve_status($attendance_date, $datetime_in, $schedule);
    $duration_minutes = compute_duration_minutes($datetime_in, $datetime_out);
    $source = 'student';

    if ($id > 0) {
        $existing = $conn->prepare('SELECT proof_url, proof_public_id, datetime_out FROM ojt_attendance WHERE id = ? AND ojt_student_id = ? LIMIT 1');
        $existing->bind_param('ii', $id, $ojt_student_id);
        $existing->execute();
        $existingRes = $existing->get_result();
        $existingRow = $existingRes ? $existingRes->fetch_assoc() : null;
        $existing->close();

        if (!$existingRow) {
            $conn->close();
            echo json_encode(['success' => false, 'error' => 'Attendance record not found.']);
            exit();
        }

        $nextProofUrl = $proof_url !== '' ? $proof_url : (string)($existingRow['proof_url'] ?? '');
        $nextProofPublicId = $proof_public_id !== '' ? $proof_public_id : (string)($existingRow['proof_public_id'] ?? '');
        $nextDatetimeOut = $datetime_out !== null ? $datetime_out : ($existingRow['datetime_out'] ?? null);
        $nextDurationMinutes = compute_duration_minutes($datetime_in, $nextDatetimeOut);

        $stmt = $conn->prepare('UPDATE ojt_attendance SET attendance_date = ?, datetime_in = ?, datetime_out = ?, duration_minutes = ?, status = ?, proof_url = ?, proof_public_id = ?, notes = ?, source = ?, updated_at = NOW() WHERE id = ? AND ojt_student_id = ?');
        $stmt->bind_param('sssisssssii', $attendance_date, $datetime_in, $nextDatetimeOut, $nextDurationMinutes, $status, $nextProofUrl, $nextProofPublicId, $notes, $source, $id, $ojt_student_id);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare('INSERT INTO ojt_attendance (ojt_student_id, student_id_ref, attendance_date, datetime_in, datetime_out, duration_minutes, status, proof_url, proof_public_id, notes, source, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('issssissssss', $ojt_student_id, $student_id, $attendance_date, $datetime_in, $datetime_out, $duration_minutes, $status, $proof_url, $proof_public_id, $notes, $source, $department);
        $stmt->execute();
        $stmt->close();
    }

    ensure_today_auto_absent($conn, $ojt_student_id, $student_id, $department);
    ensure_due_auto_timeout($conn, $ojt_student_id);
    if ($proofUploadedNow) {
        ojt_policy_track_upload_activity($conn, $department, $student_id, $dailyPolicy['category']);
    }
    $conn->close();
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'timeout') {
    $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
    if ($id <= 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Invalid record id.']);
        exit();
    }

    $stmt = $conn->prepare('SELECT attendance_date, datetime_in FROM ojt_attendance WHERE id = ? AND ojt_student_id = ? LIMIT 1');
    $stmt->bind_param('ii', $id, $ojt_student_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Attendance record not found.']);
        exit();
    }

    if (empty($row['datetime_in'])) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Cannot set time out before time in exists.']);
        exit();
    }

    $schedule = get_schedule_for_date($conn, $ojt_student_id, (string)$row['attendance_date']);
    $now = current_datetime_value();
    $timeoutDatetime = $now;
    $scheduledTimeout = scheduled_timeout_datetime((string)$row['attendance_date'], $schedule);
    if ($scheduledTimeout !== null && strtotime($now) >= strtotime($scheduledTimeout)) {
        $timeoutDatetime = $scheduledTimeout;
    }
    $status = resolve_timeout_status((string)$row['attendance_date'], (string)$row['datetime_in'], $schedule);
    $duration_minutes = compute_duration_minutes((string)$row['datetime_in'], $timeoutDatetime);

    $stmt = $conn->prepare('UPDATE ojt_attendance SET datetime_out = ?, duration_minutes = ?, status = ?, updated_at = NOW() WHERE id = ? AND ojt_student_id = ?');
    $stmt->bind_param('sisii', $timeoutDatetime, $duration_minutes, $status, $id, $ojt_student_id);
    $stmt->execute();
    $stmt->close();

    $conn->close();
    echo json_encode(['success' => true, 'datetime_out' => $timeoutDatetime]);
    exit();
}

if ($action === 'delete') {
    $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
    if ($id <= 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Invalid record id']);
        exit();
    }

    $stmt = $conn->prepare('DELETE FROM ojt_attendance WHERE id = ? AND ojt_student_id = ?');
    $stmt->bind_param('ii', $id, $ojt_student_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    echo json_encode(['success' => true]);
    exit();
}

$conn->close();
echo json_encode(['success' => false, 'error' => 'Invalid action']);
exit();
