const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { query } = require("../db/connect");
const cloudinaryService = require("../services/cloudinary");

const router = express.Router();

const DEFAULT_OJT_POLICY = {
  preRateLimitPerDay: 10,
  postRateLimitPerDay: 10,
  dailyRateLimitPerDay: 5,
  weeklyRateLimitPerDay: 3,
  preMaxFileSizeMB: 25,
  postMaxFileSizeMB: 25,
  dailyMaxFileSizeMB: 25,
  weeklyMaxFileSizeMB: 25,
};

let ojtPolicyTablesReady = false;

function getDepartment(req) {
  return String(req.headers["x-department"] || "").trim() || "CCS";
}

function normalizePositiveInt(value, fallback, max = 1000) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function mapFolderTypeToCategory(folderType) {
  const key = String(folderType || "")
    .trim()
    .toLowerCase();
  if (key.includes("post")) return "post";
  if (key.includes("daily")) return "daily";
  if (key.includes("weekly")) return "weekly";
  if (key.includes("pre")) return "pre";
  return "pre";
}

async function ensureOjtPolicyTables() {
  if (ojtPolicyTablesReady) return;

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
    CREATE TABLE IF NOT EXISTS ojt_upload_activity (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      department VARCHAR(120) NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      upload_category ENUM('pre', 'post', 'daily', 'weekly') NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_oua_lookup (department, student_id_ref, upload_category, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  ojtPolicyTablesReady = true;
}

async function getPolicyForDepartment(dept) {
  await ensureOjtPolicyTables();

  const rows = await query(
    `SELECT *
     FROM ojt_requirements_manager_settings
     WHERE department = ?
     LIMIT 1`,
    [dept],
  );

  if (!Array.isArray(rows) || !rows.length) {
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
        DEFAULT_OJT_POLICY.preRateLimitPerDay,
        DEFAULT_OJT_POLICY.postRateLimitPerDay,
        DEFAULT_OJT_POLICY.dailyRateLimitPerDay,
        DEFAULT_OJT_POLICY.weeklyRateLimitPerDay,
        DEFAULT_OJT_POLICY.preMaxFileSizeMB,
        DEFAULT_OJT_POLICY.postMaxFileSizeMB,
        DEFAULT_OJT_POLICY.dailyMaxFileSizeMB,
        DEFAULT_OJT_POLICY.weeklyMaxFileSizeMB,
      ],
    );
    return { ...DEFAULT_OJT_POLICY };
  }

  const row = rows[0];
  return {
    preRateLimitPerDay: normalizePositiveInt(
      row.pre_rate_limit_per_day,
      DEFAULT_OJT_POLICY.preRateLimitPerDay,
      100,
    ),
    postRateLimitPerDay: normalizePositiveInt(
      row.post_rate_limit_per_day,
      DEFAULT_OJT_POLICY.postRateLimitPerDay,
      100,
    ),
    dailyRateLimitPerDay: normalizePositiveInt(
      row.daily_rate_limit_per_day,
      DEFAULT_OJT_POLICY.dailyRateLimitPerDay,
      100,
    ),
    weeklyRateLimitPerDay: normalizePositiveInt(
      row.weekly_rate_limit_per_day,
      DEFAULT_OJT_POLICY.weeklyRateLimitPerDay,
      100,
    ),
    preMaxFileSizeMB: normalizePositiveInt(
      row.pre_max_file_size_mb,
      DEFAULT_OJT_POLICY.preMaxFileSizeMB,
      50,
    ),
    postMaxFileSizeMB: normalizePositiveInt(
      row.post_max_file_size_mb,
      DEFAULT_OJT_POLICY.postMaxFileSizeMB,
      50,
    ),
    dailyMaxFileSizeMB: normalizePositiveInt(
      row.daily_max_file_size_mb,
      DEFAULT_OJT_POLICY.dailyMaxFileSizeMB,
      50,
    ),
    weeklyMaxFileSizeMB: normalizePositiveInt(
      row.weekly_max_file_size_mb,
      DEFAULT_OJT_POLICY.weeklyMaxFileSizeMB,
      50,
    ),
  };
}

function resolvePolicyValues(policy, category) {
  if (category === "post") {
    return {
      maxFileSizeMB: policy.postMaxFileSizeMB,
      rateLimitPerDay: policy.postRateLimitPerDay,
      categoryLabel: "Post Requirements",
    };
  }
  if (category === "daily") {
    return {
      maxFileSizeMB: policy.dailyMaxFileSizeMB,
      rateLimitPerDay: policy.dailyRateLimitPerDay,
      categoryLabel: "Daily Reports",
    };
  }
  if (category === "weekly") {
    return {
      maxFileSizeMB: policy.weeklyMaxFileSizeMB,
      rateLimitPerDay: policy.weeklyRateLimitPerDay,
      categoryLabel: "Weekly Reports",
    };
  }
  return {
    maxFileSizeMB: policy.preMaxFileSizeMB,
    rateLimitPerDay: policy.preRateLimitPerDay,
    categoryLabel: "Pre Requirements",
  };
}

