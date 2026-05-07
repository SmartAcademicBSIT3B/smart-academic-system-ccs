-- ============================================================================
-- QUICK DIAGNOSTIC: Check ojt_requirement_submissions table issues
-- Run this first to see what needs cleaning
-- ============================================================================

SET @total_records := (SELECT COUNT(*) FROM ojt_requirement_submissions);
SET @orphaned := (SELECT COUNT(*) FROM ojt_requirement_submissions WHERE ojt_student_id IS NULL OR ojt_student_id = 0);
SET @invalid_student := (SELECT COUNT(*) FROM ojt_requirement_submissions ors LEFT JOIN ojt_students os ON ors.ojt_student_id = os.id WHERE os.id IS NULL AND ors.ojt_student_id IS NOT NULL);
SET @invalid_template := (SELECT COUNT(*) FROM ojt_requirement_submissions ors LEFT JOIN ojt_requirement_templates ort ON ors.template_id = ort.id WHERE ort.id IS NULL);
SET @duplicates := (SELECT COUNT(*) FROM (SELECT COUNT(*) FROM ojt_requirement_submissions GROUP BY ojt_student_id, template_id HAVING COUNT(*) > 1) AS dupes);

-- ============================================================================
-- DIAGNOSIS RESULTS
-- ============================================================================

SELECT 'QUICK DIAGNOSIS: ojt_requirement_submissions' as '🔍 DIAGNOSTIC REPORT';
SELECT '';

-- Summary
SELECT CONCAT('Total Records: ', @total_records) as '📊 Status';
SELECT CONCAT('Orphaned Records (NULL ojt_student_id): ', @orphaned) as '⚠️  Issue';
SELECT CONCAT('Invalid Student References: ', @invalid_student) as '⚠️  Issue';
SELECT CONCAT('Invalid Template References: ', @invalid_template) as '⚠️  Issue';
SELECT CONCAT('Duplicate Entries: ', @duplicates) as '⚠️  Issue';

SELECT '';
SELECT '📋 DETAILS:' as '─────';

-- Show samples of each issue type
IF @orphaned > 0 THEN
  SELECT '⚠️  ORPHANED RECORDS (NULL ojt_student_id):' as issue;
  SELECT id, ojt_student_id, template_id, student_id_ref, status
  FROM ojt_requirement_submissions
  WHERE ojt_student_id IS NULL OR ojt_student_id = 0
  LIMIT 5;
  SELECT '';
END IF;

IF @invalid_student > 0 THEN
  SELECT '⚠️  INVALID STUDENT REFERENCES:' as issue;
  SELECT ors.id, ors.ojt_student_id, ors.template_id, ors.student_id_ref
  FROM ojt_requirement_submissions ors
  LEFT JOIN ojt_students os ON ors.ojt_student_id = os.id
  WHERE os.id IS NULL AND ors.ojt_student_id IS NOT NULL
  LIMIT 5;
  SELECT '';
END IF;

IF @invalid_template > 0 THEN
  SELECT '⚠️  INVALID TEMPLATE REFERENCES:' as issue;
  SELECT ors.id, ors.ojt_student_id, ors.template_id, ors.student_id_ref
  FROM ojt_requirement_submissions ors
  LEFT JOIN ojt_requirement_templates ort ON ors.template_id = ort.id
  WHERE ort.id IS NULL
  LIMIT 5;
  SELECT '';
END IF;

IF @duplicates > 0 THEN
  SELECT '⚠️  DUPLICATE (ojt_student_id, template_id) PAIRS:' as issue;
  SELECT ojt_student_id, template_id, COUNT(*) as count, GROUP_CONCAT(id ORDER BY updated_at DESC) as ids
  FROM ojt_requirement_submissions
  GROUP BY ojt_student_id, template_id
  HAVING COUNT(*) > 1
  LIMIT 5;
  SELECT '';
END IF;

-- Status distribution
SELECT '';
SELECT '✓ STATUS DISTRIBUTION:' as '─────';
SELECT status, COUNT(*) as count
FROM ojt_requirement_submissions
GROUP BY status
ORDER BY status;

-- Department distribution
SELECT '';
SELECT '✓ DEPARTMENT DISTRIBUTION:' as '─────';
SELECT department, COUNT(*) as count
FROM ojt_requirement_submissions
GROUP BY department
ORDER BY department;

-- Sample of valid data
SELECT '';
SELECT '✓ SAMPLE OF VALID DATA (first 5):' as '─────';
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
WHERE ojt_student_id IS NOT NULL
ORDER BY id DESC
LIMIT 5;

-- ============================================================================
-- RECOMMENDATION
-- ============================================================================

SELECT '';
SELECT '=' as '';
SELECT IF(@orphaned + @invalid_student + @invalid_template + @duplicates = 0,
  '✅ NO ISSUES FOUND - Your database is clean!',
  '⚠️  ISSUES DETECTED - Run clean_requirements.js or clean_requirements.sql'
) as '🎯 RECOMMENDATION';
SELECT '=' as '';
