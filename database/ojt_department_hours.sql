-- OJT Department Hours Configuration Table
-- Stores required OJT hours by department and section prefix
-- Created: May 2026

CREATE TABLE IF NOT EXISTS ojt_department_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(120) NOT NULL,
  section_prefix VARCHAR(50) NOT NULL,
  required_hours INT NOT NULL DEFAULT 480,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_dept_section (department, section_prefix),
  INDEX idx_department (department),
  INDEX idx_section_prefix (section_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert initial data for BSIT and BSCS programs
INSERT IGNORE INTO ojt_department_hours (department, section_prefix, required_hours, notes)
VALUES
  ('CCS', 'BSIT', 468, 'Bachelor of Science in Information Technology'),
  ('CCS', 'BSCS', 156, 'Bachelor of Science in Computer Science'),
  ('CCS', 'CCS', 480, 'Default Computer Science hours');
