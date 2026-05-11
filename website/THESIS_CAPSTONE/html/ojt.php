<?php
session_start();

// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}

function format_name_surname_first($name) {
    $raw = trim((string)$name);
    if ($raw === '') {
        return 'Student Name';
    }
    if (strpos($raw, ',') !== false) {
        return $raw;
    }
    $parts = preg_split('/\s+/', $raw);
    if (!$parts || count($parts) < 2) {
        return $raw;
    }
    $surname = array_pop($parts);
    $firstMiddle = implode(' ', $parts);
    return trim($surname . ', ' . $firstMiddle);
}

function normalize_ojt_status($status) {
    $normalized = strtolower(trim((string)$status));
    if ($normalized === '') {
        return 'Pending Requirements';
    }
    if (strpos($normalized, 'deploy') !== false || strpos($normalized, 'complete') !== false) {
        return 'Deployed';
    }
    if (strpos($normalized, 'pre') !== false) {
        return 'Pre-Deployment';
    }
    if (strpos($normalized, 'pending') !== false) {
        return 'Pending Requirements';
    }
    return ucwords($normalized);
}

function status_css_class($status) {
    $normalized = strtolower(trim((string)$status));
    if (strpos($normalized, 'deploy') !== false || strpos($normalized, 'complete') !== false) {
        return 'deployed';
    }
    if (strpos($normalized, 'pre') !== false) {
        return 'pre-deployment';
    }
    return 'pending-requirements';
}

// Include database config to get student + OJT data
$conn = include("../php/config.php");
$student_data = null;
$partner_profile = null;
$connected_thesis_status = 'Not Approved';

