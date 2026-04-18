CREATE TABLE IF NOT EXISTS external_partners (
	id INT AUTO_INCREMENT PRIMARY KEY,
	logo VARCHAR(512) NULL,
	company_name VARCHAR(255) NOT NULL,
	address VARCHAR(255) NOT NULL,
	company_email VARCHAR(255) NULL,
	company_contact VARCHAR(50) NULL,
	representative VARCHAR(255) NULL,
	job_description VARCHAR(255) NULL,
	representative_email VARCHAR(255) NULL,
	representative_contact VARCHAR(50) NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_external_partners_company_name (company_name),
	INDEX idx_external_partners_representative (representative)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
