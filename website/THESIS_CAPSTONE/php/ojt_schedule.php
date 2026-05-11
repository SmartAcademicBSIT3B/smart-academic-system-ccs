<?php
header('Content-Type: application/json');

session_start();
if (!isset($_SESSION['student_id'])) {
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit();
}

$student_id = trim((string)($_SESSION['student_id'] ?? ''));
$action = strtolower(trim((string)($_REQUEST['action'] ?? 'get')));

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

if (!ensure_schedule_table($conn) || !ensure_schedule_start_date_column($conn)) {
    echo json_encode(['success' => false, 'error' => 'Failed to prepare schedule table']);
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

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Student OJT record not found']);
    exit();
}

if ($action === 'get') {
    $rows = [];
    $stmt = $conn->prepare('SELECT day_of_week, time_in, time_out, start_date FROM ojt_student_schedules WHERE ojt_student_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\',\'Sunday\')');
    $stmt->bind_param('i', $ojt_student_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($res && $row = $res->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();
    $conn->close();

    echo json_encode([
        'success' => true,
        'has_schedule' => count($rows) > 0,
        'schedule' => $rows,
    ]);
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

    $days = $payload['days'] ?? [];
    $start_date = trim((string)($payload['start_date'] ?? ''));
    $time_in = trim((string)($payload['time_in'] ?? ''));
    $time_out = trim((string)($payload['time_out'] ?? ''));

    if ($start_date === '') {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'OJT start date is required.']);
        exit();
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start_date)) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Invalid OJT start date format.']);
        exit();
    }

    if (!is_array($days) || count($days) === 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Please select at least one day.']);
        exit();
    }

    $valid_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    $selected_days = [];
    foreach ($days as $day) {
        $normalized = ucfirst(strtolower(trim((string)$day)));
        if (in_array($normalized, $valid_days, true)) {
            $selected_days[] = $normalized;
        }
    }
    $selected_days = array_values(array_unique($selected_days));

    if (count($selected_days) === 0) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'No valid schedule day selected.']);
        exit();
    }

    if ($time_in === '' || $time_out === '') {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Time in and time out are required.']);
        exit();
    }

    if (strtotime($time_out) <= strtotime($time_in)) {
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Time out must be after time in.']);
        exit();
    }

    $conn->begin_transaction();
    try {
        $deleteStmt = $conn->prepare('DELETE FROM ojt_student_schedules WHERE ojt_student_id = ?');
        $deleteStmt->bind_param('i', $ojt_student_id);
        $deleteStmt->execute();
        $deleteStmt->close();

        $insertStmt = $conn->prepare('INSERT INTO ojt_student_schedules (ojt_student_id, student_id_ref, start_date, day_of_week, time_in, time_out, is_active, department) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');
        foreach ($selected_days as $day) {
            $insertStmt->bind_param('issssss', $ojt_student_id, $student_id, $start_date, $day, $time_in, $time_out, $department);
            $insertStmt->execute();
        }
        $insertStmt->close();

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        $conn->close();
        echo json_encode(['success' => false, 'error' => 'Failed to save schedule: ' . $e->getMessage()]);
        exit();
    }

    $conn->close();
    echo json_encode(['success' => true]);
    exit();
}

$conn->close();
echo json_encode(['success' => false, 'error' => 'Invalid action']);
exit();
