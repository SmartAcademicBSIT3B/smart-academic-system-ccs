const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

// ── Table bootstrap ───────────────────────────────────────────────────────────
let tablePrepared = false;
async function ensureWeeklyReportsTable() {
  if (tablePrepared) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ojt_weekly_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      week_number INT NOT NULL COMMENT '1-based week index',
      week_start_date DATE NULL,
      file_url VARCHAR(512) NULL,
      cloudinary_public_id VARCHAR(512) NULL,
      folder_path VARCHAR(512) NULL,
      file_name VARCHAR(255) NULL,
      status ENUM('pending', 'submitted', 'reviewed', 'returned') NOT NULL DEFAULT 'pending',
      submitted_at DATETIME NULL,
      reviewed_by_user_id INT NULL,
      reviewed_at DATETIME NULL,
      feedback TEXT NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_student_week (ojt_student_id, week_number),
      INDEX idx_owr_student (ojt_student_id),
      INDEX idx_owr_dept (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablePrepared = true;
}

// ── GET /api/ojt-weekly-reports/:studentId ────────────────────────────────────
router.get("/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    await ensureWeeklyReportsTable();

    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    const dbId = student[0].id;

    const reports = await query(
      `SELECT r.*, u.name AS reviewed_by_name
       FROM ojt_weekly_reports r
       LEFT JOIN users u ON u.id = r.reviewed_by_user_id
       WHERE r.ojt_student_id = ? AND r.department = ?
       ORDER BY r.week_number ASC`,
      [dbId, dept],
    );

    return res.json({ success: true, reports });
  } catch (error) {
    console.error("getWeeklyReports error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to fetch weekly reports.",
      });
  }
});

// ── POST /api/ojt-weekly-reports ─────────────────────────────────────────────
// Create or update (upsert) weekly report for a student+week.
router.post("/", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureWeeklyReportsTable();

    const studentId = String(req.body.student_id || "").trim();
    const weekNumber = parseInt(req.body.week_number, 10);

    if (!studentId || isNaN(weekNumber) || weekNumber < 1) {
      return res
        .status(400)
        .json({
          success: false,
          message: "student_id and valid week_number are required.",
        });
    }

    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    const dbId = student[0].id;

    // Check for existing entry (upsert)
    const existing = await query(
      "SELECT id FROM ojt_weekly_reports WHERE ojt_student_id = ? AND week_number = ? LIMIT 1",
      [dbId, weekNumber],
    );

    const fileUrl = req.body.file_url || null;
    const publicId = req.body.cloudinary_public_id || null;
    const folderPath = req.body.folder_path || null;
    const fileName = req.body.file_name || null;
    const weekStartDate = req.body.week_start_date || null;
    const status = fileUrl ? "submitted" : "pending";

    if (existing.length) {
      const subId = existing[0].id;
      await query(
        `UPDATE ojt_weekly_reports
         SET file_url = ?, cloudinary_public_id = ?, folder_path = ?, file_name = ?,
             week_start_date = ?, status = ?, submitted_at = ?
         WHERE id = ?`,
        [
          fileUrl,
          publicId,
          folderPath,
          fileName,
          weekStartDate,
          status,
          fileUrl ? new Date() : null,
          subId,
        ],
      );
      const rows = await query(
        "SELECT * FROM ojt_weekly_reports WHERE id = ? LIMIT 1",
        [subId],
      );
      return res.json({ success: true, report: rows[0] });
    }

    const result = await query(
      `INSERT INTO ojt_weekly_reports
       (ojt_student_id, student_id_ref, week_number, week_start_date, file_url, cloudinary_public_id,
        folder_path, file_name, status, submitted_at, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbId,
        studentId,
        weekNumber,
        weekStartDate,
        fileUrl,
        publicId,
        folderPath,
        fileName,
        status,
        fileUrl ? new Date() : null,
        dept,
      ],
    );

    const rows = await query(
      "SELECT * FROM ojt_weekly_reports WHERE id = ? LIMIT 1",
      [result.insertId],
    );
    return res.status(201).json({ success: true, report: rows[0] });
  } catch (error) {
    console.error("createWeeklyReport error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to save weekly report.",
      });
  }
});

// ── PATCH /api/ojt-weekly-reports/:id ────────────────────────────────────────
// Update review status / feedback.
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureWeeklyReportsTable();

    const existing = await query(
      "SELECT id FROM ojt_weekly_reports WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });

    const fields = [];
    const vals = [];

    if (
      req.body.status !== undefined &&
      ["pending", "submitted", "reviewed", "returned"].includes(req.body.status)
    ) {
      fields.push("status = ?");
      vals.push(req.body.status);
      if (req.body.status === "reviewed" || req.body.status === "returned") {
        fields.push("reviewed_by_user_id = ?", "reviewed_at = NOW()");
        vals.push(req.user?.id || null);
      }
    }
    if (req.body.feedback !== undefined) {
      fields.push("feedback = ?");
      vals.push(String(req.body.feedback).trim() || null);
    }

    if (!fields.length)
      return res
        .status(400)
        .json({ success: false, message: "No fields to update." });

    vals.push(id, dept);
    await query(
      `UPDATE ojt_weekly_reports SET ${fields.join(", ")} WHERE id = ? AND department = ?`,
      vals,
    );

    const rows = await query(
      "SELECT * FROM ojt_weekly_reports WHERE id = ? LIMIT 1",
      [id],
    );
    return res.json({ success: true, report: rows[0] });
  } catch (error) {
    console.error("updateWeeklyReport error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to update weekly report.",
      });
  }
});

// ── DELETE /api/ojt-weekly-reports/:id ──────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureWeeklyReportsTable();
    await query(
      "DELETE FROM ojt_weekly_reports WHERE id = ? AND department = ?",
      [id, dept],
    );
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteWeeklyReport error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to delete weekly report.",
      });
  }
});

module.exports = router;
module.exports.ensureWeeklyReportsTable = ensureWeeklyReportsTable;
