const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/meta/departments ─────────────────────────────────────────────────
// Public so pre-login pages can populate department branding/settings.
router.get("/departments", async (req, res) => {
  try {
    let departments = [];
    try {
      departments = await query(
        "SELECT id, department_name, department_code, logo_url, created_at FROM department ORDER BY department_name ASC",
      );
    } catch (_err) {
      departments = await query(
        "SELECT id, department_name, department_code, logo_url, created_at FROM departments ORDER BY department_name ASC",
      );
    }
    return res.json({
      success: true,
      departments: Array.isArray(departments) ? departments : [],
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
