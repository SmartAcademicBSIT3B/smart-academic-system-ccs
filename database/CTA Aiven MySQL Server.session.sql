ALTER TABLE external_partners
ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS' AFTER address;

UPDATE external_partners
SET department = 'CCS'
WHERE department IS NULL OR TRIM(department) = '';