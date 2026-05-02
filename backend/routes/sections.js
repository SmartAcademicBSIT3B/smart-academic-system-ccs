const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

let sectionsTablePrepared = false;
let sectionsTablePreparationPromise = null;

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

async function ensureSectionsTable() {
  if (sectionsTablePrepared) return;
  if (sectionsTablePreparationPromise) {
    await sectionsTablePreparationPromise;
    return;
  }

  sectionsTablePreparationPromise = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS sections (
         id INT NOT NULL AUTO_INCREMENT,
         section_name VARCHAR(120) NOT NULL,
         department VARCHAR(120) NOT NULL DEFAULT 'CCS',
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_sections_department (department),
         KEY idx_sections_name (section_name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const sectionNameColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sections'
          AND COLUMN_NAME = 'section_name'
        LIMIT 1`,
    );

    const sectionsNameColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sections'
          AND COLUMN_NAME = 'sections_name'
        LIMIT 1`,
    );

    const createdAtColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sections'
          AND COLUMN_NAME = 'created_at'
        LIMIT 1`,
    );

    const updatedAtColumnRows = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sections'
          AND COLUMN_NAME = 'updated_at'
        LIMIT 1`,
    );

    const hasSectionName =
      Array.isArray(sectionNameColumnRows) && sectionNameColumnRows.length > 0;
    const hasSectionsName =
      Array.isArray(sectionsNameColumnRows) &&
      sectionsNameColumnRows.length > 0;
    const hasCreatedAt =
      Array.isArray(createdAtColumnRows) && createdAtColumnRows.length > 0;
    const hasUpdatedAt =
      Array.isArray(updatedAtColumnRows) && updatedAtColumnRows.length > 0;

    if (!hasSectionName) {
      await query(
        `ALTER TABLE sections
         ADD COLUMN section_name VARCHAR(120) NOT NULL DEFAULT ''`,
      );
    }

    if (!hasCreatedAt) {
      await query(
        `ALTER TABLE sections
         ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      );
    }

    if (!hasUpdatedAt) {
      await query(
        `ALTER TABLE sections
         ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
      );
    }

    if (hasSectionsName) {
      await query(
        `UPDATE sections
            SET section_name = sections_name
          WHERE section_name IS NULL OR TRIM(section_name) = ''`,
      );
    }

    sectionsTablePrepared = true;
  })();

  try {
    await sectionsTablePreparationPromise;
  } finally {
    sectionsTablePreparationPromise = null;
  }
}

function sanitizeSectionPayload(payload = {}) {
  const section_name = asText(
    payload.section_name || payload.sections_name || payload.sectionName,
  );

  const errors = [];
  if (!section_name) errors.push("section_name is required.");

  return {
    section_name,
    errors,
  };
}

function mapRow(row) {
  const normalizedSectionName = row.section_name || row.sections_name;
  return {
    id: row.id,
    section_name: normalizedSectionName,
    sections_name: normalizedSectionName,
    department: row.department,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/sections - List all sections for department
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureSectionsTable();
    const department = getRequestDepartment(req);

    const rows = await query(
      `SELECT id, section_name, section_name AS sections_name, department, created_at, updated_at
         FROM sections
        WHERE department = ?
        ORDER BY section_name ASC`,
      [department],
    );

    return res.json({
      success: true,
      sections: Array.isArray(rows) ? rows.map(mapRow) : [],
    });
  } catch (error) {
    console.error("getSections error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch sections.",
    });
  }
});

// POST /api/sections - Create new section
router.post("/", requireAuth, async (req, res) => {
  try {
    await ensureSectionsTable();

    const payload = sanitizeSectionPayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const department = getRequestDepartment(req);

    const result = await query(
      `INSERT INTO sections (section_name, department)
       VALUES (?, ?)`,
      [payload.section_name, department],
    );

    const rows = await query(
      `SELECT id, section_name, section_name AS sections_name, department, created_at, updated_at
         FROM sections
        WHERE id = ?
        LIMIT 1`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Section created successfully.",
      section: mapRow(rows[0]),
    });
  } catch (error) {
    console.error("createSection error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create section.",
    });
  }
});

// PATCH /api/sections/:id - Update section
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureSectionsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid section ID is required.",
      });
    }

    const payload = sanitizeSectionPayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const department = getRequestDepartment(req);

    const existing = await query(
      `SELECT id
         FROM sections
        WHERE id = ? AND department = ?
        LIMIT 1`,
      [id, department],
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Section not found.",
      });
    }

    await query(
      `UPDATE sections
          SET section_name = ?
        WHERE id = ? AND department = ?`,
      [payload.section_name, id, department],
    );

    const rows = await query(
      `SELECT id, section_name, section_name AS sections_name, department, created_at, updated_at
         FROM sections
        WHERE id = ?
        LIMIT 1`,
      [id],
    );

    return res.json({
      success: true,
      message: "Section updated successfully.",
      section: mapRow(rows[0]),
    });
  } catch (error) {
    console.error("updateSection error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update section.",
    });
  }
});

// DELETE /api/sections/:id - Delete section
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureSectionsTable();

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid section ID is required.",
      });
    }

    const department = getRequestDepartment(req);

    const existing = await query(
      `SELECT id
         FROM sections
        WHERE id = ? AND department = ?
        LIMIT 1`,
      [id, department],
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Section not found or already deleted.",
      });
    }

    await query(
      `DELETE FROM sections
        WHERE id = ? AND department = ?`,
      [id, department],
    );

    return res.json({
      success: true,
      message: "Section deleted successfully.",
    });
  } catch (error) {
    console.error("deleteSection error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete section.",
    });
  }
});

module.exports = router;
