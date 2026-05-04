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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  try {
    await ensureArchiveOjtLinksTable();
    const department = getDept(req);
    const driveFolderPath = `CTA Files/Documents/${sanitizeDriveFolderSegment(department)}`;

    const title = String(req.body.title || "").trim();
    const authors = String(req.body.authors || "").trim();
    const section = String(req.body.section || "").trim();
    const advisor = String(req.body.advisor || "").trim();
    const datePublished = String(req.body.date_published || "").trim();
    const keywords = String(req.body.keywords || "").trim();
    const type = normalizeArchiveType(req.body.type);
    const status = normalizeArchiveStatus(req.body.status || "Pending");
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

    const rows = await query(
      `SELECT id, title, authors, section, advisor, date_published, keywords,
              type, department, file_path, local_file_path, status, created_at
       FROM archives WHERE id = ?`,
      [result.insertId],
    );

    await syncArchiveLinksByArchiveId(result.insertId);

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

    const rows = await query(
      `SELECT id, title, authors, section, advisor, date_published, keywords,
              type, department, file_path, local_file_path, status, created_at
       FROM archives WHERE id=? LIMIT 1`,
      [id],
    );

    await syncArchiveLinksByArchiveId(id);

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

module.exports = router;
