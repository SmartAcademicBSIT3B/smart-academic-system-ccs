<?php
header('Content-Type: application/json');

session_start();

if (!isset($_SESSION['student_id'])) {
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit();
}

$student_id = trim((string)($_SESSION['student_id'] ?? ''));
$tab = strtolower(trim((string)($_GET['tab'] ?? 'pre')));
if (!in_array($tab, ['pre', 'post', 'weekly', 'attendance'], true)) {
    $tab = 'pre';
}

$conn = include('config.php');
if (!$conn) {
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit();
}

function build_view_url($file_url, $file_name) {
    $ext = strtolower(pathinfo((string)$file_name, PATHINFO_EXTENSION));
    if (in_array($ext, ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'], true)) {
        return $file_url;
    }
    return 'https://docs.google.com/gview?url=' . urlencode((string)$file_url) . '&embedded=true';
}

function normalized_status_label($status) {
    $raw = strtolower(trim((string)$status));
    if ($raw === '') {
        return 'Pending';
    }
    if ($raw === 'verified' || $raw === 'approved') {
        return 'Verified';
    }
    if ($raw === 'submitted') {
        return 'Submitted';
    }
    if ($raw === 'rejected') {
        return 'Rejected';
    }
    return ucfirst($raw);
}

function format_duration_hm($minutes) {
    if ($minutes === null || $minutes === '') {
        return '-';
    }
    $total = (int)$minutes;
    if ($total < 0) {
        return '-';
    }
    if ($total === 0) {
        return '0 min';
    }
    $hours = intdiv($total, 60);
    $mins = $total % 60;

    if ($hours > 0 && $mins > 0) {
        return $hours . ' hr ' . $mins . ' min';
    }
    if ($hours > 0) {
        return $hours . ' hr';
    }
    return $mins . ' min';
}

function compute_duration_minutes($datetime_in, $datetime_out) {
    if (!$datetime_in || !$datetime_out) return null;
    $in = strtotime((string)$datetime_in);
    $out = strtotime((string)$datetime_out);
    if (!$in || !$out || $out <= $in) return 0;
    return (int) floor(($out - $in) / 60);
}

function requirement_section_state($conn, $ojt_student_id, $section) {
    $sql = "SELECT
        SUM(CASE WHEN LOWER(s.status) IN ('submitted','verified','rejected') THEN 1 ELSE 0 END) AS submitted_count,
        SUM(CASE WHEN LOWER(s.status) IN ('verified','approved') THEN 1 ELSE 0 END) AS verified_count
    FROM ojt_requirement_submissions s
    INNER JOIN ojt_requirement_templates t ON t.id = s.template_id
    WHERE s.ojt_student_id = ? AND LOWER(t.type) = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('is', $ojt_student_id, $section);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : [];
    $stmt->close();

    return [
        'is_submitted' => ((int)($row['submitted_count'] ?? 0)) > 0,
        'has_verified' => ((int)($row['verified_count'] ?? 0)) > 0,
    ];
}

function requirement_deadline_badge($deadlineValue) {
    $raw = trim((string)$deadlineValue);
    if ($raw === '') {
        return null;
    }

    $deadlineTs = strtotime(substr($raw, 0, 10));
    if (!$deadlineTs) {
        return null;
    }

    $todayTs = strtotime(date('Y-m-d'));
    $diffDays = (int)ceil(($deadlineTs - $todayTs) / 86400);

    if ($diffDays < 0) {
        return [
            'status' => 'overdue',
            'label' => abs($diffDays) . 'd overdue',
            'is_overdue' => true,
        ];
    }

    if ($diffDays <= 3) {
        return [
            'status' => 'soon',
            'label' => 'due in ' . $diffDays . 'd',
            'is_overdue' => false,
        ];
    }

    return [
        'status' => 'ok',
        'label' => 'due in ' . $diffDays . 'd',
        'is_overdue' => false,
    ];
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

    $updateStmt = $conn->prepare('UPDATE ojt_attendance SET datetime_out = ?, duration_minutes = ?, updated_at = NOW() WHERE id = ? AND ojt_student_id = ?');
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
        $rowId = (int)($row['id'] ?? 0);
        if ($rowId <= 0) {
            continue;
        }

        $updateStmt->bind_param('siii', $fixedDatetimeOut, $durationMinutes, $rowId, $ojt_student_id);
        $updateStmt->execute();
    }

    $updateStmt->close();
    $stmt->close();
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

function ensure_weekly_reports_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS ojt_weekly_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      week_number INT NOT NULL,
      week_start_date DATE NULL,
      file_url VARCHAR(512) NULL,
      cloudinary_public_id VARCHAR(512) NULL,
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
        'cloudinary_public_id' => "ALTER TABLE ojt_weekly_reports ADD COLUMN cloudinary_public_id VARCHAR(512) NULL",
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

function ensure_ojt_requirement_tab_labels_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS ojt_requirement_tab_labels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department VARCHAR(120) NOT NULL,
      pre_label VARCHAR(120) NOT NULL DEFAULT 'PRE REQUIREMENTS',
      attendance_label VARCHAR(120) NOT NULL DEFAULT 'ATTENDANCE RECORD',
      weekly_label VARCHAR(120) NOT NULL DEFAULT 'WEEKLY REPORTS',
      post_label VARCHAR(120) NOT NULL DEFAULT 'POST REQUIREMENTS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ortl_department (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    return $conn->query($sql);
}

