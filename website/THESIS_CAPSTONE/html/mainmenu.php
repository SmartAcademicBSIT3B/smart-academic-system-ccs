<?php
session_start();

// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}

// Fetch student OJT profile (JOIN students_user + ojt_students on student_id)
$conn = include("../php/config.php");
$student_profile = null;
if ($conn) {
    try {
        $sql = "SELECT s.*, o.*
                FROM students_user s
                LEFT JOIN ojt_students o ON s.student_id = o.student_id
                WHERE s.student_id = ?
                LIMIT 1";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("s", $_SESSION['student_id']);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
            $student_profile = $result->fetch_assoc();
        }
        $stmt->close();
    } catch (Exception $e) {
        // Query failed — profile will show N/A fields
    }
    $conn->close();
}

$profile_image_url = $student_profile['profile_image_url'] ?? '';
?>

<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>CTA HTE Website | Main Menu</title>
<link rel="icon" type="image/png" href="../images/CTA_HTE_icon.png">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/lucide@latest"></script>
<link rel="stylesheet" href="../css/mainmenu.css">
</head>

<body>

<div class="layout">

<!-- SIDEBAR -->
<div class="sidebar">

    <div class="logo">
        <img src="../images/PLPLOGO.png" class="plp-logo">
        <h2 class="system-title">
            Thesis/Capstone<br>
            Archiving and<br>
            Host Training<br>
            Establishment System
        </h2>
    </div>

    <ul class="menu">

        <li class="menu-item active" onclick="loadPage('dashboard.php', this)">
            <div class="menu-left">
                <i data-lucide="layout-dashboard"></i>
                <span>Dashboard</span>
            </div>
        </li>

        <li class="menu-item" onclick="loadPage('thesiscap_submission.php', this)">
            <div class="menu-left">
                <i data-lucide="archive"></i>
                <span>My Thesis/Capstone Archive</span>
            </div>
        </li>
        <li class="menu-item" onclick="loadPage('ojt.php', this)">
            <div class="menu-left">
                <i data-lucide="building"></i>
                <span>On-the-Job Training (OJT)</span>
            </div>
        </li>

    </ul>

</div>

<!-- SIDEBAR BACKDROP -->
<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>

<!-- MAIN -->
<div class="main-content">

    <div class="header">
        <div class="header-left">
            <button class="sidebar-toggle" type="button" onclick="toggleSidebar()" aria-label="Toggle sidebar">
                <i data-lucide="menu"></i>
            </button>
            <h1>Welcome, <span><?php echo $_SESSION['name']; ?></span></h1>
        </div>

        <div class="profile-dropdown">
            <div class="profile-icon" onclick="toggleProfileMenu(event)">
                <span class="profile-icon-fallback" aria-hidden="true">
                    <i data-lucide="user"></i>
                </span>
                <img id="headerAvatarImg"
                     src="<?php echo htmlspecialchars($profile_image_url); ?>"
                     alt="Profile"
                     style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:<?php echo $profile_image_url !== '' ? 'block' : 'none'; ?>;">
            </div>

            <div class="profile-menu">
                <button onclick="openProfileModal()">My Profile</button>
                <button onclick="window.location.href='../auth/logout.php'">
                    Logout
                </button>
            </div>
        </div>
    </div>

    <div class="page-content">
        <iframe id="content-frame" src="dashboard.php"></iframe>
    </div>

</div>

</div>

