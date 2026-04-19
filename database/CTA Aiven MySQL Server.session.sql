ALTER TABLE users
ADD COLUMN department VARCHAR(20) AFTER role;

UPDATE users
SET department = 'CCS'
WHERE department IS NULL OR TRIM(department) = '';