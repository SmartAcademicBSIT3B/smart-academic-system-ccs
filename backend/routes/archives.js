const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const {
  normalizeArchiveType,
  normalizeArchiveStatus,
  toSqlDateTime,
} = require("../helpers/normalize");
const {
  ensureArchiveOjtLinksTable,
  syncArchiveLinksByArchiveId,
  removeArchiveLinksByArchiveId,
} = require("../helpers/archive-ojt-link");
const gdriveService = require("../services/gdrive");

const router = express.Router();
const ARCHIVE_UPLOAD_MAX_SIZE_MB = 50;
const ARCHIVE_UPLOAD_MAX_SIZE_BYTES = ARCHIVE_UPLOAD_MAX_SIZE_MB * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ARCHIVE_UPLOAD_MAX_SIZE_BYTES },
});

const DEPT_HEADER = "x-department";

function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

function sanitizeDriveFolderSegment(value) {
  const raw = String(value || "").trim();
  if (!raw) return "CCS";
  return raw.replace(/[\\/:*?"<>|]+/g, "-").trim() || "CCS";
}

function sanitizeDriveBasePath(value) {
  const parts = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => part.replace(/[\\:*?"<>|]+/g, "-"));

  if (parts.length === 0) return "CTA Files/Documents";
  return parts.join("/");
}

function slugifyTitle(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "archive";
}

function buildDriveFileName(title, originalName) {
  const ext = String(path.extname(String(originalName || "")) || "").trim();
  const safeExt = ext && /^\.[a-z0-9]+$/i.test(ext) ? ext : ".pdf";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const unique = crypto.randomBytes(3).toString("hex");
  return `${slugifyTitle(title)}__${stamp}__${unique}${safeExt}`;
}

function uploadArchiveFile(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return res.status(413).json({
        success: false,
        code: "FILE_TOO_LARGE",
        message: `File exceeds the maximum upload size of ${ARCHIVE_UPLOAD_MAX_SIZE_MB} MB.`,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Invalid file upload request.",
    });
  });
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// ── GET /api/archives ─────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const rows = await query(
      `SELECT a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
              a.keywords, a.type, a.department, a.file_path, a.local_file_path,
              a.status, a.created_at,
              GROUP_CONCAT(DISTINCT l.ojt_student_id ORDER BY l.ojt_student_id SEPARATOR ',') AS linked_student_ids
       FROM archives a
       LEFT JOIN archive_ojt_links l ON l.archive_id = a.id
       WHERE a.department = ?
       GROUP BY a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
                a.keywords, a.type, a.department, a.file_path, a.local_file_path,
                a.status, a.created_at
       ORDER BY a.created_at DESC`,
      [department],
    );
    return res.json({ success: true, archives: rows });
  } catch (error) {
    console.error("getArchives error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch archives.",
    });
  }
});