if ($conn) {
    $sql = "SELECT 
                os.id AS ojt_student_id,
                os.student_id,
                os.name,
                os.email,
                os.section,
                os.department,
                os.contact_no,
                os.status AS ojt_status,
                os.external_partner_assigned,
                os.nature_of_business,
                su.profile_image_url,
                su.status AS account_status
            FROM ojt_students os
            LEFT JOIN students_user su ON LOWER(TRIM(su.student_id)) = LOWER(TRIM(os.student_id))
            WHERE LOWER(TRIM(os.student_id)) = LOWER(TRIM(?))
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $_SESSION['student_id']);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $student_data = $result->fetch_assoc();
        $student_data['external_partner'] = $student_data['external_partner_assigned'] ?? null;
        $student_data['specialization'] = $student_data['nature_of_business'] ?? null;
        $student_data['display_name'] = format_name_surname_first($student_data['name'] ?? '');
        $student_data['display_ojt_status'] = normalize_ojt_status($student_data['ojt_status'] ?? '');
        $student_data['status_css_class'] = status_css_class($student_data['display_ojt_status']);

        // External partner profile details (same source as coordinator: external_partners table).
        $partnerName = trim((string)($student_data['external_partner'] ?? ''));
        if ($partnerName !== '' && strtolower($partnerName) !== 'n/a') {
            $dept = trim((string)($student_data['department'] ?? ''));
            if ($dept !== '') {
                $partnerSql = "SELECT id, logo, company_name, address, department, company_email,
                                      company_contact, representative, job_description,
                                      representative_email, representative_contact
                               FROM external_partners
                               WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(?))
                                 AND LOWER(TRIM(department)) = LOWER(TRIM(?))
                               ORDER BY id DESC
                               LIMIT 1";
                $partnerStmt = $conn->prepare($partnerSql);
                $partnerStmt->bind_param("ss", $partnerName, $dept);
            } else {
                $partnerSql = "SELECT id, logo, company_name, address, department, company_email,
                                      company_contact, representative, job_description,
                                      representative_email, representative_contact
                               FROM external_partners
                               WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(?))
                               ORDER BY id DESC
                               LIMIT 1";
                $partnerStmt = $conn->prepare($partnerSql);
                $partnerStmt->bind_param("s", $partnerName);
            }
            $partnerStmt->execute();
            $partnerRes = $partnerStmt->get_result();
            if ($partnerRes && $partnerRes->num_rows > 0) {
                $partner_profile = $partnerRes->fetch_assoc();
            }
            $partnerStmt->close();
        }

        // Connected thesis/capstone status based on archive links to this OJT student.
        $ojtStudentPk = (int)($student_data['ojt_student_id'] ?? 0);
        if ($ojtStudentPk > 0) {
            $archiveSql = "SELECT a.status
                           FROM archive_ojt_links l
                           INNER JOIN archives a ON a.id = l.archive_id
                           WHERE l.ojt_student_id = ?
                           ORDER BY a.created_at DESC, a.id DESC
                           LIMIT 20";
            $archiveStmt = $conn->prepare($archiveSql);
            $archiveStmt->bind_param("i", $ojtStudentPk);
            $archiveStmt->execute();
            $archiveRes = $archiveStmt->get_result();
            while ($archiveRow = $archiveRes->fetch_assoc()) {
                $statusValue = strtolower(trim((string)($archiveRow['status'] ?? '')));
                if ($statusValue === 'approved') {
                    $connected_thesis_status = 'Approved';
                    break;
                }
            }
            $archiveStmt->close();
        }
    } else {
        // Fallback: minimal profile from students_user if OJT row is missing.
        $fallbackSql = "SELECT student_id, name, email, profile_image_url, status AS account_status FROM students_user WHERE student_id = ? LIMIT 1";
        $fallbackStmt = $conn->prepare($fallbackSql);
        $fallbackStmt->bind_param("s", $_SESSION['student_id']);
        $fallbackStmt->execute();
        $fallbackRes = $fallbackStmt->get_result();
        if ($fallbackRes->num_rows > 0) {
            $student_data = $fallbackRes->fetch_assoc();
            $student_data['section'] = null;
            $student_data['department'] = null;
            $student_data['contact_no'] = null;
            $student_data['external_partner'] = null;
            $student_data['specialization'] = null;
            $student_data['display_name'] = format_name_surname_first($student_data['name'] ?? '');
            $student_data['display_ojt_status'] = 'Pending Requirements';
            $student_data['status_css_class'] = 'pending-requirements';
        }
        $fallbackStmt->close();
    }
    $stmt->close();
    $conn->close();
}
// Check if all pre requirements are approved
function all_pre_requirements_approved($student_id) {
    if (!$student_id) return false;
    $conn = include("../php/config.php");
    if (!$conn) return false;
    $ojt_student_id = null;
    $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_id);
    $stmt->execute();
    $stmt->bind_result($ojt_student_id);
    $stmt->fetch();
    $stmt->close();
    if (!$ojt_student_id) return false;
    $sql = "SELECT COUNT(*) as cnt FROM ojt_requirement_templates WHERE type='pre' AND is_required=1";
    $total = $conn->query($sql)->fetch_assoc()['cnt'];
    $sql2 = "SELECT COUNT(*) as cnt FROM ojt_requirement_submissions WHERE ojt_student_id=? AND LOWER(status) IN ('approved','verified')";
    $stmt2 = $conn->prepare($sql2);
    $stmt2->bind_param("i", $ojt_student_id);
    $stmt2->execute();
    $stmt2->bind_result($approved);
    $stmt2->fetch();
    $stmt2->close();
    $conn->close();
    return $approved >= $total && $total > 0;
}
$profile_student_id = $student_data['student_id'] ?? ($_SESSION['student_id'] ?? null);
$can_access_dtr = all_pre_requirements_approved($profile_student_id);

?>

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Trainee Profile</title>
<link rel="stylesheet" href="../css/ojt.css">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans:wght@400;600&display=swap" rel="stylesheet">

</head>

<body>

<div class="profile-page">
<div class="profile-shell">


<section class="profile-card">

<header class="profile-top">
<div class="avatar">
    <?php if (!empty($student_data['profile_image_url'])): ?>
        <img src="<?php echo htmlspecialchars($student_data['profile_image_url']); ?>" alt="Profile Image" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
    <?php else: ?>
        <img src="../images/default_avatar.png" alt="Default Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
    <?php endif; ?>
</div>

<div class="profile-meta">

<div class="name-row">
<h1 class="student-name"><?php echo htmlspecialchars($student_data['display_name'] ?? 'Student Name'); ?></h1>
<span class="student-id"><?php echo htmlspecialchars($student_data['student_id'] ?? 'Student ID'); ?></span>
</div>

