const express = require("express");
const { pool, query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const DEFAULT_OJT_MANAGER_SETTINGS = {
  preRateLimitPerDay: 10,
  postRateLimitPerDay: 10,
  dailyRateLimitPerDay: 5,
  weeklyRateLimitPerDay: 3,
  preMaxFileSizeMB: 25,
  postMaxFileSizeMB: 25,
  dailyMaxFileSizeMB: 25,
  weeklyMaxFileSizeMB: 25,
};

const DEPT_HEADER = "x-department";
function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

// ── Default pre/post requirement sets ────────────────────────────────────────
const DEFAULT_PRE_REQUIREMENTS = [
  "Curriculum Vitae",
  "Recommendation Letter",
  "Training Agreement",
  "OJT Seminar Certificate",
  "Certificate of Enrollment",
];

const DEFAULT_POST_REQUIREMENTS = [
  "Narrative Report",
  "Evaluation Sheet",
  "Certificate of Completion",
];

// ── Table bootstrap ────────────────────────────────────────────────────────────
let tablesPrepared = false;

async function ensureTables() {
  if (tablesPrepared) return;

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_requirement_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type ENUM('pre', 'post') NOT NULL DEFAULT 'pre',
      scope ENUM('department', 'section', 'student') NOT NULL DEFAULT 'department',
      scope_value VARCHAR(255) NULL COMMENT 'department code, section name, or student_id depending on scope',
      deadline DATE NULL,
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      display_order INT NOT NULL DEFAULT 0,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_by_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ort_dept_type (department, type),
      INDEX idx_ort_scope (scope, scope_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_requirement_submissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      template_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL COMMENT 'denormalized for easy lookup',
      file_url VARCHAR(512) NULL,
      cloudinary_public_id VARCHAR(512) NULL,
      folder_path VARCHAR(512) NULL,
      file_name VARCHAR(255) NULL,
      file_type VARCHAR(50) NULL,
      status ENUM('pending', 'submitted', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
      deadline_override DATE NULL COMMENT 'overrides template deadline for this student',
      verified_by_user_id INT NULL,
      verified_at DATETIME NULL,
      notes TEXT NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_student_template (ojt_student_id, template_id),
      INDEX idx_ors_student (ojt_student_id),
      INDEX idx_ors_template (template_id),
      INDEX idx_ors_status (status, department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_requirements_manager_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department VARCHAR(120) NOT NULL,
      pre_rate_limit_per_day INT NOT NULL DEFAULT 10,
      post_rate_limit_per_day INT NOT NULL DEFAULT 10,
      daily_rate_limit_per_day INT NOT NULL DEFAULT 5,
      weekly_rate_limit_per_day INT NOT NULL DEFAULT 3,
      pre_max_file_size_mb INT NOT NULL DEFAULT 25,
      post_max_file_size_mb INT NOT NULL DEFAULT 25,
      daily_max_file_size_mb INT NOT NULL DEFAULT 25,
      weekly_max_file_size_mb INT NOT NULL DEFAULT 25,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_orms_department (department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_department_hours (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department VARCHAR(120) NOT NULL,
      section_prefix VARCHAR(50) NOT NULL,
      required_hours INT NOT NULL,
      notes VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_odh_department_section (department, section_prefix)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  tablesPrepared = true;
}

function normalizePositiveInt(value, fallback, max = 1000) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeManagerSettingsPayload(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    preRateLimitPerDay: normalizePositiveInt(
      raw.preRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.preRateLimitPerDay,
      100,
    ),
    postRateLimitPerDay: normalizePositiveInt(
      raw.postRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.postRateLimitPerDay,
      100,
    ),
    dailyRateLimitPerDay: normalizePositiveInt(
      raw.dailyRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyRateLimitPerDay,
      100,
    ),
    weeklyRateLimitPerDay: normalizePositiveInt(
      raw.weeklyRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyRateLimitPerDay,
      100,
    ),
    preMaxFileSizeMB: normalizePositiveInt(
      raw.preMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.preMaxFileSizeMB,
      50,
    ),
    postMaxFileSizeMB: normalizePositiveInt(
      raw.postMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.postMaxFileSizeMB,
      50,
    ),
    dailyMaxFileSizeMB: normalizePositiveInt(
      raw.dailyMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyMaxFileSizeMB,
      50,
    ),
    weeklyMaxFileSizeMB: normalizePositiveInt(
      raw.weeklyMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyMaxFileSizeMB,
      50,
    ),
  };
}

async function ensureManagerSettingsRow(dept) {
  const rows = await query(
    `SELECT *
     FROM ojt_requirements_manager_settings
     WHERE department = ?
     LIMIT 1`,
    [dept],
  );

  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }

  await query(
    `INSERT INTO ojt_requirements_manager_settings (
      department,
      pre_rate_limit_per_day,
      post_rate_limit_per_day,
      daily_rate_limit_per_day,
      weekly_rate_limit_per_day,
      pre_max_file_size_mb,
      post_max_file_size_mb,
      daily_max_file_size_mb,
      weekly_max_file_size_mb
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dept,
      DEFAULT_OJT_MANAGER_SETTINGS.preRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.postRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyRateLimitPerDay,
      DEFAULT_OJT_MANAGER_SETTINGS.preMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.postMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyMaxFileSizeMB,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyMaxFileSizeMB,
    ],
  );

  const created = await query(
    `SELECT *
     FROM ojt_requirements_manager_settings
     WHERE department = ?
     LIMIT 1`,
    [dept],
  );
  return created[0] || null;
}

function toManagerSettingsResponse(row = {}) {
  return {
    preRateLimitPerDay: normalizePositiveInt(
      row.pre_rate_limit_per_day,
      DEFAULT_OJT_MANAGER_SETTINGS.preRateLimitPerDay,
      100,
    ),
    postRateLimitPerDay: normalizePositiveInt(
      row.post_rate_limit_per_day,
      DEFAULT_OJT_MANAGER_SETTINGS.postRateLimitPerDay,
      100,
    ),
    dailyRateLimitPerDay: normalizePositiveInt(
      row.daily_rate_limit_per_day,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyRateLimitPerDay,
      100,
    ),
    weeklyRateLimitPerDay: normalizePositiveInt(
      row.weekly_rate_limit_per_day,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyRateLimitPerDay,
      100,
    ),
    preMaxFileSizeMB: normalizePositiveInt(
      row.pre_max_file_size_mb,
      DEFAULT_OJT_MANAGER_SETTINGS.preMaxFileSizeMB,
      50,
    ),
    postMaxFileSizeMB: normalizePositiveInt(
      row.post_max_file_size_mb,
      DEFAULT_OJT_MANAGER_SETTINGS.postMaxFileSizeMB,
      50,
    ),
    dailyMaxFileSizeMB: normalizePositiveInt(
      row.daily_max_file_size_mb,
      DEFAULT_OJT_MANAGER_SETTINGS.dailyMaxFileSizeMB,
      50,
    ),
    weeklyMaxFileSizeMB: normalizePositiveInt(
      row.weekly_max_file_size_mb,
      DEFAULT_OJT_MANAGER_SETTINGS.weeklyMaxFileSizeMB,
      50,
    ),
  };
}

// ── Seed defaults ─────────────────────────────────────────────────────────────
async function seedDefaultTemplates(department) {
  const existingDefaults = await query(
    `SELECT name, type
     FROM ojt_requirement_templates
     WHERE department = ?
       AND scope = 'department'
       AND scope_value = ?
       AND type IN ('pre', 'post')`,
    [department, department],
  );

  const existingSet = new Set(
    existingDefaults.map(
      (row) =>
        `${String(row.type).toLowerCase()}::${String(row.name).toLowerCase()}`,
    ),
  );

  const toInsert = [
    ...DEFAULT_PRE_REQUIREMENTS.map((name, i) => ({
      name,
      type: "pre",
      scope: "department",
      scopeValue: department,
      displayOrder: i,
    })),
    ...DEFAULT_POST_REQUIREMENTS.map((name, i) => ({
      name,
      type: "post",
      scope: "department",
      scopeValue: department,
      displayOrder: i,
    })),
  ];

  for (const item of toInsert) {
    const key = `${item.type}::${String(item.name).toLowerCase()}`;
    if (existingSet.has(key)) continue;

    await query(
      `INSERT INTO ojt_requirement_templates
       (name, type, scope, scope_value, department, display_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.name,
        item.type,
        item.scope,
        item.scopeValue,
        department,
        item.displayOrder,
      ],
    );
  }
}

// ── Deadline badge helper (returned for UI) ───────────────────────────────────
function deadlineBadge(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { status: "overdue", days: Math.abs(diffDays) };
  if (diffDays <= 3) return { status: "soon", days: diffDays };
  return { status: "ok", days: diffDays };
}

// ── GET /api/ojt-requirements/templates ───────────────────────────────────────
// Returns templates applicable to a student: department-wide + section + student-specific.
// Query params: ?student_id=&section=&type=pre|post
router.get("/templates", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    await seedDefaultTemplates(dept);

    const type = req.query.type === "post" ? "post" : "pre";
    const studentId = String(req.query.student_id || "").trim();
    const section = String(req.query.section || "").trim();

    let rows;
    if (studentId && section) {
      rows = await query(
        `SELECT * FROM ojt_requirement_templates
         WHERE department = ? AND type = ?
           AND (
             (scope = 'department' AND scope_value = ?) OR
             (scope = 'section' AND scope_value = ?) OR
             (scope = 'student' AND scope_value = ?)
           )
         ORDER BY display_order ASC, id ASC`,
        [dept, type, dept, section, studentId],
      );
    } else {
      rows = await query(
        `SELECT * FROM ojt_requirement_templates
         WHERE department = ? AND type = ? AND scope = 'department'
         ORDER BY display_order ASC, id ASC`,
        [dept, type],
      );
    }

    const templates = rows.map((r) => ({
      ...r,
      deadline_badge: deadlineBadge(r.deadline),
    }));

    return res.json({ success: true, templates });
  } catch (error) {
    console.error("getRequirementTemplates error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch templates.",
    });
  }
});

