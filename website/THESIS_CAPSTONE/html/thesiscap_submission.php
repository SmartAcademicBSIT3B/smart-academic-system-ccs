<?php
session_start();

// DEBUG: Store debug info for later output (not above table)
$debug_student_id = $_SESSION['student_id'];
$debug_archive_ids = [];
// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}

// DB connection
$conn = include("../php/config.php");
if (!$conn) {
    die("<div style='color:red'>Database connection failed.</div>");
}






$student_id = $_SESSION['student_id'];
$stmt = $conn->prepare("SELECT name FROM students_user WHERE student_id = ? LIMIT 1");
$stmt->bind_param("s", $student_id);
$stmt->execute();
$student_name = '';
$stmt->bind_result($student_name);
$stmt->fetch();
$stmt->close();

// Fetch all archives and filter by authors field
$stmt = $conn->prepare("SELECT id, title, section, advisor, date_published, department, type, status, authors, keywords, file_path, local_file_path FROM archives");
$stmt->execute();
$result = $stmt->get_result();
$archives_data = [];
$debug_archive_ids = [];
while ($row = $result->fetch_assoc()) {
    if (stripos($row['authors'], $student_name) !== false) {
        $archives_data[] = $row;
        $debug_archive_ids[] = $row['id'];
    }
}
$stmt->close();
$conn->close();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Thesis/Capstone Archive</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="../css/archives.css">
</head>

<body>

<div class="app">
    <div class="main">
        <div class="page">
            <h2 class="title">Thesis/Capstone Archive</h2>
            <p class="page-subtitle">Your linked thesis/capstone records are shown below with full details and document preview.</p>
            <?php if (empty($archives_data)): ?>
                <div class="archive-card-dark">
                    <p class="empty-text">No linked thesis/capstone found for your account.</p>
                </div>
            <?php else: ?>
            <div class="thesis-archive-stack">
                <?php foreach ($archives_data as $i => $archive): ?>
                    <?php $status_class = strtolower(preg_replace('/[^a-z0-9]+/', '-', (string) ($archive['status'] ?? 'unknown'))); ?>
                    <article class="thesis-archive-card archive-card-dark">
                        <div class="thesis-archive-head">
                            <h3 class="thesis-archive-title"><?= htmlspecialchars($archive['title']) ?></h3>
                            <span class="pro-status <?= htmlspecialchars($status_class) ?>"><?= htmlspecialchars($archive['status']) ?></span>
                        </div>

                        <div class="thesis-archive-grid">
                            <div class="darkcard-modal-row">
                                <span class="darkcard-label">Authors:</span>
                                <span class="darkcard-modal-value">
                                    <?php
                                        $authors_raw = html_entity_decode((string) ($archive['authors'] ?? ''), ENT_QUOTES);
                                        $authors_list = preg_split('/\s*(?:,|&|\band\b)\s*/i', $authors_raw);
                                    ?>
                                    <?php foreach ($authors_list as $author): ?>
                                        <?php if (trim($author) !== ''): ?>
                                            <span class="pro-author"><?= htmlspecialchars(trim($author)) ?></span>
                                        <?php endif; ?>
                                    <?php endforeach; ?>
                                </span>
                            </div>
                            <div class="darkcard-modal-row"><span class="darkcard-label">Section:</span> <span class="darkcard-modal-value"><?= htmlspecialchars($archive['linked_section'] ?? $archive['section']) ?></span></div>
                            <div class="darkcard-modal-row"><span class="darkcard-label">Advisor:</span> <span class="darkcard-modal-value"><?= htmlspecialchars($archive['advisor']) ?></span></div>
                            <div class="darkcard-modal-row"><span class="darkcard-label">Published:</span> <span class="darkcard-modal-value"><?= htmlspecialchars($archive['date_published']) ?></span></div>
                            <div class="darkcard-modal-row"><span class="darkcard-label">Department:</span> <span class="darkcard-modal-value"><?= htmlspecialchars($archive['linked_department'] ?? $archive['department']) ?></span></div>
                            <div class="darkcard-modal-row"><span class="darkcard-label">Type:</span> <span class="darkcard-modal-value"><?= htmlspecialchars($archive['type']) ?></span></div>
                        </div>

                        <div class="darkcard-modal-keywords-label">KEYWORDS</div>
                        <div class="darkcard-modal-keywords">
                            <?php foreach (explode(',', (string) ($archive['keywords'] ?? '')) as $kw): ?>
                                <?php if (trim($kw) !== ''): ?>
                                    <span class="keyword-tag"><?= htmlspecialchars(trim($kw)) ?></span>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </div>

                        <?php if (!empty($archive['file_path'])): ?>
                            <div class="thesis-preview-panel" data-file-url="<?= htmlspecialchars($archive['file_path'], ENT_QUOTES) ?>" data-title="<?= htmlspecialchars($archive['title'], ENT_QUOTES) ?>">
                                <div class="thesis-preview-header">
                                    <h4 class="thesis-preview-title">Document Preview</h4>
                                    <a href="<?= htmlspecialchars($archive['file_path'], ENT_QUOTES) ?>" target="_blank" rel="noopener noreferrer" class="pro-view-btn">
                                        <i data-lucide="external-link" aria-hidden="true"></i>
                                        View Document
                                    </a>
                                </div>
                                <p class="thesis-preview-state">Loading preview...</p>
                                <div class="thesis-preview-frame-wrap">
                                    <iframe class="thesis-preview-iframe" title="<?= htmlspecialchars($archive['title'], ENT_QUOTES) ?> document preview" loading="lazy"></iframe>
                                </div>
                            </div>
                        <?php else: ?>
                            <div class="thesis-preview-panel no-document">
                                <div class="thesis-preview-header">
                                    <h4 class="thesis-preview-title">Document Preview</h4>
                                </div>
                                <p class="thesis-preview-state">No document file is currently attached to this archive record.</p>
                            </div>
                        <?php endif; ?>
                    </article>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<script>
