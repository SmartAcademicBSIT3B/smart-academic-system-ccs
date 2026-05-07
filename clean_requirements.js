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

async function cleanDatabase() {
  try {
    console.log("🧹 CLEANING ojt_requirement_submissions TABLE\n");

    // 1. Remove orphaned records (NULL ojt_student_id)
    console.log("1️⃣ Removing orphaned records (NULL ojt_student_id)...");
    const orphanedResult = await query(
      "DELETE FROM ojt_requirement_submissions WHERE ojt_student_id IS NULL OR ojt_student_id = 0"
    );
    console.log(`✓ Deleted ${orphanedResult.affectedRows} orphaned records\n`);

    // 2. Remove records with invalid template_id
    console.log("2️⃣ Removing records with invalid template_id...");
    const invalidTemplateResult = await query(`
      DELETE FROM ojt_requirement_submissions
      WHERE template_id NOT IN (
        SELECT id FROM ojt_requirement_templates
      )
    `);
    console.log(`✓ Deleted ${invalidTemplateResult.affectedRows} records with invalid template_id\n`);

    // 3. Remove records with invalid ojt_student_id
    console.log("3️⃣ Removing records with invalid ojt_student_id...");
    const invalidStudentResult = await query(`
      DELETE FROM ojt_requirement_submissions
      WHERE ojt_student_id NOT IN (
        SELECT id FROM ojt_students
      )
    `);
    console.log(`✓ Deleted ${invalidStudentResult.affectedRows} records with invalid ojt_student_id\n`);

    // 4. Handle duplicates - keep the most recent one
    console.log("4️⃣ Handling duplicate (ojt_student_id, template_id) entries...");
    const duplicates = await query(`
      SELECT ojt_student_id, template_id, GROUP_CONCAT(id ORDER BY updated_at DESC) as ids
      FROM ojt_requirement_submissions
      GROUP BY ojt_student_id, template_id
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate groups\n`);
      let totalDeleted = 0;

      for (const dup of duplicates) {
        const ids = dup.ids.split(",");
        const idsToKeep = ids[0]; // Keep the most recent
        const idsToDelete = ids.slice(1); // Delete the rest

        if (idsToDelete.length > 0) {
          const deleteResult = await query(
            `DELETE FROM ojt_requirement_submissions WHERE id IN (${idsToDelete.map(() => "?").join(",")})",
            idsToDelete.map(id => parseInt(id, 10))
          );
          totalDeleted += deleteResult.affectedRows;
        }
      }

      console.log(`✓ Deleted ${totalDeleted} duplicate records (kept most recent)\n`);
    } else {
      console.log("✓ No duplicates found\n");
    }

    // 5. Fix empty/invalid student_id_ref
    console.log("5️⃣ Fixing empty student_id_ref values...");
    const emptyRefResult = await query(`
      UPDATE ojt_requirement_submissions ors
      JOIN ojt_students os ON ors.ojt_student_id = os.id
      SET ors.student_id_ref = os.student_id
      WHERE ors.student_id_ref IS NULL OR ors.student_id_ref = ''
    `);
    console.log(`✓ Updated ${emptyRefResult.affectedRows} records with correct student_id_ref\n`);

    // 6. Verify all records now have valid references
    console.log("6️⃣ VERIFICATION - Checking data integrity...");
    
    const totalCount = await query("SELECT COUNT(*) as count FROM ojt_requirement_submissions");
    console.log(`✓ Total valid records: ${totalCount[0].count}`);

    const orphanCheck = await query("SELECT COUNT(*) as count FROM ojt_requirement_submissions WHERE ojt_student_id IS NULL OR ojt_student_id = 0");
    console.log(`✓ Orphaned records: ${orphanCheck[0].count}`);

    const invalidTemplateCheck = await query(`
      SELECT COUNT(*) as count FROM ojt_requirement_submissions
      WHERE template_id NOT IN (SELECT id FROM ojt_requirement_templates)
    `);
    console.log(`✓ Invalid template references: ${invalidTemplateCheck[0].count}`);

    const invalidStudentCheck = await query(`
      SELECT COUNT(*) as count FROM ojt_requirement_submissions
      WHERE ojt_student_id NOT IN (SELECT id FROM ojt_students)
    `);
    console.log(`✓ Invalid student references: ${invalidStudentCheck[0].count}`);

    const statusDist = await query(`
      SELECT status, COUNT(*) as count
      FROM ojt_requirement_submissions
      GROUP BY status
    `);
    console.log("\n✓ Final status distribution:");
    console.table(statusDist);

    console.log("\n✅ CLEANING COMPLETE - Database is now clean!\n");

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanDatabase();
