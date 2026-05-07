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
    <!-- MAIN AREA -->
    <div class="main">
        <!-- PAGE CONTENT -->
        <div class="page">


            <h2 class="title">Thesis/Capstone Archive</h2>
            <?php if (empty($archives_data)): ?>
                <div class="archive-card-dark">
                    <p class="empty-text">No linked thesis/capstone found for your account.</p>
                </div>
            <?php else: ?>
            <div class="mobile-swipe-hint" role="note" aria-label="Swipe hint">
                Swipe left/right to see more columns.
            </div>
            <div class="archive-table-container archive-card-dark">
            <table class="themed-archive-table" style="background:transparent;">
                <thead>
                    <tr>
                        <th style="min-width:220px;">Title</th>
                        <th>Section</th>
                        <th>Advisor</th>
                        <th>Published</th>
                        <th>Department</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th style="min-width:160px;">Authors</th>
                        <th style="min-width:180px;">Keywords</th>
                        <th>View</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($archives_data as $i => $archive): ?>
                    <tr class="<?= $i % 2 === 0 ? 'pro-row-even' : 'pro-row-odd' ?>">
                        <td class="pro-title-cell"> <?= htmlspecialchars($archive['title']) ?> </td>
                        <td><?= htmlspecialchars($archive['linked_section'] ?? $archive['section']) ?></td>
                        <td><?= htmlspecialchars($archive['advisor']) ?></td>
                        <td><?= htmlspecialchars($archive['date_published']) ?></td>
                        <td><?= htmlspecialchars($archive['linked_department'] ?? $archive['department']) ?></td>
                        <td><?= htmlspecialchars($archive['type']) ?></td>
                        <td><span class="pro-status <?= strtolower(htmlspecialchars($archive['status'])) ?>"> <?= htmlspecialchars($archive['status']) ?> </span></td>
                        <td class="pro-authors-cell">
                            <?php foreach (explode(',', $archive['authors']) as $author): ?>
                                <span class="pro-author"> <?= htmlspecialchars(trim($author)) ?> </span>
                            <?php endforeach; ?>
                        </td>
                        <td class="pro-keywords-cell">
                            <?php foreach (explode(',', $archive['keywords']) as $kw): ?>
                                <span class="keyword-tag"> <?= htmlspecialchars(trim($kw)) ?> </span>
                            <?php endforeach; ?>
                        </td>
                        <td class="col-view">
                            <button type="button" class="view-modal-btn pro-view-btn" data-index="<?= $i ?>" title="View Details" <?= empty($archive['file_path']) ? 'disabled' : '' ?>><i data-lucide="eye" aria-hidden="true"></i></button>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            </div>
            <?php endif; ?>
            <!-- DEBUG OUTPUT REMOVED -->
        </div>
    </div>
</div>

<!-- Modal Structure -->
<div id="archiveModal" class="themed-modal-bg">
    <div id="modalContent" class="darkcard-modal-content">
        <button id="closeModal" class="themed-modal-close" title="Close"><i data-lucide="x"></i></button>
        <div id="modalDetails"></div>
    </div>
</div>

<script>
lucide.createIcons();

// Prepare archive data for modal
const archivesData = <?php echo json_encode($archives_data); ?>;

function showModal(index) {
    const archive = archivesData[index];
    let html = '';
    html += `<div class='darkcard-modal-inner'>`;
    html += `<h2 class='darkcard-modal-title'>${archive.title ? escapeHtml(archive.title) : ''}</h2>`;
    if (archive.authors) {
        html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Authors:</span> <span class='darkcard-modal-value'>${archive.authors.split(',').map(a=>escapeHtml(a.trim())).join(', ')}</span></div>`;
    }
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Section:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.linked_section || archive.section || '')}</span></div>`;
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Advisor:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.advisor || '')}</span></div>`;
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Published:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.date_published || '')}</span></div>`;
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Department:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.linked_department || archive.department || '')}</span></div>`;
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Type:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.type || '')}</span></div>`;
    html += `<div class='darkcard-modal-row'><span class='darkcard-label'>Status:</span> <span class='darkcard-modal-value'>${escapeHtml(archive.status || '')}</span></div>`;
    html += `<div class='darkcard-modal-keywords-label'>KEYWORDS</div>`;
    html += `<div class='darkcard-modal-keywords'>`;
    if (archive.keywords) {
        html += archive.keywords.split(',').map(k=>`<span class='keyword-tag'>${escapeHtml(k.trim())}</span>`).join(' ');
    }
    html += `</div>`;
    if (archive.file_path) {
        html += `<a href='${escapeHtml(archive.file_path)}' target='_blank' rel='noopener noreferrer' class='pro-view-btn'><i data-lucide='external-link' aria-hidden='true'></i> View Document</a>`;
    }
    html += `</div>`;
    document.getElementById('modalDetails').innerHTML = html;
    document.getElementById('archiveModal').style.display = 'flex';
    lucide.createIcons();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]);
    });
}

document.querySelectorAll('.view-modal-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        showModal(this.getAttribute('data-index'));
    });
});

document.getElementById('closeModal').onclick = function() {
    document.getElementById('archiveModal').style.display = 'none';
};
// Close modal on outside click
document.getElementById('archiveModal').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
});
</script>

</body>
</html>