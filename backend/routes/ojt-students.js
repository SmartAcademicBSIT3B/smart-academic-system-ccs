const express = require("express");
const { pool, query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { normalizeOjtStudentPayload } = require("../helpers/normalize");
const {
  createOrUpdateStudentUser,
  sendStudentWelcomeEmail,
} = require("../services/student-user");
const {
  ensureArchiveOjtLinksTable,
  syncArchiveLinksByStudentId,
  removeArchiveLinksByStudentId,
  hydrateStudentLinkMetadata,
} = require("../helpers/archive-ojt-link");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function isFourthYearSection(sectionName) {
  const section = normalizeUpper(sectionName).replace(/\s+/g, "");
  if (!section) return false;
  return section.includes("4");
}

function getProgramFromSection(sectionName) {
  const section = normalizeUpper(sectionName);
  if (section.includes("BSIT")) return "BSIT";
  if (section.includes("BSCS")) return "BSCS";
  return null;
}

function getFourthYearSectionGroup(sectionName) {
  const normalized = normalizeText(sectionName).toUpperCase();
  const match = normalized.match(/^[^\d]+/);
  const group = match ? match[0].trim() : "";
  return group || "Unassigned";
}

function normalizeStudentStatus(status) {
  const normalized = normalizeUpper(status);
  if (!normalized) return "";
  if (normalized === "OJT COMPLETE" || normalized.includes("DEPLOYED")) {
    return "DEPLOYED";
  }
  return normalized;
}

function toSchoolYearLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  return `${year}-${year + 1}`;
}

function sortSchoolYearLabels(a, b) {
  const aYear = parseInt(String(a || "").split("-")[0], 10);
  const bYear = parseInt(String(b || "").split("-")[0], 10);
  if (!Number.isFinite(aYear) || !Number.isFinite(bYear)) {
    return String(a || "").localeCompare(String(b || ""));
  }
  return aYear - bYear;
}

function ensureRecentSchoolYears(labels, count = 5) {
  const sorted = [...new Set(labels)].sort(sortSchoolYearLabels);
  const maxStartYear = sorted.length
    ? parseInt(sorted[sorted.length - 1].split("-")[0], 10)
    : new Date().getFullYear();

  const recent = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const startYear = maxStartYear - offset;
    recent.push(`${startYear}-${startYear + 1}`);
  }

  return recent;
}