function get_ojt_requirement_tab_labels($conn, $department) {
    $defaults = [
        'pre' => 'PRE REQUIREMENTS',
        'attendance' => 'ATTENDANCE RECORD',
        'weekly' => 'WEEKLY REPORTS',
        'post' => 'POST REQUIREMENTS',
    ];

    if (!$conn || !ensure_ojt_requirement_tab_labels_table($conn)) {
        return $defaults;
    }

    $dept = trim((string)$department);
    if ($dept === '') {
        $dept = 'CCS';
    }

    $selectStmt = $conn->prepare('SELECT pre_label, attendance_label, weekly_label, post_label FROM ojt_requirement_tab_labels WHERE department = ? LIMIT 1');
    $selectStmt->bind_param('s', $dept);
    $selectStmt->execute();
    $res = $selectStmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $selectStmt->close();

    if (!$row) {
        $insertStmt = $conn->prepare('INSERT INTO ojt_requirement_tab_labels (department, pre_label, attendance_label, weekly_label, post_label) VALUES (?, ?, ?, ?, ?)');
        $insertStmt->bind_param(
            'sssss',
            $dept,
            $defaults['pre'],
            $defaults['attendance'],
            $defaults['weekly'],
            $defaults['post']
        );
        $insertStmt->execute();
        $insertStmt->close();
        return $defaults;
    }

    return [
        'pre' => trim((string)($row['pre_label'] ?? '')) ?: $defaults['pre'],
        'attendance' => trim((string)($row['attendance_label'] ?? '')) ?: $defaults['attendance'],
        'weekly' => trim((string)($row['weekly_label'] ?? '')) ?: $defaults['weekly'],
        'post' => trim((string)($row['post_label'] ?? '')) ?: $defaults['post'],
    ];
}

$ojt_student_id = null;
$student_department = 'CCS';
$stmt = $conn->prepare('SELECT id, department FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id, $student_department);
$stmt->fetch();
$stmt->close();

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Student OJT record not found']);
    exit();
}

ensure_schedule_start_date_column($conn);
ensure_weekly_reports_table($conn);
ensure_weekly_reports_columns($conn);
$ojt_tab_labels = get_ojt_requirement_tab_labels($conn, $student_department ?: 'CCS');

ob_start();

