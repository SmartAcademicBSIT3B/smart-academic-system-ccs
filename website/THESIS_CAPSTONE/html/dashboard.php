<?php
session_start();

// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Dashboard</title>
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
                <button type="button" class="quick-icon" data-tooltip="View pending submission card" data-action="focusPending" aria-label="Focus Pending Card">
                    <i class="fa-solid fa-bell"></i>
                    <span>Notifications</span>
                </button>
                <a class="quick-icon" data-tooltip="Open your OJT profile page" href="./ojt.php?tab=pre" aria-label="Open OJT Profile">
                    <i class="fa-solid fa-circle-user"></i>
                    <span>Profile</span>
                </a>
                <a class="quick-icon" data-tooltip="Go to archived requirements" href="./thesiscap_submission.php" aria-label="Open Archived Requirements">
                    <i class="fa-solid fa-box-archive"></i>
                    <span>Archives</span>
                </a>
                <button type="button" class="quick-icon" data-tooltip="Jump calendar to current month" data-action="jumpToday" aria-label="Jump To Current Month">
                    <i class="fa-solid fa-building"></i>
                    <span>OJT</span>
                </button>
            </div>

            <div class="card-row">
                <article class="panel card pending-card">
                    <div class="pending-top">
                        <div class="pending-icon">
                            <i class="fa-regular fa-file-lines"></i>
                        </div>
                        <div class="pending-heading">
                            <h3 id="pendingStatus">PENDING</h3>
                            <span class="review-pill">Review</span>
                        </div>
                    </div>
                    <p><span>TITLE</span> <span id="pendingTitle">Thesis/Capstone Archiving and Host Training Establishment by CCS</span></p>
                    <p><span>ADVISER</span> <span id="pendingAdviser">Noreen A. Perez</span></p>
                    <a id="pendingLink" href="#"><i class="fa-regular fa-file-lines"></i> View Document <i class="fa-solid fa-angle-right"></i></a>
                </article>

                <article class="panel card time-card">
                    <h4><i class="fa-regular fa-clock"></i> OJT Daily Time Record:</h4>
                    <div class="progress-wrap">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <span class="progress-value" id="progressValue">45%</span>
                    </div>
                    <p>Remaining Time:</p>
                    <strong id="remainingHours">316 hours</strong>
                    <button type="button"><i class="fa-solid fa-right-to-bracket"></i> TIME IN</button>
                </article>
            </div>

            <article class="panel req-card">
                <h4>OJT Requirements</h4>
                <div id="requirementsList">
                    <div class="req-item">
                        <p>Memorandum of Agreement (MOA)</p>
                        <button type="button" class="upload-requirement-btn" data-requirement-key="MOA">Upload</button>
                    </div>
                    <div class="req-item">
                        <p>Curriculum Vitae (CV)</p>
                        <button type="button" class="upload-requirement-btn" data-requirement-key="CV">Upload</button>
                    </div>
                </div>
                <a class="req-shortcut-btn" href="./thesiscap_submission.php">ARCHIVES</a>
            </article>
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
                <span><i class="legend-dot legend-yellow"></i> Holiday / Event</span>
                <span><i class="legend-dot legend-red"></i> Task / Research</span>
                <span><i class="legend-dot legend-blue"></i> Meeting / Delivery</span>
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

    const events = {
        '2025-03-01': [{ text: 'Ethics Day', cls: 'event-yellow' }],
        '2025-03-03': [{ text: 'Research 1', cls: 'event-red' }],
        '2025-03-05': [{ text: 'Client Meeting', cls: 'event-blue' }],
        '2025-03-09': [{ text: 'Analysis', cls: 'event-red' }],
        '2025-03-10': [{ text: 'Research 2', cls: 'event-red' }],
        '2025-03-12': [{ text: 'UI Delivery', cls: 'event-blue' }]
    };

    let activeDate = new Date(2025, 2, 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function pad(num) {
        return String(num).padStart(2, '0');
    }

    function keyFor(year, monthIndex, day) {
        return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
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

            eventList.slice(0, 2).forEach((eventItem) => {
                const eventTag = document.createElement('div');
                eventTag.className = `calendar-event ${eventItem.cls}`;
                eventTag.textContent = eventItem.text;
                eventTag.title = eventItem.text;
                cell.appendChild(eventTag);
            });

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
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        activeDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 1);
        renderCalendar();
    });

    const REQUIREMENTS_STORAGE_KEY = 'ojtRequirements';
    const requirementLabels = {
        MOA: 'Memorandum of Agreement (MOA)',
        CV: 'Curriculum Vitae (CV)'
    };
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);

    function loadRequirements() {
        try {
            const raw = localStorage.getItem(REQUIREMENTS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function saveRequirements(nextValue) {
        localStorage.setItem(REQUIREMENTS_STORAGE_KEY, JSON.stringify(nextValue));
    }

    function updateRequirementButtons() {
        const data = loadRequirements();
        document.querySelectorAll('.upload-requirement-btn').forEach((button) => {
            const key = button.dataset.requirementKey;
            const item = data[key];
            button.textContent = item ? 'Re-upload' : 'Upload';
            button.title = item ? `Last file: ${item.fileName}` : `Upload ${requirementLabels[key]}`;
        });
    }

    let selectedRequirementKey = null;
    document.querySelectorAll('.upload-requirement-btn').forEach((button) => {
        button.addEventListener('click', () => {
            selectedRequirementKey = button.dataset.requirementKey;
            input.value = '';
            input.click();
        });
    });

    input.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file || !selectedRequirementKey) {
            return;
        }

        const current = loadRequirements();
        current[selectedRequirementKey] = {
            fileName: file.name,
            submittedAt: new Date().toISOString(),
            source: 'dashboard'
        };
        saveRequirements(current);
        updateRequirementButtons();
        selectedRequirementKey = null;
    });

    window.addEventListener('storage', (event) => {
        if (event.key === REQUIREMENTS_STORAGE_KEY) {
            updateRequirementButtons();
        }
    });

    updateRequirementButtons();

    const pendingCard = document.querySelector('.pending-card');
    const quickIcons = document.querySelectorAll('.quick-icon[data-action]');

    quickIcons.forEach((icon) => {
        icon.addEventListener('click', () => {
            const action = icon.dataset.action;

            if (action === 'focusPending' && pendingCard) {
                pendingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                pendingCard.classList.add('card-highlight');
                window.setTimeout(() => pendingCard.classList.remove('card-highlight'), 1400);
            }

            if (action === 'jumpToday') {
                activeDate = new Date(today.getFullYear(), today.getMonth(), 1);
                renderCalendar();
            }
        });
    });
    renderCalendar();
})();
</script>

</body>
</html>