function toSortedEntryArray(entryMap) {
  return Object.entries(entryMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

// ── GET /api/ojt-students/dashboard-summary ─────────────────────────────────
// Aggregated dataset for admin dashboard cards and charts.
router.get("/dashboard-summary", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);

    const [students, archives, partnerCountRows] = await Promise.all([
      query(
        `SELECT student_id, section, status, nature_of_business, created_at
         FROM ojt_students
         WHERE department = ?`,
        [department],
      ),
      query(
        `SELECT type, status
         FROM archives
         WHERE department = ?
           AND LOWER(TRIM(type)) IN ('thesis', 'capstone')`,
        [department],
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM external_partners
         WHERE department = ?`,
        [department],
      ),
    ]);

    let bsitPopulation = 0;
    let bscsPopulation = 0;
    let deployedCount = 0;
    let preDeploymentCount = 0;
    let pendingRequirementsCount = 0;
    const schoolYearMap = {};
    const deployedFieldMap = {};
    const deployedSectionMap = {};
    const populationSectionMap = {};
    const fourthYearPopulationMap = {};

    for (const student of students) {
      const sectionName = normalizeText(student.section) || "Unassigned";
      const normalizedStatus = normalizeStudentStatus(student.status);
      const isDeployed = normalizedStatus === "DEPLOYED";
      const statusLower = normalizeText(student.status).toLowerCase();
      const program = getProgramFromSection(sectionName);
      const isFourthYear = isFourthYearSection(sectionName);

      if (program === "BSIT" && isFourthYear) bsitPopulation += 1;
      if (program === "BSCS" && isFourthYear) bscsPopulation += 1;

      if (isFourthYear) {
        populationSectionMap[sectionName] =
          (populationSectionMap[sectionName] || 0) + 1;
        const groupLabel = getFourthYearSectionGroup(sectionName);
        fourthYearPopulationMap[groupLabel] =
          (fourthYearPopulationMap[groupLabel] || 0) + 1;
      }

      if (isDeployed) {
        deployedCount += 1;

        if (isFourthYear) {
          deployedSectionMap[sectionName] =
            (deployedSectionMap[sectionName] || 0) + 1;
        }

        const schoolYearLabel = toSchoolYearLabel(student.created_at);
        if (schoolYearLabel) {
          schoolYearMap[schoolYearLabel] = schoolYearMap[schoolYearLabel] || {
            BSIT: 0,
            BSCS: 0,
          };
          if (program === "BSIT") schoolYearMap[schoolYearLabel].BSIT += 1;
          if (program === "BSCS") schoolYearMap[schoolYearLabel].BSCS += 1;
        }

        const fieldLabel =
          normalizeText(student.nature_of_business) || "Unspecified";
        deployedFieldMap[fieldLabel] = (deployedFieldMap[fieldLabel] || 0) + 1;
      } else if (statusLower.includes("pending requirement")) {
        pendingRequirementsCount += 1;
      } else {
        preDeploymentCount += 1;
      }
    }

    const schoolYearLabels = ensureRecentSchoolYears(
      Object.keys(schoolYearMap),
      5,
    );
    const deployedPerSchoolYearByProgram = schoolYearLabels.map((label) => ({
      label,
      bsit: schoolYearMap[label]?.BSIT || 0,
      bscs: schoolYearMap[label]?.BSCS || 0,
    }));

    const completionCounts = {
      completed: 0,
      inProgress: 0,
      pending: 0,
    };
    for (const archive of archives) {
      const status = normalizeText(archive.status).toLowerCase();
      if (status === "approved") {
        completionCounts.completed += 1;
      } else if (status === "pending") {
        completionCounts.inProgress += 1;
      } else {
        completionCounts.pending += 1;
      }
    }

    const responsePayload = {
      success: true,
      cards: {
        bsitPopulation,
        bscsPopulation,
        thesisRecords: archives.length,
        externalPartners: Number(partnerCountRows?.[0]?.total || 0),
      },
      charts: {
        deployedPerSchoolYearByProgram,
        deploymentFields: toSortedEntryArray(deployedFieldMap),
        completionBreakdown: [
          { label: "Completed", value: completionCounts.completed },
          { label: "In Progress", value: completionCounts.inProgress },
          { label: "Pending", value: completionCounts.pending },
        ],
        deployedPerSection: toSortedEntryArray(deployedSectionMap),
        populationPerSection: toSortedEntryArray(populationSectionMap),
        sectionPopulationByGroup: toSortedEntryArray(fourthYearPopulationMap),
        deploymentStatus: [
          { label: "Deployed", value: deployedCount },
          { label: "Pre-Deployment", value: preDeploymentCount },
          { label: "Pending Requirements", value: pendingRequirementsCount },
        ],
      },
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("getAdminDashboardSummary error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin dashboard summary.",
    });
  }
});

// ── GET /api/ojt-students ─────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students
       WHERE department = ?
       ORDER BY id DESC`,
      [department],
    );
    const students = await hydrateStudentLinkMetadata(rows);
    return res.json({ success: true, students });
  } catch (error) {
    console.error("getOjtStudents error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch OJT students.",
    });
  }
});