<!-- ✅ NEW DETAILS ROW -->
<div class="details-grid">

    <div class="status-row">
        <span class="detail-label">Status</span>
        <div class="status-pill <?php echo htmlspecialchars($student_data['status_css_class'] ?? 'pending-requirements'); ?>"><?php echo htmlspecialchars($student_data['display_ojt_status'] ?? 'Pending Requirements'); ?></div>
    </div>

    <div class="detail inline-detail">
        <span class="detail-label">Email</span>
        <span class="detail-value"><?php echo htmlspecialchars($student_data['email'] ?? 'N/A'); ?></span>
    </div>

    <div class="detail inline-detail">
        <span class="detail-label">Contact</span>
        <span class="detail-value"><?php echo htmlspecialchars($student_data['contact_no'] ?? 'N/A'); ?></span>
    </div>

    <div class="detail inline-detail">
        <span class="detail-label">Section</span>
        <span class="detail-value"><?php echo htmlspecialchars($student_data['section'] ?? 'N/A'); ?></span>
    </div>

    <div class="detail inline-detail partner-detail">
        <span class="detail-label">External Partner Assigned</span>
        <div class="partner-inline-group readonly" aria-label="External Partner Assigned">
            <button
              type="button"
              class="partner-inline-input partner-readonly partner-inline-trigger"
              id="partnerToggleBtn"
              aria-expanded="false"
              data-has-partner="<?php echo !empty($student_data['external_partner']) && strtolower((string)$student_data['external_partner']) !== 'n/a' ? '1' : '0'; ?>"
            >
                <span class="partner-readonly-name"><?php echo htmlspecialchars($student_data['external_partner'] ?? 'N/A'); ?></span>
                <span class="partner-readonly-chevron">▾</span>
            </button>
        </div>

        <div class="partner-card" id="partnerCard">
            <?php
              $logo = trim((string)($partner_profile['logo'] ?? ''));
              $companyName = trim((string)($partner_profile['company_name'] ?? ($student_data['external_partner'] ?? 'N/A')));
              $companyInitial = strtoupper(substr($companyName !== '' ? $companyName : 'N', 0, 1));
            ?>
            <div class="partner-card-header">
                <div class="partner-card-logo">
                    <?php if ($logo !== ''): ?>
                        <img src="<?php echo htmlspecialchars($logo); ?>" alt="Partner Logo" />
                    <?php else: ?>
                        <?php echo htmlspecialchars($companyInitial); ?>
                    <?php endif; ?>
                </div>
                <div>
                    <div class="partner-card-name"><?php echo htmlspecialchars($companyName); ?></div>
                    <div class="partner-card-job"><?php echo htmlspecialchars($partner_profile['job_description'] ?? ($student_data['specialization'] ?? 'N/A')); ?></div>
                </div>
            </div>
            <div class="partner-card-grid">
                <div class="partner-card-field">
                    <span class="partner-card-label">External Partner</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($companyName); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Specialization</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['job_description'] ?? ($student_data['specialization'] ?? 'N/A')); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Address</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['address'] ?? 'N/A'); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Company Email</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['company_email'] ?? 'N/A'); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Company Contact</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['company_contact'] ?? 'N/A'); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Representative</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['representative'] ?? 'N/A'); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Representative Email</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['representative_email'] ?? 'N/A'); ?></span>
                </div>
                <div class="partner-card-field">
                    <span class="partner-card-label">Representative Contact</span>
                    <span class="partner-card-value"><?php echo htmlspecialchars($partner_profile['representative_contact'] ?? 'N/A'); ?></span>
                </div>
            </div>
        </div>
    </div>

    <div class="detail inline-detail">
        <span class="detail-label">Specialization</span>
        <span class="detail-value"><?php echo htmlspecialchars($student_data['specialization'] ?? 'N/A'); ?></span>
    </div>

    <div class="detail inline-detail">
        <span class="detail-label">Connected Thesis/Capstone</span>
        <span class="detail-value thesis-status <?php echo strtolower($connected_thesis_status) === 'approved' ? 'approved' : 'not-approved'; ?>">
            <?php echo htmlspecialchars($connected_thesis_status); ?>
        </span>
    </div>

</div>



</div>
</header>

<nav class="tabs">
<button class="tab active" data-target="prePanel">PRE REQUIREMENTS</button>
<button class="tab" data-target="weeklyPanel">WEEKLY REPORTS</button>
<button class="tab" data-target="postPanel">POST REQUIREMENTS</button>
<button class="tab" data-target="attendancePanel" <?php if (!$can_access_dtr) echo 'disabled style="opacity:0.5;pointer-events:none;"'; ?>>DAILY TIME RECORD</button>
</nav>

