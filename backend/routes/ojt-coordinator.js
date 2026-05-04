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

// Resolve coordinator email: prefer token field, fall back to DB lookup by user_id
async function resolveCoordinatorEmail(req) {
  const dept = getDept(req);
  const tokenEmail = String(req.user?.email || "")
    .trim()
    .toLowerCase();
  if (tokenEmail) return { email: tokenEmail, dept };
  // fall back — look up by user_id from users table
  const rows = await query(
    "SELECT email FROM users WHERE user_id = ? AND department = ? LIMIT 1",
    [req.user?.user_id || "", dept],
  );
  const email = String(rows?.[0]?.email || "")
    .trim()
    .toLowerCase();
  return { email, dept };
}

// ── GET /api/ojt-coordinator/my-sections ──────────────────────────────────────
// Returns sections assigned to the logged-in coordinator (matched by email,
// then name fallback), with a total student count per section.
router.get("/my-sections", requireAuth, async (req, res) => {
  try {
    const { email, dept } = await resolveCoordinatorEmail(req);

    // Find sections assigned to this professor (email match first, then name)
    let assignments = [];
    if (email) {
      assignments = await query(
        `SELECT section_name
         FROM section_assignments
         WHERE department = ? AND LOWER(TRIM(professor_email)) = ?
         ORDER BY section_name ASC`,
        [dept, email],
      );
    }
    if (!assignments.length) {
      const name = String(req.user?.name || "").trim();
      if (name) {
        assignments = await query(
          `SELECT section_name
           FROM section_assignments
           WHERE department = ? AND professor_name = ?
           ORDER BY section_name ASC`,
          [dept, name],
        );
      }
    }

    if (!assignments.length) {
      return res.json({ success: true, sections: [] });
    }

    const sectionNames = assignments.map((r) => r.section_name);
    const placeholders = sectionNames.map(() => "?").join(",");

    const counts = await query(
      `SELECT section, COUNT(*) AS total
       FROM ojt_students
       WHERE department = ? AND section IN (${placeholders})
       GROUP BY section`,
      [dept, ...sectionNames],
    );

    const countMap = {};
    counts.forEach((r) => {
      countMap[r.section] = r.total;
    });

    const sections = sectionNames.map((name) => ({
      section_name: name,
      student_count: countMap[name] || 0,
    }));

    return res.json({ success: true, sections });
  } catch (error) {
    console.error("getMyCoordinatorSections error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch coordinator sections.",
    });
  }
});

// ── GET /api/ojt-coordinator/students/:section ────────────────────────────────
// Returns students for one section, including profile image from students_user,
// and display name normalized to Surname, Firstname format.
router.get("/students/:section", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const section = String(req.params.section || "").trim();
    if (!section)
      return res
        .status(400)
        .json({ success: false, message: "Section is required." });

    const rows = await query(
      `SELECT
         os.id,
         os.student_id,
         os.name,
         os.section,
         os.department,
         os.email,
         os.contact_no,
         os.status,
         os.external_partner_assigned,
         os.nature_of_business,
         os.created_at,
         os.updated_at,
         su.profile_image_url
       FROM ojt_students os
       LEFT JOIN students_user su ON LOWER(TRIM(su.student_id)) = LOWER(TRIM(os.student_id))
       WHERE os.department = ? AND os.section = ?
       ORDER BY os.name ASC`,
      [dept, section],
    );

    const students = rows.map((r) => ({
      ...r,
      display_name: toSurnameFirst(r.name),
    }));
    return res.json({ success: true, students });
  } catch (error) {
    console.error("getCoordinatorSectionStudents error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch students.",
    });
  }
});

// ── GET /api/ojt-coordinator/student/:studentId ───────────────────────────────
// Returns a single student profile with full fields + profile image.
router.get("/student/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    if (!studentId)
      return res
        .status(400)
        .json({ success: false, message: "Student ID is required." });

    const rows = await query(
      `SELECT
         os.id,
         os.student_id,
         os.name,
         os.section,
         os.department,
         os.email,
         os.contact_no,
         os.status,
         os.external_partner_assigned,
         os.nature_of_business,
         os.created_at,
         os.updated_at,
         su.profile_image_url
       FROM ojt_students os
       LEFT JOIN students_user su ON LOWER(TRIM(su.student_id)) = LOWER(TRIM(os.student_id))
       WHERE os.department = ? AND os.student_id = ?
       LIMIT 1`,
      [dept, studentId],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    const archiveLinks = await query(
      `SELECT a.id, a.title, a.type, a.status, a.created_at
       FROM archive_ojt_links l
       INNER JOIN archives a ON a.id = l.archive_id
       WHERE l.ojt_student_id = ?
         AND LOWER(TRIM(l.department)) = LOWER(TRIM(?))
       ORDER BY a.created_at DESC`,
      [rows[0].id, dept],
    );

    const latestStatusByType = {};
    for (const row of archiveLinks) {
      const typeKey = String(row.type || "")
        .trim()
        .toLowerCase();
      if (!typeKey || latestStatusByType[typeKey]) continue;
      latestStatusByType[typeKey] = normalizeArchiveStatus(row.status);
    }

    const statusParts = [];
    if (latestStatusByType.thesis) {
      statusParts.push(`Thesis: ${latestStatusByType.thesis}`);
    }
    if (latestStatusByType.capstone) {
      statusParts.push(`Capstone: ${latestStatusByType.capstone}`);
    }
    if (!statusParts.length && archiveLinks.length) {
      statusParts.push(
        `Latest: ${normalizeArchiveStatus(archiveLinks[0].status)}`,
      );
    }

    const student = {
      ...rows[0],
      display_name: toSurnameFirst(rows[0].name),
      connected_archive_count: archiveLinks.length,
      connected_archive_status:
        statusParts.join(" | ") || "No linked thesis/capstone",
      connected_archive_types: Object.keys(latestStatusByType),
    };
    return res.json({ success: true, student });
  } catch (error) {
    console.error("getCoordinatorStudentProfile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch student profile.",
    });
  }
});

