const express = require("express");
const { pool, query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { normalizeOjtStudentPayload } = require("../helpers/normalize");
const {
  createOrUpdateStudentUser,
  sendStudentWelcomeEmail,
} = require("../services/student-user");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

// ── GET /api/ojt-students ─────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const department = getDept(req);
    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students
       WHERE department = ?
       ORDER BY id DESC`,
      [department],
    );
    return res.json({ success: true, students: rows });
  } catch (error) {
    console.error("getOjtStudents error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch OJT students.",
    });
  }
});

// ── POST /api/ojt-students ────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  let connection;
  try {
    const department = getDept(req);
    const data = normalizeOjtStudentPayload(
      { ...req.body, department },
      department,
    );

    if (!data.student_id || !data.name || !data.section) {
      return res.status(400).json({
        success: false,
        message: "Student ID, Name, and Section are required.",
      });
    }

    const normalizedEmail = String(data.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message:
          "Email is required to create a student portal account and send credentials.",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [insertResult] = await connection.execute(
      `INSERT INTO ojt_students
       (student_id, name, section, department, email, contact_no, status,
        external_partner_assigned, nature_of_business)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.student_id,
        data.name,
        data.section,
        data.department,
        normalizedEmail,
        data.contact_no,
        data.status,
        data.external_partner_assigned,
        data.nature_of_business,
      ],
    );

    const studentUserResult = await createOrUpdateStudentUser(connection, {
      student_id: data.student_id,
      name: data.name,
      email: normalizedEmail,
      status: data.status,
    });

    await connection.commit();

    // Email is sent AFTER commit so a failed email never rolls back DB inserts.
    let emailSent = false;
    let emailError = null;
    if (studentUserResult.emailPayload) {
      try {
        await sendStudentWelcomeEmail(studentUserResult.emailPayload);
        emailSent = true;
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error(
          "createOjtStudent: welcome email failed:",
          mailErr.message,
        );
      }
    }

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? LIMIT 1`,
      [insertResult.insertId],
    );

    const createdStudent = rows[0];
    let accountMsg;
    if (studentUserResult.mode === "created") {
      accountMsg = emailSent
        ? " Student portal account created and credentials emailed."
        : ` Student portal account created but email failed: ${emailError}`;
    } else {
      accountMsg = " Student portal account already existed and was updated.";
    }

    return res.status(201).json({
      success: true,
      student: createdStudent,
      message: `OJT student added successfully.${accountMsg}`,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("createOjtStudent rollback error:", rollbackError);
      }
    }
    console.error("createOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create OJT student.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ── PATCH /api/ojt-students/:id ───────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const department = getDept(req);
    const data = normalizeOjtStudentPayload(
      { ...req.body, department },
      department,
    );

    if (!data.student_id || !data.name || !data.section) {
      return res.status(400).json({
        success: false,
        message: "Student ID, Name, and Section are required.",
      });
    }

    const existing = await query(
      "SELECT id FROM ojt_students WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "OJT student not found." });
    }

    await query(
      `UPDATE ojt_students
       SET student_id=?, name=?, section=?, department=?, email=?,
           contact_no=?, status=?, external_partner_assigned=?, nature_of_business=?
       WHERE id=?`,
      [
        data.student_id,
        data.name,
        data.section,
        data.department,
        data.email,
        data.contact_no,
        data.status,
        data.external_partner_assigned,
        data.nature_of_business,
        id,
      ],
    );

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? AND department = ? LIMIT 1`,
      [id, department],
    );

    return res.json({
      success: true,
      student: rows[0],
      message: "OJT student updated successfully.",
    });
  } catch (error) {
    console.error("updateOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update OJT student.",
    });
  }
});

// ── DELETE /api/ojt-students/:id ──────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const department = getDept(req);
    const existing = await query(
      "SELECT id FROM ojt_students WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "OJT student not found or already deleted.",
      });
    }

    await query("DELETE FROM ojt_students WHERE id = ? AND department = ?", [
      id,
      department,
    ]);
    return res.json({
      success: true,
      message: "OJT student deleted successfully.",
    });
  } catch (error) {
    console.error("deleteOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete OJT student.",
    });
  }
});

module.exports = router;