<!-- SCHEDULE MODAL -->
<?php if ($can_access_dtr && empty($_COOKIE['schedule_modal_shown'])): ?>
<div id="scheduleModal" class="modal" style="display:block;">
  <div class="modal-content">
    <h3>Set Your OJT Schedule</h3>
    <form id="scheduleForm">
      <label>Days (e.g. Mon-Fri): <input name="days" required></label><br>
      <label>Time In: <input type="time" name="time_in" required></label><br>
      <label>Time Out: <input type="time" name="time_out" required></label><br>
      <button type="submit" class="submit-btn">Save Schedule</button>
    </form>
  </div>
</div>
<script>
document.getElementById('scheduleForm').onsubmit = function(e) {
  e.preventDefault();
  // Save schedule via AJAX (stub)
  document.getElementById('scheduleModal').style.display = 'none';
  document.cookie = 'schedule_modal_shown=1;path=/;max-age=31536000';
};
</script>
<?php endif; ?>

<!-- PRE -->
<section class="panel tab-panel active" id="prePanel">
<h2 class="panel-title">PRE REQUIREMENTS</h2>

<div class="requirements-grid">
<?php
// Fetch pre-requirements from ojt_requirement_templates table
$pre_requirements = [];
$submissions = [];
$conn = include("../php/config.php");
if ($conn) {
    // Get requirements
    $sql = "SELECT id, name FROM ojt_requirement_templates WHERE type='pre' AND is_required=1 ORDER BY display_order ASC, id ASC";
    $result = $conn->query($sql);
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $pre_requirements[] = $row;
        }
    }
    // Get ojt_student_id
    $ojt_student_id = null;
    if (isset($student_data['student_id'])) {
        $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
        $stmt->bind_param("s", $student_data['student_id']);
        $stmt->execute();
        $stmt->bind_result($ojt_student_id);
        $stmt->fetch();
        $stmt->close();
    }
    // Get submissions for this student
    if ($ojt_student_id) {
        $sql2 = "SELECT template_id, file_url, file_name, status FROM ojt_requirement_submissions WHERE ojt_student_id = ?";
        $stmt2 = $conn->prepare($sql2);
        $stmt2->bind_param("i", $ojt_student_id);
        $stmt2->execute();
        $res2 = $stmt2->get_result();
        while ($row2 = $res2->fetch_assoc()) {
            $submissions[$row2['template_id']] = $row2;
        }
        $stmt2->close();
    }
    $conn->close();
}
foreach ($pre_requirements as $req):
    $key = 'requirement_' . $req['id'];
    $submission = $submissions[$req['id']] ?? null;
    $file_url = $submission['file_url'] ?? null;
    $file_name = $submission['file_name'] ?? null;
    $status = $submission['status'] ?? null;
    $status_normalized = strtolower(trim((string)($status ?? 'pending')));
    $is_locked = in_array($status_normalized, ['approved', 'verified'], true);
?>
<div class="req" data-requirement-key="<?php echo $key; ?>">
    <div class="req-label"><?php echo htmlspecialchars($req['name']); ?></div>
    <div class="req-actions">
        <?php if ($file_url): ?>
            <div class="uploaded-file-row">
                <span class="file-name"><?php echo htmlspecialchars($file_name); ?></span>
                <?php
                    $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
                    $view_url = $file_url;
                    if (in_array($ext, ['doc','docx','xls','xlsx','ppt','pptx'])) {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    } elseif (in_array($ext, ['pdf','png','jpg','jpeg','gif','bmp','webp'])) {
                        $view_url = $file_url;
                    } else {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    }
                ?>
                <a href="<?php echo htmlspecialchars($view_url); ?>" target="_blank" class="view-link" title="View File">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>
                </a>
                <?php if (!$is_locked): ?>
                    <button class="remove-btn icon-btn danger" data-requirement-key="<?php echo $key; ?>" title="Remove">
                        <svg width="18" height="18" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <button class="upload-btn" data-requirement-key="<?php echo $key; ?>">Upload File</button>
        <?php endif; ?>
    </div>
    <div class="req-status">
        Status: <span class="status-label status-<?php echo strtolower($status ?? 'pending'); ?>"><?php echo htmlspecialchars($status ?? 'Pending'); ?></span>
    </div>
