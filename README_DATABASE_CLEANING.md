# Database Cleaning - Quick Start Guide

## Problem
Your `ojt_requirement_submissions` table has corrupt/invalid data preventing proper fetching in the application.

## Solution Files Created

I've created 4 files to help you clean and verify your database:

### 1. **clean_requirements.js** (Recommended - Automatic)
Automatically diagnoses and cleans the database with one command.

```bash
node clean_requirements.js
```

**Does:**
- ✅ Removes orphaned records (NULL ojt_student_id)
- ✅ Deletes invalid foreign key references
- ✅ Resolves duplicate submissions
- ✅ Fixes empty student_id_ref values
- ✅ Verifies data integrity
- ✅ Shows final status

### 2. **clean_requirements.sql** (Manual - Direct SQL)
Raw SQL script for manual execution in your database client.

**How to use:**
- Option A: Copy-paste into MySQL Workbench / HeidiSQL / Aiven console
- Option B: Run from command line:
  ```bash
  mysql -h [HOST] -u [USER] -p [DATABASE] < clean_requirements.sql
  ```

### 3. **diagnose_requirements.js** (Read-Only - Safe)
Analyzes the table without making changes. Use this first if unsure.

```bash
node diagnose_requirements.js
```

**Shows:**
- Table structure
- Total records
- Orphaned records
- Invalid references
- Duplicates
- Status distribution
- Sample data

### 4. **test_fetch_requirements.js** (Verification - After Cleaning)
Tests that the fetch logic works correctly after cleaning.

```bash
node test_fetch_requirements.js
```

**Verifies:**
- Requirements fetch successfully
- All students and their submissions display correctly
- Both PRE and POST requirements work

### 5. **CLEANING_GUIDE.md** (Detailed Documentation)
Comprehensive guide with explanations of what gets cleaned and why.

---

## Quick Steps

### Step 1: Diagnose (Safe - Read Only)
```bash
node diagnose_requirements.js
```
See what problems exist without making changes.

### Step 2: Clean (Safe - Automatic Verification)
```bash
node clean_requirements.js
```
Automatically removes bad data and verifies integrity.

### Step 3: Test (Verify Fetching Works)
```bash
node test_fetch_requirements.js
```
Confirms requirements are now fetching correctly.

### Step 4: Restart Application
```bash
npm start
```
Restart your backend/application to use cleaned data.

---

## What Gets Removed

| Issue | Examples | Impact |
|-------|----------|--------|
| **Orphaned records** | NULL ojt_student_id | Can't fetch submissions |
| **Invalid references** | Template ID doesn't exist | Foreign key violations |
| **Duplicates** | Multiple submissions for same student-template | UNIQUE constraint errors |
| **Empty student_id_ref** | NULL student_id_ref | Lookup failures |

---

## Safety Features

✅ All scripts verify data integrity before/after  
✅ Duplicates keep the most recent record  
✅ Only removes provably invalid data  
✅ Full diagnostic output  
✅ SQL script included as backup  

---

## Troubleshooting

### Database Won't Connect
- Check `.env` file for DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
- Verify network access to database
- Try running from a different network if behind VPN

### Want to Backup First
```bash
# Create backup table (run in SQL client)
CREATE TABLE ojt_requirement_submissions_backup AS 
SELECT * FROM ojt_requirement_submissions;
```

### Need to Restore Backup
```bash
# Delete current corrupt data
DROP TABLE ojt_requirement_submissions;

# Restore from backup
RENAME TABLE ojt_requirement_submissions_backup TO ojt_requirement_submissions;
```

---

## Files Location
All files are in: `c:\Users\PLPASIG\smart-academic-system-ccs\`

- `clean_requirements.js`
- `clean_requirements.sql`
- `diagnose_requirements.js`
- `test_fetch_requirements.js`
- `CLEANING_GUIDE.md` (this guide)

---

## Expected Results

After running the cleaning script, you should see:
- ✅ 0 orphaned records
- ✅ 0 invalid references
- ✅ 0 duplicates
- ✅ All student_id_ref populated
- ✅ Requirements fetch successfully in the app

Then in the coordinator profile page, you'll see:
- ✅ All PRE requirements display correctly
- ✅ All POST requirements display correctly
- ✅ Submissions show with correct status
- ✅ Files can be viewed/verified

---

## Next Steps

1. Run: `node diagnose_requirements.js` (check status)
2. Run: `node clean_requirements.js` (clean data)
3. Run: `node test_fetch_requirements.js` (verify fetch works)
4. Restart backend: `npm start`
5. Test in application

Need help? Check **CLEANING_GUIDE.md** for detailed explanations.