// ── POST /api/ojt-students ────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  let connection;
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const emailDispatchMode = String(req.body?.email_dispatch_mode || "")
      .trim()
      .toLowerCase();
    const data = normalizeOjtStudentPayload(
      { ...req.body, department },
      department,
    );

    if (!data.student_id || !data.name || !data.section) {
      return res.status(400).json({
        success: false,
        message: "Student ID, Name, and Section are required.",
      });
    }

    const normalizedEmail = String(data.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message:
          "Email is required to create a student portal account and send credentials.",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [insertResult] = await connection.execute(
      `INSERT INTO ojt_students
       (student_id, name, section, department, email, contact_no, status,
        external_partner_assigned, nature_of_business)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.student_id,
        data.name,
        data.section,
        data.department,
        normalizedEmail,
        data.contact_no,
        data.status,
        data.external_partner_assigned,
        data.nature_of_business,
      ],
    );

    const studentUserResult = await createOrUpdateStudentUser(connection, {
      student_id: data.student_id,
      name: data.name,
      email: normalizedEmail,
      status: data.status,
      use_student_id_as_password: Boolean(req.body?.use_student_id_as_password),
      send_password_email: req.body?.send_password_email !== false,
    });

    await connection.commit();

    // Manual add can optionally wait for email so UI can confirm completion.
    const shouldWaitForEmail = emailDispatchMode === "wait";
    let emailSent = false;
    let emailQueued = false;
    let emailError = null;

    if (studentUserResult.emailPayload) {
      if (shouldWaitForEmail) {
        try {
          await sendStudentWelcomeEmail(studentUserResult.emailPayload);
          emailSent = true;
        } catch (mailErr) {
          emailError = mailErr.message;
          console.error(
            "createOjtStudent: welcome email failed:",
            mailErr.message,
          );
        }
      } else {
        emailQueued = true;
        Promise.resolve()
          .then(() => sendStudentWelcomeEmail(studentUserResult.emailPayload))
          .catch((mailErr) => {
            console.error(
              "createOjtStudent: welcome email failed:",
              mailErr.message,
            );
          });
      }
    }

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? LIMIT 1`,
      [insertResult.insertId],
    );

    await syncArchiveLinksByStudentId(insertResult.insertId);
    const hydratedRows = await hydrateStudentLinkMetadata(rows);
    const createdStudent = hydratedRows[0];

    return res.status(201).json({
      success: true,
      student: createdStudent,
      message: "OJT student added successfully.",
      studentUser: {
        mode: studentUserResult.mode,
        emailSent,
        emailQueued,
        emailError,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("createOjtStudent rollback error:", rollbackError);
      }
    }
    console.error("createOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create OJT student.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ── PATCH /api/ojt-students/:id ───────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const department = getDept(req);
    const data = normalizeOjtStudentPayload(
      { ...req.body, department },
      department,
    );

    if (!data.student_id || !data.name || !data.section) {
      return res.status(400).json({
        success: false,
        message: "Student ID, Name, and Section are required.",
      });
    }

    const existing = await query(
      "SELECT id FROM ojt_students WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "OJT student not found." });
    }

    await query(
      `UPDATE ojt_students
       SET student_id=?, name=?, section=?, department=?, email=?,
           contact_no=?, status=?, external_partner_assigned=?, nature_of_business=?
       WHERE id=?`,
      [
        data.student_id,
        data.name,
        data.section,
        data.department,
        data.email,
        data.contact_no,
        data.status,
        data.external_partner_assigned,
        data.nature_of_business,
        id,
      ],
    );

    const rows = await query(
      `SELECT id, student_id, name, section, department, email, contact_no,
              status, external_partner_assigned, nature_of_business,
              created_at, updated_at
       FROM ojt_students WHERE id = ? AND department = ? LIMIT 1`,
      [id, department],
    );

    await syncArchiveLinksByStudentId(id);
    const hydratedRows = await hydrateStudentLinkMetadata(rows);

    return res.json({
      success: true,
      student: hydratedRows[0],
      message: "OJT student updated successfully.",
    });
  } catch (error) {
    console.error("updateOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update OJT student.",
    });
  }
});

// ── DELETE /api/ojt-students/:id ──────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const department = getDept(req);
    const existing = await query(
      "SELECT id, student_id FROM ojt_students WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "OJT student not found or already deleted.",
      });
    }
    // Remove archive links related to this OJT student
    await removeArchiveLinksByStudentId(id);

    // Delete the OJT student row
    await query("DELETE FROM ojt_students WHERE id = ? AND department = ?", [
      id,
      department,
    ]);

    // Also delete the corresponding students_user record (if any)
    try {
      const studentId = String(existing[0].student_id || "").trim();
      if (studentId) {
        await query("DELETE FROM students_user WHERE student_id = ?", [
          studentId,
        ]);
      }
    } catch (err) {
      console.error("Failed to delete students_user for OJT student:", err);
      // Non-fatal: continue but log the error
    }
    return res.json({
      success: true,
      message: "OJT student deleted successfully.",
    });
  } catch (error) {
    console.error("deleteOjtStudent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete OJT student.",
    });
  }
});

module.exports = router;
