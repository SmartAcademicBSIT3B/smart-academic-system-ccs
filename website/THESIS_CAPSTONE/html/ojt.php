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
<div id="scheduleModal" class="modal" style="display:flex;">
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

<section class="panel tab-panel active" id="prePanel" data-tab="pre">
    <div class="panel-loading">Loading pre requirements...</div>
</section>

<section class="panel tab-panel" id="weeklyPanel" data-tab="weekly">
    <div class="panel-loading">Loading weekly reports...</div>
</section>

<section class="panel tab-panel" id="postPanel" data-tab="post">
    <div class="panel-loading">Loading post requirements...</div>
</section>

<section class="panel tab-panel" id="attendancePanel" data-tab="attendance">
    <div class="panel-loading">Loading daily time record...</div>
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
    let selectedWeekUpload = null;

    const requirementFileInput = document.createElement("input");
    requirementFileInput.type = "file";
    requirementFileInput.style.display = "none";
    document.body.appendChild(requirementFileInput);

    const weeklyFileInput = document.createElement("input");
    weeklyFileInput.type = "file";
    weeklyFileInput.style.display = "none";
    document.body.appendChild(weeklyFileInput);

    const appModal = document.getElementById("appModal");
    const appModalTitle = document.getElementById("appModalTitle");
    const appModalMessage = document.getElementById("appModalMessage");
    const appModalList = document.getElementById("appModalList");
    const appModalOk = document.getElementById("appModalOk");
    const appModalCancel = document.getElementById("appModalCancel");

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
            return {
                success: false,
                error: "Unexpected server response. Please refresh and try again.",
            };
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

    weeklyFileInput.addEventListener("change", async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || selectedWeekUpload === null) return;

        const formData = new FormData();
        formData.append("week_number", selectedWeekUpload);
        formData.append("action", "upload");
        formData.append("file", file);

        try {
            const response = await fetch("../php/ojt_weekly_upload.php", { method: "POST", body: formData });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Upload failed", "Upload Failed");
            } else {
                await refreshSection("weekly");
            }
        } catch (_err) {
            await showAlert("Upload failed", "Upload Failed");
        } finally {
            selectedWeekUpload = null;
            weeklyFileInput.value = "";
        }
    });

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

        const weeklyUploadBtn = event.target.closest(".upload-weekly-btn[data-week-number]");
        if (weeklyUploadBtn) {
            selectedWeekUpload = weeklyUploadBtn.dataset.weekNumber;
            weeklyFileInput.click();
            return;
        }

        const weeklyRemoveBtn = event.target.closest(".remove-weekly-btn[data-week-number]");
        if (weeklyRemoveBtn) {
            const weekNumber = weeklyRemoveBtn.dataset.weekNumber;
            const shouldRemoveWeekly = await showConfirm(
                `Remove uploaded file for week ${weekNumber}?`,
                "Remove Weekly File",
                "Remove",
                "Cancel",
            );
            if (!shouldRemoveWeekly) return;
            const params = new URLSearchParams({ week_number: weekNumber, action: "remove" });
            const response = await fetch("../php/ojt_weekly_upload.php", { method: "POST", body: params });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Remove failed", "Remove Failed");
            } else {
                await refreshSection("weekly");
            }
            return;
        }

        const weeklySubmitBtn = event.target.closest(".submit-weekly-btn[data-week-number]");
        if (weeklySubmitBtn) {
            const weekNumber = weeklySubmitBtn.dataset.weekNumber;
            const shouldSubmitWeekly = await showConfirm(
                `Submit file for week ${weekNumber}? You will not be able to edit after submitting.`,
                "Submit Weekly File",
                "Submit",
                "Cancel",
            );
            if (!shouldSubmitWeekly) return;
            const params = new URLSearchParams({ week_number: weekNumber, action: "submit" });
            const response = await fetch("../php/ojt_weekly_upload.php", { method: "POST", body: params });
            const data = await parseJsonSafely(response);
            if (!data.success) {
                await showAlert(data.error || "Submit failed", "Submit Failed");
            } else {
                await refreshSection("weekly");
            }
            return;
        }

        if (event.target.id === "inBtn") {
            await showAlert("IN recorded! (stub)", "Daily Time Record");
            return;
        }

        if (event.target.id === "outBtn") {
            await showAlert("OUT recorded! (stub)", "Daily Time Record");
        }
    });

    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    let initialPanelId = panelIdFromSection(urlTab || "pre");

    const initialTabButton = document.querySelector(`[data-target="${initialPanelId}"]`);
    if (initialTabButton && initialTabButton.disabled) {
        initialPanelId = "prePanel";
    }

    activatePanel(initialPanelId);
});
</script>

</body>
</html>