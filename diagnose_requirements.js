require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function diagnose() {
  try {
    console.log("🔍 DIAGNOSING ojt_requirement_submissions TABLE\n");

    // 1. Check table structure
    console.log("1️⃣ TABLE STRUCTURE:");
    const structure = await query("DESCRIBE ojt_requirement_submissions");
    console.table(structure);

    // 2. Count total records
    console.log("\n2️⃣ TOTAL RECORDS:");
    const [countResult] = await query("SELECT COUNT(*) as total FROM ojt_requirement_submissions");
    console.log(`Total submissions: ${countResult.total}`);

    // 3. Check for NULL ojt_student_id (orphaned records)
    console.log("\n3️⃣ CHECKING FOR ORPHANED RECORDS (NULL ojt_student_id):");
    const orphaned = await query("SELECT COUNT(*) as count FROM ojt_requirement_submissions WHERE ojt_student_id IS NULL OR ojt_student_id = 0");
    console.log(`Orphaned records: ${orphaned[0].count}`);

    // 4. Check for duplicate entries (violating UNIQUE constraint)
    console.log("\n4️⃣ CHECKING FOR DUPLICATE ENTRIES (ojt_student_id, template_id):");
    const duplicates = await query(`
      SELECT ojt_student_id, template_id, COUNT(*) as count
      FROM ojt_requirement_submissions
      GROUP BY ojt_student_id, template_id
      HAVING count > 1
    `);
    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate entries:`);
      console.table(duplicates);
    } else {
      console.log("No duplicates found ✓");
    }

    // 5. Check for invalid template_id references
    console.log("\n5️⃣ CHECKING FOR INVALID TEMPLATE_ID REFERENCES:");
    const invalidTemplates = await query(`
      SELECT ors.id, ors.ojt_student_id, ors.template_id
      FROM ojt_requirement_submissions ors
      LEFT JOIN ojt_requirement_templates ort ON ors.template_id = ort.id
      WHERE ort.id IS NULL
      LIMIT 10
    `);
    if (invalidTemplates.length > 0) {
      console.log(`Found ${invalidTemplates.length} records with invalid template_id:`);
      console.table(invalidTemplates);
    } else {
      console.log("All template_id references are valid ✓");
    }

    // 6. Check for invalid student_id references
    console.log("\n6️⃣ CHECKING FOR INVALID STUDENT_ID REFERENCES:");
    const invalidStudents = await query(`
      SELECT ors.id, ors.ojt_student_id, ors.student_id_ref
      FROM ojt_requirement_submissions ors
      LEFT JOIN ojt_students os ON ors.ojt_student_id = os.id
      WHERE os.id IS NULL AND ors.ojt_student_id IS NOT NULL
      LIMIT 10
    `);
    if (invalidStudents.length > 0) {
      console.log(`Found ${invalidStudents.length} records with invalid ojt_student_id:`);
      console.table(invalidStudents);
    } else {
      console.log("All ojt_student_id references are valid ✓");
    }

    // 7. Sample data
    console.log("\n7️⃣ SAMPLE DATA (first 5 records):");
    const samples = await query(`
      SELECT 
        ors.id,
        ors.ojt_student_id,
        ors.template_id,
        ors.student_id_ref,
        ors.status,
        ors.file_name,
        ors.department,
        ors.created_at
      FROM ojt_requirement_submissions ors
      LIMIT 5
    `);
    console.table(samples);

    // 8. Check status distribution
    console.log("\n8️⃣ STATUS DISTRIBUTION:");
    const statusDist = await query(`
      SELECT status, COUNT(*) as count
      FROM ojt_requirement_submissions
      GROUP BY status
    `);
    console.table(statusDist);

    // 9. Check department distribution
    console.log("\n9️⃣ DEPARTMENT DISTRIBUTION:");
    const deptDist = await query(`
      SELECT department, COUNT(*) as count
      FROM ojt_requirement_submissions
      GROUP BY department
    `);
    console.table(deptDist);

    console.log("\n✅ DIAGNOSIS COMPLETE\n");

  } catch (error) {
    console.error("❌ ERROR:", error.message);
  } finally {
    await pool.end();
  }
}

diagnose();