</div>
<?php endforeach; ?>
</div>

<div class="panel-actions">
<button class="submit-btn">Submit</button>
</div>
</section>

<!-- ATTENDANCE -->
<section class="panel tab-panel" id="attendancePanel">
<h2 class="panel-title">DAILY TIME RECORD</h2>
<?php
$conn = include("../php/config.php");
$attendance = [];
$ojt_student_id = null;
if ($conn && isset($student_data['student_id'])) {
    $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_data['student_id']);
    $stmt->execute();
    $stmt->bind_result($ojt_student_id);
    $stmt->fetch();
    $stmt->close();
    if ($ojt_student_id) {
        $sql2 = "SELECT * FROM ojt_attendance WHERE ojt_student_id = ? ORDER BY attendance_date DESC, id DESC";
        $stmt2 = $conn->prepare($sql2);
        $stmt2->bind_param("i", $ojt_student_id);
        $stmt2->execute();
        $res2 = $stmt2->get_result();
        while ($row2 = $res2->fetch_assoc()) {
            $attendance[] = $row2;
        }
        $stmt2->close();
    }
    $conn->close();
}
$date_today = date('Y-m-d');
$has_in = false; $has_out = false;
$present_count = 0;
$absent_count = 0;
$late_count = 0;
$total_minutes = 0;
foreach ($attendance as $row) {
    if ($row['attendance_date'] == $date_today) {
        if ($row['datetime_in']) $has_in = true;
        if ($row['datetime_out']) $has_out = true;
    }
    $status = strtolower((string)($row['status'] ?? ''));
    if ($status === 'present') $present_count++;
    if ($status === 'absent') $absent_count++;
    if ($status === 'late') $late_count++;
    $total_minutes += (int)($row['duration_minutes'] ?? 0);
}
?>
<div class="att-summary-row">
    <div class="att-summary-item">Present: <strong><?php echo $present_count; ?></strong></div>
    <div class="att-summary-item">Late: <strong><?php echo $late_count; ?></strong></div>
    <div class="att-summary-item">Absent: <strong><?php echo $absent_count; ?></strong></div>
    <div class="att-summary-item">Rendered Hours: <strong><?php echo number_format($total_minutes / 60, 2); ?> hrs</strong></div>
</div>
<div class="attendance-table-wrap">
<table class="att-table">
<thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Status</th><th>Proof</th><th>Notes</th></tr></thead>
<tbody>
<?php foreach ($attendance as $row): ?>
<tr>
<td><?php echo htmlspecialchars($row['attendance_date']); ?></td>
<td><?php echo $row['datetime_in'] ? date('H:i', strtotime($row['datetime_in'])) : '-'; ?></td>
<td><?php echo $row['datetime_out'] ? date('H:i', strtotime($row['datetime_out'])) : '-'; ?></td>
<td><?php echo $row['duration_minutes'] ? $row['duration_minutes'].' min' : '-'; ?></td>
<td>
    <?php $status_class = strtolower(str_replace(' ', '-', (string)($row['status'] ?? 'pending'))); ?>
    <span class="att-status-pill <?php echo htmlspecialchars($status_class); ?>"><?php echo htmlspecialchars($row['status'] ?? 'Pending'); ?></span>
</td>
<td><?php if ($row['proof_url']): ?><a href="<?php echo htmlspecialchars($row['proof_url']); ?>" target="_blank" class="att-proof-link">View proof</a><?php endif; ?></td>
<td><?php echo htmlspecialchars($row['notes']); ?></td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
</div>
<div class="attendance-actions">
    <button class="in-btn submit-btn" id="inBtn" <?php if ($has_in) echo 'disabled'; ?>>IN</button>
    <button class="out-btn danger" id="outBtn" <?php if (!$has_in || $has_out) echo 'disabled'; ?>>OUT</button>
</div>
<script>
document.getElementById('inBtn').onclick = function() {
    // AJAX to backend to record IN (with optional proof upload)
    alert('IN recorded! (stub)');
    // On success: window.location.reload();
};
document.getElementById('outBtn').onclick = function() {
    // AJAX to backend to record OUT (with optional proof upload)
    alert('OUT recorded! (stub)');
    // On success: window.location.reload();
};
</script>
</section>

