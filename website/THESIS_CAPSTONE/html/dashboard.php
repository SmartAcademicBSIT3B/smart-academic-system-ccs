<?php
session_start();

// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}

// Fetch student data and linked thesis/capstone
$conn = include("../php/config.php");
$student_id = $_SESSION['student_id'];
$thesis_data = null;
$ojt_status = null;
$ojt_student_id = null;
$required_hours = 480; // Default fallback
$progress_data = [
    'completed_hours' => 0,
    'progress_percent' => 0,
    'remaining_hours' => 480
];
$ojt_requirements = [];
$calendar_events = [];
$show_requirements_card = false;
$requirements_type = null;

if ($conn) {
    // Fetch thesis/capstone data
    $stmt = $conn->prepare("SELECT s.name FROM students_user s WHERE s.student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_id);
    $stmt->execute();
    $stmt->bind_result($student_name);
    $stmt->fetch();
    $stmt->close();

    // Get linked thesis/capstone
    $stmt = $conn->prepare("SELECT id, title, advisor, status, file_path, type FROM archives WHERE LOWER(authors) LIKE ? LIMIT 1");
    $search_name = "%$student_name%";
    $stmt->bind_param("s", $search_name);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        $thesis_data = $result->fetch_assoc();
    }
    $stmt->close();

    // Get OJT status (fetch ojt_student_id for use with helper functions)
    $stmt = $conn->prepare("SELECT id, status, department FROM ojt_students WHERE student_id = ? LIMIT 1");
    $stmt->bind_param("s", $student_id);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        $ojt_data = $result->fetch_assoc();
        $ojt_status = $ojt_data['status'];
        $ojt_student_id = (int)$ojt_data['id'];
        $ojt_department = $ojt_data['department'] ?? 'CCS';
    }
    $stmt->close();

    // Get required hours based on student's department/section
    if ($ojt_student_id) {
        $required_hours = getStudentRequiredHours($conn, $ojt_student_id);
    }

    // Calculate student's OJT progress based on attendance records
    if ($ojt_student_id) {
        $progress_data = calculateStudentProgress($conn, $student_id, $required_hours);
    }

    // Decide which requirement set to show.
    $ojt_status_lower = strtolower(trim((string)$ojt_status));
    $is_pending_requirements = strpos($ojt_status_lower, 'pending requirement') !== false;
    $is_deployed = strpos($ojt_status_lower, 'deploy') !== false || strpos($ojt_status_lower, 'complete') !== false;

    if ($is_pending_requirements) {
        $requirements_type = 'pre';
        $show_requirements_card = true;
    } elseif ($is_deployed && $progress_data['progress_percent'] >= 100) {
        $requirements_type = 'post';
        $show_requirements_card = true;
    }

    if ($show_requirements_card && $ojt_student_id && $requirements_type) {
        $stmt = $conn->prepare("SELECT rt.id, rt.name, COALESCE(rs.status, 'pending') as status FROM ojt_requirement_templates rt LEFT JOIN ojt_requirement_submissions rs ON rt.id = rs.template_id AND rs.ojt_student_id = ? WHERE rt.type = ? AND rt.is_required = 1 AND (rs.file_url IS NULL OR TRIM(rs.file_url) = '') ORDER BY rt.display_order ASC, rt.id ASC");
        if ($stmt) {
            $stmt->bind_param("is", $ojt_student_id, $requirements_type);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $ojt_requirements[] = $row;
            }
            $stmt->close();
        }
    }

    // Get requirement deadlines for calendar
    if (!isset($ojt_department) || !$ojt_department) {
        $ojt_department = 'CCS';
    }
    $calendarStudentId = (int)($ojt_student_id ?? 0);
    $stmt = $conn->prepare("SELECT rt.name, rt.deadline FROM ojt_requirement_templates rt LEFT JOIN ojt_requirement_submissions rs ON rs.template_id = rt.id AND rs.ojt_student_id = ? WHERE rt.is_required = 1 AND rt.deadline IS NOT NULL AND (rt.department = ? OR rt.department IS NULL OR rt.department = '') AND (rs.file_url IS NULL OR TRIM(rs.file_url) = '') ORDER BY rt.deadline ASC, rt.id ASC");
    if ($stmt) {
        $stmt->bind_param("is", $calendarStudentId, $ojt_department);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $deadline = $row['deadline'];
            if (!isset($calendar_events[$deadline])) {
                $calendar_events[$deadline] = [];
            }
            $calendar_events[$deadline][] = [
                'text' => $row['name'] . ' Deadline',
                'cls' => 'event-yellow'
            ];
        }
        $stmt->close();
    } else {
        // Legacy schema fallback where department column may not exist yet.
        $fallbackStmt = $conn->prepare("SELECT rt.name, rt.deadline FROM ojt_requirement_templates rt LEFT JOIN ojt_requirement_submissions rs ON rs.template_id = rt.id AND rs.ojt_student_id = ? WHERE rt.is_required = 1 AND rt.deadline IS NOT NULL AND (rs.file_url IS NULL OR TRIM(rs.file_url) = '') ORDER BY rt.deadline ASC, rt.id ASC");
        if ($fallbackStmt) {
            $fallbackStmt->bind_param("i", $calendarStudentId);
            $fallbackStmt->execute();
            $result = $fallbackStmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $deadline = $row['deadline'];
                if (!isset($calendar_events[$deadline])) {
                    $calendar_events[$deadline] = [];
                }
                $calendar_events[$deadline][] = [
                    'text' => $row['name'] . ' Deadline',
                    'cls' => 'event-yellow'
                ];
            }
            $fallbackStmt->close();
        }
    }

    $conn->close();
}

