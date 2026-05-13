const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const {
  sendOjtDeploymentStatusEmail,
  formatStatusLabel,
} = require("../services/deployment-email");

const router = express.Router();

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function shouldSendDeploymentEmail(previousStatus, nextStatus) {
  const previous = normalizeStatus(previousStatus);
  const next = normalizeStatus(nextStatus);
  if (!next || previous === next) return false;
  return next === "deployed" || next === "ojt complete";
}

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
      "SELECT id, student_id, name, email, status FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
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

    let emailSent = false;
    let emailError = null;
    if (shouldSendDeploymentEmail(oldStatus, newStatus)) {
      try {
        await sendOjtDeploymentStatusEmail({
          email: existing[0].email,
          studentName: existing[0].name,
          studentId: existing[0].student_id,
          status: newStatus,
          previousStatus: oldStatus,
        });
        emailSent = true;
      } catch (mailError) {
        emailError = mailError.message || "Failed to send deployment email.";
        console.error("updateStudentStatus deployment email error:", mailError);
      }
    }

    return res.json({
      success: true,
      message: emailError
        ? "Status updated, but email notification could not be sent."
        : "Status updated.",
      old_status: oldStatus,
      new_status: newStatus,
      status_label: formatStatusLabel(newStatus),
      email_sent: emailSent,
      email_error: emailError,
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

// ── GET /api/ojt-coordinator/capstone-approval/:studentId ────────────────────
// Check if student's linked capstone (archive) is approved
router.get("/capstone-approval/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentIdRef = String(req.params.studentId || "").trim();

    if (!studentIdRef)
      return res
        .status(400)
        .json({ success: false, message: "studentId is required." });

    // Get ojt_student record
    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentIdRef, dept],
    );
    if (!student.length)
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });

    const dbStudentId = student[0].id;

    // Check for linked approved capstone/thesis
    const capstoneLink = await query(
      `SELECT a.id, a.status, a.type
       FROM archives a
       INNER JOIN archive_ojt_links aol ON a.id = aol.archive_id
       WHERE aol.ojt_student_id = ? AND a.status = 'Approved'
       LIMIT 1`,
      [dbStudentId],
    );

    const hasApprovedCapstone = capstoneLink.length > 0;

    return res.json({
      success: true,
      hasCapstone: capstoneLink.length > 0,
      isApproved: hasApprovedCapstone,
      capstone: capstoneLink.length > 0 ? capstoneLink[0] : null,
    });
  } catch (error) {
    console.error("getCapstoneApproval error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check capstone approval.",
    });
  }
});

