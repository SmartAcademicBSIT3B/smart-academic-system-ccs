# OJT Requirement Submissions - Database Cleaning Guide

## Problem
The `ojt_requirement_submissions` table contains invalid or corrupted data that prevents proper fetching in the application.

## Root Causes
The table may have the following issues:
1. **Orphaned records**: NULL or 0 `ojt_student_id` values (no student record exists)
2. **Invalid foreign keys**: `template_id` or `ojt_student_id` references non-existent records
3. **Duplicate entries**: Multiple submissions for the same student-template pair violating UNIQUE constraint
4. **Missing denormalized data**: Empty `student_id_ref` values

## Cleaning Methods

### Method 1: Using the Node.js Script (Recommended)

```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node clean_requirements.js
```

**What it does:**
- Automatically diagnoses the table
- Removes orphaned records
- Deletes invalid foreign key references
- Resolves duplicates (keeps most recent)
- Fixes empty student_id_ref values
- Verifies data integrity after cleaning

**Output includes:**
- Number of records cleaned at each step
- Final status distribution
- Verification that all references are valid

### Method 2: Using SQL Script Directly

If you want to run the SQL directly in your database client (MySQL Workbench, HeidiSQL, Aiven Console, etc.):

```bash
# Copy the entire contents of clean_requirements.sql
# Paste into your MySQL client
# Execute all queries
```

Or from the command line:
```bash
mysql -h mysql-eac28ff-smartacademicbsit3b-fb16.b.aivencloud.com -P 25442 -u avnadmin -p CTAPLP < clean_requirements.sql
```

### Method 3: Diagnostic First (Optional)

To just see what needs cleaning without making changes:

```bash
node diagnose_requirements.js
```

This will show:
- Current table structure
- Total record count
- Orphaned records
- Invalid references
- Duplicate entries
- Status and department distribution
- Sample data

## What Gets Cleaned

### 1. Orphaned Records
Removes rows where `ojt_student_id` is NULL or 0.

```sql
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id IS NULL OR ojt_student_id = 0;
```

### 2. Invalid Foreign Keys
Removes submissions referencing non-existent students or templates.

```sql
-- Invalid student references
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id NOT IN (SELECT id FROM ojt_students);

-- Invalid template references
DELETE FROM ojt_requirement_submissions
WHERE template_id NOT IN (SELECT id FROM ojt_requirement_templates);
```

### 3. Duplicate Entries
Keeps the most recent submission for each `(ojt_student_id, template_id)` pair.

```sql
DELETE FROM ojt_requirement_submissions
WHERE id NOT IN (
  SELECT MAX(id)
  FROM ojt_requirement_submissions
  GROUP BY ojt_student_id, template_id
);
```

### 4. Empty student_id_ref
Populates missing `student_id_ref` from the `ojt_students` table.

```sql
UPDATE ojt_requirement_submissions ors
INNER JOIN ojt_students os ON ors.ojt_student_id = os.id
SET ors.student_id_ref = os.student_id
WHERE ors.student_id_ref IS NULL OR ors.student_id_ref = '';
```

## Verification

After cleaning, the script verifies:
- ✓ No orphaned records (NULL ojt_student_id)
- ✓ All `ojt_student_id` references valid
- ✓ All `template_id` references valid
- ✓ No duplicate (ojt_student_id, template_id) pairs
- ✓ All `student_id_ref` populated
- ✓ Status distribution is healthy
- ✓ Sample data looks correct

## Before Running

1. **Backup your database** (optional but recommended)
   ```sql
   CREATE TABLE ojt_requirement_submissions_backup AS 
   SELECT * FROM ojt_requirement_submissions;
   ```

2. **Ensure database connectivity**
   - Check your `.env` file for correct DB credentials
   - Verify network access to the database host

## Expected Results

After cleaning, you should be able to:
- ✅ Fetch requirements successfully in the application
- ✅ See all student submissions in the coordinator view
- ✅ No orphaned/invalid data in the database
- ✅ Consistent status and department information

## Troubleshooting

### Script fails to connect
```
ERROR: getaddrinfo ENOTFOUND [host]
```
- Check `.env` file for correct DB_HOST, DB_PORT
- Verify network connectivity to the database
- Check if credentials are correct

### UNIQUE constraint violations
This happens if duplicates exist. The cleaning script handles this by keeping the most recent record.

### Data loss concerns
The script only removes:
- Records with NULL/0 student IDs
- Records referencing non-existent students or templates
- Duplicate pairs (keeps most recent)

All valid data is preserved.

## After Cleaning

Restart your application:
```bash
# Restart backend
npm start

# Refresh the electron/web app
```

Then verify in the coordinator view that requirements are now fetching correctly.

---

**Files in this workspace:**
- `clean_requirements.js` - Node.js script for automatic cleaning
- `clean_requirements.sql` - SQL script for manual cleaning
- `diagnose_requirements.js` - Diagnostic script (read-only)
