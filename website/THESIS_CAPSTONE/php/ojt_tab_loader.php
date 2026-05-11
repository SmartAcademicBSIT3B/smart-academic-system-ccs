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

$ojt_student_id = null;
$stmt = $conn->prepare('SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1');
$stmt->bind_param('s', $student_id);
$stmt->execute();
$stmt->bind_result($ojt_student_id);
$stmt->fetch();
$stmt->close();

if (!$ojt_student_id) {
    $conn->close();
    echo json_encode(['success' => false, 'error' => 'Student OJT record not found']);
    exit();
}

ob_start();

if ($tab === 'pre' || $tab === 'post') {
    $section = $tab;
    $state = requirement_section_state($conn, $ojt_student_id, $section);
    $is_section_submitted = (bool)$state['is_submitted'];
    $has_verified = (bool)$state['has_verified'];

    $templates = [];
    $tplStmt = $conn->prepare("SELECT id, name FROM ojt_requirement_templates WHERE type = ? AND is_required = 1 ORDER BY display_order ASC, id ASC");
    $tplStmt->bind_param('s', $section);
    $tplStmt->execute();
    $tplRes = $tplStmt->get_result();
    while ($tplRes && $row = $tplRes->fetch_assoc()) {
        $templates[] = $row;
    }
    $tplStmt->close();

    $submissions = [];
    $subStmt = $conn->prepare('SELECT template_id, file_url, file_name, status, notes FROM ojt_requirement_submissions WHERE ojt_student_id = ?');
    $subStmt->bind_param('i', $ojt_student_id);
    $subStmt->execute();
    $subRes = $subStmt->get_result();
    while ($subRes && $row = $subRes->fetch_assoc()) {
        $submissions[(int)$row['template_id']] = $row;
    }
    $subStmt->close();

    $title = $section === 'pre' ? 'PRE REQUIREMENTS' : 'POST REQUIREMENTS';
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
        $is_locked = $is_row_verified || ($is_section_submitted && !$is_rejected);
        $label_class = $is_locked ? 'req-label' : 'req-label req-label-upload';
        $label_data_key = $is_locked ? '' : ' data-requirement-key="' . htmlspecialchars($key) . '"';
        $label_title = $is_locked ? '' : ' title="Click to replace/upload file"';

        echo '<div class="req" data-requirement-key="' . htmlspecialchars($key) . '">';
        echo '<div class="' . $label_class . '"' . $label_data_key . $label_title . '>' . htmlspecialchars((string)($req['name'] ?? 'Requirement')) . '</div>';
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
            if ($is_locked) {
                echo '<button class="upload-btn" disabled title="Unsubmit first to edit">Locked after submit</button>';
            } else {
                echo '<button class="upload-btn" data-requirement-key="' . htmlspecialchars($key) . '">Upload File</button>';
            }
        }

        echo '</div>';
        echo '<div class="req-status">Status: <span class="status-label status-' . $status_class . '">' . htmlspecialchars($status_label) . '</span></div>';
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
    $stmt2 = $conn->prepare('SELECT week_number, file_url, file_name, status FROM ojt_weekly_reports WHERE ojt_student_id = ?');
    $stmt2->bind_param('i', $ojt_student_id);
    $stmt2->execute();
    $res2 = $stmt2->get_result();
    while ($res2 && $row2 = $res2->fetch_assoc()) {
        $weekly_reports[(int)$row2['week_number']] = $row2;
    }
    $stmt2->close();

    echo '<h2 class="panel-title">WEEKLY REPORTS</h2>';
    echo '<div class="requirements-grid" id="weekly-reports-grid">';
    for ($week = 1; $week <= 10; $week++) {
        $report = $weekly_reports[$week] ?? null;
        $file_url = $report['file_url'] ?? null;
        $file_name = $report['file_name'] ?? null;
        $status = $report['status'] ?? null;
        $status_raw = strtolower(trim((string)($status ?? 'pending')));

        echo '<div class="req" data-week-number="' . $week . '">';
        echo '<div class="req-label">WEEK ' . $week . '</div>';
        echo '<div class="req-actions">';

        if (!empty($file_url)) {
            $view_url = build_view_url($file_url, (string)$file_name);
            echo '<div class="uploaded-file-row">';
            echo '<span class="file-name">' . htmlspecialchars((string)$file_name) . '</span>';
            echo '<a href="' . htmlspecialchars($view_url) . '" target="_blank" class="pro-view-btn" title="View File">';
            echo '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>';
            echo '</a>';
            if ($status_raw !== 'submitted') {
                echo '<button class="remove-weekly-btn icon-btn danger" data-week-number="' . $week . '" title="Remove">';
                echo '<svg width="18" height="18" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
                echo '</button>';
                echo '<button class="submit-weekly-btn submit-btn" data-week-number="' . $week . '" title="Submit">';
                echo '<svg width="18" height="18" fill="none" stroke="#388e3c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit';
                echo '</button>';
            }
            echo '</div>';
        } else {
            echo '<button class="upload-weekly-btn upload-btn" data-week-number="' . $week . '">Upload File</button>';
        }

        echo '</div>';
        echo '<div class="req-status">Status: <span class="status-label status-' . htmlspecialchars($status_raw === '' ? 'pending' : $status_raw) . '">' . htmlspecialchars(normalized_status_label($status ?? 'pending')) . '</span></div>';
        echo '</div>';
    }
    echo '</div>';
}