<!-- PROFILE MODAL -->
<div class="pm-overlay" id="pmOverlay">
    <div class="pm-box">
        <div class="pm-header">
            <h3>My Profile</h3>
            <button class="pm-close" onclick="closeProfileModal()">&#x2715;</button>
        </div>
        <div class="pm-body">
            <div class="pm-avatar-section">
                <div class="pm-avatar-wrap" onclick="triggerImageUpload()" title="Click to change photo">
                    <div class="pm-avatar-fallback" aria-hidden="true">
                        <i data-lucide="user"></i>
                    </div>
                    <img id="pmAvatarImg"
                         src="<?php echo htmlspecialchars($profile_image_url); ?>"
                         alt="Profile Photo"
                         style="display:<?php echo $profile_image_url !== '' ? 'block' : 'none'; ?>;">
                    <div class="pm-avatar-overlay">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        <span>Change Photo</span>
                    </div>
                </div>
                <input type="file" id="pmImageInput" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="uploadProfileImage(this)">
                <p class="pm-avatar-hint">Click photo to upload</p>
            </div>
            <div class="pm-fields">
                <div class="pm-field">
                    <span class="pm-label">Name</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['name'] ?? $_SESSION['name'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Student ID</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['student_id'] ?? $_SESSION['student_id'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Section</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['section'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Department</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['department'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Email</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['email'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Contact No.</span>
                    <div class="pm-editable">
                        <input type="text" id="pmContactInput" class="pm-edit-input"
                            value="<?php echo htmlspecialchars($student_profile['contact_no'] ?? ''); ?>"
                            placeholder="Enter contact number"
                            maxlength="20">
                        <button class="pm-edit-btn" onclick="saveContactNumber(this)">Save</button>
                        <span class="pm-edit-msg" id="pmContactMsg"></span>
                    </div>
                </div>
                <div class="pm-field">
                    <span class="pm-label">Status</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['status'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field pm-full">
                    <span class="pm-label">External Partner</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['external_partner_assigned'] ?? 'N/A'); ?></span>
                </div>
                <div class="pm-field pm-full">
                    <span class="pm-label">Nature of Business</span>
                    <span class="pm-value"><?php echo htmlspecialchars($student_profile['nature_of_business'] ?? 'N/A'); ?></span>
                </div>
            </div>

            <!-- CHANGE PASSWORD SECTION -->
            <div class="pm-pw-section">
                <div class="pm-pw-toggle" onclick="togglePwSection(this)">
                    <span>&#x1F512; Change Password</span>
                    <span class="pm-pw-arrow">&#x25BE;</span>
                </div>
                <div class="pm-pw-body" id="pmPwBody">
                    <div class="pm-pw-fields">
                        <div class="pm-field pm-full">
                            <span class="pm-label">Current Password</span>
                            <div class="pm-pw-wrapper">
                                <input type="password" id="pmCurrentPw" class="pm-pw-input with-eye" placeholder="Enter current password" autocomplete="current-password">
                                <button type="button" class="pm-toggle-pw inside" tabindex="-1" onclick="togglePwVisibility('pmCurrentPw', this)" aria-label="Show/Hide Password">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="pm-field">
                            <span class="pm-label">New Password</span>
                            <div class="pm-pw-wrapper">
                                <input type="password" id="pmNewPw" class="pm-pw-input with-eye" placeholder="New password" autocomplete="new-password" oninput="checkPasswordMatch()">
                                <button type="button" class="pm-toggle-pw inside" tabindex="-1" onclick="togglePwVisibility('pmNewPw', this)" aria-label="Show/Hide Password">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="pm-field">
                            <span class="pm-label">Confirm New Password</span>
                            <div class="pm-pw-wrapper">
                                <input type="password" id="pmConfirmPw" class="pm-pw-input with-eye" placeholder="Confirm new password" autocomplete="new-password" oninput="checkPasswordMatch()">
                                <button type="button" class="pm-toggle-pw inside" tabindex="-1" onclick="togglePwVisibility('pmConfirmPw', this)" aria-label="Show/Hide Password">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                                </button>
                            </div>
                            <span id="pmPwMatchMsg" class="pm-pw-match-msg" style="color:#d32f2f;font-size:13px;display:none;margin-top:2px;">Passwords do not match.</span>
                        </div>
                    </div>
                    <div class="pm-pw-msg" id="pmPwMsg"></div>
                    <div class="pm-pw-actions">
                        <button class="pm-pw-btn" onclick="submitChangePassword()">Update Password</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
lucide.createIcons();

function isMobileSidebarMode() {
    if (!window.matchMedia) return false;
    return window.matchMedia('(max-width: 1000px), (hover: none) and (pointer: coarse)').matches;
}

function syncSidebarMode() {
    const isMobile = isMobileSidebarMode();
    document.body.classList.toggle('nav-mobile', isMobile);
    if (!isMobile) closeSidebar();
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar || !backdrop) return;

    const willOpen = !sidebar.classList.contains('open');

    sidebar.classList.toggle('open', willOpen);
    backdrop.classList.toggle('show', willOpen);
    document.body.classList.toggle('sidebar-open', willOpen);

    // ✅ ADD THIS: force expanded view agad
    if (willOpen) {
        sidebar.classList.add('expanded');
    } else {
        sidebar.classList.remove('expanded');
    }
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar || !backdrop) return;

    sidebar.classList.remove('open');
    sidebar.classList.remove('expanded'); // ✅ ADD THIS
    backdrop.classList.remove('show');
    document.body.classList.remove('sidebar-open');
}
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
});

window.addEventListener('resize', () => {
    syncSidebarMode();
});

window.addEventListener('DOMContentLoaded', () => {
    syncSidebarMode();
    // Ensure backdrop exists
    let backdrop = document.getElementById('sidebarBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.id = 'sidebarBackdrop';
        backdrop.onclick = closeSidebar;
        document.querySelector('.layout').appendChild(backdrop);
    }
});

// Toggle password visibility for a given input
function togglePwVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const svg = btn.querySelector('svg');
    if (input.type === 'password') {
        input.type = 'text';
        svg.innerHTML = `<path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"/>`;
    } else {
        input.type = 'password';
        svg.innerHTML = `<path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>`;
    }
}

