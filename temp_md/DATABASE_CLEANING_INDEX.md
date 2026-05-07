# 📋 OJT Requirements Database Cleaning - Complete Toolkit

## 🚀 START HERE

You have **corrupt data** in your `ojt_requirement_submissions` table. I've created tools to fix it.

### ⚡ Fastest Solution (Recommended)
```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node clean_requirements.js
```

Done! 5 seconds. Then restart your app: `npm start`

---

## 📚 Documentation (Read This First)

| File | Purpose | Read Time |
|------|---------|-----------|
| **DATABASE_CLEANING_SUMMARY.md** | Overview of all tools | 3 min |
| **STEPS.md** | Step-by-step guide with troubleshooting | 5 min |
| **CLEANING_GUIDE.md** | Detailed explanations of what's being cleaned | 10 min |
| **README_DATABASE_CLEANING.md** | Quick reference | 2 min |

**👉 Start with: DATABASE_CLEANING_SUMMARY.md**

---

## 🛠️ Tools (Pick One to Run)

### Safe & Read-Only
```bash
node diagnose_requirements.js    # See what's wrong
node test_fetch_requirements.js  # Verify after cleaning
```

### Cleaning Tools
```bash
node clean_requirements.js       # Automatic (RECOMMENDED)
```

### Manual SQL
```
File: clean_requirements.sql     # Copy-paste into MySQL client
File: quick_diagnostic.sql       # Quick check in SQL client
```

---

## 📊 What's Wrong

Your `ojt_requirement_submissions` table has:

- ❌ **Orphaned records** - Student doesn't exist
- ❌ **Invalid references** - Template or student ID doesn't exist  
- ❌ **Duplicates** - Multiple submissions for same student-template
- ❌ **Empty fields** - student_id_ref is NULL/empty

**Result:** Requirements don't fetch correctly in the app

---

## ✅ What Gets Fixed

- ✓ Removes 0 or NULL student IDs
- ✓ Removes invalid foreign key references
- ✓ Resolves duplicate submissions (keeps most recent)
- ✓ Populates empty student_id_ref values
- ✓ Verifies all data is now valid
- ✓ Shows results with counts

---

## 🎯 Recommended Workflow

```
1. UNDERSTAND
   Read: DATABASE_CLEANING_SUMMARY.md

2. DIAGNOSE (Optional but recommended)
   Run: node diagnose_requirements.js
   This shows what's wrong without making changes

3. BACKUP (Optional but recommended)
   Run this SQL:
   CREATE TABLE ojt_requirement_submissions_backup AS 
   SELECT * FROM ojt_requirement_submissions;

4. CLEAN
   Run: node clean_requirements.js
   Takes ~5 seconds
   Shows verification results

5. TEST
   Run: node test_fetch_requirements.js
   Confirms fetch logic works

6. RESTART
   Run: npm start
   Applies changes

7. VERIFY
   Open app
   Check coordinator profile
   Verify requirements load
```

---

## 📁 All Files

### Documentation
- `DATABASE_CLEANING_SUMMARY.md` ← **START HERE**
- `STEPS.md` - Step-by-step guide
- `CLEANING_GUIDE.md` - Detailed docs
- `README_DATABASE_CLEANING.md` - Quick ref
- `DATABASE_CLEANING_INDEX.md` ← This file

### Tools
- `diagnose_requirements.js` - Check (read-only)
- `clean_requirements.js` - Fix (automatic)
- `test_fetch_requirements.js` - Verify
- `clean_requirements.sql` - Fix (manual SQL)
- `quick_diagnostic.sql` - Check (manual SQL)

### Your App Files
- `renderer/modules/m1_archive/coordinator/html/ojt_students_profile.html` (the profile page)
- `backend/routes/ojt-requirements.js` (the fetch logic)

---

## 🔥 QUICK START (2 Minutes)

### Step 1: Diagnose (See What's Wrong)
```bash
node diagnose_requirements.js
```

You'll see output like:
```
🔍 DIAGNOSING ojt_requirement_submissions TABLE

1️⃣ TABLE STRUCTURE: [columns...]
2️⃣ TOTAL RECORDS: 150
3️⃣ ORPHANED RECORDS: 23 ⚠️
4️⃣ INVALID REFERENCES: 8 ⚠️
5️⃣ DUPLICATES: 12 ⚠️
```

### Step 2: Clean (Fix the Issues)
```bash
node clean_requirements.js
```

You'll see:
```
✓ Step 1: Deleted orphaned records (23)
✓ Step 2: Deleted invalid template refs (8)
✓ Step 3: Deleted invalid student refs (5)
✓ Step 4: Deleted duplicates (12)
✓ Step 5: Fixed empty student_id_ref (10)

VERIFICATION:
✓ Total valid submissions: 102
✓ Orphaned records: 0
✓ Invalid references: 0
✓ Duplicates: 0
```

### Step 3: Restart
```bash
npm start
```

### Step 4: Test
Open your app and check the coordinator profile - requirements should now load!

---

## 🆘 Troubleshooting

### Can't connect to database?
```
ERROR: getaddrinfo ENOTFOUND mysql-eac28ff...
```
- Check `.env` file exists
- Verify DB_HOST, DB_USER, DB_PASSWORD
- Check network connection

### Want to restore?
```sql
DROP TABLE ojt_requirement_submissions;
RENAME TABLE ojt_requirement_submissions_backup TO ojt_requirement_submissions;
```

### More help?
Read: `STEPS.md` (Troubleshooting section)

---

## 📊 Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Total records | 150 | 102 |
| Orphaned | 23 | **0** |
| Invalid refs | 13 | **0** |
| Duplicates | 12 | **0** |
| Fetch works? | ❌ No | ✅ Yes |

---

## 🎓 Learn What's Happening

### What is this table?
`ojt_requirement_submissions` stores student file submissions for OJT requirements (pre-deployment requirements like CV, recommendation letters, etc.)

### Why is it corrupt?
Possible causes:
- Manual database edits
- Failed delete operations
- Data import issues
- Race conditions in old code

### How does it get fixed?
The cleaning script:
1. Removes records pointing to non-existent students/templates
2. Removes duplicate pairs (keeps most recent)
3. Fixes missing reference data
4. Verifies all remaining data is valid

---

## ✨ What Makes This Safe

1. **Read-only diagnostic first** - See issues without changes
2. **Only removes provably invalid data** - Valid data stays
3. **Automatic verification** - Confirms integrity after cleaning
4. **SQL backup option** - Can restore if needed
5. **Test suite included** - Verify fetch works after cleaning
6. **Detailed logging** - See exactly what was removed

---

## 🎯 The Goal

After cleaning:
```
✅ Requirements fetch correctly
✅ Coordinator can see all submissions
✅ No database errors
✅ All status values visible
✅ Can verify/reject submissions
✅ Student progress shows correctly
```

---

## 📞 TL;DR

```bash
# Run this ONE command:
node clean_requirements.js

# Then restart:
npm start

# Done!
```

---

## Next Steps

1. **Read:** `DATABASE_CLEANING_SUMMARY.md` (3 min read)
2. **Run:** `node clean_requirements.js` (5 sec execution)
3. **Restart:** `npm start` (apply changes)
4. **Test:** Open app, check coordinator profile
5. **Celebrate:** It works! 🎉

---

**All files are in:**
```
c:\Users\PLPASIG\smart-academic-system-ccs\
```

**Ready to fix it?** Open a terminal and run:
```bash
cd c:\Users\PLPASIG\smart-academic-system-ccs
node clean_requirements.js
```