<!-- WEEKLY -->
<section class="panel tab-panel" id="weeklyPanel">
<h2 class="panel-title">WEEKLY REPORTS</h2>
<div class="requirements-grid" id="weekly-reports-grid">
<?php
$conn = include("../php/config.php");
$weekly_reports = [];
$ojt_student_id = null;
if ($conn && isset($student_data['student_id'])) {
    $stmt = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_data['student_id']);
    $stmt->execute();
    $stmt->bind_result($ojt_student_id);
    $stmt->fetch();
    $stmt->close();
    if ($ojt_student_id) {
        $sql2 = "SELECT week_number, file_url, file_name, status FROM ojt_weekly_reports WHERE ojt_student_id = ?";
        $stmt2 = $conn->prepare($sql2);
        $stmt2->bind_param("i", $ojt_student_id);
        $stmt2->execute();
        $res2 = $stmt2->get_result();
        while ($row2 = $res2->fetch_assoc()) {
            $weekly_reports[$row2['week_number']] = $row2;
        }
        $stmt2->close();
    }
    $conn->close();
}
for ($week = 1; $week <= 10; $week++):
    $report = $weekly_reports[$week] ?? null;
    $file_url = $report['file_url'] ?? null;
    $file_name = $report['file_name'] ?? null;
    $status = $report['status'] ?? null;
?>
<div class="req" data-week-number="<?php echo $week; ?>">
    <div class="req-label">WEEK <?php echo $week; ?></div>
    <div class="req-actions">
        <?php if ($file_url): ?>
            <div class="uploaded-file-row">
                <span class="file-name"><?php echo htmlspecialchars($file_name); ?></span>
                <?php
                    $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
                    $view_url = $file_url;
                    if (in_array($ext, ['doc','docx','xls','xlsx','ppt','pptx'])) {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    } elseif (in_array($ext, ['pdf','png','jpg','jpeg','gif','bmp','webp'])) {
                        $view_url = $file_url;
                    } else {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    }
                ?>
                <a href="<?php echo htmlspecialchars($view_url); ?>" target="_blank" class="pro-view-btn" title="View File">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>
                </a>
                <?php if ($status !== 'Submitted'): ?>
                    <button class="remove-weekly-btn icon-btn danger" data-week-number="<?php echo $week; ?>" title="Remove">
                        <svg width="18" height="18" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                    <button class="submit-weekly-btn submit-btn" data-week-number="<?php echo $week; ?>" title="Submit">
                        <svg width="18" height="18" fill="none" stroke="#388e3c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Submit
                    </button>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <button class="upload-weekly-btn upload-btn" data-week-number="<?php echo $week; ?>">Upload File</button>
        <?php endif; ?>
    </div>
    <div class="req-status">
        Status: <span class="status-label status-<?php echo strtolower($status ?? 'pending'); ?>"><?php echo htmlspecialchars($status ?? 'Pending'); ?></span>
    </div>
</div>

<?php endfor; ?>
</div>
</section>

<!-- POST -->

