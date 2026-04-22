const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { normalizeOjtStudentPayload } = require("../helpers/normalize");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return String(req.headers[DEPT_HEADER] || req.user?.department_code || "CCS").trim() || "CCS";
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
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to fetch OJT students." });
  }
});

// ── POST /api/ojt-students ────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const department = getDept(req);
    const data = normalizeOjtStudentPayload({ ...req.body, department }, department);

    if (!data.student_id || !data.name || !data.section) {
      return res
        .status(400)
        .json({ success: false, message: "Student ID, Name, and Section are required." });
    }

    const result = await query(
      `INSERT INTO ojt_students
       (student_id, name, section, department, email, contact_no, status,
        external_partner_assigned, nature_of_business)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.student_id, data.name, data.section, data.department,
        data.email, data.contact_no, data.status,
        data.external_partner_assigned, data.nature_of_business,
      ],
    );

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? LIMIT 1`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      student: rows[0],
      message: "OJT student added successfully.",
    });
  } catch (error) {
    console.error("createOjtStudent error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to create OJT student." });
  }
});

// ── PATCH /api/ojt-students/:id ───────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid OJT student ID is required." });
    }

    const department = getDept(req);
    const data = normalizeOjtStudentPayload({ ...req.body, department }, department);

    if (!data.student_id || !data.name || !data.section) {
      return res
        .status(400)
        .json({ success: false, message: "Student ID, Name, and Section are required." });
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
        data.student_id, data.name, data.section, data.department,
        data.email, data.contact_no, data.status,
        data.external_partner_assigned, data.nature_of_business, id,
      ],
    );

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? AND department = ? LIMIT 1`,
      [id, department],
    );

    return res.json({ success: true, student: rows[0], message: "OJT student updated successfully." });
  } catch (error) {
    console.error("updateOjtStudent error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to update OJT student." });
  }
});

// ── DELETE /api/ojt-students/:id ──────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid OJT student ID is required." });
    }

    const department = getDept(req);
    const existing = await query(
      "SELECT id FROM ojt_students WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "OJT student not found or already deleted." });
    }

    await query("DELETE FROM ojt_students WHERE id = ? AND department = ?", [id, department]);
    return res.json({ success: true, message: "OJT student deleted successfully." });
  } catch (error) {
    console.error("deleteOjtStudent error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to delete OJT student." });
  }
});

module.exports = router;
