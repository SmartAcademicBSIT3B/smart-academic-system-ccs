const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

let sectionAssignmentsPrepared = false;
let sectionAssignmentsPreparationPromise = null;
let sectionAssignmentsHasDateAssigned = false;

function asText(value) {
  return String(value || "").trim();
}

function normalizeDepartment(value) {
  const normalized = asText(value).toUpperCase();
  return normalized || "CCS";
}

function getRequestDepartment(req) {
  return normalizeDepartment(
    req?.headers?.["x-department"] || req?.user?.department_code || "CCS",
  );
}

function parseDateTimeInput(value) {
  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toSqlDateTime(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

async function ensureSectionAssignmentsTable() {
  if (sectionAssignmentsPrepared) return;
  if (sectionAssignmentsPreparationPromise) {
    await sectionAssignmentsPreparationPromise;
    return;
  }

  sectionAssignmentsPreparationPromise = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS section_assignments (
         id INT NOT NULL AUTO_INCREMENT,
         section_name VARCHAR(120) NOT NULL,
         professor_name VARCHAR(180) NOT NULL,
         department VARCHAR(120) NOT NULL DEFAULT 'CCS',
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_section_assignments_department (department),
         KEY idx_section_assignments_section (section_name),
         KEY idx_section_assignments_professor (professor_name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const dateAssignedColumnRows = await query(
      `SELECT COLUMN_NAME, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'section_assignments'
          AND COLUMN_NAME = 'date_assigned'
        LIMIT 1`,
    );

    sectionAssignmentsHasDateAssigned =
      Array.isArray(dateAssignedColumnRows) &&
      dateAssignedColumnRows.length > 0;

    if (sectionAssignmentsHasDateAssigned) {
      const dataType = String(
        dateAssignedColumnRows[0]?.DATA_TYPE || "",
      ).toLowerCase();
      try {
        if (dataType === "date") {
          await query(
            `ALTER TABLE section_assignments
             MODIFY COLUMN date_assigned DATE NOT NULL DEFAULT (CURRENT_DATE)`,
          );
        } else if (dataType === "datetime") {
          await query(
            `ALTER TABLE section_assignments
             MODIFY COLUMN date_assigned DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
          );
        } else {
          await query(
            `ALTER TABLE section_assignments
             MODIFY COLUMN date_assigned TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
          );
        }
      } catch (_alterDateAssignedError) {
        // Keep runtime compatibility for older schemas; POST will still set date_assigned explicitly.
      }
    }

    sectionAssignmentsPrepared = true;
  })();

  try {
    await sectionAssignmentsPreparationPromise;
  } finally {
    sectionAssignmentsPreparationPromise = null;
  }
}

function sanitizePayload(payload = {}) {
  const section_name = asText(payload.section_name || payload.sectionName);
  const professor_name = asText(
    payload.professor_name || payload.professorName,
  );

  const errors = [];
  if (!section_name) errors.push("section_name is required.");
  if (!professor_name) errors.push("professor_name is required.");

  return {
    section_name,
    professor_name,
    errors,
  };
}

function mapRow(row) {
  return {
    id: row.id,
    section_name: row.section_name,
    professor_name: row.professor_name,
    department: row.department,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureSectionAssignmentsTable();
    const department = getRequestDepartment(req);

    const rows = await query(
      `SELECT id, section_name, professor_name, department, created_at, updated_at
         FROM section_assignments
        WHERE department = ?
        ORDER BY id DESC`,
      [department],
    );

    return res.json({
      success: true,
      sectionAssignments: Array.isArray(rows) ? rows.map(mapRow) : [],
    });
  } catch (error) {
    console.error("getSectionAssignments error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch section assignments.",
    });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    await ensureSectionAssignmentsTable();

    const payload = sanitizePayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const department = getRequestDepartment(req);

    const result = sectionAssignmentsHasDateAssigned
      ? await query(
          `INSERT INTO section_assignments (section_name, professor_name, department, date_assigned)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [payload.section_name, payload.professor_name, department],
        )
      : await query(
          `INSERT INTO section_assignments (section_name, professor_name, department)
           VALUES (?, ?, ?)`,
          [payload.section_name, payload.professor_name, department],
        );

    const rows = await query(
      `SELECT id, section_name, professor_name, department, created_at, updated_at
         FROM section_assignments
        WHERE id = ?
        LIMIT 1`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Section assignment added successfully.",
      sectionAssignment: mapRow(rows[0]),
    });
  } catch (error) {
    console.error("createSectionAssignment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create section assignment.",
    });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureSectionAssignmentsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid section assignment ID is required.",
      });
    }

    const payload = sanitizePayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const department = getRequestDepartment(req);

    const existing = await query(
      `SELECT id
         FROM section_assignments
        WHERE id = ? AND department = ?
        LIMIT 1`,
      [id, department],
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Section assignment not found.",
      });
    }

    await query(
      `UPDATE section_assignments
          SET section_name = ?,
              professor_name = ?
        WHERE id = ? AND department = ?`,
      [payload.section_name, payload.professor_name, id, department],
    );

    const rows = await query(
      `SELECT id, section_name, professor_name, department, created_at, updated_at
         FROM section_assignments
        WHERE id = ?
        LIMIT 1`,
      [id],
    );

    return res.json({
      success: true,
      message: "Section assignment updated successfully.",
      sectionAssignment: mapRow(rows[0]),
    });
  } catch (error) {
    console.error("updateSectionAssignment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update section assignment.",
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureSectionAssignmentsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid section assignment ID is required.",
      });
    }

    const department = getRequestDepartment(req);

    const existing = await query(
      `SELECT id
         FROM section_assignments
        WHERE id = ? AND department = ?
        LIMIT 1`,
      [id, department],
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Section assignment not found or already deleted.",
      });
    }

    await query(
      `DELETE FROM section_assignments
        WHERE id = ? AND department = ?`,
      [id, department],
    );

    return res.json({
      success: true,
      message: "Section assignment deleted successfully.",
    });
  } catch (error) {
    console.error("deleteSectionAssignment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete section assignment.",
    });
  }
});

module.exports = router;
