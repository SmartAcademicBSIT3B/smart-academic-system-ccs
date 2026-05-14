<?php
header('Content-Type: application/json');
error_reporting(0);
ini_set('display_errors', 0);

// Always return JSON on fatal DB errors
set_exception_handler(function($e) {
    if ($e instanceof mysqli_sql_exception) {
        echo json_encode(['error' => 'DB error: ' . $e->getMessage()]);
        exit();
    }
    throw $e;
});

$cloud_name = 'diujat7xu';

session_start();
require_once __DIR__ . '/ojt_policy_settings.php';

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['error' => 'Not authenticated']);
    exit();
}

$student_id = $_SESSION['student_id'];
$requirement_key = $_POST['requirement'] ?? null;
$action = $_POST['action'] ?? 'upload';
$requirement_section = strtolower(trim((string)($_POST['section'] ?? 'pre')));

if (!in_array($requirement_section, ['pre', 'post'], true)) {
    echo json_encode(['error' => 'Invalid requirement section']);
    exit();
}

if (!$requirement_key || strpos($requirement_key, 'requirement_') !== 0) {
    echo json_encode(['error' => 'Missing or invalid requirement key']);
    exit();
}
$template_id = intval(str_replace('requirement_', '', $requirement_key));
if ($template_id <= 0) {
    echo json_encode(['error' => 'Invalid template id']);
    exit();
}

function section_is_submitted($conn, $ojt_student_id, $requirement_section) {
    $sql = "SELECT COUNT(*) AS cnt
            FROM ojt_requirement_submissions s
            INNER JOIN ojt_requirement_templates t ON t.id = s.template_id
            WHERE s.ojt_student_id = ?
              AND LOWER(t.type) = ?
              AND LOWER(COALESCE(s.status, 'pending')) IN ('submitted','verified','rejected')";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('is', $ojt_student_id, $requirement_section);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return ((int)($row['cnt'] ?? 0)) > 0;
}

function requirement_status($conn, $ojt_student_id, $template_id) {
    $sql = "SELECT LOWER(COALESCE(status, 'pending')) AS status
            FROM ojt_requirement_submissions
            WHERE ojt_student_id = ? AND template_id = ?
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('ii', $ojt_student_id, $template_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return strtolower(trim((string)($row['status'] ?? 'pending')));
}

function requirement_has_uploaded_file($conn, $ojt_student_id, $template_id) {
    $sql = "SELECT file_url
            FROM ojt_requirement_submissions
            WHERE ojt_student_id = ? AND template_id = ?
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('ii', $ojt_student_id, $template_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return trim((string)($row['file_url'] ?? '')) !== '';
}

function requirement_is_overdue($conn, $ojt_student_id, $template_id, $requirement_section) {
    $sql = "SELECT t.deadline, s.deadline_override
            FROM ojt_requirement_templates t
            LEFT JOIN ojt_requirement_submissions s
              ON s.template_id = t.id AND s.ojt_student_id = ?
            WHERE t.id = ? AND LOWER(t.type) = ?
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('iis', $ojt_student_id, $template_id, $requirement_section);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        return false;
    }

    $override = trim((string)($row['deadline_override'] ?? ''));
    $templateDeadline = trim((string)($row['deadline'] ?? ''));
    $effectiveDeadline = $override !== '' ? $override : $templateDeadline;
    if ($effectiveDeadline === '') {
        return false;
    }

    $deadlineTs = strtotime(substr($effectiveDeadline, 0, 10));
    if (!$deadlineTs) {
        return false;
    }

    $todayTs = strtotime(date('Y-m-d'));
    return $deadlineTs < $todayTs;
}

// --- REMOVE LOGIC ---
if ($action === 'remove') {
    $conn = include('config.php');
    if (!$conn) {
        echo json_encode(['error' => 'Database connection failed']);
        exit();
    }
    $ojt_student_id = null;
    $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_id);
    $stmt->execute();
    $stmt->bind_result($ojt_student_id);
    $stmt->fetch();
    $stmt->close();
    if (!$ojt_student_id) {
        echo json_encode(['error' => 'Student OJT record not found']);
        exit();
    }

    $current_status = requirement_status($conn, $ojt_student_id, $template_id);
    $is_section_submitted = section_is_submitted($conn, $ojt_student_id, $requirement_section);
    $can_edit_rejected = $current_status === 'rejected';
    $has_uploaded_file = requirement_has_uploaded_file($conn, $ojt_student_id, $template_id);
    $is_verified_locked = in_array($current_status, ['verified', 'approved'], true);

    // Upload exception: allow adding/replacing files even while section is submitted.
    // Keep verified requirements protected from edits.
    if ($is_verified_locked && !$can_edit_rejected) {
        echo json_encode(['error' => 'This requirement is already verified and can no longer be edited.']);
        exit();
    }

    $next_status = $can_edit_rejected ? 'rejected' : 'pending';
    $stmt = $conn->prepare("UPDATE ojt_requirement_submissions SET file_url=NULL, file_name=NULL, cloudinary_public_id=NULL, file_type=NULL, status=?, updated_at=NOW() WHERE ojt_student_id=? AND template_id=?");
    $stmt->bind_param("sii", $next_status, $ojt_student_id, $template_id);
    if (!$stmt->execute()) {
        echo json_encode(['error' => 'DB error: ' . $stmt->error]);
        exit();
    }
    $stmt->close();
    echo json_encode(['success' => true, 'template_id' => $template_id, 'section' => $requirement_section]);
    exit();
}
$api_key = '183859447426441';
$api_secret = 'ZlclHl6jA8-Epmmtax3zVpjCWqk';

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