if ($tab === 'pre' || $tab === 'post') {
    $section = $tab;
    $state = requirement_section_state($conn, $ojt_student_id, $section);
    $is_section_submitted = (bool)$state['is_submitted'];
    $has_verified = (bool)$state['has_verified'];

    $templates = [];
    $tplStmt = $conn->prepare("SELECT id, name, deadline FROM ojt_requirement_templates WHERE type = ? AND is_required = 1 ORDER BY display_order ASC, id ASC");
    $tplStmt->bind_param('s', $section);
    $tplStmt->execute();
    $tplRes = $tplStmt->get_result();
    while ($tplRes && $row = $tplRes->fetch_assoc()) {
        $templates[] = $row;
    }
    $tplStmt->close();

    $submissions = [];
    $subStmt = $conn->prepare('SELECT template_id, file_url, file_name, status, notes, deadline_override FROM ojt_requirement_submissions WHERE ojt_student_id = ?');
    $subStmt->bind_param('i', $ojt_student_id);
    $subStmt->execute();
    $subRes = $subStmt->get_result();
    while ($subRes && $row = $subRes->fetch_assoc()) {
        $submissions[(int)$row['template_id']] = $row;
    }
    $subStmt->close();

    $title = $section === 'pre' ? $ojt_tab_labels['pre'] : $ojt_tab_labels['post'];
    echo '<div class="panel-head">';
    echo '<h2 class="panel-title">' . htmlspecialchars($title) . '</h2>';
    echo '<button class="panel-refresh-btn" type="button" data-section="' . htmlspecialchars($section) . '" title="Refresh requirements" aria-label="Refresh requirements">';
    echo '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"></path></svg>';
    echo '</button>';
    echo '</div>';
    echo '<div class="requirements-grid">';

    foreach ($templates as $req) {
        $template_id = (int)($req['id'] ?? 0);
        $key = 'requirement_' . $template_id;
        $submission = $submissions[$template_id] ?? null;
        $file_url = $submission['file_url'] ?? null;
        $file_name = $submission['file_name'] ?? null;
        $status = $submission['status'] ?? null;
        $notes = trim((string)($submission['notes'] ?? ''));
        $status_raw = strtolower(trim((string)($status ?? 'pending')));
        $status_class = htmlspecialchars($status_raw === '' ? 'pending' : $status_raw);
        $status_label = normalized_status_label($status ?? 'pending');
        $is_rejected = $status_raw === 'rejected';
        $is_row_verified = in_array($status_raw, ['approved', 'verified'], true);
        $has_uploaded_file = trim((string)($file_url ?? '')) !== '';
        $template_deadline = trim((string)($req['deadline'] ?? ''));
        $override_deadline = trim((string)($submission['deadline_override'] ?? ''));
        $effective_deadline = $override_deadline !== '' ? $override_deadline : $template_deadline;
        $deadline_badge = requirement_deadline_badge($effective_deadline);
        $is_overdue = (bool)($deadline_badge['is_overdue'] ?? false);

        // If the student already uploaded this requirement, do not surface overdue
        // indicator/lock in the card even if the deadline has passed.
        if ($has_uploaded_file && $is_overdue) {
            $is_overdue = false;
            $deadline_badge = null;
        }

        $is_locked_by_submit = $is_section_submitted && !$is_rejected && $has_uploaded_file;
        $is_locked = $is_row_verified || $is_locked_by_submit || $is_overdue;
        $label_class = $is_locked ? 'req-label' : 'req-label req-label-upload';
        $label_data_key = $is_locked ? '' : ' data-requirement-key="' . htmlspecialchars($key) . '"';
        $label_title = $is_locked ? '' : ' title="Click to replace/upload file"';

        echo '<div class="req" data-requirement-key="' . htmlspecialchars($key) . '">';
        echo '<div class="req-meta">';
        echo '<div class="' . $label_class . '"' . $label_data_key . $label_title . '>' . htmlspecialchars((string)($req['name'] ?? 'Requirement')) . '</div>';
        if ($deadline_badge) {
            echo '<span class="deadline-badge ' . htmlspecialchars((string)$deadline_badge['status']) . '">' . htmlspecialchars((string)$deadline_badge['label']) . '</span>';
        }
        echo '</div>';
        echo '<div class="req-actions">';

        if (!empty($file_url)) {
            $view_url = build_view_url($file_url, (string)$file_name);
            echo '<div class="uploaded-file-row">';
            echo '<span class="file-name">' . htmlspecialchars((string)$file_name) . '</span>';
            echo '<a href="' . htmlspecialchars($view_url) . '" target="_blank" class="pro-view-btn" title="View File">';
            echo '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>';
            echo '</a>';
            if (!$is_locked) {
                echo '<button class="remove-btn icon-btn danger" data-requirement-key="' . htmlspecialchars($key) . '" title="Remove">';
                echo '<svg width="18" height="18" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
                echo '</button>';
            }
            echo '</div>';
        } else {
            if ($is_overdue) {
                echo '<button class="upload-btn" disabled title="Deadline passed">Deadline passed</button>';
            } else {
                echo '<button class="upload-btn" data-requirement-key="' . htmlspecialchars($key) . '">Upload File</button>';
            }
        }

        echo '</div>';
        echo '<div class="req-status">Status: <span class="status-label status-' . $status_class . '">' . htmlspecialchars($status_label) . '</span></div>';
        if ($is_overdue) {
            echo '<div class="req-deadline-lock">Past deadline - upload disabled.</div>';
        }
        if ($status_raw === 'rejected') {
            $commentText = $notes !== '' ? $notes : 'No rejection comment provided yet.';
            echo '<div class="req-comment"><strong>Comment:</strong> ' . nl2br(htmlspecialchars($commentText)) . '</div>';
        }
        echo '</div>';
    }

    echo '</div>';
    echo '<div class="panel-actions">';
    if ($is_section_submitted) {
        $disabledAttr = $has_verified ? ' disabled title="Cannot unsubmit after verification"' : '';
        echo '<button class="submit-btn req-submit-toggle" data-section="' . htmlspecialchars($section) . '" data-action="unsubmit"' . $disabledAttr . '>Unsubmit</button>';
    } else {
        echo '<button class="submit-btn req-submit-toggle" data-section="' . htmlspecialchars($section) . '" data-action="submit">Submit</button>';
    }
    echo '</div>';
}

