const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

let departmentsTableCache = null;
let departmentsTableColumnsCache = null;

async function tableExists(tableName) {
  const rows = await query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function getDepartmentTableColumns(tableName) {
  const cacheKey = String(tableName || "").trim();
  if (departmentsTableColumnsCache?.[cacheKey]) {
    return departmentsTableColumnsCache[cacheKey];
  }

  const rows = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );

  const columns = new Set(
    (Array.isArray(rows) ? rows : []).map((row) =>
      String(row.COLUMN_NAME || "").trim(),
    ),
  );
  departmentsTableColumnsCache = departmentsTableColumnsCache || {};
  departmentsTableColumnsCache[cacheKey] = columns;
  return columns;
}

async function selectDepartmentRows(tableName) {
  const columns = await getDepartmentTableColumns(tableName);
  const selectColumns = [
    "id",
    "department_name",
    "department_code",
    "logo_url",
    "created_at",
  ];

  if (columns.has("updated_at")) {
    selectColumns.push("updated_at");
  }

  const rows = await query(
    `SELECT ${selectColumns.join(", ")}
       FROM ${tableName}
      ORDER BY department_name ASC`,
  );

  return Array.isArray(rows) ? rows : [];
}

async function ensureDepartmentTable(tableName) {
  await query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department_name VARCHAR(180) NOT NULL,
      department_code VARCHAR(50) NOT NULL,
      logo_url VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_department_code (department_code),
      UNIQUE KEY uk_department_name (department_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function resolveDepartmentTableName() {
  if (departmentsTableCache) return departmentsTableCache;

  const hasDepartment = await tableExists("department");
  const hasDepartments = await tableExists("departments");

  if (!hasDepartment && !hasDepartments) {
    await ensureDepartmentTable("department");
    departmentsTableCache = "department";
    return departmentsTableCache;
  }

  if (hasDepartment && hasDepartments) {
    const departmentCount = await query(
      "SELECT COUNT(*) AS total FROM department",
    );
    const departmentsCount = await query(
      "SELECT COUNT(*) AS total FROM departments",
    );
    const departmentTotal = Number(departmentCount?.[0]?.total || 0);
    const departmentsTotal = Number(departmentsCount?.[0]?.total || 0);
    departmentsTableCache =
      departmentTotal >= departmentsTotal ? "department" : "departments";
    return departmentsTableCache;
  }

  departmentsTableCache = hasDepartment ? "department" : "departments";
  return departmentsTableCache;
}

function sanitizeDepartmentPayload(payload = {}) {
  const department_name = String(
    payload.department_name || payload.departmentName || "",
  ).trim();
  const department_code = String(
    payload.department_code || payload.departmentCode || "",
  )
    .trim()
    .toUpperCase();
  const logo_url = String(payload.logo_url || payload.logoUrl || "").trim();

  const errors = [];
  if (!department_name) errors.push("department_name is required.");
  if (!department_code) errors.push("department_code is required.");

  return { department_name, department_code, logo_url, errors };
}

function mapDepartmentRow(row = {}) {
  return {
    id: row.id,
    department_name: row.department_name,
    department_code: row.department_code,
    logo_url: row.logo_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── GET /api/meta/departments ─────────────────────────────────────────────────
// Public so pre-login pages can populate department branding/settings.
router.get("/departments", async (req, res) => {
  try {
    const tableName = await resolveDepartmentTableName();
    const departments = await selectDepartmentRows(tableName);
    return res.json({
      success: true,
      departments,
    });
  } catch (error) {
    console.error("getDepartments error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch departments.",
      departments: [],
    });
  }
});

// ── POST /api/meta/departments ───────────────────────────────────────────────
router.post("/departments", requireAuth, async (req, res) => {
  try {
    const tableName = await resolveDepartmentTableName();
    const payload = sanitizeDepartmentPayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const existing = await query(
      `SELECT id FROM ${tableName} WHERE department_code = ? OR department_name = ? LIMIT 1`,
      [payload.department_code, payload.department_name],
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Department code or name already exists.",
      });
    }

    const result = await query(
      `INSERT INTO ${tableName} (department_name, department_code, logo_url)
       VALUES (?, ?, ?)`,
      [
        payload.department_name,
        payload.department_code,
        payload.logo_url || null,
      ],
    );

    const rows = await selectDepartmentRows(tableName);
    return res.status(201).json({
      success: true,
      message: "Department created successfully.",
      department: mapDepartmentRow(
        rows.find((row) => Number.parseInt(row.id, 10) === result.insertId) ||
          rows[0],
      ),
    });
  } catch (error) {
    console.error("createDepartment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create department.",
    });
  }
});

