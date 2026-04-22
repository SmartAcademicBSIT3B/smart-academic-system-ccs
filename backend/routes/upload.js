const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const cloudinaryService = require("../services/cloudinary");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── POST /api/upload/profile-image ────────────────────────────────────────────
router.post("/profile-image", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const userId = String(req.body.userId || "").trim();
    const fileName = String(req.body.fileName || req.file.originalname || "profile.jpg");
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
});

// ── POST /api/upload/partner-logo ─────────────────────────────────────────────
router.post("/partner-logo", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const partnerId = String(req.body.partnerId || "").trim();
    const fileName = String(req.body.fileName || req.file.originalname || "logo.jpg");
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
});

// ── POST /api/upload/partner-logo-url ─────────────────────────────────────────
// Fetches an image from an external URL then uploads it to Cloudinary.
router.post("/partner-logo-url", requireAuth, async (req, res) => {
  try {
    const rawUrl = String(req.body.url || "").trim();
    const partnerId = String(req.body.partnerId || "").trim();

    if (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))) {
      return res
        .status(400)
        .json({ success: false, message: "A valid http/https URL is required." });
    }

    const response = await fetch(rawUrl);
    if (!response.ok) {
      return res
        .status(400)
        .json({ success: false, message: `Failed to fetch image: HTTP ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ success: false, message: "URL does not point to an image." });
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
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to fetch and upload logo." });
  }
});

module.exports = router;