// ── POST /api/ojt-requirements/templates ─────────────────────────────────────
// Create a new requirement template.
router.post("/templates", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();

    const name = String(req.body.name || "").trim();
    const type = req.body.type === "post" ? "post" : "pre";
    const scope = ["department", "section", "student"].includes(req.body.scope)
      ? req.body.scope
      : "department";
    const scopeValue =
      String(req.body.scope_value || "").trim() ||
      (scope === "department" ? dept : null);
    const deadline = req.body.deadline || null;

    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "Requirement name is required." });

    const result = await query(
      `INSERT INTO ojt_requirement_templates
       (name, type, scope, scope_value, deadline, department, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, type, scope, scopeValue, deadline, dept, req.user?.id || null],
    );

    const rows = await query(
      "SELECT * FROM ojt_requirement_templates WHERE id = ? LIMIT 1",
      [result.insertId],
    );
    return res.status(201).json({
      success: true,
      template: { ...rows[0], deadline_badge: deadlineBadge(rows[0].deadline) },
    });
  } catch (error) {
    console.error("createRequirementTemplate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create template.",
    });
  }
});

// ── PATCH /api/ojt-requirements/templates/:id ────────────────────────────────
router.patch("/templates/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureTables();

    const existing = await query(
      "SELECT id FROM ojt_requirement_templates WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Template not found." });

    const fields = [];
    const vals = [];
    if (req.body.name !== undefined) {
      fields.push("name = ?");
      vals.push(String(req.body.name).trim());
    }
    if (req.body.deadline !== undefined) {
      fields.push("deadline = ?");
      vals.push(req.body.deadline || null);
    }
    if (req.body.is_required !== undefined) {
      fields.push("is_required = ?");
      vals.push(req.body.is_required ? 1 : 0);
    }
    if (!fields.length)
      return res
        .status(400)
        .json({ success: false, message: "No fields to update." });

    vals.push(id, dept);
    await query(
      `UPDATE ojt_requirement_templates SET ${fields.join(", ")} WHERE id = ? AND department = ?`,
      vals,
    );

    const rows = await query(
      "SELECT * FROM ojt_requirement_templates WHERE id = ? LIMIT 1",
      [id],
    );
    return res.json({
      success: true,
      template: { ...rows[0], deadline_badge: deadlineBadge(rows[0].deadline) },
    });
  } catch (error) {
    console.error("updateRequirementTemplate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update template.",
    });
  }
});

// ── DELETE /api/ojt-requirements/templates/:id ──────────────────────────────
router.delete("/templates/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureTables();
    await query(
      "DELETE FROM ojt_requirement_templates WHERE id = ? AND department = ?",
      [id, dept],
    );
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteRequirementTemplate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete template.",
    });
  }
});

// ── GET /api/ojt-requirements/settings ──────────────────────────────────────
router.get("/settings", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    const row = await ensureManagerSettingsRow(dept);
    return res.json({
      success: true,
      settings: toManagerSettingsResponse(row),
    });
  } catch (error) {
    console.error("getOjtManagerSettings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch OJT settings.",
    });
  }
});

// ── PATCH /api/ojt-requirements/settings ────────────────────────────────────
router.patch("/settings", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    await ensureManagerSettingsRow(dept);
    const payload = normalizeManagerSettingsPayload(req.body || {});

    await query(
      `UPDATE ojt_requirements_manager_settings
       SET pre_rate_limit_per_day = ?,
           post_rate_limit_per_day = ?,
           daily_rate_limit_per_day = ?,
           weekly_rate_limit_per_day = ?,
           pre_max_file_size_mb = ?,
           post_max_file_size_mb = ?,
           daily_max_file_size_mb = ?,
           weekly_max_file_size_mb = ?
       WHERE department = ?`,
      [
        payload.preRateLimitPerDay,
        payload.postRateLimitPerDay,
        payload.dailyRateLimitPerDay,
        payload.weeklyRateLimitPerDay,
        payload.preMaxFileSizeMB,
        payload.postMaxFileSizeMB,
        payload.dailyMaxFileSizeMB,
        payload.weeklyMaxFileSizeMB,
        dept,
      ],
    );

    const row = await ensureManagerSettingsRow(dept);
    return res.json({
      success: true,
      settings: toManagerSettingsResponse(row),
    });
  } catch (error) {
    console.error("updateOjtManagerSettings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update OJT settings.",
    });
  }
});

// ── GET /api/ojt-requirements/department-hours ─────────────────────────────
router.get("/department-hours", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    const rows = await query(
      `SELECT id, department, section_prefix, required_hours, notes, updated_at
       FROM ojt_department_hours
       WHERE department = ?
       ORDER BY section_prefix ASC`,
      [dept],
    );
    return res.json({ success: true, hours: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    console.error("getDepartmentHours error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch required OJT hours.",
    });
  }
});

// ── POST /api/ojt-requirements/department-hours ────────────────────────────
router.post("/department-hours", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();

    const sectionPrefix = String(req.body.section_prefix || "")
      .trim()
      .toUpperCase();
    const requiredHours = normalizePositiveInt(
      req.body.required_hours,
      1,
      2000,
    );
    const notes = String(req.body.notes || "").trim() || null;

    if (!sectionPrefix) {
      return res.status(400).json({
        success: false,
        message: "section_prefix is required.",
      });
    }

    const existing = await query(
      `SELECT id
       FROM ojt_department_hours
       WHERE department = ? AND section_prefix = ?
       LIMIT 1`,
      [dept, sectionPrefix],
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Section prefix already exists for this department.",
      });
    }

    const result = await query(
      `INSERT INTO ojt_department_hours (department, section_prefix, required_hours, notes)
       VALUES (?, ?, ?, ?)`,
      [dept, sectionPrefix, requiredHours, notes],
    );

    const rows = await query(
      `SELECT id, department, section_prefix, required_hours, notes, updated_at
       FROM ojt_department_hours
       WHERE id = ?
       LIMIT 1`,
      [result.insertId],
    );
    return res.status(201).json({ success: true, hour: rows[0] });
  } catch (error) {
    console.error("createDepartmentHours error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create required hours entry.",
    });
  }
});

// ── PATCH /api/ojt-requirements/department-hours/:id ───────────────────────
router.patch("/department-hours/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const sectionPrefix = String(req.body.section_prefix || "")
      .trim()
      .toUpperCase();
    const requiredHours = normalizePositiveInt(
      req.body.required_hours,
      1,
      2000,
    );
    const notes = String(req.body.notes || "").trim() || null;

    if (!sectionPrefix) {
      return res.status(400).json({
        success: false,
        message: "section_prefix is required.",
      });
    }

    await query(
      `UPDATE ojt_department_hours
       SET section_prefix = ?, required_hours = ?, notes = ?
       WHERE id = ? AND department = ?`,
      [sectionPrefix, requiredHours, notes, id, dept],
    );

    const rows = await query(
      `SELECT id, department, section_prefix, required_hours, notes, updated_at
       FROM ojt_department_hours
       WHERE id = ? AND department = ?
       LIMIT 1`,
      [id, dept],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found." });
    }
    return res.json({ success: true, hour: rows[0] });
  } catch (error) {
    console.error("updateDepartmentHours error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update required hours entry.",
    });
  }
});

// ── DELETE /api/ojt-requirements/department-hours/:id ──────────────────────
router.delete("/department-hours/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    await query(
      `DELETE FROM ojt_department_hours
       WHERE id = ? AND department = ?`,
      [id, dept],
    );
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteDepartmentHours error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete required hours entry.",
    });
  }
});

// ── GET /api/ojt-requirements/submissions/:studentId ────────────────────────
// Returns all requirement submissions for a student (includes template metadata).
router.get("/submissions/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    await ensureTables();
    await seedDefaultTemplates(dept);

    const student = await query(
      "SELECT id, section FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    const dbId = student[0].id;
    const section = student[0].section;

    const type = req.query.type === "post" ? "post" : "pre";

    // Fetch all applicable templates for this student
    const templates = await query(
      `SELECT * FROM ojt_requirement_templates
       WHERE department = ? AND type = ?
         AND (
           (scope = 'department' AND scope_value = ?) OR
           (scope = 'section' AND scope_value = ?) OR
           (scope = 'student' AND scope_value = ?)
         )
       ORDER BY display_order ASC, id ASC`,
      [dept, type, dept, section, studentId],
    );

    // Fetch existing submissions
    const submissions = await query(
      "SELECT * FROM ojt_requirement_submissions WHERE ojt_student_id = ? AND department = ?",
      [dbId, dept],
    );
    const subMap = {};
    submissions.forEach((s) => {
      const status = String(s?.status || "")
        .trim()
        .toLowerCase();
      const isCoordinatorVisible = [
        "submitted",
        "verified",
        "rejected",
      ].includes(status);
      subMap[s.template_id] = isCoordinatorVisible
        ? s
        : {
            ...s,
            file_url: null,
            file_name: null,
            cloudinary_public_id: null,
            folder_path: null,
            file_type: null,
          };
    });

    const result = templates.map((t) => {
      const sub = subMap[t.id] || null;
      const effectiveDeadline = sub?.deadline_override || t.deadline;
      return {
        template: { ...t, deadline_badge: deadlineBadge(effectiveDeadline) },
        submission: sub,
      };
    });

    return res.json({ success: true, requirements: result });
  } catch (error) {
    console.error("getRequirementSubmissions error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch submissions.",
    });
  }
});

// ── PATCH /api/ojt-requirements/submissions/:submissionId ────────────────────
// Update submission: set file, verify, reject, add notes, set deadline override.
router.patch("/submissions/:submissionId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.submissionId, 10);
    await ensureTables();
    await seedDefaultTemplates(dept);

    const existing = await query(
      "SELECT id, template_id, ojt_student_id, status FROM ojt_requirement_submissions WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Submission not found." });

    const fields = [];
    const vals = [];
    const previousStatus = existing[0].status;
    let isRejectingVerified = false;

    if (
      req.body.status !== undefined &&
      ["pending", "submitted", "verified", "rejected"].includes(req.body.status)
    ) {
      // Check if we're rejecting a previously-verified requirement
      if (req.body.status === "rejected" && previousStatus === "verified") {
        isRejectingVerified = true;
      }
      fields.push("status = ?");
      vals.push(req.body.status);
      if (req.body.status === "verified") {
        fields.push("verified_by_user_id = ?", "verified_at = NOW()");
        vals.push(req.user?.id || null);
      }
    }
    if (req.body.notes !== undefined) {
      fields.push("notes = ?");
      vals.push(String(req.body.notes).trim() || null);
    }
    if (req.body.deadline_override !== undefined) {
      fields.push("deadline_override = ?");
      vals.push(req.body.deadline_override || null);
    }
    if (req.body.file_url !== undefined) {
      fields.push(
        "file_url = ?",
        "cloudinary_public_id = ?",
        "folder_path = ?",
        "file_name = ?",
        "file_type = ?",
        "status = ?",
      );
      vals.push(
        req.body.file_url || null,
        req.body.cloudinary_public_id || null,
        req.body.folder_path || null,
        req.body.file_name || null,
        req.body.file_type || null,
        "submitted",
      );
    }

    if (!fields.length)
      return res
        .status(400)
        .json({ success: false, message: "No fields to update." });

    vals.push(id, dept);
    await query(
      `UPDATE ojt_requirement_submissions SET ${fields.join(", ")} WHERE id = ? AND department = ?`,
      vals,
    );

    // Check auto-transition: if all required pre submissions for this student are verified
    const sub = existing[0];
    if (isRejectingVerified) {
      // Auto-demote student status back to "Pending Requirements"
      await demoteStudentStatus(sub.ojt_student_id, dept, req.user?.id);
    } else {
      // Normal auto-promotion check if newly verified
      await checkAutoStatusTransition(sub.ojt_student_id, dept, req.user?.id);
    }

    const rows = await query(
      "SELECT * FROM ojt_requirement_submissions WHERE id = ? LIMIT 1",
      [id],
    );
    return res.json({ success: true, submission: rows[0] });
  } catch (error) {
    console.error("updateRequirementSubmission error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update submission.",
    });
  }
});

// ── POST /api/ojt-requirements/submissions ────────────────────────────────────
// Create (upsert) a submission entry for a student+template.
router.post("/submissions", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureTables();
    await seedDefaultTemplates(dept);

    const studentIdRef = String(req.body.student_id || "").trim();
    const templateId = parseInt(req.body.template_id, 10);

    if (!studentIdRef || !templateId) {
      return res.status(400).json({
        success: false,
        message: "student_id and template_id are required.",
      });
    }

    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentIdRef, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    const dbId = student[0].id;

    const existing = await query(
      "SELECT id FROM ojt_requirement_submissions WHERE ojt_student_id = ? AND template_id = ? LIMIT 1",
      [dbId, templateId],
    );

    if (existing.length) {
      // Delegate to PATCH-like logic inline
      const subId = existing[0].id;
      const fields = ["status = ?"];
      const vals = ["submitted"];

      if (req.body.file_url) {
        fields.push(
          "file_url = ?",
          "cloudinary_public_id = ?",
          "folder_path = ?",
          "file_name = ?",
          "file_type = ?",
        );
        vals.push(
          req.body.file_url,
          req.body.cloudinary_public_id || null,
          req.body.folder_path || null,
          req.body.file_name || null,
          req.body.file_type || null,
        );
      }
      vals.push(subId, dept);
      await query(
        `UPDATE ojt_requirement_submissions SET ${fields.join(", ")} WHERE id = ? AND department = ?`,
        vals,
      );
      const rows = await query(
        "SELECT * FROM ojt_requirement_submissions WHERE id = ? LIMIT 1",
        [subId],
      );
      return res.json({ success: true, submission: rows[0] });
    }

    const result = await query(
      `INSERT INTO ojt_requirement_submissions
       (ojt_student_id, template_id, student_id_ref, file_url, cloudinary_public_id, folder_path, file_name, file_type, status, deadline_override, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbId,
        templateId,
        studentIdRef,
        req.body.file_url || null,
        req.body.cloudinary_public_id || null,
        req.body.folder_path || null,
        req.body.file_name || null,
        req.body.file_type || null,
        req.body.file_url ? "submitted" : "pending",
        req.body.deadline_override || null,
        dept,
      ],
    );

    await checkAutoStatusTransition(dbId, dept, req.user?.id);
    const rows = await query(
      "SELECT * FROM ojt_requirement_submissions WHERE id = ? LIMIT 1",
      [result.insertId],
    );
    return res.status(201).json({ success: true, submission: rows[0] });
  } catch (error) {
    console.error("createRequirementSubmission error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create submission.",
    });
  }
});