// Real-time password match check
function checkPasswordMatch() {
    const newPw = document.getElementById('pmNewPw').value;
    const confirmPw = document.getElementById('pmConfirmPw').value;
    const msg = document.getElementById('pmPwMatchMsg');
    if (confirmPw.length > 0 && newPw !== confirmPw) {
        msg.style.display = 'inline';
    } else {
        msg.style.display = 'none';
    }
}

function setAvatarState(hasImage, imageSrc) {
    const headerImg = document.getElementById('headerAvatarImg');
    const modalImg = document.getElementById('pmAvatarImg');
    const wrappers = [
        document.querySelector('.profile-icon'),
        document.querySelector('.pm-avatar-wrap')
    ];

    wrappers.forEach(function(wrapper) {
        if (!wrapper) return;
        if (hasImage) {
            wrapper.classList.add('has-image');
        } else {
            wrapper.classList.remove('has-image');
        }
    });

    if (hasImage && imageSrc) {
        if (headerImg) {
            headerImg.src = imageSrc;
            headerImg.style.display = 'block';
        }
        if (modalImg) {
            modalImg.src = imageSrc;
            modalImg.style.display = 'block';
        }
        return;
    }

    if (headerImg) {
        headerImg.removeAttribute('src');
        headerImg.style.display = 'none';
    }
    if (modalImg) {
        modalImg.removeAttribute('src');
        modalImg.style.display = 'none';
    }
}

setAvatarState(<?php echo $profile_image_url !== '' ? 'true' : 'false'; ?>, <?php echo json_encode($profile_image_url); ?>);

function toggleMenu(element) {
    const submenu = element.nextElementSibling;
    const arrow = element.querySelector('.arrow');

    if (submenu) submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotate');
}

function toggleProfileMenu(event) {
    event.stopPropagation();
    document.querySelector(".profile-menu").classList.toggle("show");
}

function loadPage(page, element) {
    document.getElementById("content-frame").src = page;

    // Clear active states from both main menu items and submenu items
    document.querySelectorAll(".menu-item, .submenu li").forEach(item => {
        item.classList.remove("active");
    });

    // Highlight the clicked item (submenu <li> doesn't have .menu-item)
    if (element) element.classList.add("active");

    // If a submenu item was clicked, also highlight its parent dropdown menu item
    if (element && element.matches(".submenu li")) {
        const submenu = element.closest(".submenu");
        const parentDropdown = submenu ? submenu.previousElementSibling : null;
        if (parentDropdown && parentDropdown.classList.contains("menu-item")) {
            parentDropdown.classList.add("active");
        }
    }

    // Close off-canvas sidebar after navigation on small screens
    if (isMobileSidebarMode()) closeSidebar();
}

