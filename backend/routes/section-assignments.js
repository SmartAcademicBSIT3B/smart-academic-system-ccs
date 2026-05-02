const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

let sectionAssignmentsPrepared = false;
let sectionAssignmentsPreparationPromise = null;
let usersHasDepartmentColumn = true;

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
         professor_email VARCHAR(255) NOT NULL DEFAULT '',
         department VARCHAR(120) NOT NULL DEFAULT 'CCS',
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_section_assignments_department (department),
         KEY idx_section_assignments_section (section_name),
         KEY idx_section_assignments_professor (professor_name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const professorEmailColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'section_assignments'
          AND COLUMN_NAME = 'professor_email'
        LIMIT 1`,
    );

    if (
      !Array.isArray(professorEmailColumnRows) ||
      professorEmailColumnRows.length === 0
    ) {
      try {
        await query(
          `ALTER TABLE section_assignments
           ADD COLUMN professor_email VARCHAR(255) NOT NULL DEFAULT ''
           AFTER professor_name`,
        );
      } catch (_alterProfessorEmailError) {
        // If migration races or column already exists due to another process, continue.
      }
    }

    await detectUsersDepartmentColumn();

    try {
      if (usersHasDepartmentColumn) {
        await query(
          `UPDATE section_assignments AS sa
              LEFT JOIN (
                SELECT name, department, MIN(email) AS email
                  FROM users
                 GROUP BY name, department
              ) AS um
                ON um.name COLLATE utf8mb4_unicode_ci = sa.professor_name COLLATE utf8mb4_unicode_ci
               AND um.department COLLATE utf8mb4_unicode_ci = sa.department COLLATE utf8mb4_unicode_ci
             SET sa.professor_email = COALESCE(um.email, '')
           WHERE sa.professor_email IS NULL OR TRIM(sa.professor_email) = ''`,
        );
      } else {
        await query(
          `UPDATE section_assignments AS sa
              LEFT JOIN (
                SELECT name, MIN(email) AS email
                  FROM users
                 GROUP BY name
              ) AS um
                ON um.name COLLATE utf8mb4_unicode_ci = sa.professor_name COLLATE utf8mb4_unicode_ci
             SET sa.professor_email = COALESCE(um.email, '')
           WHERE sa.professor_email IS NULL OR TRIM(sa.professor_email) = ''`,
        );
      }
    } catch (_backfillProfessorEmailError) {
      // Keep startup resilient if user schema differs; create/update paths still populate email.
    }

    const dateAssignedColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'section_assignments'
          AND COLUMN_NAME = 'date_assigned'
        LIMIT 1`,
    );

    if (
      Array.isArray(dateAssignedColumnRows) &&
      dateAssignedColumnRows.length > 0
    ) {
      try {
        await query(
          `ALTER TABLE section_assignments
           DROP COLUMN date_assigned`,
        );
      } catch (_dropDateAssignedError) {
        // Keep serving requests even if legacy column cannot be dropped immediately.
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
  const professor_email = asText(
    payload.professor_email || payload.professorEmail,
  );

  const errors = [];
  if (!section_name) errors.push("section_name is required.");
  if (!professor_name) errors.push("professor_name is required.");

  return {
    section_name,
    professor_name,
    professor_email,
    errors,
  };
}

function mapRow(row) {
  return {
    id: row.id,
    section_name: row.section_name,
    professor_name: row.professor_name,
    professor_email: asText(row.professor_email),
    department: row.department,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function detectUsersDepartmentColumn() {
  try {
    const rows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'department'
        LIMIT 1`,
    );

    usersHasDepartmentColumn = Array.isArray(rows) && rows.length > 0;
  } catch (_error) {
    usersHasDepartmentColumn = false;
  }
}

async function resolveProfessorEmail(department, professorName, fallbackEmail) {
  const fallback = asText(fallbackEmail);
  if (fallback) return fallback;

  const name = asText(professorName);
  if (!name) return "";

  try {
    await detectUsersDepartmentColumn();

    if (usersHasDepartmentColumn) {
      const rows = await query(
        `SELECT email
           FROM users
          WHERE name = ?
            AND department = ?
          ORDER BY id DESC
          LIMIT 1`,
        [name, asText(department)],
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return asText(rows[0]?.email);
      }
    }

    const rows = await query(
      `SELECT email
         FROM users
        WHERE name = ?
        ORDER BY id DESC
        LIMIT 1`,
      [name],
    );

    return Array.isArray(rows) && rows.length > 0 ? asText(rows[0]?.email) : "";
  } catch (_error) {
    return "";
  }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureSectionAssignmentsTable();
    const department = getRequestDepartment(req);

    const rows = await query(
      `SELECT id, section_name, professor_name, professor_email, department, created_at, updated_at
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
    const professorEmail = await resolveProfessorEmail(
      department,
      payload.professor_name,
      payload.professor_email,
    );

    const result = await query(
      `INSERT INTO section_assignments (section_name, professor_name, professor_email, department)
       VALUES (?, ?, ?, ?)`,
      [
        payload.section_name,
        payload.professor_name,
        professorEmail,
        department,
      ],
    );

    const rows = await query(
      `SELECT id, section_name, professor_name, professor_email, department, created_at, updated_at
         FROM section_assignments
        WHERE department = ?
          AND id = ?
        LIMIT 1`,
      [department, result.insertId],
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
    const professorEmail = await resolveProfessorEmail(
      department,
      payload.professor_name,
      payload.professor_email,
    );

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
              professor_name = ?,
              professor_email = ?
        WHERE id = ? AND department = ?`,
      [
        payload.section_name,
        payload.professor_name,
        professorEmail,
        id,
        department,
      ],
    );

    const rows = await query(
      `SELECT id, section_name, professor_name, professor_email, department, created_at, updated_at
         FROM section_assignments
        WHERE department = ?
          AND id = ?
        LIMIT 1`,
      [department, id],
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