// ── DELETE /api/ojt-requirements/submissions/:submissionId ──────────────────
router.delete("/submissions/:submissionId", requireAuth, async (req, res) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  const dept = String(req.headers["x-department"] || "").trim();
  if (!submissionId) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid submission ID." });
  }
  try {
    const rows = await query(
      "SELECT id FROM ojt_requirement_submissions WHERE id = ? AND department = ? LIMIT 1",
      [submissionId, dept],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Submission not found." });
    }
    await query(
      "DELETE FROM ojt_requirement_submissions WHERE id = ? AND department = ?",
      [submissionId, dept],
    );
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteRequirementSubmission error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete submission.",
    });
  }
});

// ── Auto-status transition ────────────────────────────────────────────────────
// If all required PRE templates for this student are verified → set Pre-Deployment
async function checkAutoStatusTransition(dbStudentId, dept, changedByUserId) {
  try {
    const student = await query(
      "SELECT student_id, section, status FROM ojt_students WHERE id = ? LIMIT 1",
      [dbStudentId],
    );
    if (!student.length) return;
    const {
      student_id: studentIdRef,
      section,
      status: currentStatus,
    } = student[0];

    // Already past pre-deployment — don't revert
    if (currentStatus === "Deployed") return;

    const requiredTemplates = await query(
      `SELECT id FROM ojt_requirement_templates
       WHERE type = 'pre' AND is_required = 1 AND department = ?
         AND (
           (scope = 'department' AND scope_value = ?) OR
           (scope = 'section' AND scope_value = ?) OR
           (scope = 'student' AND scope_value = ?)
         )`,
      [dept, dept, section, studentIdRef],
    );
    if (!requiredTemplates.length) return;

    const templateIds = requiredTemplates.map((t) => t.id);
    const placeholders = templateIds.map(() => "?").join(",");
    const verifiedSubs = await query(
      `SELECT template_id FROM ojt_requirement_submissions
       WHERE ojt_student_id = ? AND template_id IN (${placeholders}) AND status = 'verified'`,
      [dbStudentId, ...templateIds],
    );

    if (verifiedSubs.length >= templateIds.length) {
      await query(
        "UPDATE ojt_students SET status = 'Pre-Deployment', updated_at = NOW() WHERE id = ?",
        [dbStudentId],
      );
      const { ensureStatusHistoryTable } = require("./ojt-coordinator");
      await ensureStatusHistoryTable();
      await query(
        "INSERT INTO ojt_status_history (ojt_student_id, old_status, new_status, changed_by_user_id, notes) VALUES (?, ?, ?, ?, ?)",
        [
          dbStudentId,
          currentStatus,
          "Pre-Deployment",
          changedByUserId || null,
          "Auto-transitioned: all pre requirements verified",
        ],
      );
    }
  } catch (_err) {
    // Non-fatal: auto-transition failure should not break the upload response
    console.error("checkAutoStatusTransition error:", _err);
  }
}

