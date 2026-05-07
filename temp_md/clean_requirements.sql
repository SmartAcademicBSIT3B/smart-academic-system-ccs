-- ============================================================================
-- SQL SCRIPT: Clean and Repair ojt_requirement_submissions Table
-- ============================================================================
-- This script will:
-- 1. Remove orphaned records (NULL or 0 ojt_student_id)
-- 2. Remove records with invalid template_id references
-- 3. Remove records with invalid ojt_student_id references
-- 4. Remove duplicate (ojt_student_id, template_id) entries (keeps most recent)
-- 5. Fix empty student_id_ref values
-- 6. Verify data integrity
-- ============================================================================

-- Step 1: Backup before cleaning (optional)
-- CREATE TABLE ojt_requirement_submissions_backup AS SELECT * FROM ojt_requirement_submissions;

-- ============================================================================
-- DIAGNOSIS: Check current state before cleaning
-- ============================================================================

SELECT '=== DIAGNOSIS BEFORE CLEANING ===' as message;

-- Total records
SELECT CONCAT('Total submissions: ', COUNT(*)) as summary
FROM ojt_requirement_submissions;

-- Orphaned records (NULL ojt_student_id)
SELECT CONCAT('Orphaned records (NULL ojt_student_id): ', COUNT(*)) as summary
FROM ojt_requirement_submissions
WHERE ojt_student_id IS NULL OR ojt_student_id = 0;

-- Invalid template references
SELECT CONCAT('Invalid template_id references: ', COUNT(*)) as summary
FROM ojt_requirement_submissions ors
LEFT JOIN ojt_requirement_templates ort ON ors.template_id = ort.id
WHERE ort.id IS NULL;

-- Invalid student references
SELECT CONCAT('Invalid ojt_student_id references: ', COUNT(*)) as summary
FROM ojt_requirement_submissions ors
LEFT JOIN ojt_students os ON ors.ojt_student_id = os.id
WHERE os.id IS NULL AND ors.ojt_student_id IS NOT NULL;

-- Duplicates
SELECT CONCAT('Duplicate (ojt_student_id, template_id) groups: ', COUNT(*)) as summary
FROM (
  SELECT ojt_student_id, template_id, COUNT(*) as cnt
  FROM ojt_requirement_submissions
  GROUP BY ojt_student_id, template_id
  HAVING cnt > 1
) as dupes;

-- ============================================================================
-- CLEANING: Remove bad data
-- ============================================================================

SELECT '' as message;
SELECT '=== STARTING CLEANUP ===' as message;

-- 1. Delete orphaned records
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id IS NULL OR ojt_student_id = 0;

SELECT CONCAT('✓ Step 1: Deleted orphaned records') as progress;

-- 2. Delete records with invalid template_id
DELETE FROM ojt_requirement_submissions
WHERE template_id NOT IN (
  SELECT id FROM ojt_requirement_templates
);

SELECT CONCAT('✓ Step 2: Deleted records with invalid template_id') as progress;

-- 3. Delete records with invalid ojt_student_id
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id NOT IN (
  SELECT id FROM ojt_students WHERE id IS NOT NULL
);

SELECT CONCAT('✓ Step 3: Deleted records with invalid ojt_student_id') as progress;

-- 4. Handle duplicates - delete all but the most recent for each (ojt_student_id, template_id) pair
DELETE FROM ojt_requirement_submissions
WHERE id NOT IN (
  SELECT * FROM (
    SELECT MAX(id) as max_id
    FROM ojt_requirement_submissions
    GROUP BY ojt_student_id, template_id
  ) as subquery
) AND (ojt_student_id, template_id) IN (
  SELECT ojt_student_id, template_id
  FROM ojt_requirement_submissions
  GROUP BY ojt_student_id, template_id
  HAVING COUNT(*) > 1
);

SELECT CONCAT('✓ Step 4: Deleted duplicate records (kept most recent)') as progress;

-- 5. Fix empty student_id_ref - populate from ojt_students table
UPDATE ojt_requirement_submissions ors
INNER JOIN ojt_students os ON ors.ojt_student_id = os.id
SET ors.student_id_ref = os.student_id
WHERE ors.student_id_ref IS NULL OR ors.student_id_ref = '';

SELECT CONCAT('✓ Step 5: Fixed empty student_id_ref values') as progress;

-- ============================================================================
-- VERIFICATION: Check state after cleaning
-- ============================================================================

SELECT '' as message;
SELECT '=== VERIFICATION AFTER CLEANING ===' as message;

-- Total valid records
SELECT CONCAT('✓ Total valid submissions: ', COUNT(*)) as summary
FROM ojt_requirement_submissions;

-- Remaining orphaned records (should be 0)
SELECT CONCAT('✓ Orphaned records: ', COUNT(*)) as summary
FROM ojt_requirement_submissions
WHERE ojt_student_id IS NULL OR ojt_student_id = 0;

-- Remaining invalid template references (should be 0)
SELECT CONCAT('✓ Invalid template_id references: ', COUNT(*)) as summary
FROM ojt_requirement_submissions ors
LEFT JOIN ojt_requirement_templates ort ON ors.template_id = ort.id
WHERE ort.id IS NULL;

-- Remaining invalid student references (should be 0)
SELECT CONCAT('✓ Invalid ojt_student_id references: ', COUNT(*)) as summary
FROM ojt_requirement_submissions ors
LEFT JOIN ojt_students os ON ors.ojt_student_id = os.id
WHERE os.id IS NULL AND ors.ojt_student_id IS NOT NULL;

-- Status distribution
SELECT '' as message;
SELECT CONCAT('Status distribution:') as summary;
SELECT status, COUNT(*) as count
FROM ojt_requirement_submissions
GROUP BY status
ORDER BY status;

-- Department distribution
SELECT '' as message;
SELECT CONCAT('Department distribution:') as summary;
SELECT department, COUNT(*) as count
FROM ojt_requirement_submissions
GROUP BY department
ORDER BY department;

-- Sample data
SELECT '' as message;
SELECT 'Sample of cleaned data (first 10 records):' as summary;
SELECT 
  id,
  ojt_student_id,
  template_id,
  student_id_ref,
  status,
  file_name,
  department,
  created_at
FROM ojt_requirement_submissions
ORDER BY id DESC
LIMIT 10;

SELECT '' as message;
SELECT '✅ CLEANUP COMPLETE' as message;
