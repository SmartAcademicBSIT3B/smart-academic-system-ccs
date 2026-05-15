<?php
session_start();

// If user is already logged in, redirect to main menu
if (isset($_SESSION['student_id'])) {
    header("Location: html/mainmenu.php");
    exit();
}

// Force logout is removed - sessions are now properly managed
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTA HTE Website | Login</title>
<link rel="icon" type="image/png" href="images/CTA_HTE_icon.png">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/login.css">
</head>

<body class="page-transition">

<div class="login-page">

    <!-- BACKGROUND -->
    <img src="./images/plp_courtyard.jpg" class="bg">
    <div class="overlay"></div>

    <!-- LOGIN CARD -->
    <div class="card">

        <!-- LEFT SIDE -->
        <div class="left">
            <div class="logos">
                <img src="./images/PLPLOGO.png">
                <img src="./images/PASIG.png">
            </div>

            <a href="landingpage.php" class="back-btn" data-page-nav="landing">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                 <path d="M15 18L9 12L15 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"/>
             </svg>
            </a>

            <p class="school">Pamantasan ng Lungsod ng Pasig’s</p>

            <h1>
                THESIS/CAPSTONE<br>
                ARCHIVING AND<br>
                HOST TRAINING<br>
                ESTABLISHMENT <br>
                (HTE)
            </h1>
        </div>

        <!-- RIGHT SIDE -->
        <div class="right">

            <h2>Login</h2>

            <!-- ✅ ERROR DISPLAY -->
            <p id="loginError" class="login-error"<?php if (!isset($_GET['error'])): ?> style="display:none;"<?php endif; ?>>
                <?php if (isset($_GET['error'])): ?><?php echo htmlspecialchars($_GET['error']); ?><?php endif; ?>
            </p>

            <!-- ✅ FORM ADDED -->
            <form id="loginForm" action="auth/login.php" method="POST" onsubmit="handleLoginSubmit(event)">

                <label>Email Address</label>
                <input type="email" id="loginEmail" name="email" required oninput="validateEmailTyping(this)">

                <label>Password</label>

                <div class="password-wrapper">
                    <input type="password" name="password" id="password" required>

                    <button type="button" class="toggle-password" onclick="togglePassword()">
                        <svg id="eyeIcon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
                                  stroke="currentColor"
                                  stroke-width="2"/>
                            <circle cx="12" cy="12" r="3"
                                    stroke="currentColor"
                                    stroke-width="2"/>
                        </svg>
                    </button>
                </div>

                <a href="#" class="forgot" onclick="openModal(); return false;">forgot password?</a>

                <div class="or">OR</div>

                <button type="button" class="google" onclick="loginWithGoogle()">
                    <img src="./images/google.png"> Continue with PLP Account
                </button>

                <!-- ✅ submit -->
                <button class="login-btn" type="submit">LOGIN</button>

            </form>

        </div>

    </div>

</div>


<!-- FORGOT PASSWORD MODAL -->
<div id="forgotModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2>Forgot Password</h2>
            <span class="close" onclick="closeModal()">&times;</span>
        </div>
        <div class="modal-body">
            <!-- Step 1: Enter Email -->
            <div id="emailStep">
                <label for="resetEmail">Enter your PLP email address</label>
                <input type="email" id="resetEmail" placeholder="Email Address" required>
                <button id="sendOtpBtn" type="button" onclick="sendOTP()">Send OTP</button>
                <div id="emailMessage" class="message"></div>
            </div>

            <!-- Step 2: Enter OTP -->
            <div id="otpStep" style="display:none;">
                <label for="otpCode">Enter the 6-digit OTP sent to your email</label>
                <input type="text" id="otpCode" maxlength="6" placeholder="Enter OTP" required>
                <button id="resendOtpBtn" type="button" onclick="resendOTP()">Resend OTP</button>
                <button type="button" onclick="verifyOTP()">Verify OTP</button>
                <div id="otpMessage" class="message"></div>
            </div>

            <!-- Step 3: Reset Password -->
            <div id="passwordStep" style="display:none;">
                <label for="newPassword">New Password</label>
                <input type="password" id="newPassword" placeholder="New Password" required>
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" placeholder="Confirm Password" required>
                <button type="button" onclick="resetPassword()">Reset Password</button>
                <div id="passwordMessage" class="message"></div>
            </div>
        </div>
    </div>