// ── Demote student status back to Pending Requirements ──────────────────────
// Called when a verified requirement is rejected
async function demoteStudentStatus(dbStudentId, dept, changedByUserId) {
  try {
    const student = await query(
      "SELECT student_id, status FROM ojt_students WHERE id = ? LIMIT 1",
      [dbStudentId],
    );
    if (!student.length) return;

    const currentStatus = student[0].status;

    // Only demote if currently in Pre-Deployment state
    // (don't demote if already Deployed or OJT Complete)
    if (currentStatus === "Pre-Deployment") {
      await query(
        "UPDATE ojt_students SET status = 'Pending Requirements', updated_at = NOW() WHERE id = ?",
        [dbStudentId],
      );
      const { ensureStatusHistoryTable } = require("./ojt-coordinator");
      await ensureStatusHistoryTable();
      await query(
        "INSERT INTO ojt_status_history (ojt_student_id, old_status, new_status, changed_by_user_id, notes) VALUES (?, ?, ?, ?, ?)",
        [
          dbStudentId,
          currentStatus,
          "Pending Requirements",
          changedByUserId || null,
          "Reverted: verified requirement rejected",
        ],
      );
    }
  } catch (_err) {
    console.error("demoteStudentStatus error:", _err);
  }
}

// ── GET /api/ojt-requirements/submissions/:submissionId ────────────────────
// Get submission details including notes (for student to view rejection reason)
router.get("/submissions/:submissionId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.submissionId, 10);
    await ensureTables();

    const rows = await query(
      `SELECT 
        s.id, s.ojt_student_id, s.template_id, s.student_id_ref,
        s.file_url, s.cloudinary_public_id, s.folder_path, s.file_name, s.file_type,
        s.status, s.notes, s.deadline_override, s.verified_by_user_id, s.verified_at,
        s.created_at, s.updated_at,
        t.name as template_name, t.type as requirement_type
       FROM ojt_requirement_submissions s
       LEFT JOIN ojt_requirement_templates t ON s.template_id = t.id
       WHERE s.id = ? AND s.department = ?
       LIMIT 1`,
      [id, dept],
    );

    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "Submission not found." });

    return res.json({ success: true, submission: rows[0] });
  } catch (error) {
    console.error("getSubmission error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch submission.",
    });
  }
});

module.exports = router;
module.exports.ensureTables = ensureTables;
