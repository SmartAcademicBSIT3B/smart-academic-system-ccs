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

let tablePrepared = false;
async function ensureScheduleTable() {
  if (tablePrepared) return;

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_student_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL COMMENT 'FK to ojt_students.id',
      student_id_ref VARCHAR(120) NOT NULL COMMENT 'denormalized student_id',
      start_date DATE NULL,
      day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
      time_in TIME NOT NULL,
      time_out TIME NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_oss_student_day (ojt_student_id, day_of_week),
      INDEX idx_oss_student (ojt_student_id),
      INDEX idx_oss_day (day_of_week),
      INDEX idx_oss_dept (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const startDateColumn = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ojt_student_schedules'
       AND COLUMN_NAME = 'start_date'
     LIMIT 1`,
  );

  if (!Array.isArray(startDateColumn) || startDateColumn.length === 0) {
    await query(
      `ALTER TABLE ojt_student_schedules
       ADD COLUMN start_date DATE NULL
       AFTER student_id_ref`,
    );
  }

  tablePrepared = true;
}

async function getStudentDbId(studentId, dept) {
  const rows = await query(
    "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
    [studentId, dept],
  );
  if (!rows.length) return null;
  return rows[0].id;
}

function normalizeDay(dayValue) {
  const normalized = String(dayValue || "")
    .trim()
    .toLowerCase();
  const map = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return map[normalized] || "";
}

// GET /api/ojt-student-schedules/:studentId
router.get("/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    await ensureScheduleTable();

    const dbId = await getStudentDbId(studentId, dept);
    if (!dbId) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    const schedules = await query(
      `SELECT id, student_id_ref, start_date, day_of_week, time_in, time_out, is_active
       FROM ojt_student_schedules
       WHERE ojt_student_id = ? AND department = ?
       ORDER BY FIELD(day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') ASC`,
      [dbId, dept],
    );

    return res.json({ success: true, schedules });
  } catch (error) {
    console.error("getOjtStudentSchedules error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch schedules.",
    });
  }
});

// POST /api/ojt-student-schedules
router.post("/", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureScheduleTable();

    const studentId = String(req.body.student_id || "").trim();
    const startDate = String(req.body.start_date || "").trim() || null;
    const day = normalizeDay(req.body.day_of_week);
    const timeIn = String(req.body.time_in || "").trim();
    const timeOut = String(req.body.time_out || "").trim();
    const isActive =
      req.body.is_active === 0 || req.body.is_active === "0" ? 0 : 1;

    if (!studentId || !day || !timeIn || !timeOut) {
      return res.status(400).json({
        success: false,
        message: "student_id, day_of_week, time_in, and time_out are required.",
      });
    }

    const dbId = await getStudentDbId(studentId, dept);
    if (!dbId) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    const result = await query(
      `INSERT INTO ojt_student_schedules
       (ojt_student_id, student_id_ref, start_date, day_of_week, time_in, time_out, is_active, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         start_date = VALUES(start_date),
         time_in = VALUES(time_in),
         time_out = VALUES(time_out),
         is_active = VALUES(is_active),
         updated_at = CURRENT_TIMESTAMP`,
      [dbId, studentId, startDate, day, timeIn, timeOut, isActive, dept],
    );

    let rowId = result.insertId;
    if (!rowId) {
      const row = await query(
        `SELECT id FROM ojt_student_schedules
         WHERE ojt_student_id = ? AND day_of_week = ? AND department = ?
         LIMIT 1`,
        [dbId, day, dept],
      );
      rowId = row?.[0]?.id || null;
    }

    const rows = await query(
      "SELECT * FROM ojt_student_schedules WHERE id = ? LIMIT 1",
      [rowId],
    );

    return res.status(201).json({ success: true, schedule: rows[0] || null });
  } catch (error) {
    console.error("createOjtStudentSchedule error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save schedule.",
    });
  }
});

// PATCH /api/ojt-student-schedules/:id
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureScheduleTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const existingRows = await query(
      "SELECT * FROM ojt_student_schedules WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!existingRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Schedule not found." });
    }

    const existing = existingRows[0];
    const nextStartDate =
      req.body.start_date !== undefined
        ? String(req.body.start_date || "").trim() || null
        : existing.start_date;
    const nextDay =
      req.body.day_of_week !== undefined
        ? normalizeDay(req.body.day_of_week)
        : existing.day_of_week;
    const nextTimeIn =
      req.body.time_in !== undefined
        ? String(req.body.time_in || "").trim()
        : existing.time_in;
    const nextTimeOut =
      req.body.time_out !== undefined
        ? String(req.body.time_out || "").trim()
        : existing.time_out;
    const nextIsActive =
      req.body.is_active !== undefined
        ? req.body.is_active === 0 || req.body.is_active === "0"
          ? 0
          : 1
        : existing.is_active;

    if (!nextDay || !nextTimeIn || !nextTimeOut) {
      return res.status(400).json({
        success: false,
        message: "day_of_week, time_in, and time_out are required.",
      });
    }

    await query(
      `UPDATE ojt_student_schedules
       SET start_date = ?, day_of_week = ?, time_in = ?, time_out = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND department = ?`,
      [nextStartDate, nextDay, nextTimeIn, nextTimeOut, nextIsActive, id, dept],
    );

    const rows = await query(
      "SELECT * FROM ojt_student_schedules WHERE id = ? LIMIT 1",
      [id],
    );
    return res.json({ success: true, schedule: rows[0] || null });
  } catch (error) {
    console.error("updateOjtStudentSchedule error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update schedule.",
    });
  }
});

// DELETE /api/ojt-student-schedules/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureScheduleTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    await query(
      "DELETE FROM ojt_student_schedules WHERE id = ? AND department = ?",
      [id, dept],
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("deleteOjtStudentSchedule error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete schedule.",
    });
  }
});

module.exports = router;
module.exports.ensureScheduleTable = ensureScheduleTable;
