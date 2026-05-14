<?php

if (!function_exists('ojt_policy_defaults')) {
    function ojt_policy_defaults() {
        return [
            'preRateLimitPerDay' => 10,
            'postRateLimitPerDay' => 10,
            'dailyRateLimitPerDay' => 5,
            'weeklyRateLimitPerDay' => 3,
            'preMaxFileSizeMB' => 25,
            'postMaxFileSizeMB' => 25,
            'dailyMaxFileSizeMB' => 25,
            'weeklyMaxFileSizeMB' => 25,
        ];
    }

    function ojt_policy_normalize_positive_int($value, $fallback, $max = 1000) {
        $parsed = (int)$value;
        if ($parsed < 1) {
            return (int)$fallback;
        }
        return min($parsed, (int)$max);
    }

    function ojt_policy_ensure_tables($conn) {
        $settingsSql = "CREATE TABLE IF NOT EXISTS ojt_requirements_manager_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            department VARCHAR(120) NOT NULL,
            pre_rate_limit_per_day INT NOT NULL DEFAULT 10,
            post_rate_limit_per_day INT NOT NULL DEFAULT 10,
            daily_rate_limit_per_day INT NOT NULL DEFAULT 5,
            weekly_rate_limit_per_day INT NOT NULL DEFAULT 3,
            pre_max_file_size_mb INT NOT NULL DEFAULT 25,
            post_max_file_size_mb INT NOT NULL DEFAULT 25,
            daily_max_file_size_mb INT NOT NULL DEFAULT 25,
            weekly_max_file_size_mb INT NOT NULL DEFAULT 25,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_orms_department (department)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

        $activitySql = "CREATE TABLE IF NOT EXISTS ojt_upload_activity (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            department VARCHAR(120) NOT NULL,
            student_id_ref VARCHAR(120) NOT NULL,
            upload_category ENUM('pre', 'post', 'daily', 'weekly') NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_oua_lookup (department, student_id_ref, upload_category, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

        return $conn->query($settingsSql) && $conn->query($activitySql);
    }

    function ojt_policy_get_for_department($conn, $department) {
        $dept = trim((string)$department);
        if ($dept === '') {
            $dept = 'CCS';
        }

        if (!ojt_policy_ensure_tables($conn)) {
            return ojt_policy_defaults();
        }

        $stmt = $conn->prepare('SELECT * FROM ojt_requirements_manager_settings WHERE department = ? LIMIT 1');
        if (!$stmt) {
            return ojt_policy_defaults();
        }

        $stmt->bind_param('s', $dept);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res ? $res->fetch_assoc() : null;
        $stmt->close();

        $defaults = ojt_policy_defaults();

        if (!$row) {
            $insert = $conn->prepare('INSERT INTO ojt_requirements_manager_settings (department, pre_rate_limit_per_day, post_rate_limit_per_day, daily_rate_limit_per_day, weekly_rate_limit_per_day, pre_max_file_size_mb, post_max_file_size_mb, daily_max_file_size_mb, weekly_max_file_size_mb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            if ($insert) {
                $insert->bind_param(
                    'siiiiiiii',
                    $dept,
                    $defaults['preRateLimitPerDay'],
                    $defaults['postRateLimitPerDay'],
                    $defaults['dailyRateLimitPerDay'],
                    $defaults['weeklyRateLimitPerDay'],
                    $defaults['preMaxFileSizeMB'],
                    $defaults['postMaxFileSizeMB'],
                    $defaults['dailyMaxFileSizeMB'],
                    $defaults['weeklyMaxFileSizeMB']
                );
                $insert->execute();
                $insert->close();
            }
            return $defaults;
        }

        return [
            'preRateLimitPerDay' => ojt_policy_normalize_positive_int($row['pre_rate_limit_per_day'] ?? null, $defaults['preRateLimitPerDay'], 100),
            'postRateLimitPerDay' => ojt_policy_normalize_positive_int($row['post_rate_limit_per_day'] ?? null, $defaults['postRateLimitPerDay'], 100),
            'dailyRateLimitPerDay' => ojt_policy_normalize_positive_int($row['daily_rate_limit_per_day'] ?? null, $defaults['dailyRateLimitPerDay'], 100),
            'weeklyRateLimitPerDay' => ojt_policy_normalize_positive_int($row['weekly_rate_limit_per_day'] ?? null, $defaults['weeklyRateLimitPerDay'], 100),
            'preMaxFileSizeMB' => ojt_policy_normalize_positive_int($row['pre_max_file_size_mb'] ?? null, $defaults['preMaxFileSizeMB'], 50),
            'postMaxFileSizeMB' => ojt_policy_normalize_positive_int($row['post_max_file_size_mb'] ?? null, $defaults['postMaxFileSizeMB'], 50),
            'dailyMaxFileSizeMB' => ojt_policy_normalize_positive_int($row['daily_max_file_size_mb'] ?? null, $defaults['dailyMaxFileSizeMB'], 50),
            'weeklyMaxFileSizeMB' => ojt_policy_normalize_positive_int($row['weekly_max_file_size_mb'] ?? null, $defaults['weeklyMaxFileSizeMB'], 50),
        ];
    }

    function ojt_policy_values_for_category($policy, $category) {
        $type = strtolower(trim((string)$category));
        if ($type === 'post') {
            return [
                'category' => 'post',
                'rateLimitPerDay' => (int)($policy['postRateLimitPerDay'] ?? 10),
                'maxFileSizeMB' => (int)($policy['postMaxFileSizeMB'] ?? 25),
                'label' => 'Post Requirements',
            ];
        }
        if ($type === 'daily') {
            return [
                'category' => 'daily',
                'rateLimitPerDay' => (int)($policy['dailyRateLimitPerDay'] ?? 5),
                'maxFileSizeMB' => (int)($policy['dailyMaxFileSizeMB'] ?? 25),
                'label' => 'Daily Reports',
            ];
        }
        if ($type === 'weekly') {
            return [
                'category' => 'weekly',
                'rateLimitPerDay' => (int)($policy['weeklyRateLimitPerDay'] ?? 3),
                'maxFileSizeMB' => (int)($policy['weeklyMaxFileSizeMB'] ?? 25),
                'label' => 'Weekly Reports',
            ];
        }

        return [
            'category' => 'pre',
            'rateLimitPerDay' => (int)($policy['preRateLimitPerDay'] ?? 10),
            'maxFileSizeMB' => (int)($policy['preMaxFileSizeMB'] ?? 25),
            'label' => 'Pre Requirements',
        ];
    }

    function ojt_policy_check_daily_upload_limit($conn, $department, $studentIdRef, $category, $rateLimitPerDay) {
        $rateLimit = (int)$rateLimitPerDay;
        if ($rateLimit < 1) {
            return [
                'ok' => true,
                'total' => 0,
            ];
        }

        $dept = trim((string)$department);
        if ($dept === '') {
            $dept = 'CCS';
        }

        $studentId = trim((string)$studentIdRef);
        $uploadCategory = strtolower(trim((string)$category));

        $stmt = $conn->prepare('SELECT COUNT(*) AS total FROM ojt_upload_activity WHERE department = ? AND student_id_ref = ? AND upload_category = ? AND created_at >= (NOW() - INTERVAL 1 DAY)');
        if (!$stmt) {
            return [
                'ok' => true,
                'total' => 0,
            ];
        }

        $stmt->bind_param('sss', $dept, $studentId, $uploadCategory);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res ? $res->fetch_assoc() : null;
        $stmt->close();

        $total = (int)($row['total'] ?? 0);
        return [
            'ok' => $total < $rateLimit,
            'total' => $total,
        ];
    }

    function ojt_policy_track_upload_activity($conn, $department, $studentIdRef, $category) {
        $dept = trim((string)$department);
        if ($dept === '') {
            $dept = 'CCS';
        }

        $studentId = trim((string)$studentIdRef);
        $uploadCategory = strtolower(trim((string)$category));

        $stmt = $conn->prepare('INSERT INTO ojt_upload_activity (department, student_id_ref, upload_category) VALUES (?, ?, ?)');
        if (!$stmt) {
            return false;
        }

        $stmt->bind_param('sss', $dept, $studentId, $uploadCategory);
        $ok = $stmt->execute();
        $stmt->close();
        return (bool)$ok;
    }

    function ojt_policy_validate_uploaded_file_size($fileInfo, $maxFileSizeMB) {
        $maxMB = max(1, (int)$maxFileSizeMB);
        $maxBytes = $maxMB * 1024 * 1024;
        $size = (int)($fileInfo['size'] ?? 0);
        if ($size <= 0) {
            return null;
        }

        if ($size > $maxBytes) {
            return 'File exceeds the maximum allowed size of ' . $maxMB . 'MB.';
        }

        return null;
    }
}