lucide.createIcons();

document.querySelectorAll('.thesis-preview-panel[data-file-url]').forEach(function(panel) {
    const fileUrl = panel.getAttribute('data-file-url');
    const frame = panel.querySelector('.thesis-preview-iframe');
    const stateLabel = panel.querySelector('.thesis-preview-state');
    let fallbackTriggered = false;
    let previewLoaded = false;

    function openFallback() {
        if (fallbackTriggered || !fileUrl) return;
        fallbackTriggered = true;
        panel.classList.add('preview-fallback-triggered');
        if (stateLabel) {
            stateLabel.textContent = 'Preview could not be embedded. Opening in a new tab...';
        }
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }

    function normalizeDrivePreviewUrl(url) {
        if (!url) return '';

        let parsed;
        try {
            parsed = new window.URL(url, window.location.origin);
        } catch (error) {
            return url;
        }

        const host = parsed.hostname.toLowerCase();
        if (!host.includes('drive.google.com')) {
            return url;
        }

        const filePathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
        const fileId = filePathMatch ? filePathMatch[1] : parsed.searchParams.get('id');
        if (!fileId) {
            return url;
        }

        // Use Drive's embeddable preview endpoint instead of /view links.
        return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview';
    }

    const previewUrl = normalizeDrivePreviewUrl(fileUrl);

    const timeoutId = window.setTimeout(function() {
        if (!previewLoaded) {
            openFallback();
        }
    }, 7000);

    frame.addEventListener('load', function() {
        previewLoaded = true;
        window.clearTimeout(timeoutId);
        panel.classList.add('preview-loaded');
        if (stateLabel) {
            stateLabel.textContent = 'Embedded preview loaded.';
        }
    });

    frame.addEventListener('error', function() {
        window.clearTimeout(timeoutId);
        openFallback();
    });

    try {
        frame.src = previewUrl || fileUrl;
    } catch (error) {
        window.clearTimeout(timeoutId);
        openFallback();
    }
});
</script>

</body>
</html>