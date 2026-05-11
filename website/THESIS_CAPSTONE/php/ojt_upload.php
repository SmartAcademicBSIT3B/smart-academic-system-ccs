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

    if ($is_section_submitted && !$can_edit_rejected) {
        echo json_encode(['error' => 'Cannot edit requirements while this section is submitted. Unsubmit first.']);
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

if ($action === 'upload' && isset($_FILES['file'])) {
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['error' => 'File upload error']);
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

        $current_status = requirement_status($conn, $ojt_student_id, $template_id);
        $is_section_submitted = section_is_submitted($conn, $ojt_student_id, $requirement_section);
        $can_edit_rejected = $current_status === 'rejected';

        if ($is_section_submitted && !$can_edit_rejected) {
            echo json_encode(['error' => 'Cannot edit requirements while this section is submitted. Unsubmit first.']);
            exit();
        }

        $next_status = $can_edit_rejected ? 'submitted' : 'pending';

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