<section class="panel tab-panel" id="postPanel">
<h2 class="panel-title">POST REQUIREMENTS</h2>
<div class="requirements-grid">
<?php
$conn = include("../php/config.php");
if ($conn) {
    $sql = "SELECT id, name FROM ojt_requirement_templates WHERE type='post' AND is_required=1 ORDER BY display_order ASC, id ASC";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $result = $stmt->get_result();
    $post_reqs = $result->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $ojt_student_id = null;
    $stmt2 = $conn->prepare("SELECT id FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt2->bind_param("s", $_SESSION['student_id']);
    $stmt2->execute();
    $stmt2->bind_result($ojt_student_id);
    $stmt2->fetch();
    $stmt2->close();
    $submissions = [];
    if ($ojt_student_id) {
        $sql2 = "SELECT template_id, file_url, file_name, status FROM ojt_requirement_submissions WHERE ojt_student_id = ?";
        $stmt3 = $conn->prepare($sql2);
        $stmt3->bind_param("i", $ojt_student_id);
        $stmt3->execute();
        $result2 = $stmt3->get_result();
        while ($row = $result2->fetch_assoc()) {
            $submissions[$row['template_id']] = $row;
        }
        $stmt3->close();
    }
    foreach ($post_reqs as $req):
        $key = 'requirement_' . $req['id'];
        $submission = $submissions[$req['id']] ?? null;
        $file_url = $submission['file_url'] ?? null;
        $file_name = $submission['file_name'] ?? null;
        $status = $submission['status'] ?? null;
        $status_normalized = strtolower(trim((string)($status ?? 'pending')));
        $is_locked = in_array($status_normalized, ['approved', 'verified'], true);
?>
<div class="req" data-requirement-key="<?php echo $key; ?>">
    <div class="req-label"><?php echo htmlspecialchars($req['name']); ?></div>
    <div class="req-actions">
        <?php if ($file_url): ?>
            <div class="uploaded-file-row">
                <span class="file-name"><?php echo htmlspecialchars($file_name); ?></span>
                <?php
                    $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
                    $view_url = $file_url;
                    if (in_array($ext, ['doc','docx','xls','xlsx','ppt','pptx'])) {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    } elseif (in_array($ext, ['pdf','png','jpg','jpeg','gif','bmp','webp'])) {
                        $view_url = $file_url;
                    } else {
                        $view_url = 'https://docs.google.com/gview?url=' . urlencode($file_url) . '&embedded=true';
                    }
                ?>
                <a href="<?php echo htmlspecialchars($view_url); ?>" target="_blank" class="pro-view-btn" title="View File">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>
                </a>
                <?php if (!$is_locked): ?>
                    <button class="remove-btn icon-btn danger" data-requirement-key="<?php echo $key; ?>" title="Remove">
                        <svg width="18" height="18" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <button class="upload-btn" data-requirement-key="<?php echo $key; ?>">Upload File</button>
        <?php endif; ?>
    </div>
    <div class="req-status">
        Status: <span class="status-label status-<?php echo strtolower($status ?? 'pending'); ?>"><?php echo htmlspecialchars($status ?? 'Pending'); ?></span>
    </div>
</div>
<?php
    endforeach;
    $conn->close();
}
?>
</div>
<div class="panel-actions">
    <button class="completeojt-btn">Submit</button>
</div>
</section>

</section>
</div>
</div>

<script>
// TAB SWITCH + URL PARAM
document.addEventListener("DOMContentLoaded", function(){

    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".tab-panel");

    function activateTab(targetId){
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));

        const targetTab = document.querySelector(`[data-target="${targetId}"]`);
        const targetPanel = document.getElementById(targetId);
        if (targetTab) targetTab.classList.add("active");
        if (targetPanel) targetPanel.classList.add("active");
    }

    tabs.forEach(function(tab){
        tab.addEventListener("click", function(){
            activateTab(this.dataset.target);
        });
    });

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");

    if(tab === "pre") activateTab("prePanel");
    if(tab === "weekly") activateTab("weeklyPanel");
    if(tab === "post") activateTab("postPanel");
    if(tab === "attendance") activateTab("attendancePanel");
});

document.addEventListener("DOMContentLoaded", function () {
    const partnerBtn = document.getElementById("partnerToggleBtn");
    const partnerCard = document.getElementById("partnerCard");
    if (!partnerBtn || !partnerCard) return;

    const hasPartner = partnerBtn.dataset.hasPartner === "1";
    if (!hasPartner) {
        partnerBtn.disabled = true;
        partnerBtn.classList.add("is-disabled");
        return;
    }

    partnerBtn.addEventListener("click", function () {
        const isOpen = partnerCard.classList.toggle("visible");
        partnerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        const chevron = partnerBtn.querySelector(".partner-readonly-chevron");
        if (chevron) chevron.textContent = isOpen ? "▴" : "▾";
    });
});

