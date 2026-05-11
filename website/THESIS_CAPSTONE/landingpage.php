<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">

<!-- ICONS -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="css/landingpage.css">
</head>

<body class="page-transition">

<!-- STICKY HEADER -->
<header class="sticky-header" id="stickyHeader">
    <div class="header-content">
        <div class="logo-area">
            <img src="./images/PLPLOGO.png" alt="PLP Logo">
            <div>
                <b>PAMANTASAN NG LUNGSOD NG PASIG</b><br>
                <span>University of Pasig</span>
            </div>
        </div>

        <div class="nav">
            <a href="login.php" class="page-nav-login">Login</a>
            <a href="#">About</a>
        </div>
    </div>
</header>

<div class="hero-section">

    <img src="./images/plp_courtyard.jpg" class="bg" id="parallaxBg">
    <div class="overlay"></div>

    <!-- HEADER (HERO) -->
    <div class="header" id="heroHeader">
        <div class="logo-area">
            <img src="./images/PLPLOGO.png" alt="PLP Logo">
            <div>
                <b>PAMANTASAN NG LUNGSOD NG PASIG</b><br>
                <span>University of Pasig</span>
            </div>
        </div>

        <div class="nav">
            <a href="login.php" class="page-nav-login">Login</a>
            <a href="#">About</a>
        </div>
    </div>

    <!-- HERO TEXT -->
    <div class="hero-content" id="heroContent">
        <h1>
            THESIS/CAPSTONE<br>
            ARCHIVING AND<br>
            HOST TRAINING<br>
            ESTABLISHMENT (HTE)<br>
            FOR GRADUATING STUDENTS
        </h1>

        <p>Track, manage and verify your internship in real-time</p>

        <button class="btn-primary page-nav-login" data-target="login.php">LOGIN</button>
    </div>

</div>

<!-- FEATURES -->
<section class="features">

    <div class="feature">
        <i class="fa-solid fa-file-lines"></i>
        <p>Submit your requirements<br>without hassle.</p>
    </div>

    <div class="feature">
        <i class="fa-solid fa-clock"></i>
        <p>Track your progress<br>real-time.</p>
    </div>

    <div class="feature">
        <i class="fa-solid fa-pen-to-square"></i>
        <p>Record your daily<br>activities.</p>
    </div>

    <div class="feature">
        <i class="fa-solid fa-circle-check"></i>
        <p>Get your work validated<br>instantly.</p>
    </div>

</section>

<!-- CTA -->
<section class="cta">
    <h2>Start progressing your internship now!</h2>
    <button class="btn-primary page-nav-login" data-target="login.php">LOGIN</button>
</section>

<!-- FOOTER -->
<footer class="footer">
    <img src="./images/PASIG.png" alt="Pasig Logo">
	<img src="./images/PLPLOGO.png" alt="PLP Logo">
	<img src="./images/CCSLOGO.png" alt="CCS Logo">
	<p>PAMANTASAN NG LUNGSOD NG PASIG</p>
    <p>Acalde Jose St. Kapasigan, Pasig City &nbsp; +123 4567 90</p>
    <a href="#">About the Website</a>
</footer>

<script>
    document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('page-ready');
    });

    function navigateWithFade(url) {
        document.body.classList.add('page-exit');
        setTimeout(() => {
            window.location.href = url;
        }, 280);
    }

    document.querySelectorAll('a.page-nav-login').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            navigateWithFade('login.php');
        });
    });

    document.querySelectorAll('button.page-nav-login').forEach(button => {
        button.addEventListener('click', () => {
            navigateWithFade(button.dataset.target || 'login.php');
        });
    });

    // Parallax Scrolling Effect
    const parallaxBg = document.getElementById('parallaxBg');
    const stickyHeader = document.getElementById('stickyHeader');
    const heroHeader = document.getElementById('heroHeader');
    
    const STICKY_SHOW_AT = 90;
    const STICKY_HIDE_AT = 35;
    let isStickyShown = false;
    let isTicking = false;

    function updateScrollEffects() {
        const scrollY = window.scrollY;

        // Parallax background movement (depth effect)
        if (parallaxBg) {
            parallaxBg.style.transform = `translateY(${scrollY * 0.4}px)`;
        }

        // Sticky header with hysteresis to avoid abrupt flicker
        if (!isStickyShown && scrollY >= STICKY_SHOW_AT) {
            isStickyShown = true;
            stickyHeader.classList.add('active');
            heroHeader.classList.add('hidden');
        } else if (isStickyShown && scrollY <= STICKY_HIDE_AT) {
            isStickyShown = false;
            stickyHeader.classList.remove('active');
            heroHeader.classList.remove('hidden');
        }

        isTicking = false;
    }

    window.addEventListener('scroll', () => {
        if (!isTicking) {
            window.requestAnimationFrame(updateScrollEffects);
            isTicking = true;
        }
    });

    updateScrollEffects();
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
</script>

</body>
</html>