// ── GET /api/ojt-coordinator/notifications ────────────────────────────────────
// Returns recent activities (requirements, attendance, weekly reports) for all
// students in the coordinator's assigned sections.
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const { email, dept } = await resolveCoordinatorEmail(req);
    const sinceRaw = String(req.query.since || "").trim();
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    const hasSince =
      sinceDate instanceof Date && !Number.isNaN(sinceDate.getTime());
    const minutesBack = Math.max(
      1,
      parseInt(req.query.minutes_back || "30", 10),
    );
    const limit = Math.max(
      5,
      Math.min(100, parseInt(req.query.limit || "20", 10)),
    );

    // Find sections assigned to this coordinator
    let assignments = [];
    if (email) {
      assignments = await query(
        `SELECT section_name
         FROM section_assignments
         WHERE department = ? AND LOWER(TRIM(professor_email)) = ?`,
        [dept, email],
      );
    }
    if (!assignments.length) {
      const name = String(req.user?.name || "").trim();
      if (name) {
        assignments = await query(
          `SELECT section_name
           FROM section_assignments
           WHERE department = ? AND professor_name = ?`,
          [dept, name],
        );
      }
    }

    // If no sections assigned, return empty
    if (!assignments.length) {
      return res.json({ success: true, notifications: [] });
    }

    const sectionNames = assignments.map((r) => r.section_name);

    // Get all students in coordinator's sections
    const placeholders = sectionNames.map(() => "?").join(",");
    const students = await query(
      `SELECT id, student_id, name FROM ojt_students
       WHERE department = ? AND section IN (${placeholders})`,
      [dept, ...sectionNames],
    );

    if (!students.length) {
      return res.json({ success: true, notifications: [] });
    }

    const studentIds = students.map((s) => s.id);
    const studentMap = {};
    students.forEach((s) => {
      studentMap[s.id] = { student_id: s.student_id, name: s.name };
    });

    // Time window for "recent" activities
    const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);
    const windowStart = hasSince ? sinceDate : cutoffTime;

    // Fetch requirement submissions
    const reqPlaceholders = studentIds.map(() => "?").join(",");
    const requirements = await query(
      `SELECT 
         'requirement' AS activity_type,
         ors.ojt_student_id,
         ors.status,
         LOWER(COALESCE(ort.type, 'pre')) AS requirement_type,
         ors.created_at,
         ors.updated_at,
         ors.file_name
       FROM ojt_requirement_submissions ors
       LEFT JOIN ojt_requirement_templates ort ON ort.id = ors.template_id
       WHERE ors.ojt_student_id IN (${reqPlaceholders})
         AND ors.updated_at >= ?
       ORDER BY ors.updated_at DESC`,
      [...studentIds, windowStart],
    );

    // Fetch attendance records
    const attendance = await query(
      `SELECT
         'attendance' AS activity_type,
         oa.ojt_student_id,
         oa.status,
         oa.attendance_date,
         oa.created_at,
         oa.updated_at
       FROM ojt_attendance oa
       WHERE oa.ojt_student_id IN (${reqPlaceholders})
         AND oa.updated_at >= ?
       ORDER BY oa.updated_at DESC`,
      [...studentIds, windowStart],
    );

    // Fetch weekly reports
    const weeklyReports = await query(
      `SELECT
         'weekly_report' AS activity_type,
         owr.ojt_student_id,
         owr.status,
         owr.week_number,
         owr.created_at,
         owr.updated_at,
         owr.feedback
       FROM ojt_weekly_reports owr
       WHERE owr.ojt_student_id IN (${reqPlaceholders})
         AND owr.updated_at >= ?
       ORDER BY owr.updated_at DESC`,
      [...studentIds, windowStart],
    );

    // Aggregate and format notifications
    const notifications = [];

    // Add requirement notifications
    requirements.forEach((req) => {
      const student = studentMap[req.ojt_student_id];
      if (!student) return;
      const reqType = req.requirement_type === "post" ? "post" : "pre";
      let message = "";
      if (req.status === "submitted" || req.status === "pending") {
        message = `submitted a ${reqType}-requirement file`;
      } else if (req.status === "verified") {
        message = `${reqType}-requirement was verified`;
      } else if (req.status === "rejected") {
        message = `${reqType}-requirement was rejected`;
      } else {
        message = `updated a ${reqType}-requirement`;
      }

      notifications.push({
        id: `req-${req.ojt_student_id}-${req.created_at}`,
        activity_type: "requirement",
        status: req.status,
        student_id: student.student_id,
        student_name: student.name,
        message: message,
        file_name: req.file_name || "(File)",
        timestamp: req.updated_at,
      });
    });

    // Add attendance notifications
    attendance.forEach((att) => {
      const student = studentMap[att.ojt_student_id];
      if (!student) return;
      const dateStr = att.attendance_date
        ? new Date(att.attendance_date).toLocaleDateString()
        : "Unknown date";
      const message = `recorded attendance (${att.status}) on ${dateStr}`;

      notifications.push({
        id: `att-${att.ojt_student_id}-${att.attendance_date}`,
        activity_type: "attendance",
        status: att.status,
        student_id: student.student_id,
        student_name: student.name,
        message: message,
        timestamp: att.updated_at,
      });
    });

    // Add weekly report notifications
    weeklyReports.forEach((report) => {
      const student = studentMap[report.ojt_student_id];
      if (!student) return;
      let message = "";
      if (report.status === "submitted" || report.status === "pending") {
        message = `submitted week ${report.week_number} report`;
      } else if (report.status === "reviewed") {
        message = `week ${report.week_number} report was reviewed`;
      } else if (report.status === "returned") {
        message = `week ${report.week_number} report was returned for revision`;
      } else {
        message = `updated week ${report.week_number} report`;
      }

      notifications.push({
        id: `report-${report.ojt_student_id}-${report.week_number}`,
        activity_type: "weekly_report",
        status: report.status,
        student_id: student.student_id,
        student_name: student.name,
        message: message,
        has_feedback: !!report.feedback,
        timestamp: report.updated_at,
      });
    });

    // Sort by timestamp (most recent first) and limit
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const result = notifications.slice(0, limit);
    const lastCursor = result.length ? result[0].timestamp : null;

    return res.json({
      success: true,
      notifications: result,
      last_cursor: lastCursor,
    });
  } catch (error) {
    console.error("getNotifications error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notifications.",
    });
  }
});

// ── POST /api/ojt-coordinator/emit-notification ────────────────────────────────
// Emits a real-time notification to all coordinators in a department
// Called by PHP scripts (ojt_upload.php, ojt_weekly_upload.php) to trigger real-time notifications
router.post("/emit-notification", async (req, res) => {
  try {
    const notificationService = require("../services/notifications");

    const dept = String(req.body.department || "CCS").trim();
    const type = String(req.body.type || "")
      .trim()
      .toLowerCase();

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Notification type is required (requirement or weekly_report)",
      });
    }

    const studentId = String(req.body.student_id || "").trim();
    const studentName = String(req.body.student_name || "").trim();

    if (!studentId || !studentName) {
      return res.status(400).json({
        success: false,
        message: "student_id and student_name are required",
      });
    }

    // Get student OJT ID
    const student = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );

    if (!student.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const ojtStudentId = student[0].id;

    if (type === "requirement") {
      const section = String(req.body.section || "pre")
        .trim()
        .toLowerCase();
      const fileName = String(req.body.file_name || "").trim();
      const status = String(req.body.status || "submitted")
        .trim()
        .toLowerCase();

      await notificationService.emitRequirementUpload(
        dept,
        ojtStudentId,
        studentId,
        studentName,
        section,
        fileName,
        status,
      );

      return res.json({
        success: true,
        message: "Requirement upload notification emitted",
      });
    } else if (type === "weekly_report") {
      const weekNumber = parseInt(req.body.week_number || 0, 10);
      const status = String(req.body.status || "submitted")
        .trim()
        .toLowerCase();
      const hasFeedback = req.body.has_feedback === true;

      if (weekNumber < 1) {
        return res.status(400).json({
          success: false,
          message: "Valid week_number is required",
        });
      }

      await notificationService.emitWeeklyReportSubmission(
        dept,
        ojtStudentId,
        studentId,
        studentName,
        weekNumber,
        status,
        hasFeedback,
      );

      return res.json({
        success: true,
        message: "Weekly report notification emitted",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid notification type",
      });
    }
  } catch (error) {
    console.error("emitNotification error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to emit notification.",
    });
  }
});

module.exports = router;
module.exports.ensureStatusHistoryTable = ensureStatusHistoryTable;
