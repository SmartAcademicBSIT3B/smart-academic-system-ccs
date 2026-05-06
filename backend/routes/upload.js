const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const cloudinaryService = require("../services/cloudinary");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── POST /api/upload/profile-image ────────────────────────────────────────────
router.post(
  "/profile-image",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
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
  },
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
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

      const result = await cloudinaryService.uploadOjtFile(
        req.file.buffer,
        fileName,
        studentId,
        folderType,
      );
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
