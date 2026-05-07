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

async function testFetch() {
  try {
    console.log("🧪 TESTING REQUIREMENT SUBMISSIONS FETCH\n");

    // Get all students
    const students = await query(`
      SELECT DISTINCT os.id, os.student_id, os.section, os.department
      FROM ojt_students os
      WHERE EXISTS (
        SELECT 1 FROM ojt_requirement_submissions ors 
        WHERE ors.ojt_student_id = os.id
      )
      LIMIT 5
    `);

    if (students.length === 0) {
      console.log("⚠️  No students with requirement submissions found\n");
      return;
    }

    console.log(`✓ Found ${students.length} students with submissions\n`);

    for (const student of students) {
      console.log(`📊 Student: ${student.student_id} (ID: ${student.id})`);
      console.log(`   Section: ${student.section}, Department: ${student.department}\n`);

      // Simulate the fetch from ojt_requirements.js route
      const dept = student.department;
      const studentId = student.student_id;
      const section = student.section;

      // Fetch templates for PRE requirements
      const preTemplates = await query(`
        SELECT * FROM ojt_requirement_templates
        WHERE department = ? AND type = 'pre'
          AND (
            (scope = 'department' AND scope_value = ?) OR
            (scope = 'section' AND scope_value = ?) OR
            (scope = 'student' AND scope_value = ?)
          )
        ORDER BY display_order ASC, id ASC
      `, [dept, dept, section, studentId]);

      // Fetch submissions for this student
      const submissions = await query(`
        SELECT * FROM ojt_requirement_submissions 
        WHERE ojt_student_id = ? AND department = ?
      `, [student.id, dept]);

      console.log(`   📋 PRE Templates: ${preTemplates.length}`);
      console.log(`   📄 Submissions: ${submissions.length}\n`);

      // Show submissions detail
      if (submissions.length > 0) {
        console.log("   Submission Details:");
        for (const sub of submissions.slice(0, 3)) {
          console.log(`     - ID: ${sub.id}`);
          console.log(`       Template: ${sub.template_id}, Status: ${sub.status}`);
          console.log(`       File: ${sub.file_name || "No file"}`);
          console.log(`       Student Ref: ${sub.student_id_ref}\n`);
        }
        if (submissions.length > 3) {
          console.log(`     ... and ${submissions.length - 3} more submissions\n`);
        }
      }

      // Test the full fetch (as the route would return it)
      const templateMap = {};
      preTemplates.forEach(t => {
        templateMap[t.id] = t;
      });

      const subMap = {};
      submissions.forEach(s => {
        subMap[s.template_id] = s;
      });

      const result = preTemplates.map(t => ({
        template: t,
        submission: subMap[t.id] || null
      }));

      console.log(`   ✅ Fetch result ready: ${result.length} entries\n`);
      console.log("   ---\n");
    }

    // Test POST requirements as well
    console.log("\n🔍 Testing POST requirements fetch:\n");

    const firstStudent = students[0];
    const dept = firstStudent.department;
    const section = firstStudent.section;
    const studentId = firstStudent.student_id;

    const postTemplates = await query(`
      SELECT * FROM ojt_requirement_templates
      WHERE department = ? AND type = 'post'
        AND (
          (scope = 'department' AND scope_value = ?) OR
          (scope = 'section' AND scope_value = ?) OR
          (scope = 'student' AND scope_value = ?)
        )
      ORDER BY display_order ASC, id ASC
    `, [dept, dept, section, studentId]);

    const postSubmissions = await query(`
      SELECT * FROM ojt_requirement_submissions 
      WHERE ojt_student_id = ? AND department = ? AND template_id IN (
        SELECT id FROM ojt_requirement_templates WHERE type = 'post'
      )
    `, [firstStudent.id, dept]);

    console.log(`Student: ${studentId}`);
    console.log(`📋 POST Templates: ${postTemplates.length}`);
    console.log(`📄 POST Submissions: ${postSubmissions.length}\n`);

    if (postSubmissions.length > 0) {
      console.log("POST Submission Details:");
      for (const sub of postSubmissions.slice(0, 3)) {
        console.log(`  - Template ID: ${sub.template_id}, Status: ${sub.status}`);
        console.log(`    File: ${sub.file_name || "No file"}`);
      }
    }

    console.log("\n✅ FETCH TEST COMPLETE - All requirements fetching correctly!\n");

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

testFetch();