if ($tab === 'weekly') {
    $weekly_reports = [];
    $stmt2 = $conn->prepare('SELECT week_number, week_start_date, file_url, file_name, status FROM ojt_weekly_reports WHERE ojt_student_id = ? ORDER BY week_number ASC');
    $stmt2->bind_param('i', $ojt_student_id);
    $stmt2->execute();
    $res2 = $stmt2->get_result();
    $max_week = 0;
    while ($res2 && $row2 = $res2->fetch_assoc()) {
        $week = (int)($row2['week_number'] ?? 0);
        if ($week > $max_week) {
            $max_week = $week;
        }
        $weekly_reports[] = $row2;
    }
    $stmt2->close();

    $next_week = max(1, $max_week + 1);

    echo '<div class="panel-head">';
    echo '<h2 class="panel-title">' . htmlspecialchars($ojt_tab_labels['weekly']) . '</h2>';
    echo '<div class="panel-head-actions">';
    echo '<button class="panel-refresh-btn" type="button" data-section="weekly" title="Refresh weekly reports" aria-label="Refresh weekly reports">';
    echo '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"></path></svg>';
    echo '</button>';
    echo '<button class="submit-btn" type="button" id="weeklyAddBtn" data-next-week="' . $next_week . '">+ Add Report</button>';
    echo '</div>';
    echo '</div>';

    echo '<div class="weekly-grid" id="weekly-reports-grid">';
    if (count($weekly_reports) === 0) {
        echo '<div class="panel-loading">No weekly reports yet. Click "+ Add Report" to add one.</div>';
    }
    foreach ($weekly_reports as $report) {
        $week = (int)($report['week_number'] ?? 0);
        $week_start = trim((string)($report['week_start_date'] ?? ''));
        $file_url = trim((string)($report['file_url'] ?? ''));
        $file_name = trim((string)($report['file_name'] ?? ''));
        $status_raw = strtolower(trim((string)($report['status'] ?? 'pending')));
        if ($status_raw === '') {
            $status_raw = $file_url !== '' ? 'submitted' : 'pending';
        }
        $status_class = preg_replace('/[^a-z0-9\-]/', '-', $status_raw);
        $week_date_text = $week_start !== '' ? date('F j, Y', strtotime($week_start)) : 'No start date set';

        echo '<div class="week-card" data-week-number="' . $week . '">';
        echo '<div class="week-card-title">Week ' . $week . '</div>';
        echo '<div class="week-card-date">' . htmlspecialchars($week_date_text) . '</div>';
        echo '<span class="week-status-badge ' . htmlspecialchars($status_class) . '">' . htmlspecialchars(ucfirst($status_raw)) . '</span>';
        echo '<div class="week-card-footer">';
        if ($file_url !== '') {
            $view_url = build_view_url($file_url, $file_name !== '' ? $file_name : ('week-' . $week));
            echo '<a class="week-view-link" href="' . htmlspecialchars($view_url) . '" target="_blank">View Report</a>';
        } else {
            echo '<span class="file-chosen-label">No file uploaded</span>';
        }
        echo '</div>';
        if ($file_name !== '') {
            echo '<div class="file-chosen-label">' . htmlspecialchars($file_name) . '</div>';
        }
        echo '</div>';
    }
    echo '</div>';
}

