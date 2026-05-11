-- OJT student weekly schedule table
CREATE TABLE IF NOT EXISTS ojt_student_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ojt_student_id INT NOT NULL,
    student_id_ref VARCHAR(120) NOT NULL,
    start_date DATE NULL,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    time_in TIME NOT NULL,
    time_out TIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    department VARCHAR(120) NOT NULL DEFAULT 'CCS',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_oss_student_day (ojt_student_id, day_of_week),
    INDEX idx_oss_student (ojt_student_id),
    INDEX idx_oss_day (day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