// ── PATCH /api/meta/departments/:id ─────────────────────────────────────────
router.patch("/departments/:id", requireAuth, async (req, res) => {
  try {
    const tableName = await resolveDepartmentTableName();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const payload = sanitizeDepartmentPayload(req.body);
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const existing = await query(
      `SELECT id, department_code FROM ${tableName} WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!Array.isArray(existing) || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    }

    const duplicate = await query(
      `SELECT id FROM ${tableName}
        WHERE id <> ? AND (department_code = ? OR department_name = ?)
        LIMIT 1`,
      [id, payload.department_code, payload.department_name],
    );
    if (Array.isArray(duplicate) && duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Department code or name already exists.",
      });
    }

    const oldCode = String(existing[0].department_code || "").trim();
    await query(
      `UPDATE ${tableName}
          SET department_name = ?, department_code = ?, logo_url = ?
        WHERE id = ?`,
      [
        payload.department_name,
        payload.department_code,
        payload.logo_url || null,
        id,
      ],
    );

    if (oldCode && oldCode !== payload.department_code) {
      try {
        await query(`UPDATE sections SET department = ? WHERE department = ?`, [
          payload.department_code,
          oldCode,
        ]);
      } catch (_sectionCascadeError) {
        // best effort
      }
    }

    const rows = await selectDepartmentRows(tableName);
    const row = rows.find((item) => Number.parseInt(item.id, 10) === id);

    return res.json({
      success: true,
      message: "Department updated successfully.",
      department: mapDepartmentRow(row),
    });
  } catch (error) {
    console.error("updateDepartment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update department.",
    });
  }
});

// ── DELETE /api/meta/departments/:id ─────────────────────────────────────────
router.delete("/departments/:id", requireAuth, async (req, res) => {
  try {
    const tableName = await resolveDepartmentTableName();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const existing = await query(
      `SELECT id, department_code FROM ${tableName} WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!Array.isArray(existing) || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    }

    const departmentCode = String(existing[0].department_code || "").trim();
    if (departmentCode) {
      try {
        await query(`DELETE FROM sections WHERE department = ?`, [
          departmentCode,
        ]);
      } catch (_sectionDeleteError) {
        // best effort
      }
    }

    await query(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    return res.json({
      success: true,
      message: "Department deleted successfully.",
    });
  } catch (error) {
    console.error("deleteDepartment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete department.",
    });
  }
});

// ── GET /api/meta/sections ────────────────────────────────────────────────────
router.get("/sections", requireAuth, async (req, res) => {
  try {
    const requestedDepartment = String(
      req.query.department ||
        req.headers["x-department"] ||
        req.user?.department_code ||
        "",
    ).trim();

    const departmentCandidates = [];
    if (requestedDepartment) {
      departmentCandidates.push(requestedDepartment);

      try {
        const fromDepartmentTable = await query(
          "SELECT department_name FROM department WHERE department_code = ? LIMIT 1",
          [requestedDepartment],
        );
        const resolvedName = String(
          fromDepartmentTable?.[0]?.department_name || "",
        ).trim();
        if (resolvedName) {
          departmentCandidates.push(resolvedName);
        }
      } catch (_departmentTableError) {
        try {
          const fromDepartmentsTable = await query(
            "SELECT department_name FROM departments WHERE department_code = ? LIMIT 1",
            [requestedDepartment],
          );
          const resolvedName = String(
            fromDepartmentsTable?.[0]?.department_name || "",
          ).trim();
          if (resolvedName) {
            departmentCandidates.push(resolvedName);
          }
        } catch (_departmentsTableError) {
          // ignore lookup errors; fallback to code only
        }
      }
    }

    const uniqueDepartmentCandidates = [...new Set(departmentCandidates)]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const whereClause = uniqueDepartmentCandidates.length
      ? `WHERE department IN (${uniqueDepartmentCandidates
          .map(() => "?")
          .join(",")})`
      : "";

    let rows = [];
    try {
      rows = await query(
        `SELECT id, sections_name, sections_name AS section_name, department, created_at
         FROM sections
         ${whereClause}
         ORDER BY sections_name ASC`,
        uniqueDepartmentCandidates,
      );
    } catch (_sectionsNameError) {
      rows = await query(
        `SELECT id, section_name, section_name AS sections_name, department, created_at
         FROM sections
         ${whereClause}
         ORDER BY section_name ASC`,
        uniqueDepartmentCandidates,
      );
    }

    return res.json({ success: true, sections: rows });
  } catch (error) {
    console.error("getSections error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch sections.",
    });
  }
});

// ── GET /api/meta/professors ──────────────────────────────────────────────────
router.get("/professors", requireAuth, async (req, res) => {
  try {
    const requestedDepartment = String(
      req.query.department ||
        req.headers["x-department"] ||
        req.user?.department ||
        "CCS",
    )
      .trim()
      .toUpperCase();

    const rows = await query(
      "SELECT id, user_id, name, email, role, status, department FROM users WHERE department = ? ORDER BY name ASC",
      [requestedDepartment],
    );
    return res.json({ success: true, professors: rows });
  } catch (error) {
    console.error("getProfessors error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch professors.",
    });
  }
});

module.exports = router;
