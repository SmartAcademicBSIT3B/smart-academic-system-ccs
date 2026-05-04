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
async function ensureAttendanceTable() {
  if (tablePrepared) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ojt_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL COMMENT 'FK to ojt_students.id',
      student_id_ref VARCHAR(120) NOT NULL COMMENT 'denormalized student_id for quick lookup',
      attendance_date DATE NOT NULL,
      datetime_in DATETIME NULL,
      datetime_out DATETIME NULL,
      duration_minutes INT NULL COMMENT 'computed (datetime_out - datetime_in)',
      status ENUM('present','absent','late','half-day','excused') NOT NULL DEFAULT 'present',
      proof_url VARCHAR(512) NULL,
      proof_public_id VARCHAR(512) NULL,
      notes TEXT NULL,
      recorded_by_user_id INT NULL,
      source ENUM('coordinator','student') NOT NULL DEFAULT 'coordinator',
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_oa_student (ojt_student_id),
      INDEX idx_oa_date (attendance_date),
      INDEX idx_oa_dept (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablePrepared = true;
}

// ── GET /api/ojt-attendance/:studentId ───────────────────────────────────────
// Returns all attendance records for a student. Optional ?month=YYYY-MM filter.
router.get("/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    await ensureAttendanceTable();

    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    const dbId = student[0].id;

    let sql = `SELECT * FROM ojt_attendance WHERE ojt_student_id = ? AND department = ?`;
    const params = [dbId, dept];

    if (req.query.month) {
      sql += ` AND DATE_FORMAT(attendance_date, '%Y-%m') = ?`;
      params.push(String(req.query.month).substring(0, 7));
    }

    sql += ` ORDER BY attendance_date DESC, datetime_in DESC`;

    const records = await query(sql, params);

    // Compute summary
    const summary = {
      total: records.length,
      present: records.filter((r) => r.status === "present").length,
      absent: records.filter((r) => r.status === "absent").length,
      late: records.filter((r) => r.status === "late").length,
      total_minutes: records.reduce(
        (acc, r) => acc + (r.duration_minutes || 0),
        0,
      ),
    };

    return res.json({ success: true, records, summary });
  } catch (error) {
    console.error("getAttendance error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to fetch attendance.",
      });
  }
});

// ── POST /api/ojt-attendance ──────────────────────────────────────────────────
// Create an attendance record.
router.post("/", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureAttendanceTable();

    const studentId = String(req.body.student_id || "").trim();
    const attendanceDate = String(req.body.attendance_date || "").trim();

    if (!studentId || !attendanceDate) {
      return res
        .status(400)
        .json({
          success: false,
          message: "student_id and attendance_date are required.",
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

    const datetimeIn = req.body.datetime_in || null;
    const datetimeOut = req.body.datetime_out || null;
    const durationMinutes = computeDuration(datetimeIn, datetimeOut);
    const status = req.body.status || "present";
    const proofUrl = req.body.proof_url || null;
    const proofPublicId = req.body.proof_public_id || null;
    const notes = String(req.body.notes || "").trim() || null;
    const source = req.body.source === "student" ? "student" : "coordinator";

    const result = await query(
      `INSERT INTO ojt_attendance
       (ojt_student_id, student_id_ref, attendance_date, datetime_in, datetime_out,
        duration_minutes, status, proof_url, proof_public_id, notes, recorded_by_user_id, source, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbId,
        studentId,
        attendanceDate,
        datetimeIn,
        datetimeOut,
        durationMinutes,
        status,
        proofUrl,
        proofPublicId,
        notes,
        req.user?.id || null,
        source,
        dept,
      ],
    );

    const rows = await query(
      "SELECT * FROM ojt_attendance WHERE id = ? LIMIT 1",
      [result.insertId],
    );
    return res.status(201).json({ success: true, record: rows[0] });
  } catch (error) {
    console.error("createAttendance error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to create attendance record.",
      });
  }
});

// ── PATCH /api/ojt-attendance/:id ────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureAttendanceTable();

    const existing = await query(
      "SELECT id, datetime_in, datetime_out FROM ojt_attendance WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Record not found." });

    const fields = [];
    const vals = [];

    const datetimeIn =
      req.body.datetime_in !== undefined
        ? req.body.datetime_in || null
        : existing[0].datetime_in;
    const datetimeOut =
      req.body.datetime_out !== undefined
        ? req.body.datetime_out || null
        : existing[0].datetime_out;

    if (req.body.datetime_in !== undefined) {
      fields.push("datetime_in = ?");
      vals.push(datetimeIn);
    }
    if (req.body.datetime_out !== undefined) {
      fields.push("datetime_out = ?");
      vals.push(datetimeOut);
    }
    if (
      req.body.datetime_in !== undefined ||
      req.body.datetime_out !== undefined
    ) {
      fields.push("duration_minutes = ?");
      vals.push(computeDuration(datetimeIn, datetimeOut));
    }
    if (req.body.attendance_date !== undefined) {
      fields.push("attendance_date = ?");
      vals.push(req.body.attendance_date || null);
    }
    if (req.body.status !== undefined) {
      fields.push("status = ?");
      vals.push(req.body.status);
    }
    if (req.body.notes !== undefined) {
      fields.push("notes = ?");
      vals.push(String(req.body.notes).trim() || null);
    }
    if (req.body.proof_url !== undefined) {
      fields.push("proof_url = ?", "proof_public_id = ?");
      vals.push(req.body.proof_url || null, req.body.proof_public_id || null);
    }

    if (!fields.length)
      return res
        .status(400)
        .json({ success: false, message: "No fields to update." });

    vals.push(id, dept);
    await query(
      `UPDATE ojt_attendance SET ${fields.join(", ")} WHERE id = ? AND department = ?`,
      vals,
    );

    const rows = await query(
      "SELECT * FROM ojt_attendance WHERE id = ? LIMIT 1",
      [id],
    );
    return res.json({ success: true, record: rows[0] });
  } catch (error) {
    console.error("updateAttendance error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to update attendance record.",
      });
  }
});

// ── DELETE /api/ojt-attendance/:id ──────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureAttendanceTable();
    await query("DELETE FROM ojt_attendance WHERE id = ? AND department = ?", [
      id,
      dept,
    ]);
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteAttendance error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to delete attendance record.",
      });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeDuration(datetimeIn, datetimeOut) {
  if (!datetimeIn || !datetimeOut) return null;
  const inTime = new Date(datetimeIn);
  const outTime = new Date(datetimeOut);
  if (isNaN(inTime) || isNaN(outTime)) return null;
  const diff = outTime - inTime;
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

module.exports = router;
module.exports.ensureAttendanceTable = ensureAttendanceTable;
