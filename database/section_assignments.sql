CREATE TABLE IF NOT EXISTS section_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  section_name VARCHAR(120) NOT NULL,
  professor_name VARCHAR(180) NOT NULL,
  date_assigned DATETIME NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_section_assignments_department (department),
  KEY idx_section_assignments_section (section_name),
  KEY idx_section_assignments_professor (professor_name),
  KEY idx_section_assignments_date (date_assigned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