</div>

<!-- ACCOUNT REACTIVATION MODAL -->
<div id="reactivateModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2>Account Reactivation</h2>
            <span class="close" onclick="closeReactivateModal()">&times;</span>
        </div>
        <div class="modal-body">
            <p>Your account has been temporarily locked due to too many failed login attempts.<br>
            Please enter the OTP sent to your email to reactivate your account.</p>
            <input type="email" id="reactivateEmail" placeholder="Email Address" required>
            <button onclick="sendReactivationOTP()">Send OTP</button>
            <input type="text" id="reactivateOtp" placeholder="Enter OTP" maxlength="6" style="margin-top:10px;">
            <button onclick="verifyReactivationOTP()">Reactivate Account</button>
            <div id="reactivateMessage" class="message"></div>
        </div>
    </div>
</div>

<script>
window.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('page-ready');
});

function navigateWithFade(url) {
    document.body.classList.add('page-exit');
    setTimeout(function() {
        window.location.href = url;
    }, 280);
}

document.addEventListener('click', function(event) {
    const pageNav = event.target.closest('[data-page-nav="landing"]');
    if (pageNav) {
        event.preventDefault();
        navigateWithFade('landingpage.php');
    }
});

// Show reactivation modal if error=locked in URL
window.addEventListener('DOMContentLoaded', function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'locked') {
        const email = params.get('email') || '';
        openReactivateModal(email);
    }
});
// --- Reactivation Modal JS ---
function openReactivateModal(email) {
    document.getElementById('reactivateModal').style.display = 'block';
    document.getElementById('reactivateEmail').value = email || '';
    document.getElementById('reactivateMessage').innerHTML = '';
}
function closeReactivateModal() {
    document.getElementById('reactivateModal').style.display = 'none';
}
function sendReactivationOTP() {
    const email = document.getElementById('reactivateEmail').value;
    if (!email) {
        showMessage('reactivateMessage', 'Please enter your email address', false);
        return;
    }
    // Disable button to prevent spam and start cooldown
    const btns = document.querySelectorAll('#reactivateModal button');
    const sendBtn = btns[0];
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    fetch('auth/reactivate_send_otp.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=' + encodeURIComponent(email)
    })
    .then(res => res.json())
    .then(data => {
        // Always show the real backend message
        showMessage('reactivateMessage', data.message, !!data.success);
        if (data.success) {
            startReactivationCooldown(sendBtn, 60); // 60 seconds cooldown
        } else {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send OTP';
        }
    })
    .catch((err) => {
        showMessage('reactivateMessage', 'Network error: ' + (err && err.message ? err.message : 'Failed to send OTP. Please try again.'), false);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP';
    });
}
function verifyReactivationOTP() {
    const email = document.getElementById('reactivateEmail').value;
    const otp = document.getElementById('reactivateOtp').value;
    if (!otp || otp.length !== 6) {
        showMessage('reactivateMessage', 'Please enter a valid 6-digit OTP', false);
        return;
    }
    // Disable button to prevent spam
    const btns = document.querySelectorAll('#reactivateModal button');
    btns[1].disabled = true;
    btns[1].textContent = 'Verifying...';
    fetch('auth/reactivate_verify_otp.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=' + encodeURIComponent(email) + '&otp=' + encodeURIComponent(otp)
    })
    .then(res => res.json())
    .then(data => {
        showMessage('reactivateMessage', data.message, data.success);
        if (data.success) {
            setTimeout(() => { closeReactivateModal(); window.location.href = 'login.php'; }, 2000);
        }
    })
    .catch(() => {
        showMessage('reactivateMessage', 'Failed to verify OTP. Please try again.', false);
    })
    .finally(() => {
        btns[1].disabled = false;
        btns[1].textContent = 'Reactivate Account';
    });
}
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.innerHTML = `
            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
                  stroke="currentColor"
                  stroke-width="2"/>
            <circle cx="12" cy="12" r="3"
                    stroke="currentColor"
                    stroke-width="2"/>
            <line x1="1" y1="1" x2="23" y2="23"
                  stroke="currentColor"
                  stroke-width="2"/>
        `;
    } else {
        passwordInput.type = 'password';
        eyeIcon.innerHTML = `
            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
                  stroke="currentColor"
                  stroke-width="2"/>
            <circle cx="12" cy="12" r="3"
                    stroke="currentColor"
                    stroke-width="2"/>
        `;
    }
}