async function checkDailyUploadLimit({
  department,
  studentId,
  category,
  rateLimitPerDay,
}) {
  if (!rateLimitPerDay || rateLimitPerDay < 1) return { ok: true };

  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM ojt_upload_activity
     WHERE department = ?
       AND student_id_ref = ?
       AND upload_category = ?
       AND created_at >= (NOW() - INTERVAL 1 DAY)`,
    [department, studentId, category],
  );

  const total = Number(rows?.[0]?.total || 0);
  if (total >= rateLimitPerDay) {
    return {
      ok: false,
      total,
    };
  }
  return { ok: true, total };
}

async function trackUploadActivity({ department, studentId, category }) {
  await query(
    `INSERT INTO ojt_upload_activity (department, student_id_ref, upload_category)
     VALUES (?, ?, ?)`,
    [department, studentId, category],
  );
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function handleProfileImageUpload(req, res) {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded." });
    }

    const userId = String(req.body.userId || "").trim();
    const fileName = String(
      req.body.fileName || req.file.originalname || "profile.jpg",
    );
    const mimeType = req.file.mimetype || "image/jpeg";

    const url = await cloudinaryService.uploadProfileImage(
      req.file.buffer,
      fileName,
      mimeType,
      userId,
    );

    return res.json({ success: true, path: url });
  } catch (error) {
    console.error("Profile image upload error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Upload failed." });
  }
}

router.post(
  "/setup-profile-image",
  upload.single("file"),
  handleProfileImageUpload,
);

// ── POST /api/upload/profile-image ────────────────────────────────────────────
router.post(
  "/profile-image",
  requireAuth,
  upload.single("file"),
  handleProfileImageUpload,
);

// ── POST /api/upload/partner-logo ─────────────────────────────────────────────
router.post(
  "/partner-logo",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded." });
      }

      const partnerId = String(req.body.partnerId || "").trim();
      const fileName = String(
        req.body.fileName || req.file.originalname || "logo.jpg",
      );
      const mimeType = req.file.mimetype || "image/jpeg";

      const url = await cloudinaryService.uploadPartnerLogo(
        req.file.buffer,
        fileName,
        mimeType,
        partnerId,
      );

      return res.json({ success: true, path: url });
    } catch (error) {
      console.error("Partner logo upload error:", error);
      return res
        .status(500)
        .json({ success: false, message: error.message || "Upload failed." });
    }
  },
);

// ── POST /api/upload/partner-logo-url ─────────────────────────────────────────
// Fetches an image from an external URL then uploads it to Cloudinary.
router.post("/partner-logo-url", requireAuth, async (req, res) => {
  try {
    const rawUrl = String(req.body.url || "").trim();
    const partnerId = String(req.body.partnerId || "").trim();

    if (
      !rawUrl ||
      (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid http/https URL is required.",
      });
    }

    const response = await fetch(rawUrl);
    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to fetch image: HTTP ${response.status}`,
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res
        .status(400)
        .json({ success: false, message: "URL does not point to an image." });
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";

    const url = await cloudinaryService.uploadPartnerLogo(
      fileBuffer,
      `fetched_logo.${ext}`,
      contentType,
      partnerId,
    );

    return res.json({ success: true, path: url });
  } catch (error) {
    console.error("Fetch and upload logo error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch and upload logo.",
    });
  }
});

// ── POST /api/upload/ojt-file ─────────────────────────────────────────────────
// Upload an OJT file (requirement, attendance proof, weekly report) to Cloudinary.
// Body (multipart): file, studentId, folderType
const ojtUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files are allowed."));
    }
  },
});

