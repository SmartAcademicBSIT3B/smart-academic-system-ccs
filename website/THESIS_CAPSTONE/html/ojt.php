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
    if (strpos($normalized, 'complete') !== false) {
        return 'OJT Complete';
    }
    if (strpos($normalized, 'deploy') !== false) {
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
    if (strpos($normalized, 'complete') !== false) {
        return 'ojt-complete';
    }
    if (strpos($normalized, 'deploy') !== false) {
        return 'deployed';
    }
    if (strpos($normalized, 'pre') !== false) {
        return 'pre-deployment';
    }
    return 'pending-requirements';
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

    $selectStmt = $conn->prepare("SELECT pre_label, attendance_label, weekly_label, post_label FROM ojt_requirement_tab_labels WHERE department = ? LIMIT 1");
    $selectStmt->bind_param("s", $dept);
    $selectStmt->execute();
    $res = $selectStmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $selectStmt->close();

    if (!$row) {
        $insertStmt = $conn->prepare("INSERT INTO ojt_requirement_tab_labels (department, pre_label, attendance_label, weekly_label, post_label) VALUES (?, ?, ?, ?, ?)");
        $insertStmt->bind_param(
            "sssss",
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

// Include database config to get student + OJT data
$conn = include("../php/config.php");
$student_data = null;
$partner_profile = null;
$connected_thesis_status = 'Not Approved';
$ojt_tab_labels = [
    'pre' => 'PRE REQUIREMENTS',
    'attendance' => 'ATTENDANCE RECORD',
    'weekly' => 'WEEKLY REPORTS',
    'post' => 'POST REQUIREMENTS',
];

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

    $departmentForLabels = trim((string)($student_data['department'] ?? ''));
    if ($departmentForLabels === '') {
        $departmentForLabels = 'CCS';
    }
    $ojt_tab_labels = get_ojt_requirement_tab_labels($conn, $departmentForLabels);

    $stmt->close();
    $conn->close();
}
$student_status_label = strtolower(trim((string)($student_data['display_ojt_status'] ?? '')));
$can_access_progress_tabs = in_array($student_status_label, ['deployed', 'ojt complete'], true);

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
<button class="tab active" data-target="prePanel"><?php echo htmlspecialchars($ojt_tab_labels['pre']); ?></button>
<button class="tab" data-target="attendancePanel" <?php if (!$can_access_progress_tabs) echo 'disabled style="opacity:0.5;pointer-events:none;"'; ?>><?php echo htmlspecialchars($ojt_tab_labels['attendance']); ?></button>
<button class="tab" data-target="weeklyPanel" <?php if (!$can_access_progress_tabs) echo 'disabled style="opacity:0.5;pointer-events:none;"'; ?>><?php echo htmlspecialchars($ojt_tab_labels['weekly']); ?></button>
<button class="tab" data-target="postPanel" <?php if (!$can_access_progress_tabs) echo 'disabled style="opacity:0.5;pointer-events:none;"'; ?>><?php echo htmlspecialchars($ojt_tab_labels['post']); ?></button>

</nav>

<div id="scheduleModal" class="modal" style="display:none;" aria-hidden="true">
    <div class="modal-content">
        <h3>Set Your OJT Schedule</h3>
        <p class="schedule-note">Daily Record requires a schedule so the system can auto-detect late, present, and absent status.</p>
        <form id="scheduleForm">
            <label>OJT Start Date <input type="date" name="start_date" required></label>
            <label>Schedule Days</label>
            <div class="schedule-days-grid">
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Monday"> Monday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Tuesday"> Tuesday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Wednesday"> Wednesday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Thursday"> Thursday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Friday"> Friday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Saturday"> Saturday</label>
                <label class="schedule-day-item"><input type="checkbox" name="days[]" value="Sunday"> Sunday</label>
            </div>
            <label>Time In <input type="time" name="time_in" required></label>
            <label>Time Out <input type="time" name="time_out" required></label>
            <div class="modal-inline-actions">
                <button type="button" id="scheduleSkipBtn" class="app-modal-btn secondary">Cancel</button>
                <button type="submit" class="submit-btn">Save Schedule</button>
            </div>
        </form>
    </div>
</div>

<div id="attendanceModal" class="modal" style="display:none;" aria-hidden="true">
    <div class="modal-content">
        <h3 id="attendanceModalTitle">Add Attendance Record</h3>
        <form id="attendanceForm">
            <input type="hidden" name="id" value="">
            <label>Date <input type="date" name="attendance_date" required></label>
            <label>Time In <input type="time" name="time_in"></label>
            <label>Proof File <input type="file" name="proof_file" accept="image/*,.pdf"></label>
            <label>Notes <input type="text" name="notes" placeholder="Optional notes"></label>
            <div class="modal-inline-actions">
                <button type="button" id="attendanceCancelBtn" class="app-modal-btn secondary">Cancel</button>
                <button type="submit" class="submit-btn">Save Record</button>
            </div>
        </form>
    </div>
</div>

<div id="weeklyModal" class="modal" style="display:none;" aria-hidden="true">
    <div class="modal-content">
        <h3 id="weeklyModalTitle">Add Weekly Report</h3>
        <form id="weeklyForm">
            <label>Week Number <input type="number" name="week_number" min="1" readonly required></label>
            <label>Week Start Date <input type="date" name="week_start_date" required></label>
            <label>Report File (Image/PDF) <input type="file" name="file" accept="image/*,.pdf"></label>
            <div class="modal-inline-actions">
                <button type="button" id="weeklyCancelBtn" class="app-modal-btn secondary">Cancel</button>
                <button type="submit" class="submit-btn">Save Report</button>
            </div>
        </form>
    </div>
</div>

<section class="panel tab-panel active" id="prePanel" data-tab="pre">
    <div class="panel-loading">Loading <?php echo htmlspecialchars(strtolower($ojt_tab_labels['pre'])); ?>...</div>
</section>

<section class="panel tab-panel" id="weeklyPanel" data-tab="weekly">
    <div class="panel-loading">Loading <?php echo htmlspecialchars(strtolower($ojt_tab_labels['weekly'])); ?>...</div>
</section>

<section class="panel tab-panel" id="postPanel" data-tab="post">
    <div class="panel-loading">Loading <?php echo htmlspecialchars(strtolower($ojt_tab_labels['post'])); ?>...</div>
</section>

<section class="panel tab-panel" id="attendancePanel" data-tab="attendance">
    <div class="panel-loading">Loading <?php echo htmlspecialchars(strtolower($ojt_tab_labels['attendance'])); ?>...</div>
</section>

</section>
</div>
</div>

<div id="appModal" class="app-modal-overlay" aria-hidden="true">
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
        <h3 id="appModalTitle" class="app-modal-title">Notice</h3>
        <p id="appModalMessage" class="app-modal-message"></p>
        <ul id="appModalList" class="app-modal-list" hidden></ul>
        <div class="app-modal-actions">
            <button type="button" id="appModalCancel" class="app-modal-btn secondary" hidden>Cancel</button>
            <button type="button" id="appModalOk" class="app-modal-btn primary">OK</button>
        </div>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function () {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panels = Array.from(document.querySelectorAll(".tab-panel"));
    const loadedPanels = new Set();

    let selectedRequirementUpload = null;

    const requirementFileInput = document.createElement("input");
    requirementFileInput.type = "file";
    requirementFileInput.style.display = "none";
    document.body.appendChild(requirementFileInput);

    const appModal = document.getElementById("appModal");
    const appModalTitle = document.getElementById("appModalTitle");
    const appModalMessage = document.getElementById("appModalMessage");
    const appModalList = document.getElementById("appModalList");
    const appModalOk = document.getElementById("appModalOk");
    const appModalCancel = document.getElementById("appModalCancel");
    const scheduleModal = document.getElementById("scheduleModal");
    const scheduleForm = document.getElementById("scheduleForm");
    const scheduleSkipBtn = document.getElementById("scheduleSkipBtn");
    const attendanceModal = document.getElementById("attendanceModal");
    const attendanceForm = document.getElementById("attendanceForm");
    const attendanceModalTitle = document.getElementById("attendanceModalTitle");
    const attendanceCancelBtn = document.getElementById("attendanceCancelBtn");
    const weeklyModal = document.getElementById("weeklyModal");
    const weeklyForm = document.getElementById("weeklyForm");
    const weeklyModalTitle = document.getElementById("weeklyModalTitle");
    const weeklyCancelBtn = document.getElementById("weeklyCancelBtn");
    let scheduleCheckInFlight = false;

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function openModal(options) {
        const opts = options || {};
        const title = opts.title || "Notice";
        const message = opts.message || "";
        const details = Array.isArray(opts.details) ? opts.details : [];
        const confirmText = opts.confirmText || "OK";
        const cancelText = opts.cancelText || "";

        appModalTitle.textContent = title;
        appModalMessage.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
        appModalOk.textContent = confirmText;

        if (details.length) {
            appModalList.hidden = false;
            appModalList.innerHTML = details.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
        } else {
            appModalList.hidden = true;
            appModalList.innerHTML = "";
        }

        if (cancelText) {
            appModalCancel.hidden = false;
            appModalCancel.textContent = cancelText;
        } else {
            appModalCancel.hidden = true;
            appModalCancel.textContent = "";
        }

        appModal.classList.add("open");
        appModal.setAttribute("aria-hidden", "false");

        return new Promise((resolve) => {
            const close = (value) => {
                appModal.classList.remove("open");
                appModal.setAttribute("aria-hidden", "true");
                appModalOk.removeEventListener("click", onOk);
                appModalCancel.removeEventListener("click", onCancel);
                appModal.removeEventListener("click", onBackdrop);
                document.removeEventListener("keydown", onKeyDown);
                resolve(value);
            };

            const onOk = () => close(true);
            const onCancel = () => close(false);
            const onBackdrop = (event) => {
                if (event.target === appModal && !cancelText) {
                    close(true);
                }
                if (event.target === appModal && cancelText) {
                    close(false);
                }
            };
            const onKeyDown = (event) => {
                if (event.key === "Escape") {
                    close(cancelText ? false : true);
                }
            };

            appModalOk.addEventListener("click", onOk);
            appModalCancel.addEventListener("click", onCancel);
            appModal.addEventListener("click", onBackdrop);
            document.addEventListener("keydown", onKeyDown);
        });
    }

    async function showAlert(message, title) {
        await openModal({
            title: title || "Notice",
            message,
            confirmText: "OK",
        });
    }

    async function showConfirm(message, title, confirmText, cancelText, details) {
        return openModal({
            title: title || "Confirm",
            message,
            confirmText: confirmText || "Confirm",
            cancelText: cancelText || "Cancel",
            details: details || [],
        });
    }

    async function parseJsonSafely(response) {
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (_e) {
            const cleaned = String(text || "").trim();
            return {
                success: false,
                error: cleaned && !cleaned.startsWith("<") ? cleaned : `Server returned HTTP ${response.status}.`,
            };
        }
    }

    function getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getLocalTimeString(date = new Date()) {
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    function showScheduleModal() {
        if (!scheduleModal) return;
        if (scheduleForm && scheduleForm.elements && scheduleForm.elements.start_date && !scheduleForm.elements.start_date.value) {
            scheduleForm.elements.start_date.value = getLocalDateString();
        }
        scheduleModal.style.display = "flex";
        scheduleModal.setAttribute("aria-hidden", "false");
    }

    function hideScheduleModal() {
        if (!scheduleModal) return;
        scheduleModal.style.display = "none";
        scheduleModal.setAttribute("aria-hidden", "true");
    }

    function openAttendanceModal(record) {
        if (!attendanceModal || !attendanceForm) return;
        const isEdit = !!(record && record.id);
        attendanceModalTitle.textContent = isEdit ? "Edit Attendance Record" : "Add Attendance Record";
        attendanceForm.reset();

        attendanceForm.elements.id.value = isEdit ? String(record.id) : "";
        attendanceForm.elements.attendance_date.value = record && record.attendance_date ? record.attendance_date : getLocalDateString();
        attendanceForm.elements.time_in.value = record && record.time_in ? record.time_in : getLocalTimeString();
        attendanceForm.elements.notes.value = record && record.notes ? record.notes : "";
        const proofInput = attendanceForm.elements.proof_file;
        if (proofInput) {
            proofInput.value = "";
        }

        attendanceModal.style.display = "flex";
        attendanceModal.setAttribute("aria-hidden", "false");
    }

    function hideAttendanceModal() {
        if (!attendanceModal) return;
        attendanceModal.style.display = "none";
        attendanceModal.setAttribute("aria-hidden", "true");
    }

    function openWeeklyModal(options) {
        if (!weeklyModal || !weeklyForm) return;
        const opts = options || {};
        const weekNumber = Number(opts.weekNumber || 0);
        const weekStartDate = (opts.weekStartDate || "").toString().trim();
        const hasExisting = !!opts.hasExisting;

        weeklyForm.reset();
        weeklyModalTitle.textContent = hasExisting ? `Update Weekly Report (Week ${weekNumber})` : "Add Weekly Report";
        weeklyForm.elements.week_number.value = weekNumber > 0 ? String(weekNumber) : "";
        weeklyForm.elements.week_start_date.value = weekStartDate || getLocalDateString();
        weeklyForm.elements.file.value = "";

        weeklyModal.style.display = "flex";
        weeklyModal.setAttribute("aria-hidden", "false");
    }

    function hideWeeklyModal() {
        if (!weeklyModal) return;
        weeklyModal.style.display = "none";
        weeklyModal.setAttribute("aria-hidden", "true");
    }

    async function ensureScheduleBeforeAttendance() {
        if (scheduleCheckInFlight) return;
        scheduleCheckInFlight = true;
        try {
            const response = await fetch("../php/ojt_schedule.php?action=get");
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Unable to check OJT schedule.", "Daily Time Record");
                return;
            }
            if (!data.has_schedule) {
                showScheduleModal();
            }
        } catch (_err) {
            await showAlert("Unable to check OJT schedule.", "Daily Time Record");
        } finally {
            scheduleCheckInFlight = false;
        }
    }

    const partnerBtn = document.getElementById("partnerToggleBtn");
    const partnerCard = document.getElementById("partnerCard");
    if (partnerBtn && partnerCard) {
        const hasPartner = partnerBtn.dataset.hasPartner === "1";
        if (!hasPartner) {
            partnerBtn.disabled = true;
            partnerBtn.classList.add("is-disabled");
        } else {
            partnerBtn.addEventListener("click", function () {
                const isOpen = partnerCard.classList.toggle("visible");
                partnerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
                const chevron = partnerBtn.querySelector(".partner-readonly-chevron");
                if (chevron) chevron.textContent = isOpen ? "▴" : "▾";
            });
        }
    }

    function tabKeyFromPanel(panelId) {
        if (panelId === "prePanel") return "pre";
        if (panelId === "postPanel") return "post";
        if (panelId === "weeklyPanel") return "weekly";
        if (panelId === "attendancePanel") return "attendance";
        return "pre";
    }

    function panelIdFromSection(section) {
        if (section === "pre") return "prePanel";
        if (section === "post") return "postPanel";
        if (section === "weekly") return "weeklyPanel";
        if (section === "attendance") return "attendancePanel";
        return "prePanel";
    }

    function setActiveTab(panelId) {
        tabs.forEach((tab) => tab.classList.remove("active"));
        panels.forEach((panel) => panel.classList.remove("active"));
        const tabButton = document.querySelector(`[data-target="${panelId}"]`);
        const panel = document.getElementById(panelId);
        if (tabButton) tabButton.classList.add("active");
        if (panel) panel.classList.add("active");
    }

    async function loadPanel(panelId, forceReload) {
        const shouldReload = forceReload === true;
        if (!shouldReload && loadedPanels.has(panelId)) {
            return;
        }

        const panel = document.getElementById(panelId);
        if (!panel) return;
        panel.innerHTML = '<div class="panel-loading">Loading...</div>';

        const tabKey = tabKeyFromPanel(panelId);
        try {
            const response = await fetch(`../php/ojt_tab_loader.php?tab=${encodeURIComponent(tabKey)}`);
            const data = await response.json();
            if (!data.success) {
                panel.innerHTML = `<div class="panel-loading">${data.error || "Failed to load panel."}</div>`;
                return;
            }
            panel.innerHTML = data.html;
            loadedPanels.add(panelId);
        } catch (_err) {
            panel.innerHTML = '<div class="panel-loading">Failed to load panel.</div>';
        }
    }

    async function refreshSection(section) {
        const panelId = panelIdFromSection(section);
        await loadPanel(panelId, true);
    }

    async function activatePanel(panelId) {
        setActiveTab(panelId);
        await loadPanel(panelId, false);
        const tabKey = tabKeyFromPanel(panelId);
        if (tabKey === "attendance") {
            await ensureScheduleBeforeAttendance();
        }
        const params = new URLSearchParams(window.location.search);
        params.set("tab", tabKey);
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", newUrl);
    }

    tabs.forEach((tabButton) => {
        tabButton.addEventListener("click", function () {
            if (tabButton.disabled) return;
            activatePanel(tabButton.dataset.target || "prePanel");
        });
    });

    requirementFileInput.addEventListener("change", async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !selectedRequirementUpload) return;

        const formData = new FormData();
        formData.append("requirement", selectedRequirementUpload.requirementKey);
        formData.append("action", "upload");
        formData.append("section", selectedRequirementUpload.section);
        formData.append("file", file);

        try {
            const response = await fetch("../php/ojt_upload.php", { method: "POST", body: formData });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Upload failed", "Upload Failed");
            } else {
                await refreshSection(selectedRequirementUpload.section);
            }
        } catch (_err) {
            await showAlert("Upload failed", "Upload Failed");
        } finally {
            selectedRequirementUpload = null;
            requirementFileInput.value = "";
        }
    });

    if (scheduleSkipBtn) {
        scheduleSkipBtn.addEventListener("click", function () {
            hideScheduleModal();
        });
    }

    if (weeklyCancelBtn) {
        weeklyCancelBtn.addEventListener("click", function () {
            hideWeeklyModal();
        });
    }

    if (weeklyForm) {
        weeklyForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const formData = new FormData(weeklyForm);
            const weekNumber = Number(formData.get("week_number") || 0);
            const weekStartDate = String(formData.get("week_start_date") || "").trim();

            if (!weekNumber || weekNumber < 1) {
                await showAlert("Week number is required.", "Weekly Reports");
                return;
            }
            if (!weekStartDate) {
                await showAlert("Week start date is required.", "Weekly Reports");
                return;
            }

            formData.set("week_number", String(weekNumber));
            formData.set("week_start_date", weekStartDate);

            try {
                const response = await fetch("../php/ojt_weekly_upload.php?action=save", {
                    method: "POST",
                    body: formData,
                });
                const data = await parseJsonSafely(response);
                if (!data.success) {
                    await showAlert(data.error || "Failed to save weekly report.", "Weekly Reports");
                    return;
                }

                hideWeeklyModal();
                await refreshSection("weekly");
            } catch (_err) {
                await showAlert("Failed to save weekly report.", "Weekly Reports");
            }
        });
    }

    if (scheduleForm) {
        scheduleForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const formData = new FormData(scheduleForm);

            const days = formData.getAll("days[]");
            const startDate = (formData.get("start_date") || "").toString().trim();
            if (!startDate) {
                await showAlert("Please select your OJT start date.", "Schedule Required");
                return;
            }
            if (!days.length) {
                await showAlert("Please select at least one day.", "Schedule Required");
                return;
            }

            try {
                const response = await fetch("../php/ojt_schedule.php?action=save", {
                    method: "POST",
                    body: formData,
                });
                const data = await parseJsonSafely(response);
                if (!data.success) {
                    await showAlert(data.error || "Failed to save schedule.", "Schedule");
                    return;
                }
                hideScheduleModal();
                await refreshSection("attendance");
                await showAlert("OJT schedule saved.", "Schedule");
            } catch (_err) {
                await showAlert("Failed to save schedule.", "Schedule");
            }
        });
    }

    if (attendanceCancelBtn) {
        attendanceCancelBtn.addEventListener("click", function () {
            hideAttendanceModal();
        });
    }

    if (attendanceForm) {
        attendanceForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const formData = new FormData(attendanceForm);
            const attendanceDateInput = attendanceForm.elements.attendance_date;
            const timeInInput = attendanceForm.elements.time_in;
            const notesInput = attendanceForm.elements.notes;
            const attendanceDate = attendanceDateInput ? String(attendanceDateInput.value || "").trim() : "";

            if (!attendanceDate) {
                await showAlert("Please choose an attendance date before saving.", "Attendance");
                return;
            }

            formData.set("attendance_date", attendanceDate);
            if (timeInInput) {
                formData.set("time_in", String(timeInInput.value || "").trim());
            }
            if (notesInput) {
                formData.set("notes", String(notesInput.value || "").trim());
            }

            try {
                const response = await fetch("../php/ojt_attendance_manage.php?action=save", {
                    method: "POST",
                    body: formData,
                });
                const data = await parseJsonSafely(response);
                if (!data.success) {
                    await showAlert(data.error || "Failed to save attendance record.", "Attendance");
                    return;
                }
                hideAttendanceModal();
                await refreshSection("attendance");
            } catch (_err) {
                await showAlert("Failed to save attendance record.", "Attendance");
            }
        });
    }

    function getIncompleteRequirements(section) {
        const panelId = panelIdFromSection(section);
        const panel = document.getElementById(panelId);
        if (!panel) return [];

        return Array.from(panel.querySelectorAll(".req[data-requirement-key]")).filter((req) => {
            const hasFile = !!req.querySelector(".uploaded-file-row .file-name");
            return !hasFile;
        }).map((req) => {
            const label = req.querySelector(".req-label");
            return (label ? label.textContent : "Requirement").trim();
        });
    }

    document.addEventListener("click", async function (event) {
        const refreshBtn = event.target.closest(".panel-refresh-btn[data-section]");
        if (refreshBtn) {
            const section = refreshBtn.dataset.section;
            if (!section) return;
            await refreshSection(section);
            return;
        }

        const requirementLabelUpload = event.target.closest(".req-label-upload[data-requirement-key]");
        if (requirementLabelUpload) {
            const panel = requirementLabelUpload.closest(".tab-panel");
            const section = tabKeyFromPanel(panel ? panel.id : "prePanel");
            selectedRequirementUpload = {
                requirementKey: requirementLabelUpload.dataset.requirementKey,
                section,
            };
            requirementFileInput.click();
            return;
        }

        const requirementUploadBtn = event.target.closest(".upload-btn[data-requirement-key]");
        if (requirementUploadBtn) {
            const panel = requirementUploadBtn.closest(".tab-panel");
            const section = tabKeyFromPanel(panel ? panel.id : "prePanel");
            selectedRequirementUpload = {
                requirementKey: requirementUploadBtn.dataset.requirementKey,
                section,
            };
            requirementFileInput.click();
            return;
        }

        const removeRequirementBtn = event.target.closest(".remove-btn[data-requirement-key]");
        if (removeRequirementBtn) {
            const shouldRemove = await showConfirm(
                "Remove uploaded file?",
                "Remove File",
                "Remove",
                "Cancel",
            );
            if (!shouldRemove) return;
            const panel = removeRequirementBtn.closest(".tab-panel");
            const section = tabKeyFromPanel(panel ? panel.id : "prePanel");
            const params = new URLSearchParams({
                requirement: removeRequirementBtn.dataset.requirementKey,
                action: "remove",
                section,
            });
            const response = await fetch("../php/ojt_upload.php", { method: "POST", body: params });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Remove failed", "Remove Failed");
            } else {
                await refreshSection(section);
            }
            return;
        }

        const submitToggleBtn = event.target.closest(".req-submit-toggle[data-section][data-action]");
        if (submitToggleBtn) {
            const section = submitToggleBtn.dataset.section;
            const action = submitToggleBtn.dataset.action;
            if (action === "submit") {
                const incompleteRequirements = getIncompleteRequirements(section);
                const hasIncomplete = incompleteRequirements.length > 0;
                const proceedSubmit = await showConfirm(
                    hasIncomplete
                        ? `You are about to submit ${section.toUpperCase()} requirements with incomplete items.`
                        : `Submit ${section.toUpperCase()} requirements? You cannot edit this tab after submitting.`,
                    hasIncomplete ? "Incomplete Requirements" : "Submit Requirements",
                    hasIncomplete ? "Submit Anyway" : "Submit",
                    "Cancel",
                    incompleteRequirements,
                );
                if (!proceedSubmit) return;
            } else {
                const proceedUnsubmit = await showConfirm(
                    `Unsubmit ${section.toUpperCase()} requirements? This will make the tab editable again.`,
                    "Unsubmit Requirements",
                    "Unsubmit",
                    "Cancel",
                );
                if (!proceedUnsubmit) return;
            }

            const params = new URLSearchParams({ section, action });
            const response = await fetch("../php/ojt_requirements_submit.php", { method: "POST", body: params });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Action failed", "Action Failed");
            } else {
                await refreshSection(section);
            }
            return;
        }

        const weeklyAddBtn = event.target.closest("#weeklyAddBtn[data-next-week]");
        if (weeklyAddBtn) {
            openWeeklyModal({
                weekNumber: Number(weeklyAddBtn.dataset.nextWeek || 1),
                weekStartDate: getLocalDateString(),
                hasExisting: false,
            });
            return;
        }

        const weeklyReplaceBtn = event.target.closest(".weekly-replace-btn[data-week-number]");
        if (weeklyReplaceBtn) {
            openWeeklyModal({
                weekNumber: Number(weeklyReplaceBtn.dataset.weekNumber || 0),
                weekStartDate: (weeklyReplaceBtn.dataset.weekStart || "").trim(),
                hasExisting: true,
            });
            return;
        }

        const weeklyDeleteBtn = event.target.closest(".weekly-delete-btn[data-week-number]");
        if (weeklyDeleteBtn) {
            const weekNumber = String(weeklyDeleteBtn.dataset.weekNumber || "").trim();
            if (!weekNumber) return;

            const shouldDeleteWeek = await showConfirm(
                `Delete weekly report for week ${weekNumber}?`,
                "Delete Weekly Report",
                "Delete",
                "Cancel",
            );
            if (!shouldDeleteWeek) return;

            const params = new URLSearchParams({ action: "delete", week_number: weekNumber });
            const response = await fetch("../php/ojt_weekly_upload.php", { method: "POST", body: params });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Failed to delete weekly report.", "Weekly Reports");
            } else {
                await refreshSection("weekly");
            }
            return;
        }

        if (event.target.id === "attendanceAddBtn") {
            openAttendanceModal({
                id: "",
                attendance_date: getLocalDateString(),
                time_in: getLocalTimeString(),
                notes: "",
            });
            return;
        }

        const attendanceTimeoutBtn = event.target.closest(".attendance-timeout-btn[data-record-id]");
        if (attendanceTimeoutBtn) {
            const shouldSetTimeout = await showConfirm(
                "Set time out to the current time?",
                "Set Time Out",
                "Set Now",
                "Cancel",
            );
            if (!shouldSetTimeout) return;

            const params = new URLSearchParams({
                id: attendanceTimeoutBtn.dataset.recordId,
            });
            const response = await fetch("../php/ojt_attendance_manage.php?action=timeout", {
                method: "POST",
                body: params,
            });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Failed to set time out.", "Attendance");
            } else {
                await refreshSection("attendance");
            }
            return;
        }

        const attendanceProofReplaceBtn = event.target.closest(".attendance-proof-replace-btn[data-record-id]");
        if (attendanceProofReplaceBtn) {
            const row = attendanceProofReplaceBtn.closest("tr");
            const proofInput = row ? row.querySelector('.attendance-proof-input[data-record-id]') : null;
            if (proofInput) {
                proofInput.click();
            }
            return;
        }

        const attendanceNotesSaveBtn = event.target.closest(".attendance-notes-save-btn[data-record-id]");
        if (attendanceNotesSaveBtn) {
            const row = attendanceNotesSaveBtn.closest("tr");
            const notesInput = row ? row.querySelector('.attendance-note-input[data-record-id]') : null;
            const recordId = String(attendanceNotesSaveBtn.dataset.recordId || "").trim();
            const attendanceDate = String(attendanceNotesSaveBtn.dataset.date || "").trim();
            const timeIn = String(attendanceNotesSaveBtn.dataset.timeIn || "").trim();
            const notesValue = notesInput ? String(notesInput.value || "").trim() : "";

            if (!recordId || !attendanceDate) {
                await showAlert("Unable to save note for this attendance row.", "Attendance");
                return;
            }

            const formData = new FormData();
            formData.set("id", recordId);
            formData.set("attendance_date", attendanceDate);
            formData.set("time_in", timeIn);
            formData.set("notes", notesValue);

            const response = await fetch("../php/ojt_attendance_manage.php?action=save", {
                method: "POST",
                body: formData,
            });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Failed to save attendance notes.", "Attendance");
            } else {
                await refreshSection("attendance");
            }
            return;
        }
    });

    document.addEventListener("change", async function (event) {
        const proofInput = event.target.closest('.attendance-proof-input[data-record-id]');
        if (!proofInput) return;

        const file = proofInput.files && proofInput.files[0];
        if (!file) return;

        const row = proofInput.closest("tr");
        const notesInput = row ? row.querySelector('.attendance-note-input[data-record-id]') : null;

        const recordId = String(proofInput.dataset.recordId || "").trim();
        const attendanceDate = String(proofInput.dataset.date || "").trim();
        const timeIn = String(proofInput.dataset.timeIn || "").trim();
        const notesValue = notesInput ? String(notesInput.value || "").trim() : "";

        if (!recordId || !attendanceDate) {
            await showAlert("Unable to update proof for this attendance row.", "Attendance");
            proofInput.value = "";
            return;
        }

        const formData = new FormData();
        formData.set("id", recordId);
        formData.set("attendance_date", attendanceDate);
        formData.set("time_in", timeIn);
        formData.set("notes", notesValue);
        formData.set("proof_file", file);

        const response = await fetch("../php/ojt_attendance_manage.php?action=save", {
            method: "POST",
            body: formData,
        });
        const data = await parseJsonSafely(response);
        if (!data.success) {
            await showAlert(data.error || "Failed to upload attendance proof.", "Attendance");
        } else {
            await refreshSection("attendance");
        }
        proofInput.value = "";
    });

    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    const autoSubmit = params.get("autoSubmit") === "1";
    let initialPanelId = panelIdFromSection(urlTab || "pre");

    const initialTabButton = document.querySelector(`[data-target="${initialPanelId}"]`);
    if (initialTabButton && initialTabButton.disabled) {
        initialPanelId = "prePanel";
    }

    activatePanel(initialPanelId);

    if (autoSubmit) {
        window.setTimeout(() => {
            const submitButton = document.querySelector('.req-submit-toggle[data-section][data-action="submit"]');
            if (submitButton) {
                submitButton.click();
            }
        }, 350);
    }
});
</script>

</body>
</html>