// ── POST /api/archives ────────────────────────────────────────────────────────
router.post("/", requireAuth, uploadArchiveFile, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const driveBasePath = sanitizeDriveBasePath(req.body.drive_base_path);
    const driveFolderPath = `${driveBasePath}/${sanitizeDriveFolderSegment(department)}`;

    const title = String(req.body.title || "").trim();
    const authors = String(req.body.authors || "").trim();
    const section = String(req.body.section || "").trim();
    const advisor = String(req.body.advisor || "").trim();
    const datePublished = String(req.body.date_published || "").trim();
    const keywords = String(req.body.keywords || "").trim();
    const type = normalizeArchiveType(req.body.type);
    const status = normalizeArchiveStatus(req.body.status || "Approved");
    const localFilePath = String(
      req.body.local_file_path || req.body.localFilePath || "",
    ).trim();

    if (!title || !authors || !keywords) {
      return res.status(400).json({
        success: false,
        message: "Title, Authors, and Keywords are required.",
      });
    }
    if (!type) {
      return res
        .status(400)
        .json({ success: false, message: "Type must be thesis or capstone." });
    }
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status must be pending, approved, or rejected.",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Please upload a PDF file." });
    }

    const duplicateRows = await query(
      "SELECT id FROM archives WHERE department = ? AND title = ? LIMIT 1",
      [department, title],
    );
    if (duplicateRows && duplicateRows.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_TITLE",
        field: "title",
        message: `An archive with the same title already exists in ${department}.`,
      });
    }

    const storedFileName = buildDriveFileName(title, req.file.originalname);
    let filePath = "";
    let usedFallback = false;

    try {
      filePath = await gdriveService.uploadFile(
        req.file.buffer,
        storedFileName,
        req.file.mimetype,
        driveFolderPath,
      );
    } catch (driveError) {
      if (driveError?.code === "AUTH_REQUIRED") {
        return res.status(403).json({
          success: false,
          requiresAuth: true,
          message: `Google Drive authorization is required. Please authorize via /api/gdrive/auth-url.`,
        });
      }
      if (
        driveError?.code === "PUBLIC_PERMISSION_FAILED" ||
        driveError?.code === "PUBLIC_LINK_RESOLVE_FAILED" ||
        driveError?.code === "INVALID_FILE_ID"
      ) {
        console.error(
          "Drive upload could not produce a public file:",
          driveError,
        );
        return res.status(502).json({
          success: false,
          message:
            driveError.message ||
            "The PDF was uploaded to Google Drive, but it could not be made public.",
        });
      }
      console.error(
        "Drive upload failed, proceeding without file URL:",
        driveError,
      );
      usedFallback = true;
    }

    const createdAt = toSqlDateTime();
    const result = await query(
      `INSERT INTO archives
       (title, authors, section, advisor, date_published, keywords, type,
        department, file_path, local_file_path, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        authors,
        section,
        advisor,
        datePublished || null,
        keywords,
        type,
        department,
        filePath || null,
        localFilePath || null,
        status,
        createdAt,
      ],
    );

    await syncArchiveLinksByArchiveId(result.insertId);

    const rows = await query(
      `SELECT a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
              a.keywords, a.type, a.department, a.file_path, a.local_file_path,
              a.status, a.created_at,
              GROUP_CONCAT(DISTINCT l.ojt_student_id ORDER BY l.ojt_student_id SEPARATOR ',') AS linked_student_ids
       FROM archives a
       LEFT JOIN archive_ojt_links l ON l.archive_id = a.id
       WHERE a.id = ?
       GROUP BY a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
                a.keywords, a.type, a.department, a.file_path, a.local_file_path,
                a.status, a.created_at`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      archive: rows[0],
      usedFallback,
      message: usedFallback
        ? "Archive saved. Google Drive unavailable."
        : "Archive saved successfully.",
    });
  } catch (error) {
    console.error("createArchive error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save archive.",
    });
  }
});

// ── PATCH /api/archives/:id ───────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid archive ID is required." });
    }

    const title = String(req.body.title || "").trim();
    const authors = String(req.body.authors || "").trim();
    const section = String(req.body.section || "").trim();
    const advisor = String(req.body.advisor || "").trim();
    const datePublished = String(req.body.date_published || "").trim();
    const keywords = String(req.body.keywords || "").trim();
    const type = normalizeArchiveType(req.body.type);
    const status = normalizeArchiveStatus(req.body.status || "Pending");

    if (!title || !authors || !keywords) {
      return res.status(400).json({
        success: false,
        message: "Title, Authors, and Keywords are required.",
      });
    }
    if (!type) {
      return res.status(400).json({ success: false, message: "Invalid type." });
    }
    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status." });
    }

    const existing = await query(
      "SELECT id, department, title FROM archives WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Archive not found." });
    }

    const existingDepartment =
      String(existing[0].department || getDept(req)).trim() || getDept(req);
    const existingTitle = String(existing[0].title || "");
    if (title !== existingTitle) {
      const duplicateRows = await query(
        "SELECT id FROM archives WHERE department = ? AND title = ? AND id <> ? LIMIT 1",
        [existingDepartment, title, id],
      );
      if (duplicateRows && duplicateRows.length > 0) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_TITLE",
          field: "title",
          message: `An archive with the same title already exists in ${existingDepartment}.`,
        });
      }
    }

    await query(
      `UPDATE archives
       SET title=?, authors=?, section=?, advisor=?, date_published=?,
           keywords=?, type=?, status=?
       WHERE id=?`,
      [
        title,
        authors,
        section,
        advisor,
        datePublished || null,
        keywords,
        type,
        status,
        id,
      ],
    );

    await syncArchiveLinksByArchiveId(id);

    const rows = await query(
      `SELECT a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
              a.keywords, a.type, a.department, a.file_path, a.local_file_path,
              a.status, a.created_at,
              GROUP_CONCAT(DISTINCT l.ojt_student_id ORDER BY l.ojt_student_id SEPARATOR ',') AS linked_student_ids
       FROM archives a
       LEFT JOIN archive_ojt_links l ON l.archive_id = a.id
       WHERE a.id = ?
       GROUP BY a.id, a.title, a.authors, a.section, a.advisor, a.date_published,
                a.keywords, a.type, a.department, a.file_path, a.local_file_path,
                a.status, a.created_at
       LIMIT 1`,
      [id],
    );

    return res.json({
      success: true,
      archive: rows[0],
      message: "Archive updated successfully.",
    });
  } catch (error) {
    console.error("updateArchive error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update archive.",
    });
  }
});

// ── DELETE /api/archives/:id ──────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid archive ID is required." });
    }

    const rows = await query(
      "SELECT id, file_path FROM archives WHERE id = ? LIMIT 1",
      [id],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Archive not found or already deleted.",
      });
    }

    const archive = rows[0];

    if (archive.file_path) {
      try {
        await gdriveService.deleteFileByUrl(archive.file_path);
      } catch (driveError) {
        if (driveError?.code === "AUTH_REQUIRED") {
          return res.status(403).json({
            success: false,
            requiresAuth: true,
            message: "Google Drive authorization is required before deleting.",
          });
        }
        return res.status(500).json({
          success: false,
          message: driveError?.message || "Failed to delete from Google Drive.",
        });
      }
    }

    await removeArchiveLinksByArchiveId(id);
    await query("DELETE FROM archives WHERE id = ?", [id]);
    return res.json({
      success: true,
      message: "Archive deleted successfully.",
    });
  } catch (error) {
    console.error("deleteArchive error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete archive.",
    });
  }
});

// ── GET /api/archives/:id/ojt-links ─────────────────────────────────────────
router.get("/:id/ojt-links", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const archiveId = parseInt(req.params.id, 10);

    if (!Number.isInteger(archiveId) || archiveId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid archive ID is required.",
      });
    }

    const archiveRows = await query(
      `SELECT id, title, section, department
       FROM archives
       WHERE id = ?
       LIMIT 1`,
      [archiveId],
    );

    if (!archiveRows || archiveRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Archive not found." });
    }

    const archive = archiveRows[0];
    if (
      normalizeComparableText(archive.department) !==
      normalizeComparableText(department)
    ) {
      return res.status(403).json({
        success: false,
        message: "Archive does not belong to your department.",
      });
    }

    const students = await query(
      `SELECT s.id, s.student_id, s.name, s.section, s.department,
              l.id AS link_id, l.linked_by, l.created_at AS linked_at
       FROM ojt_students s
       LEFT JOIN archive_ojt_links l
         ON l.ojt_student_id = s.id
        AND l.archive_id = ?
       WHERE LOWER(TRIM(s.department)) = LOWER(TRIM(?))
         AND LOWER(TRIM(s.section)) = LOWER(TRIM(?))
       ORDER BY s.name ASC`,
      [archiveId, archive.department, archive.section],
    );

    return res.json({
      success: true,
      archive: {
        id: archive.id,
        title: archive.title,
        section: archive.section,
        department: archive.department,
      },
      students: (Array.isArray(students) ? students : []).map((student) => ({
        id: student.id,
        student_id: student.student_id,
        name: student.name,
        section: student.section,
        department: student.department,
        is_linked: Boolean(student.link_id),
        linked_by: student.linked_by || null,
        linked_at: student.linked_at || null,
      })),
    });
  } catch (error) {
    console.error("getArchiveOjtLinks error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load linked OJT students.",
    });
  }
});

// ── POST /api/archives/:id/ojt-links ────────────────────────────────────────
router.post("/:id/ojt-links", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const archiveId = parseInt(req.params.id, 10);
    const studentId = parseInt(req.body.ojt_student_id, 10);

    if (!Number.isInteger(archiveId) || archiveId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid archive ID is required.",
      });
    }
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const archiveRows = await query(
      `SELECT id, section, department
       FROM archives
       WHERE id = ?
       LIMIT 1`,
      [archiveId],
    );
    if (!archiveRows || archiveRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Archive not found." });
    }

    const archive = archiveRows[0];
    if (
      normalizeComparableText(archive.department) !==
      normalizeComparableText(department)
    ) {
      return res.status(403).json({
        success: false,
        message: "Archive does not belong to your department.",
      });
    }

    const studentRows = await query(
      `SELECT id, section, department
       FROM ojt_students
       WHERE id = ?
       LIMIT 1`,
      [studentId],
    );
    if (!studentRows || studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "OJT student not found.",
      });
    }

    const student = studentRows[0];
    const sameDepartment =
      normalizeComparableText(student.department) ===
      normalizeComparableText(archive.department);
    const sameSection =
      normalizeComparableText(student.section) ===
      normalizeComparableText(archive.section);

    if (!sameDepartment || !sameSection) {
      return res.status(400).json({
        success: false,
        message:
          "Manual link requires the same department and section for archive and student.",
      });
    }

    const existing = await query(
      `SELECT id
       FROM archive_ojt_links
       WHERE archive_id = ? AND ojt_student_id = ?
       LIMIT 1`,
      [archiveId, studentId],
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        success: false,
        code: "LINK_EXISTS",
        message: "This student is already linked to the archive.",
      });
    }

    await query(
      `INSERT INTO archive_ojt_links
       (archive_id, ojt_student_id, section, department, linked_by)
       VALUES (?, ?, ?, ?, 'manual')`,
      [archiveId, studentId, archive.section, archive.department],
    );

    return res.status(201).json({
      success: true,
      message: "Student linked to archive.",
    });
  } catch (error) {
    console.error("createArchiveOjtLink error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to link student to archive.",
    });
  }
});

// ── DELETE /api/archives/:id/ojt-links/:studentId ───────────────────────────
router.delete("/:id/ojt-links/:studentId", requireAuth, async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const archiveId = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);

    if (!Number.isInteger(archiveId) || archiveId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid archive ID is required.",
      });
    }
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid OJT student ID is required.",
      });
    }

    const archiveRows = await query(
      `SELECT id, department
       FROM archives
       WHERE id = ?
       LIMIT 1`,
      [archiveId],
    );
    if (!archiveRows || archiveRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Archive not found." });
    }

    if (
      normalizeComparableText(archiveRows[0].department) !==
      normalizeComparableText(department)
    ) {
      return res.status(403).json({
        success: false,
        message: "Archive does not belong to your department.",
      });
    }

    const deleteResult = await query(
      `DELETE FROM archive_ojt_links
       WHERE archive_id = ? AND ojt_student_id = ?`,
      [archiveId, studentId],
    );

    if (!deleteResult || Number(deleteResult.affectedRows || 0) === 0) {
      return res.status(404).json({
        success: false,
        message: "Link not found.",
      });
    }

    return res.json({
      success: true,
      message: "Student unlinked from archive.",
    });
  } catch (error) {
    console.error("deleteArchiveOjtLink error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to unlink student from archive.",
    });
  }
});

module.exports = router;