if ($tab === 'attendance') {
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

    echo '<h2 class="panel-title">DAILY TIME RECORD</h2>';
    echo '<div class="att-summary-row">';
    echo '<div class="att-summary-item">Present: <strong>' . (int)$present_count . '</strong></div>';
    echo '<div class="att-summary-item">Late: <strong>' . (int)$late_count . '</strong></div>';
    echo '<div class="att-summary-item">Absent: <strong>' . (int)$absent_count . '</strong></div>';
    echo '<div class="att-summary-item">Rendered Hours: <strong>' . number_format($total_minutes / 60, 2) . ' hrs</strong></div>';
    echo '</div>';

    echo '<div class="attendance-table-wrap">';
    echo '<table class="att-table">';
    echo '<thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Status</th><th>Proof</th><th>Notes</th></tr></thead>';
    echo '<tbody>';
    foreach ($attendance as $row) {
        $status_class = strtolower(str_replace(' ', '-', (string)($row['status'] ?? 'pending')));
        echo '<tr>';
        echo '<td>' . htmlspecialchars((string)($row['attendance_date'] ?? '')) . '</td>';
        echo '<td>' . (!empty($row['datetime_in']) ? htmlspecialchars(date('H:i', strtotime((string)$row['datetime_in']))) : '-') . '</td>';
        echo '<td>' . (!empty($row['datetime_out']) ? htmlspecialchars(date('H:i', strtotime((string)$row['datetime_out']))) : '-') . '</td>';
        echo '<td>' . (!empty($row['duration_minutes']) ? htmlspecialchars((string)$row['duration_minutes']) . ' min' : '-') . '</td>';
        echo '<td><span class="att-status-pill ' . htmlspecialchars($status_class) . '">' . htmlspecialchars((string)($row['status'] ?? 'Pending')) . '</span></td>';
        if (!empty($row['proof_url'])) {
            echo '<td><a href="' . htmlspecialchars((string)$row['proof_url']) . '" target="_blank" class="att-proof-link">View proof</a></td>';
        } else {
            echo '<td></td>';
        }
        echo '<td>' . htmlspecialchars((string)($row['notes'] ?? '')) . '</td>';
        echo '</tr>';
    }
    echo '</tbody>';
    echo '</table>';
    echo '</div>';

    echo '<div class="attendance-actions">';
    echo '<button class="in-btn submit-btn" id="inBtn"' . ($has_in ? ' disabled' : '') . '>IN</button>';
    echo '<button class="out-btn danger" id="outBtn"' . ((!$has_in || $has_out) ? ' disabled' : '') . '>OUT</button>';
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