function openModal() {
    document.getElementById('forgotModal').style.display = 'block';
    document.getElementById('emailStep').style.display = 'block';
    document.getElementById('otpStep').style.display = 'none';
    document.getElementById('passwordStep').style.display = 'none';
    document.getElementById('resetEmail').value = '';
    document.getElementById('otpCode').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    clearMessages();
}

function closeModal() {
    document.getElementById('forgotModal').style.display = 'none';
    clearMessages();
}

function clearMessages() {
    const messages = ['emailMessage', 'otpMessage', 'passwordMessage'];
    messages.forEach(id => {
        const element = document.getElementById(id);
        element.innerHTML = '';
        element.className = 'message';
    });
}


// Cooldown for reactivation OTP send button (make global)
function startReactivationCooldown(button, seconds) {
    let remaining = seconds;
    button.disabled = true;
    button.textContent = `Resend in ${remaining}s`;
    const interval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
            button.textContent = `Resend in ${remaining}s`;
        } else {
            clearInterval(interval);
            button.disabled = false;
            button.textContent = 'Send OTP';
        }
    }, 1000);
}

function showMessage(elementId, message, isSuccess) {
    const element = document.getElementById(elementId);
    element.innerHTML = message;
    element.className = `message ${isSuccess ? 'success' : 'error'}`;
}

function sendOTP() {
    const email = document.getElementById('resetEmail').value;
    const sendBtn = document.getElementById('sendOtpBtn');

    if (!email) {
        showMessage('emailMessage', 'Please enter your email address', false);
        return;
    }

    // Validate email domain - show tooltip
    if (!email.endsWith('@plpasig.edu.ph')) {
        const emailInput = document.getElementById('resetEmail');
        emailInput.setCustomValidity('Only plpasig.edu.ph email addresses are allowed');
        emailInput.reportValidity();
        return;
    }

    // Disable button to prevent spam
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';
    sendBtn.style.cursor = 'not-allowed';
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Sending...';

    fetch('auth/forgot_password.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'email=' + encodeURIComponent(email)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('emailMessage', data.message, true);
            document.getElementById('emailStep').style.display = 'none';
            document.getElementById('otpStep').style.display = 'block';
        } else {
            showMessage('emailMessage', data.message, false);
            // Re-enable button on error
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
            sendBtn.textContent = originalText;
        }
    })
    .catch(error => {
        showMessage('emailMessage', 'An error occurred. Please try again.', false);
        // Re-enable button on error
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        sendBtn.textContent = originalText;
    });
}

function verifyOTP() {
    const email = document.getElementById('resetEmail').value;
    const otp = document.getElementById('otpCode').value;

    if (!otp || otp.length !== 6) {
        showMessage('otpMessage', 'Please enter a valid 6-digit OTP', false);
        return;
    }

    fetch('auth/verify_otp.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'email=' + encodeURIComponent(email) + '&otp=' + encodeURIComponent(otp)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('otpMessage', data.message, true);
            document.getElementById('otpStep').style.display = 'none';
            document.getElementById('passwordStep').style.display = 'block';
        } else {
            showMessage('otpMessage', data.message, false);
        }
    })
    .catch(error => {
        showMessage('otpMessage', 'An error occurred. Please try again.', false);
    });
}