// ── PATCH /api/ojt-coordinator/student/:studentId/partner ─────────────────────
// Updates external_partner_assigned and nature_of_business for a student.
router.patch("/student/:studentId/partner", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    const partner =
      String(req.body.external_partner_assigned || "").trim() || null;
    const nature = String(req.body.nature_of_business || "").trim() || null;

    if (!studentId)
      return res
        .status(400)
        .json({ success: false, message: "Student ID is required." });

    const existing = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });

    await query(
      "UPDATE ojt_students SET external_partner_assigned = ?, nature_of_business = ?, updated_at = NOW() WHERE student_id = ? AND department = ?",
      [partner, nature, studentId, dept],
    );

    return res.json({ success: true, message: "Partner assignment updated." });
  } catch (error) {
    console.error("updateStudentPartner error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update partner.",
    });
  }
});

// ── PATCH /api/ojt-coordinator/student/:studentId/status ─────────────────────
// Updates the student status and records a history entry.
router.patch("/student/:studentId/status", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    const newStatus = String(req.body.status || "").trim();
    const notes = String(req.body.notes || "").trim() || null;

    if (!studentId || !newStatus) {
      return res.status(400).json({
        success: false,
        message: "Student ID and status are required.",
      });
    }

    const existing = await query(
      "SELECT id, status FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!existing.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });

    const oldStatus = existing[0].status;
    const dbId = existing[0].id;

    await query(
      "UPDATE ojt_students SET status = ?, updated_at = NOW() WHERE id = ?",
      [newStatus, dbId],
    );

    // Write status history
    await ensureStatusHistoryTable();
    await query(
      `INSERT INTO ojt_status_history (ojt_student_id, old_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [dbId, oldStatus, newStatus, req.user?.id || null, notes],
    );

    return res.json({
      success: true,
      message: "Status updated.",
      old_status: oldStatus,
      new_status: newStatus,
    });
  } catch (error) {
    console.error("updateStudentStatus error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update status.",
    });
  }
});

// ── GET /api/ojt-coordinator/student/:studentId/status-history ───────────────
router.get(
  "/student/:studentId/status-history",
  requireAuth,
  async (req, res) => {
    try {
      const dept = getDept(req);
      const studentId = String(req.params.studentId || "").trim();

      const student = await query(
        "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
        [studentId, dept],
      );
      if (!student.length)
        return res
          .status(404)
          .json({ success: false, message: "Student not found." });

      await ensureStatusHistoryTable();
      const history = await query(
        `SELECT h.id, h.old_status, h.new_status, h.notes, h.created_at, u.name AS changed_by_name
       FROM ojt_status_history h
       LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.ojt_student_id = ?
       ORDER BY h.created_at DESC`,
        [student[0].id],
      );
      return res.json({ success: true, history });
    } catch (error) {
      console.error("getStatusHistory error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch status history.",
      });
    }
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────

let statusHistoryTableEnsured = false;
async function ensureStatusHistoryTable() {
  if (statusHistoryTableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ojt_status_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      old_status VARCHAR(120) NULL,
      new_status VARCHAR(120) NOT NULL,
      changed_by_user_id INT NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_osh_student (ojt_student_id),
      INDEX idx_osh_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  statusHistoryTableEnsured = true;
}

// Convert "Firstname Middlename Lastname" → "Lastname, Firstname Middlename"
// If name already contains a comma, return as-is.
function toSurnameFirst(fullName) {
  const name = String(fullName || "").trim();
  if (!name || name.includes(",")) return name;
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return `${last}, ${rest}`;
}

function normalizeArchiveStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "pending") return "Pending";
  if (!normalized) return "Pending";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

module.exports = router;
module.exports.ensureStatusHistoryTable = ensureStatusHistoryTable;
