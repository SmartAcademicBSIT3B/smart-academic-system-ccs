# Step-by-Step: Clean ojt_requirement_submissions Table

## 📌 Executive Summary
Your `ojt_requirement_submissions` table has invalid/corrupt data. Use the provided scripts to clean it automatically.

---

## 🚀 QUICK START (5 minutes)

### Option A: Automatic Cleaning (Recommended)

```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node clean_requirements.js
```

This will:
1. ✅ Remove orphaned records
2. ✅ Delete invalid references
3. ✅ Resolve duplicates
4. ✅ Verify integrity
5. ✅ Show results

**That's it!** Then restart your app.

---

### Option B: Check First (Safe)

```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node diagnose_requirements.js
```

This shows what's wrong without making changes.

---

## 📋 DETAILED STEPS

### Step 1: Check Database Status (Optional but Recommended)

**Using Node.js diagnostic:**
```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node diagnose_requirements.js
```

**OR using SQL (in your database client):**
```
Copy entire contents of quick_diagnostic.sql
Paste into MySQL Workbench / HeidiSQL / Aiven console
Execute all queries
```

**You'll see:**
- How many orphaned records exist
- How many invalid references
- How many duplicates
- Sample data

### Step 2: Backup (Optional but Recommended)

If this is production data, create a backup first:

**Using SQL:**
```sql
CREATE TABLE ojt_requirement_submissions_backup AS 
SELECT * FROM ojt_requirement_submissions;
```

### Step 3: Clean the Data

**Automatic (Recommended):**
```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node clean_requirements.js
```

**Manual SQL (in database client):**
```
Copy entire contents of clean_requirements.sql
Paste into your MySQL client
Execute all queries
```

**You'll see:**
```
✓ Step 1: Deleted orphaned records
✓ Step 2: Deleted records with invalid template_id
✓ Step 3: Deleted records with invalid ojt_student_id
✓ Step 4: Deleted duplicate records (kept most recent)
✓ Step 5: Fixed empty student_id_ref values

VERIFICATION:
✓ Total valid submissions: XXX
✓ Orphaned records: 0
✓ Invalid template references: 0
✓ Invalid student references: 0
```

### Step 4: Verify the Data is Clean

```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node test_fetch_requirements.js
```

This simulates the application's fetch logic to confirm everything works.

### Step 5: Restart Your Application

```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs\backend
npm start
```

Or if using Electron:
```bash
npm run start
```

---

## 🔍 WHAT'S BEING CLEANED

### 1. Orphaned Records
**Problem:** Submissions with NULL or 0 `ojt_student_id`
**Why it's bad:** Student record doesn't exist
**Solution:** DELETE the row

```sql
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id IS NULL OR ojt_student_id = 0;
```

### 2. Invalid Foreign Keys
**Problem:** `ojt_student_id` or `template_id` references non-existent records
**Why it's bad:** Data integrity violated, fetches fail
**Solution:** DELETE the rows

```sql
DELETE FROM ojt_requirement_submissions
WHERE ojt_student_id NOT IN (SELECT id FROM ojt_students);

DELETE FROM ojt_requirement_submissions
WHERE template_id NOT IN (SELECT id FROM ojt_requirement_templates);
```

### 3. Duplicate Submissions
**Problem:** Multiple rows for the same student-template pair
**Why it's bad:** UNIQUE constraint violation
**Solution:** Keep the most recent, DELETE the rest

```sql
DELETE FROM ojt_requirement_submissions
WHERE id NOT IN (
  SELECT MAX(id) FROM ojt_requirement_submissions
  GROUP BY ojt_student_id, template_id
);
```

### 4. Missing student_id_ref
**Problem:** NULL or empty `student_id_ref`
**Why it's bad:** Lookup failures in the application
**Solution:** Populate from `ojt_students` table

```sql
UPDATE ojt_requirement_submissions ors
INNER JOIN ojt_students os ON ors.ojt_student_id = os.id
SET ors.student_id_ref = os.student_id
WHERE ors.student_id_ref IS NULL OR ors.student_id_ref = '';
```

---

## 📊 EXPECTED RESULTS

**Before:**
```
Total records: 150
Orphaned records: 23
Invalid student refs: 8
Invalid template refs: 5
Duplicate pairs: 12
```

**After:**
```
Total records: 102  ← Only valid data remains
Orphaned records: 0 ✓
Invalid student refs: 0 ✓
Invalid template refs: 0 ✓
Duplicate pairs: 0 ✓
```

---

## ✅ VERIFICATION CHECKLIST

After cleaning, verify in your application:

- [ ] Coordinator profile page loads without errors
- [ ] Requirements section shows all PRE requirements
- [ ] Requirements section shows all POST requirements
- [ ] Submissions display with correct status (pending/submitted/verified/rejected)
- [ ] File names and URLs are visible
- [ ] Can view/verify submitted files
- [ ] No console errors or SQL errors
- [ ] Database dashboard shows clean data

---

## 🆘 TROUBLESHOOTING

### Script fails to connect to database
```
ERROR: getaddrinfo ENOTFOUND mysql-eac28ff...
```

**Solutions:**
1. Check `.env` file exists in project root
2. Verify DB_HOST, DB_PORT are correct
3. Check DB_USER and DB_PASSWORD are correct
4. Ensure network can reach database host
5. Try from different network if behind corporate VPN

### "Too many connections" error
```
Error: getConnection() failed
```

**Solution:**
- Wait a few minutes and try again
- Or restart Node.js: `npm start` in another terminal to reset connection pool

### Want to undo the cleaning
If something went wrong:

```sql
-- Restore from backup
DROP TABLE ojt_requirement_submissions;
RENAME TABLE ojt_requirement_submissions_backup TO ojt_requirement_submissions;
```

### Need more help
Check these files:
- `CLEANING_GUIDE.md` - Detailed explanations
- `clean_requirements.sql` - SQL with comments
- `clean_requirements.js` - Source code with logic

---

## 📁 FILES PROVIDED

```
workspace/
├── clean_requirements.js           ← Run this (automatic)
├── clean_requirements.sql          ← Or this (manual SQL)
├── diagnose_requirements.js        ← Check status (safe/read-only)
├── test_fetch_requirements.js      ← Verify after cleaning
├── quick_diagnostic.sql            ← Quick SQL check
├── CLEANING_GUIDE.md               ← Detailed documentation
├── STEPS.md                        ← This file
└── README_DATABASE_CLEANING.md     ← Quick reference
```

---

## 🎯 RECOMMENDED WORKFLOW

1. **Diagnose** (see what's wrong)
   ```bash
   node diagnose_requirements.js
   ```

2. **Backup** (protect your data)
   ```sql
   CREATE TABLE ojt_requirement_submissions_backup AS 
   SELECT * FROM ojt_requirement_submissions;
   ```

3. **Clean** (fix the issues)
   ```bash
   node clean_requirements.js
   ```

4. **Test** (verify it works)
   ```bash
   node test_fetch_requirements.js
   ```

5. **Restart** (apply changes)
   ```bash
   npm start
   ```

6. **Verify** (check in app)
   - Open coordinator profile
   - Check requirements load
   - Try viewing a file

---

## 📞 Summary

The `ojt_requirement_submissions` table is corrupted. Three options:

1. **Automatic** (1 command):
   ```bash
   node clean_requirements.js
   ```

2. **Manual SQL** (copy-paste into database client):
   ```
   File: clean_requirements.sql
   ```

3. **Check first** (safe, read-only):
   ```bash
   node diagnose_requirements.js
   ```

Then restart your app. Done!

---

**Questions?** Check the detailed files or read the SQL comments for explanations.
