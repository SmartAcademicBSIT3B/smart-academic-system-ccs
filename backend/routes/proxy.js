const express = require("express");
const { Readable } = require("stream");
const { v2: cloudinary } = require("cloudinary");
const { requireAuth } = require("../middleware/auth");

// Ensure Cloudinary is configured with env credentials in case this module
// is loaded before services/cloudinary.js runs its config call.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const router = express.Router();

// Only allow proxying from trusted hosts to prevent SSRF
const ALLOWED_HOSTS = ["res.cloudinary.com"];

function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return ALLOWED_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith("." + h),
    );
  } catch (_) {
    return false;
  }
}

/**
 * Given a res.cloudinary.com URL, extract the public_id, resource_type,
 * and file format so we can generate an authenticated download URL.
 *
 * Cloudinary URL format:
 *   https://res.cloudinary.com/<cloud>/<resource_type>/upload/[v<version>/]<public_id>.<ext>
 */
function parseCloudinaryUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // pathname: /<cloud_name>/<resource_type>/upload[/<version>]/<public_id_with_ext>
    const parts = u.pathname.replace(/^\//, "").split("/");
    // parts[0]=cloud_name, parts[1]=resource_type, parts[2]='upload', rest=public_id path
    if (parts.length < 4 || parts[2] !== "upload") return null;
    const resourceType = parts[1]; // 'image', 'video', 'raw'
    // Skip optional version segment (vNNNNNNNNNN)
    let startIdx = 3;
    if (/^v\d+$/.test(parts[startIdx])) startIdx += 1;
    const publicIdWithExt = parts.slice(startIdx).join("/");
    const lastDot = publicIdWithExt.lastIndexOf(".");
    const format = lastDot !== -1 ? publicIdWithExt.slice(lastDot + 1) : "";
    const publicId =
      lastDot !== -1 ? publicIdWithExt.slice(0, lastDot) : publicIdWithExt;
    return { resourceType, publicId, format };
  } catch (_) {
    return null;
  }
}

/**
 * Build an authenticated Cloudinary download URL using private_download_url.
 * This uses the Admin API endpoint with API key + secret, so it works
 * regardless of the asset's delivery type (upload, authenticated, private).
 * Falls back to the original URL if credentials are missing.
 */
function buildAuthenticatedCloudinaryUrl(originalUrl) {
  const parsed = parseCloudinaryUrl(originalUrl);
  if (!parsed) return originalUrl;

  const { resourceType, publicId, format } = parsed;
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 min

  try {
    const downloadUrl = cloudinary.utils.private_download_url(
      publicId,
      format || "pdf",
      {
        resource_type: resourceType,
        type: "upload",
        expires_at: expiresAt,
      },
    );
    console.log(
      `[proxy/file] parsed → resourceType=${resourceType} publicId=${publicId} format=${format}`,
    );
    console.log("[proxy/file] download url:", downloadUrl);
    return downloadUrl || originalUrl;
  } catch (err) {
    console.error("[proxy/file] private_download_url failed:", err.message);
    return originalUrl;
  }
}

// GET /api/proxy/file?url=<encoded_remote_url>
// Fetches a remote file server-side and streams it to the client.
// For Cloudinary URLs, generates a signed URL to handle access-controlled resources.
router.get("/file", requireAuth, async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();

  if (!rawUrl) {
    return res
      .status(400)
      .json({ success: false, message: "url query param is required." });
  }

  if (!isAllowedUrl(rawUrl)) {
    return res
      .status(403)
      .json({ success: false, message: "URL not permitted for proxying." });
  }

  // For Cloudinary assets, use an authenticated download URL so restricted/raw
  // resources are accessible regardless of delivery type.
  const fetchUrl = buildAuthenticatedCloudinaryUrl(rawUrl);

  try {
    const upstream = await fetch(fetchUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartAcademicSystem/1.0)",
      },
    });

    if (!upstream.ok) {
      let body = "";
      try {
        body = await upstream.text();
      } catch (_) {}
      console.error(`[proxy/file] upstream ${upstream.status}:`, body);
      return res.status(502).json({
        success: false,
        message: `Upstream returned HTTP ${upstream.status}`,
      });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // Stream upstream body directly to response
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (error) {
    console.error("[proxy/file] error:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, message: error.message || "Proxy error." });
    }
  }
});

module.exports = router;
