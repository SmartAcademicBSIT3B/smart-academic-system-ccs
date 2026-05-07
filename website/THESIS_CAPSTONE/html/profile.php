<?php
session_start();

// 🔐 PROTECT PAGE
if (!isset($_SESSION['student_id'])) {
    header("Location: ../login.php");
    exit();
}

// Include database config to get student data
$conn = include("../php/config.php");
$student_data = null;

if ($conn) {
    $sql = "SELECT * FROM students_user WHERE student_id = ? AND status = 'active'";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $_SESSION['student_id']);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $student_data = $result->fetch_assoc();
    }
    $stmt->close();
    $conn->close();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Profile</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="../css/profile.css">
</head>

<body>

<div class="profile-container">
    <h1>My Profile</h1>

    <div class="profile-content">
        <div class="profile-avatar">
            <i data-lucide="user" class="avatar-icon"></i>
        </div>

        <div class="profile-details">
            <div class="detail-group">
                <label>Student ID:</label>
                <span><?php echo htmlspecialchars($student_data['student_id'] ?? 'N/A'); ?></span>
            </div>

            <div class="detail-group">
                <label>Full Name:</label>
                <span><?php echo htmlspecialchars($student_data['name'] ?? 'N/A'); ?></span>
            </div>

            <div class="detail-group">
                <label>Email:</label>
                <span><?php echo htmlspecialchars($student_data['email'] ?? 'N/A'); ?></span>
            </div>

            <div class="detail-group">
                <label>Contact:</label>
                <span><?php echo htmlspecialchars($student_data['contact'] ?? 'N/A'); ?></span>
            </div>

            <div class="detail-group">
                <label>Status:</label>
                <span class="status-badge <?php echo strtolower($student_data['status'] ?? 'inactive'); ?>">
                    <?php echo htmlspecialchars(ucfirst($student_data['status'] ?? 'Inactive')); ?>
                </span>
            </div>
        </div>
    </div>
</div>

<script>
lucide.createIcons();
</script>

</body>
</html>