function resendOTP() {
    const resendBtn = document.getElementById('resendOtpBtn');
    const email = document.getElementById('resetEmail').value;

    // Validate email domain - show tooltip
    if (!email.endsWith('@plpasig.edu.ph')) {
        const emailInput = document.getElementById('resetEmail');
        emailInput.setCustomValidity('Only plpasig.edu.ph email addresses are allowed');
        emailInput.reportValidity();
        return;
    }

    // Disable button to prevent spam
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.6';
    resendBtn.style.cursor = 'not-allowed';
    const originalText = resendBtn.textContent;
    resendBtn.textContent = 'Resending...';

    fetch('auth/forgot_password.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'email=' + encodeURIComponent(email)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('otpMessage', 'OTP resent successfully!', true);
            // Add cooldown - re-enable after 60 seconds
            let countdown = 60;
            resendBtn.textContent = `Resend in ${countdown}s`;
            const timer = setInterval(() => {
                countdown--;
                resendBtn.textContent = `Resend in ${countdown}s`;
                if (countdown === 0) {
                    clearInterval(timer);
                    resendBtn.disabled = false;
                    resendBtn.style.opacity = '1';
                    resendBtn.style.cursor = 'pointer';
                    resendBtn.textContent = originalText;
                }
            }, 1000);
        } else {
            showMessage('otpMessage', data.message, false);
            // Re-enable button on error
            resendBtn.disabled = false;
            resendBtn.style.opacity = '1';
            resendBtn.style.cursor = 'pointer';
            resendBtn.textContent = originalText;
        }
    })
    .catch(error => {
        showMessage('otpMessage', 'An error occurred. Please try again.', false);
        // Re-enable button on error
        resendBtn.disabled = false;
        resendBtn.style.opacity = '1';
        resendBtn.style.cursor = 'pointer';
        resendBtn.textContent = originalText;
    });
}

function resetPassword() {
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!password || !confirmPassword) {
        showMessage('passwordMessage', 'Please fill in all fields', false);
        return;
    }

    if (password.length < 8) {
        showMessage('passwordMessage', 'Password must be at least 8 characters long', false);
        return;
    }

    if (password !== confirmPassword) {
        showMessage('passwordMessage', 'Passwords do not match', false);
        return;
    }

    fetch('auth/reset_password.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'password=' + encodeURIComponent(password) + '&confirm_password=' + encodeURIComponent(confirmPassword)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('passwordMessage', data.message, true);
            setTimeout(() => {
                closeModal();
                alert('Password reset successfully! You can now log in with your new password.');
            }, 2000);
        } else {
            showMessage('passwordMessage', data.message, false);
        }
    })
    .catch(error => {
        showMessage('passwordMessage', 'An error occurred. Please try again.', false);
    });
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('forgotModal');
    if (event.target === modal) {
        closeModal();
    }
}

function loginWithGoogle() {
    // Redirect to Google OAuth handler
    navigateWithFade('auth/google_login.php');
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function clearLoginError() {
    const errorEl = document.getElementById('loginError');
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.style.display = 'none';
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    clearLoginError();

    if (!validateLoginEmail()) {
        return false;
    }

    const form = document.getElementById('loginForm');
    const submitButton = form.querySelector('.login-btn');
    const originalText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'LOGGING IN...';

    try {
        const formData = new FormData(form);
        const response = await fetch(form.action, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: new URLSearchParams(formData)
        });

        const data = await response.json();

        if (data.success) {
            navigateWithFade(data.redirect || 'html/mainmenu.php');
            return true;
        }

        showLoginError(data.message || 'Invalid Email or Password');

        if (data.locked) {
            openReactivateModal(data.email || document.getElementById('loginEmail').value || '');
        }
    } catch (error) {
        showLoginError('Unable to log in right now. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }

    return false;
}

// Validate email as user types - show tooltip on wrong domain
function validateEmailTyping(input) {
    const email = input.value;
    if (email && !email.endsWith('@plpasig.edu.ph')) {
        input.setCustomValidity('Only plpasig.edu.ph email addresses are allowed');
        input.reportValidity();
    } else {
        input.setCustomValidity('');
    }
}

// Validate login email domain on form submit
function validateLoginEmail() {
    const email = document.getElementById('loginEmail').value;

    if (!email.endsWith('@plpasig.edu.ph')) {
        // Show native tooltip popup
        const emailInput = document.getElementById('loginEmail');
        emailInput.setCustomValidity('Only plpasig.edu.ph email addresses are allowed');
        emailInput.reportValidity();
        return false;
    }

    return true;
}
</script>
</body>
</html>