// POST-REQUIREMENTS AJAX (uses section: 'post')
document.addEventListener("DOMContentLoaded", function () {
    const postFileInput = document.createElement("input");
    postFileInput.type = "file";
    postFileInput.style.display = "none";
    document.body.appendChild(postFileInput);
    let selectedPostRequirementKey = null;

    // Upload
    document.querySelectorAll('#postPanel .upload-btn').forEach(btn => {
        btn.onclick = function () {
            selectedPostRequirementKey = this.dataset.requirementKey;
            postFileInput.value = "";
            postFileInput.click();
        };
    });
    postFileInput.addEventListener('change', function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !selectedPostRequirementKey) return;
        const formData = new FormData();
        formData.append('requirement', selectedPostRequirementKey);
        formData.append('action', 'upload');
        formData.append('section', 'post');
        formData.append('file', file);
        fetch('../php/ojt_upload.php', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                window.location.reload();
            } else {
                alert(data.error || 'Upload failed');
            }
        });
        selectedPostRequirementKey = null;
    });

    // Remove
    document.querySelectorAll('#postPanel .remove-btn').forEach(btn => {
        btn.onclick = function () {
            const key = this.dataset.requirementKey;
            if (!confirm('Remove uploaded file?')) return;
            const params = new URLSearchParams({
                requirement: key,
                action: 'remove',
                section: 'post'
            });
            fetch('../php/ojt_upload.php', {
                method: 'POST',
                body: params
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.error || 'Remove failed');
                }
            });
        };
    });
});

// PRE-REQUIREMENTS AJAX (simple, robust, matches weekly logic)
document.addEventListener("DOMContentLoaded", function () {
    const preFileInput = document.createElement("input");
    preFileInput.type = "file";
    preFileInput.style.display = "none";
    document.body.appendChild(preFileInput);
    let selectedRequirementKey = null;

    // Upload
    document.querySelectorAll('#prePanel .upload-btn').forEach(btn => {
        btn.onclick = function () {
            selectedRequirementKey = this.dataset.requirementKey;
            preFileInput.value = "";
            preFileInput.click();
        };
    });
    preFileInput.addEventListener('change', function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !selectedRequirementKey) return;
        const formData = new FormData();
        formData.append('requirement', selectedRequirementKey);
        formData.append('action', 'upload');
        formData.append('section', 'pre');
        formData.append('file', file);
        fetch('../php/ojt_upload.php', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                window.location.reload();
            } else {
                alert(data.error || 'Upload failed');
            }
        });
        selectedRequirementKey = null;
    });

    // Remove
    document.querySelectorAll('#prePanel .remove-btn').forEach(btn => {
        btn.onclick = function () {
            const key = this.dataset.requirementKey;
            if (!confirm('Remove uploaded file?')) return;
            fetch('../php/ojt_upload.php', {
                method: 'POST',
                body: new URLSearchParams({
                    requirement: key,
                    action: 'remove',
                    section: 'pre'
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.error || 'Remove failed');
                }
            });
        };
    });
});

// WEEKLY REPORTS AJAX
document.addEventListener("DOMContentLoaded", function () {
    const weeklyFileInput = document.createElement("input");
    weeklyFileInput.type = "file";
    weeklyFileInput.style.display = "none";
    document.body.appendChild(weeklyFileInput);
    let selectedWeekNumber = null;

    // Upload
    document.querySelectorAll('.upload-weekly-btn').forEach(btn => {
        btn.onclick = function () {
            selectedWeekNumber = this.dataset.weekNumber;
            weeklyFileInput.value = "";
            weeklyFileInput.click();
        };
    });
    weeklyFileInput.addEventListener('change', function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !selectedWeekNumber) return;
        const formData = new FormData();
        formData.append('week_number', selectedWeekNumber);
        formData.append('action', 'upload');
        formData.append('file', file);
        fetch('../php/ojt_weekly_upload.php', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                window.location.reload();
            } else {
                alert(data.error || 'Upload failed');
            }
        });
        selectedWeekNumber = null;
    });

    // Remove
    document.querySelectorAll('.remove-weekly-btn').forEach(btn => {
        btn.onclick = function () {
            const week = this.dataset.weekNumber;
            if (!confirm('Remove uploaded file for week ' + week + '?')) return;
            fetch('../php/ojt_weekly_upload.php', {
                method: 'POST',
                body: new URLSearchParams({
                    week_number: week,
                    action: 'remove'
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.error || 'Remove failed');
                }
            });
        };
    });

    // Submit
    document.querySelectorAll('.submit-weekly-btn').forEach(btn => {
        btn.onclick = function () {
            const week = this.dataset.weekNumber;
            if (!confirm('Submit file for week ' + week + '? You will not be able to edit after submitting.')) return;
            fetch('../php/ojt_weekly_upload.php', {
                method: 'POST',
                body: new URLSearchParams({
                    week_number: week,
                    action: 'submit'
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.error || 'Submit failed');
                }
            });
        };
    });
});

</script>

</body>
</html>