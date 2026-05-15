<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="3;url=landingpage.php">
<title>CTA HTE Website</title>
<link rel="icon" type="image/png" href="images/CTA_HTE_icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
    --ink: #0f2238;
    --deep: #0b3558;
    --sky: #0f6ca8;
    --gold: #f2b705;
    --card: #ffffff;
}

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    width: 100%;
    min-height: 100%;
    font-family: "Manrope", sans-serif;
    color: var(--ink);
    overflow: hidden;
}

body {
    display: grid;
    place-items: center;
    min-height: 100vh;
    background: #ffffff;
}

.shell {
    width: min(92vw, 760px);
    padding: clamp(20px, 4vw, 40px);
    border-radius: 24px;
    background: var(--card);
    border: 1px solid rgba(15, 34, 56, 0.12);
    box-shadow: 0 12px 36px rgba(6, 24, 39, 0.12);
    animation: shellIn 700ms ease-out both;
}

.header {
    display: flex;
    align-items: center;
    gap: 16px;
}

.logo {
    width: clamp(56px, 9vw, 74px);
    height: clamp(56px, 9vw, 74px);
    object-fit: contain;
}

.title {
    margin: 0;
    font-size: clamp(1rem, 2.4vw, 1.3rem);
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--deep);
}

.subtitle {
    margin: 4px 0 0;
    font-size: clamp(0.82rem, 1.9vw, 0.95rem);
    color: rgba(15, 34, 56, 0.8);
}

.loader-wrap {
    margin-top: 26px;
}

.loader-head {
    margin-bottom: 16px;
}

.loader-label {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--deep);
}

.spinner {
    width: 52px;
    height: 52px;
    margin: 0 auto;
    border: 5px solid rgba(15, 108, 168, 0.18);
    border-top-color: var(--sky);
    border-radius: 50%;
    animation: spin 900ms linear infinite;
}

.status {
    margin: 16px 0 0;
    font-size: 0.94rem;
    color: rgba(15, 34, 56, 0.76);
    text-align: center;
    animation: statusFlicker 1.6s linear infinite;
}

.footer-logos {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 20px;
}

.footer-logos img {
    width: 36px;
    height: 36px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(11, 53, 88, 0.2));
}

@keyframes shellIn {
    0% {
        opacity: 0;
        transform: translateY(22px) scale(0.98);
    }
    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

@keyframes statusFlicker {
    0% {
        opacity: 0.6;
    }
    40% {
        opacity: 1;
    }
    70% {
        opacity: 0.7;
    }
    100% {
        opacity: 1;
    }
}

@media (max-width: 560px) {
    .shell {
        border-radius: 18px;
        padding: 20px 16px;
    }

    .header {
        align-items: flex-start;
    }

    .footer-logos img {
        width: 32px;
        height: 32px;
    }
}
</style>
</head>
<body>
<div class="shell" role="status" aria-live="polite" aria-label="CTA HTE Website Loading">
    <div class="header">
        <img src="images/PLPLOGO.png" class="logo" alt="PLP Logo">
        <div>
            <h1 class="title">Thesis/Capstone Archiving and Host Training Establishment (HTE)</h1>
            <p class="subtitle">Preparing your Thesis and OJT portal...</p>
        </div>
    </div>

    <div class="loader-wrap">
        <div class="loader-head">
            <p class="loader-label">Loading Portal</p>
        </div>
        <div class="spinner" aria-hidden="true"></div>
        <p class="status" id="statusText">Initializing secure session and assets...</p>
    </div>

    <div class="footer-logos">
        <img src="images/PASIG.png" alt="Pasig City Logo">
        <img src="images/PLPLOGO.png" alt="PLP Logo">
        <img src="images/CCSLOGO.png" alt="CCS Logo">
    </div>
</div>

<script>
(function () {
    var statusNode = document.getElementById("statusText");
    var milestones = [
        "Initializing secure session and assets...",
        "Loading academic and internship modules...",
        "Finalizing interface and route checks..."
    ];

    var milestoneIndex = 0;
    var tick = setInterval(function () {
        milestoneIndex = (milestoneIndex + 1) % milestones.length;
        statusNode.textContent = milestones[milestoneIndex];
    }, 900);

    window.setTimeout(function () {
        clearInterval(tick);
        window.location.href = "landingpage.php";
    }, 3000);
})();
</script>
</body>
</html>
