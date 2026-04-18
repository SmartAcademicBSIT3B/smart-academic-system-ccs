
CREATE TABLE IF NOT EXISTS ojt_students (
	id INT AUTO_INCREMENT PRIMARY KEY,
	student_id VARCHAR(120) NOT NULL,
	name VARCHAR(255) NOT NULL,
	section VARCHAR(120) NOT NULL,
	department VARCHAR(120) NOT NULL DEFAULT 'CCS',
	email VARCHAR(255) NULL,
	contact_no VARCHAR(50) NULL,
	status VARCHAR(120) NOT NULL DEFAULT 'Deployed',
	external_partner_assigned VARCHAR(255) NULL,
	nature_of_business VARCHAR(255) NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_ojt_students_student_id (student_id),
	INDEX idx_ojt_students_name (name),
	INDEX idx_ojt_students_section (section),
	INDEX idx_ojt_students_department (department),
	INDEX idx_ojt_students_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE ojt_students
SET department = 'CCS'
WHERE department IS NULL OR TRIM(department) = '';