function openProfileModal() {
    document.getElementById('pmOverlay').classList.add('show');
    document.querySelector('.profile-menu').classList.remove('show');
    // Reset password fields
    ['pmCurrentPw','pmNewPw','pmConfirmPw'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pmPwMsg').textContent = '';
    document.getElementById('pmPwMsg').className = 'pm-pw-msg';
    const body = document.getElementById('pmPwBody');
    if (body.classList.contains('open')) {
        body.classList.remove('open');
        body.previousElementSibling.querySelector('.pm-pw-arrow').style.transform = '';
    }
}

function closeProfileModal() {
    document.getElementById('pmOverlay').classList.remove('show');
}

function triggerImageUpload() {
    document.getElementById('pmImageInput').click();
}

function uploadProfileImage(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('profile_image', file);
    fetch('../php/upload_profile_image.php', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const newSrc = data.path + '?t=' + Date.now();
            setAvatarState(true, newSrc);
        } else {
            alert('Upload failed: ' + data.message);
        }
    })
    .catch(() => alert('Upload error. Please try again.'));
}

document.getElementById('pmOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeProfileModal();
});

function togglePwSection(toggle) {
    const body = document.getElementById('pmPwBody');
    const arrow = toggle.querySelector('.pm-pw-arrow');
    body.classList.toggle('open');
    arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}

function saveContactNumber(btn) {
    const input = document.getElementById('pmContactInput');
    const msg   = document.getElementById('pmContactMsg');
    const val   = input.value.trim();

    msg.className = 'pm-edit-msg';
    if (!val) {
        msg.textContent = 'Contact number cannot be empty.';
        msg.classList.add('pm-edit-error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    const fd = new FormData();
    fd.append('contact_no', val);

    fetch('../php/update_contact.php', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            msg.textContent = 'Saved!';
            msg.classList.add('pm-edit-success');
        } else {
            msg.textContent = data.message || 'Failed to save.';
            msg.classList.add('pm-edit-error');
        }
    })
    .catch(() => {
        msg.textContent = 'Server error.';
        msg.classList.add('pm-edit-error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Save';
        setTimeout(() => { msg.textContent = ''; msg.className = 'pm-edit-msg'; }, 3000);
    });
}

function submitChangePassword() {
    const current = document.getElementById('pmCurrentPw').value.trim();
    const newPw   = document.getElementById('pmNewPw').value.trim();
    const confirm = document.getElementById('pmConfirmPw').value.trim();
    const msg     = document.getElementById('pmPwMsg');

    msg.className = 'pm-pw-msg';
    if (!current || !newPw || !confirm) {
        msg.textContent = 'Please fill in all password fields.';
        msg.classList.add('pm-pw-error');
        return;
    }
    if (newPw.length < 6) {
        msg.textContent = 'New password must be at least 6 characters.';
        msg.classList.add('pm-pw-error');
        return;
    }
    if (newPw !== confirm) {
        msg.textContent = 'New passwords do not match.';
        msg.classList.add('pm-pw-error');
        // Show tooltip for mismatch
        const matchMsg = document.getElementById('pmPwMatchMsg');
        matchMsg.style.display = 'inline';
        document.getElementById('pmConfirmPw').focus();
        return;
    } else {
        document.getElementById('pmPwMatchMsg').style.display = 'none';
    }

    const btn = document.querySelector('.pm-pw-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    const formData = new FormData();
    formData.append('current_password', current);
    formData.append('new_password', newPw);

    fetch('../php/change_password.php', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            msg.textContent = 'Password updated successfully!';
            msg.classList.add('pm-pw-success');
            ['pmCurrentPw','pmNewPw','pmConfirmPw'].forEach(id => document.getElementById(id).value = '');
        } else {
            msg.textContent = data.message || 'Failed to update password.';
            msg.classList.add('pm-pw-error');
        }
    })
    .catch(() => {
        msg.textContent = 'Server error. Please try again.';
        msg.classList.add('pm-pw-error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Update Password';
    });
}
</script>

</body>
</html>