// Determine folder based on section (pre or post)
if ($requirement_section === 'post') {
    $folder = "HTA Files/OJT Requirements/$student_id/Post Requirements";
} else {
    $folder = "HTA Files/OJT Requirements/$student_id/Pre Requirements";
}

/**
 * Emit real-time notification to coordinators
 */
function emitNotification($status, $section, $student_id, $student_name, $dept, $file_name) {
    // Determine backend API URL (should work in both dev and production)
    $backend_url = getenv('API_BASE_URL') ?: 'http://localhost:3000';
    $notification_url = $backend_url . '/api/ojt-coordinator/emit-notification';
    
    $payload = [
        'type' => 'requirement',
        'section' => $section,
        'student_id' => $student_id,
        'student_name' => $student_name,
        'department' => $dept,
        'status' => $status,
        'file_name' => $file_name
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

if ($action === 'upload' && isset($_FILES['file'])) {
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['error' => 'File upload error']);
        exit();
    }

    $conn = include('config.php');
    if (!$conn) {
        echo json_encode(['error' => 'Database connection failed']);
        exit();
    }

    $ojt_student_id = null;
    $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_id);
    if (!$stmt->execute()) {
        echo json_encode(['error' => 'DB error: ' . $stmt->error]);
        exit();
    }
    $stmt->bind_result($ojt_student_id);
    $stmt->fetch();
    $stmt->close();
    if (!$ojt_student_id) {
        echo json_encode(['error' => 'Student OJT record not found']);
        exit();
    }

    // Get student name and department for notifications
    $student_name = '';
    $student_dept = 'CCS';
    $stmt = $conn->prepare("SELECT name, department FROM ojt_students WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $ojt_student_id);
    if ($stmt->execute()) {
        $stmt->bind_result($student_name, $student_dept);
        $stmt->fetch();
    }
    $stmt->close();

    $policy = ojt_policy_get_for_department($conn, $student_dept);
    $policyValues = ojt_policy_values_for_category($policy, $requirement_section);

    $sizeError = ojt_policy_validate_uploaded_file_size($file, $policyValues['maxFileSizeMB']);
    if ($sizeError !== null) {
        echo json_encode(['error' => $sizeError]);
        exit();
    }

    $limitCheck = ojt_policy_check_daily_upload_limit(
        $conn,
        $student_dept,
        $student_id,
        $policyValues['category'],
        $policyValues['rateLimitPerDay']
    );
    if (!$limitCheck['ok']) {
        echo json_encode([
            'error' => $policyValues['label'] . ' upload limit reached (' . (int)$policyValues['rateLimitPerDay'] . ' per 24 hours).'
        ]);
        exit();
    }

    $current_status = requirement_status($conn, $ojt_student_id, $template_id);
    $is_section_submitted = section_is_submitted($conn, $ojt_student_id, $requirement_section);
    $can_edit_rejected = $current_status === 'rejected';
    $is_verified_locked = in_array($current_status, ['verified', 'approved'], true);

    // Keep verified requirements immutable, but allow uploads for other rows
    // even when the section is already submitted.
    if ($is_verified_locked && !$can_edit_rejected) {
        echo json_encode(['error' => 'This requirement is already verified and can no longer be edited.']);
        exit();
    }

    if (requirement_is_overdue($conn, $ojt_student_id, $template_id, $requirement_section)) {
        echo json_encode(['error' => 'This requirement is past its deadline and no longer accepts uploads.']);
        exit();
    }

    $publicId = $requirement_key . '_' . uniqid();
    $result = uploadToCloudinarySimple($file['tmp_name'], $folder, $publicId);
    if (isset($result['secure_url'])) {
        $url = $result['secure_url'];
        $public_id = $result['public_id'];
        $file_name = $file['name'];
        $file_type = $file['type'];
        $now = date('Y-m-d H:i:s');

        // If this section is already submitted, newly uploaded requirements
        // should immediately join the submitted state instead of reverting to pending.
        $next_status = ($can_edit_rejected || $is_section_submitted)
            ? 'submitted'
            : 'pending';

        $stmt = $conn->prepare("SELECT id FROM ojt_requirement_submissions WHERE ojt_student_id=? AND template_id=?");
        $stmt->bind_param("ii", $ojt_student_id, $template_id);
        if (!$stmt->execute()) {
            echo json_encode(['error' => 'DB error: ' . $stmt->error]);
            exit();
        }
        $stmt->store_result();
        if ($stmt->num_rows > 0) {
            $stmt->close();
            $stmt2 = $conn->prepare("UPDATE ojt_requirement_submissions SET file_url=?, cloudinary_public_id=?, file_name=?, file_type=?, status=?, updated_at=?, student_id_ref=0 WHERE ojt_student_id=? AND template_id=?");
            $stmt2->bind_param("ssssssii", $url, $public_id, $file_name, $file_type, $next_status, $now, $ojt_student_id, $template_id);
            if (!$stmt2->execute()) {
                echo json_encode(['error' => 'DB error: ' . $stmt2->error]);
                exit();
            }
            $stmt2->close();
        } else {
            $stmt->close();
            $stmt2 = $conn->prepare("INSERT INTO ojt_requirement_submissions (ojt_student_id, template_id, student_id_ref, file_url, cloudinary_public_id, file_name, file_type, status, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)");
            $stmt2->bind_param("iisssssss", $ojt_student_id, $template_id, $url, $public_id, $file_name, $file_type, $next_status, $now, $now);
            if (!$stmt2->execute()) {
                echo json_encode(['error' => 'DB error: ' . $stmt2->error]);
                exit();
            }
            $stmt2->close();
        }
        
        // Emit real-time notification to coordinators
        emitNotification($next_status, $requirement_section, $student_id, $student_name, $student_dept, $file_name);
        ojt_policy_track_upload_activity($conn, $student_dept, $student_id, $policyValues['category']);
        
        echo json_encode([
            'success' => true,
            'template_id' => $template_id,
            'section' => $requirement_section,
            'url' => $url,
            'status' => $next_status,
            'file_name' => $file_name,
            'file_type' => $file_type
        ]);
        exit();
    } else {
        $errorMsg = isset($result['error']) ? $result['error'] : (isset($result['message']) ? $result['message'] : 'Cloudinary upload failed');
        echo json_encode(['error' => $errorMsg]);
        exit();
    }
}

// Ensure a valid JSON response for any unhandled case
if (!headers_sent()) {
    echo json_encode(['error' => 'Invalid request']);
}
exit();