// Extract progress values for template use
$odt_hours = $progress_data['completed_hours'];
$progress_percent = $progress_data['progress_percent'];
$remaining_hours = $progress_data['remaining_hours'];
$thesis_status_lower = strtolower($thesis_data['status'] ?? '');
$thesis_status_text = strtoupper($thesis_data['status'] ?? 'No Document');
$thesis_status_pill = $thesis_data['type'] ?? 'Document';
$is_deployed = strpos(strtolower((string)$ojt_status), 'deploy') !== false || strpos(strtolower((string)$ojt_status), 'complete') !== false;

if (!$thesis_data) {
    $thesis_status_class = 'thesis-gray';
    $thesis_status_text = 'NO DOCUMENT';
    $thesis_status_pill = 'No Link';
} elseif ($thesis_status_lower === 'approved') {
    $thesis_status_class = 'thesis-green';
} elseif ($thesis_status_lower === 'rejected' || $thesis_status_lower === 'returned') {
    $thesis_status_class = 'thesis-red';
} else {
    $thesis_status_class = 'thesis-yellow';
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CTA HTE Website | Dashboard</title>
    <link rel="icon" type="image/png" href="../images/CTA_HTE_icon.png">
    <link rel="stylesheet" href="../css/dashboard.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
</head>
<body>

<div class="dashboard-wrapper">
    <h2 class="page-title">DASHBOARD</h2>
    <div class="dashboard-layout">
        <section class="left-panel">
            <div class="panel card-strip">
                <button type="button" class="quick-icon" data-tooltip="Open profile modal" onclick="window.parent.openProfileModal()" aria-label="Open Profile">
                    <i class="fa-solid fa-circle-user"></i>
                    <span>Profile</span>
                </button>
                <a class="quick-icon" data-tooltip="Go to my documents" href="./thesiscap_submission.php" aria-label="Open My Documents">
                    <i class="fa-solid fa-file-invoice"></i>
                    <span>My Documents</span>
                </a>
                <button type="button" class="quick-icon" data-tooltip="Go to OJT menu" onclick="window.parent.document.getElementById('content-frame').src='ojt.php'" aria-label="Go To OJT">
                    <i class="fa-solid fa-building"></i>
                    <span>OJT</span>
                </button>
            </div>

            <div class="card-row">
                <!-- THESIS/CAPSTONE CARD (OLD DESIGN) -->
                <article class="card pending-card <?= $thesis_status_class ?>">
                    <div class="pending-top">
                        <div class="pending-icon"><i class="fa-regular fa-file-lines"></i></div>
                        <div class="pending-heading">
                            <h3><?= htmlspecialchars($thesis_status_text) ?></h3>
                            <span class="review-pill"><?= htmlspecialchars($thesis_status_pill) ?></span>
                        </div>
                    </div>
                    <?php if ($thesis_data): ?>
                        <p><span>TITLE</span><span id="pendingTitle"><?= htmlspecialchars($thesis_data['title']) ?></span></p>
                        <p><span>ADVISER</span><span id="pendingAdviser"><?= htmlspecialchars($thesis_data['advisor']) ?></span></p>
                        <a id="pendingLink" href="<?= htmlspecialchars($thesis_data['file_path']) ?>" target="_blank" rel="noopener noreferrer">
                            <i class="fa-regular fa-file-lines"></i> View Document <i class="fa-solid fa-angle-right"></i>
                        </a>
                    <?php else: ?>
                        <p><span>TITLE</span><span id="pendingTitle">No Document Linked</span></p>
                        <p><span>ADVISER</span><span id="pendingAdviser">-</span></p>
                        <a id="pendingLink" href="#" onclick="return false;" aria-disabled="true" style="opacity:.6; pointer-events:none;">
                            <i class="fa-regular fa-file-lines"></i> View Document <i class="fa-solid fa-angle-right"></i>
                        </a>
                    <?php endif; ?>
                </article>

                <!-- OJT DAILY TIME RECORD CARD (OLD DESIGN) -->
                <article class="card time-card">
                    <h4><i class="fa-regular fa-clock"></i> OJT Daily Time Record:</h4>
                    <div class="progress-wrap">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: <?= $progress_percent ?>%"></div>
                        </div>
                        <span class="progress-value"><?= $progress_percent ?>%</span>
                    </div>
                    <p>Remaining Time:</p>
                    <?php if ($remaining_hours <= 0): ?>
                        <strong style="color: white; font-weight: 700;">OJT Complete</strong>
                    <?php else: ?>
                        <strong><?= $remaining_hours ?> hours</strong>
                    <?php endif; ?>
                    <button type="button" onclick="window.parent.document.getElementById('content-frame').src='ojt.php?tab=attendance'">
                        <i class="fa-solid fa-right-to-bracket"></i> TIME IN
                    </button>
                </article>
            </div>

            <!-- OJT REQUIREMENTS CARD -->
            <?php if ($show_requirements_card): ?>
            <article class="panel req-card">
                <h4>OJT Requirements <?php if ($is_deployed && $progress_percent >= 100): ?>(Post-Requirements)<?php endif; ?></h4>
                <?php 
                  $ojt_status_lower = strtolower(trim((string)$ojt_status));
                  $is_ojt_complete = strpos($ojt_status_lower, 'ojt complete') !== false;
                  if ($is_ojt_complete): 
                ?>
                <div style="margin-bottom: 15px; padding: 12px 14px; background: rgba(15, 92, 18, 0.08); border-radius: 8px; border-left: 3px solid #0f5c12;">
                  <p style="color: white; font-weight: 600; margin: 0; font-size: 14px;">All OJT requirements completed successfully.</p>
                </div>
                <?php endif; ?>
                <?php if (!empty($ojt_requirements)): ?>
                    <p class="req-notice">
                        There are files not submitted.
                        <a href="#" onclick="window.parent.document.getElementById('content-frame').src='ojt.php?tab=<?= htmlspecialchars((string)$requirements_type) ?>&autoSubmit=1'; return false;">Submit now</a>
                    </p>
                <?php endif; ?>
                <div id="requirementsList">
                    <?php if (empty($ojt_requirements) && !$is_ojt_complete): ?>
                        <p class="no-requirements">No requirements to display</p>
                    <?php elseif (!empty($ojt_requirements)): ?>
                        <?php foreach ($ojt_requirements as $req): ?>
                            <div class="req-item status-<?= strtolower($req['status']) ?>">
                                <p><?= htmlspecialchars($req['name']) ?></p>
                                <button type="button" class="upload-requirement-btn" data-template-id="<?= (int)$req['id'] ?>" data-section="<?= htmlspecialchars((string)$requirements_type) ?>">
                                    Upload
                                </button>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </article>
            <?php endif; ?>
        </section>

        <aside class="panel calendar-panel">
            <div class="calendar-header">
                <h3><span id="calendarMonth">March</span> <span id="calendarYear">2025</span></h3>
                <div class="calendar-nav">
                    <button type="button" id="prevMonthBtn" aria-label="Previous month">‹</button>
                    <button type="button" id="nextMonthBtn" aria-label="Next month">›</button>
                </div>
            </div>
            <div class="calendar-days">
                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div class="calendar-grid" id="calendarGrid"></div>
            <div class="calendar-legend">
                <span><i class="legend-dot legend-yellow"></i> Requirement Deadline</span>
            </div>
        </aside>
    </div>
</div>
<script>
(() => {
    const monthLabel = document.getElementById('calendarMonth');
    const yearLabel = document.getElementById('calendarYear');
    const grid = document.getElementById('calendarGrid');
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const events = <?= json_encode($calendar_events, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?> || {};

    let activeDate = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function pad(num) {
        return String(num).padStart(2, '0');
    }

    function keyFor(year, monthIndex, day) {
        return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
    }

    function closeOpenDeadlinePopovers() {
        document.querySelectorAll('.calendar-cell.open').forEach((cell) => {
            cell.classList.remove('open');
        });
    }

    function renderCalendar() {
        const year = activeDate.getFullYear();
        const month = activeDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        monthLabel.textContent = monthNames[month];
        yearLabel.textContent = year;
        grid.innerHTML = '';

        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-cell empty';
            grid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';

            const dayNumber = document.createElement('div');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            cell.appendChild(dayNumber);

            const current = new Date(year, month, day);
            const eventList = events[keyFor(year, month, day)] || [];

            if (eventList.length === 1) {
                const eventItem = eventList[0];
                const eventTag = document.createElement('div');
                eventTag.className = `calendar-event ${eventItem.cls}`;
                eventTag.textContent = eventItem.text;
                eventTag.title = eventItem.text;
                cell.appendChild(eventTag);
            } else if (eventList.length > 1) {
                cell.classList.add('has-multiple-deadlines');

                const countTrigger = document.createElement('button');
                countTrigger.type = 'button';
                countTrigger.className = 'calendar-deadline-count';
                countTrigger.textContent = String(eventList.length);
                countTrigger.title = `${eventList.length} deadlines on this date`;
                countTrigger.setAttribute('aria-label', `${eventList.length} deadlines on this date`);

                const popover = document.createElement('div');
                popover.className = 'calendar-deadline-popover';

                const popoverTitle = document.createElement('div');
                popoverTitle.className = 'calendar-deadline-popover-title';
                popoverTitle.textContent = 'Deadlines';
                popover.appendChild(popoverTitle);

                const list = document.createElement('ul');
                list.className = 'calendar-deadline-list';
                eventList.forEach((eventItem) => {
                    const item = document.createElement('li');
                    item.textContent = eventItem.text;
                    list.appendChild(item);
                });
                popover.appendChild(list);

                countTrigger.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const isOpen = cell.classList.contains('open');
                    closeOpenDeadlinePopovers();
                    if (!isOpen) {
                        cell.classList.add('open');
                    }
                });

                cell.addEventListener('mouseenter', () => {
                    cell.classList.add('open');
                });

                cell.addEventListener('mouseleave', () => {
                    cell.classList.remove('open');
                });

                cell.appendChild(countTrigger);
                cell.appendChild(popover);
            }

            if (current.getTime() === today.getTime()) {
                const dot = document.createElement('div');
                dot.className = 'today-dot';
                cell.appendChild(dot);
            }

            grid.appendChild(cell);
        }
    }

    prevBtn.addEventListener('click', () => {
        activeDate = new Date(activeDate.getFullYear(), activeDate.getMonth() - 1, 1);
        closeOpenDeadlinePopovers();
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        activeDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 1);
        closeOpenDeadlinePopovers();
        renderCalendar();
    });

    document.addEventListener('click', () => {
        closeOpenDeadlinePopovers();
    });

    renderCalendar();
})();

// Handle requirement uploads
document.addEventListener('click', function(e) {
    if (e.target.closest('.upload-requirement-btn')) {
        const btn = e.target.closest('.upload-requirement-btn');
        const templateId = btn.getAttribute('data-template-id');
        const section = btn.getAttribute('data-section') || 'pre';
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.onchange = function() {
            if (fileInput.files[0]) {
                const formData = new FormData();
                formData.append('action', 'upload');
                formData.append('section', section);
                formData.append('requirement', `requirement_${templateId}`);
                formData.append('file', fileInput.files[0]);
                
                fetch('../php/ojt_upload.php', {
                    method: 'POST',
                    body: formData
                })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Upload failed: ' + (data.error || data.message || 'Unknown error'));
                    }
                })
                .catch(err => alert('Upload error: ' + err.message));
            }
        };
        fileInput.click();
    }
});
</script>

</body>
</html>