router.post(
  "/ojt-file",
  requireAuth,
  ojtUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded." });
      }

      const studentId = String(req.body.studentId || "").trim();
      const folderType = String(req.body.folderType || "").trim();
      const fileName = String(
        req.body.fileName || req.file.originalname || "file",
      );

      if (!studentId || !folderType) {
        return res.status(400).json({
          success: false,
          message: "studentId and folderType are required.",
        });
      }

      const department = getDepartment(req);
      const category = mapFolderTypeToCategory(folderType);
      const policy = await getPolicyForDepartment(department);
      const { maxFileSizeMB, rateLimitPerDay, categoryLabel } =
        resolvePolicyValues(policy, category);

      if (req.file.size > maxFileSizeMB * 1024 * 1024) {
        return res.status(413).json({
          success: false,
          message: `${categoryLabel} upload exceeds the maximum size of ${maxFileSizeMB} MB.`,
          code: "FILE_TOO_LARGE",
        });
      }

      const rateCheck = await checkDailyUploadLimit({
        department,
        studentId,
        category,
        rateLimitPerDay,
      });
      if (!rateCheck.ok) {
        return res.status(429).json({
          success: false,
          message: `${categoryLabel} upload limit reached for the last 24 hours (${rateLimitPerDay}).`,
          code: "RATE_LIMIT_EXCEEDED",
        });
      }

      const result = await cloudinaryService.uploadOjtFile(
        req.file.buffer,
        fileName,
        studentId,
        folderType,
      );
      await trackUploadActivity({ department, studentId, category });
      return res.json({
        success: true,
        url: result.url,
        public_id: result.public_id,
        folder: result.folder,
      });
    } catch (error) {
      console.error("OJT file upload error:", error);
      return res
        .status(500)
        .json({ success: false, message: error.message || "Upload failed." });
    }
  },
);

const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed for certificates."));
    }
  },
});

router.post(
  "/ojt-certificate",
  requireAuth,
  certificateUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded." });
      }

      const studentId = String(req.body.studentId || "").trim();
      const fileName = String(
        req.body.fileName || req.file.originalname || "certificate.pdf",
      );

      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: "studentId is required.",
        });
      }

      const result = await cloudinaryService.uploadOjtCertificatePdf(
        req.file.buffer,
        fileName,
        studentId,
      );

      return res.json({
        success: true,
        url: result.url,
        public_id: result.public_id,
        folder: result.folder,
      });
    } catch (error) {
      console.error("Certificate upload error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Upload failed.",
      });
    }
  },
);

// ── POST /api/upload/ojt-file-url ─────────────────────────────────────────────
// Fetch a PDF/image from an external URL and upload to the OJT Cloudinary folder.
router.post("/ojt-file-url", requireAuth, async (req, res) => {
  try {
    const rawUrl = String(req.body.url || "").trim();
    const studentId = String(req.body.studentId || "").trim();
    const folderType = String(req.body.folderType || "").trim();

    if (
      !rawUrl ||
      (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid http/https URL is required.",
      });
    }
    if (!studentId || !folderType) {
      return res.status(400).json({
        success: false,
        message: "studentId and folderType are required.",
      });
    }

    const response = await fetch(rawUrl);
    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to fetch file: HTTP ${response.status}`,
      });
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (
      !allowed.some(
        (t) => contentType.startsWith(t.split("/")[0]) || contentType === t,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "URL does not point to an allowed file type (PDF or image).",
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const department = getDepartment(req);
    const category = mapFolderTypeToCategory(folderType);
    const policy = await getPolicyForDepartment(department);
    const { maxFileSizeMB, rateLimitPerDay, categoryLabel } =
      resolvePolicyValues(policy, category);
    if (fileBuffer.length > maxFileSizeMB * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: `${categoryLabel} upload exceeds the maximum size of ${maxFileSizeMB} MB.`,
        code: "FILE_TOO_LARGE",
      });
    }

    const rateCheck = await checkDailyUploadLimit({
      department,
      studentId,
      category,
      rateLimitPerDay,
    });
    if (!rateCheck.ok) {
      return res.status(429).json({
        success: false,
        message: `${categoryLabel} upload limit reached for the last 24 hours (${rateLimitPerDay}).`,
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    const ext =
      contentType === "application/pdf"
        ? "pdf"
        : contentType.split("/")[1]?.split(";")[0] || "bin";
    const fileName = `fetched_ojt_file_${Date.now()}.${ext}`;

    const result = await cloudinaryService.uploadOjtFile(
      fileBuffer,
      fileName,
      studentId,
      folderType,
    );
    await trackUploadActivity({ department, studentId, category });
    return res.json({
      success: true,
      url: result.url,
      public_id: result.public_id,
      folder: result.folder,
    });
  } catch (error) {
    console.error("OJT fetch-and-upload error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch and upload file.",
    });
  }
});

// ── DELETE /api/upload/file ──────────────────────────────────────────────────
// Delete a file from Cloudinary by public_id.
router.delete("/file", requireAuth, async (req, res) => {
  const publicId = String(req.body.publicId || "").trim();
  if (!publicId) {
    return res
      .status(400)
      .json({ success: false, message: "publicId is required." });
  }
  try {
    await cloudinaryService.deleteByPublicId(publicId);
    return res.json({ success: true });
  } catch (error) {
    console.error("File delete error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete file.",
    });
  }
});

module.exports = router;