if ($tab === 'attendance') {
    ensure_today_auto_absent($conn, $ojt_student_id, $student_id, $student_department ?: 'CCS');
    ensure_due_auto_timeout($conn, $ojt_student_id);

    $attendance = [];
    $attStmt = $conn->prepare('SELECT * FROM ojt_attendance WHERE ojt_student_id = ? ORDER BY attendance_date DESC, id DESC');
    $attStmt->bind_param('i', $ojt_student_id);
    $attStmt->execute();
    $attRes = $attStmt->get_result();
    while ($attRes && $row = $attRes->fetch_assoc()) {
        $attendance[] = $row;
    }
    $attStmt->close();

    $date_today = date('Y-m-d');
    $has_in = false;
    $has_out = false;
    $present_count = 0;
    $absent_count = 0;
    $late_count = 0;
    $total_minutes = 0;

    foreach ($attendance as $row) {
        if (($row['attendance_date'] ?? null) === $date_today) {
            if (!empty($row['datetime_in'])) {
                $has_in = true;
            }
            if (!empty($row['datetime_out'])) {
                $has_out = true;
            }
        }

        $status = strtolower((string)($row['status'] ?? ''));
        if ($status === 'present') {
            $present_count++;
        }
        if ($status === 'absent') {
            $absent_count++;
        }
        if ($status === 'late') {
            $late_count++;
        }
        $total_minutes += (int)($row['duration_minutes'] ?? 0);
    }

    echo '<div class="panel-head attendance-head">';
    echo '<h2 class="panel-title">' . htmlspecialchars($ojt_tab_labels['attendance']) . '</h2>';
    echo '<div class="panel-head-actions">';
    echo '<button class="panel-refresh-btn" type="button" data-section="attendance" title="Refresh attendance" aria-label="Refresh attendance">';
    echo '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"></path></svg>';
    echo '</button>';
    echo '<button class="submit-btn" type="button" id="attendanceAddBtn">+ Add Record</button>';
    echo '</div>';
    echo '</div>';
    echo '<div class="att-summary-row">';
    echo '<div class="att-summary-item">Present: <strong>' . (int)$present_count . '</strong></div>';
    echo '<div class="att-summary-item">Late: <strong>' . (int)$late_count . '</strong></div>';
    echo '<div class="att-summary-item">Absent: <strong>' . (int)$absent_count . '</strong></div>';
    echo '<div class="att-summary-item">Rendered Time: <strong>' . htmlspecialchars(format_duration_hm($total_minutes)) . '</strong></div>';
    echo '</div>';

    echo '<div class="attendance-table-wrap">';
    echo '<table class="att-table">';
    echo '<thead><tr><th>DATE</th><th>TIME IN</th><th>TIME OUT</th><th>DURATION</th><th>STATUS</th><th>PROOF</th><th>NOTES</th></tr></thead>';
    echo '<tbody>';
    foreach ($attendance as $row) {
        $status_class = strtolower(str_replace(' ', '-', (string)($row['status'] ?? 'pending')));
        $record_id = (int)($row['id'] ?? 0);
        $in_time = !empty($row['datetime_in']) ? date('H:i', strtotime((string)$row['datetime_in'])) : '';
        $out_time = !empty($row['datetime_out']) ? date('H:i', strtotime((string)$row['datetime_out'])) : '';
        $notes = (string)($row['notes'] ?? '');
        $proof = (string)($row['proof_url'] ?? '');
        $duration_minutes = null;
        if ($row['duration_minutes'] !== null && $row['duration_minutes'] !== '') {
            $duration_minutes = (int)$row['duration_minutes'];
        } elseif (!empty($row['datetime_in']) && !empty($row['datetime_out'])) {
            $duration_minutes = compute_duration_minutes((string)$row['datetime_in'], (string)$row['datetime_out']);
        }
        $timeout_label = $out_time !== '' ? $out_time : 'Set Now';
        echo '<tr>';
        echo '<td>' . htmlspecialchars((string)($row['attendance_date'] ?? '')) . '</td>';
        echo '<td>' . ($in_time !== '' ? htmlspecialchars($in_time) : '-') . '</td>';
        echo '<td><button class="attendance-timeout-btn icon-btn" type="button" data-record-id="' . $record_id . '" title="Set time out to current time">' . htmlspecialchars($timeout_label) . '</button></td>';
        echo '<td>' . htmlspecialchars(format_duration_hm($duration_minutes)) . '</td>';
        echo '<td><span class="att-status-pill ' . htmlspecialchars($status_class) . '">' . htmlspecialchars((string)($row['status'] ?? 'Pending')) . '</span></td>';
        echo '<td class="attendance-proof-cell">';
        echo '<div class="attendance-proof-inline">';
        if ($proof !== '') {
            echo '<a href="' . htmlspecialchars($proof) . '" target="_blank" class="att-proof-link">View proof</a>';
        }
        echo '<input type="file" class="attendance-proof-input" data-record-id="' . $record_id . '" data-date="' . htmlspecialchars((string)($row['attendance_date'] ?? '')) . '" data-time-in="' . htmlspecialchars($in_time) . '" accept="image/*,.pdf" hidden>';
        echo '<button class="attendance-proof-replace-btn" type="button" data-record-id="' . $record_id . '">' . ($proof !== '' ? 'Replace' : 'Upload') . '</button>';
        echo '</div>';
        echo '</td>';
        echo '<td class="attendance-notes-cell">';
        echo '<div class="attendance-notes-inline">';
        echo '<span class="attendance-note-label">Add notes</span>';
        echo '<input type="text" class="attendance-note-input" data-record-id="' . $record_id . '" placeholder="Add notes" value="' . htmlspecialchars($notes) . '">';
        echo '<button class="attendance-notes-save-btn" type="button" data-record-id="' . $record_id . '" data-date="' . htmlspecialchars((string)($row['attendance_date'] ?? '')) . '" data-time-in="' . htmlspecialchars($in_time) . '">Save</button>';
        echo '</div>';
        echo '</td>';
        echo '</tr>';
    }
    echo '</tbody>';
    echo '</table>';
    echo '</div>';
}

$html = ob_get_clean();
$conn->close();

echo json_encode([
    'success' => true,
    'tab' => $tab,
    'html' => $html,
]);
exit();
