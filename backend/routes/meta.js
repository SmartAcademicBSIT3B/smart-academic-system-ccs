const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/meta/departments ─────────────────────────────────────────────────
router.get("/departments", requireAuth, async (req, res) => {
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
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to fetch departments.",
        departments: [],
      });
  }
});

// ── GET /api/meta/sections ────────────────────────────────────────────────────
router.get("/sections", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM sections ORDER BY section_name ASC",
    );
    return res.json({ success: true, sections: rows });
  } catch (error) {
    console.error("getSections error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to fetch sections.",
      });
  }
});

// ── GET /api/meta/professors ──────────────────────────────────────────────────
router.get("/professors", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM users WHERE role = 'professor' AND status = 'active' ORDER BY name ASC",
    );
    return res.json({ success: true, professors: rows });
  } catch (error) {
    console.error("getProfessors error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to fetch professors.",
      });
  }
});

module.exports = router;
