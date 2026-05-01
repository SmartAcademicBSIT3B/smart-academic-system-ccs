const express = require("express");
const { requireAuth } = require("../middleware/auth");
const gdriveService = require("../services/gdrive");

const router = express.Router();

function resolveCallbackUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = String(
    req.headers["x-forwarded-host"] || req.get("host") || "",
  ).trim();

  if (!host) {
    throw new Error("Unable to resolve OAuth callback host.");
  }

  return `${protocol}://${host}/api/gdrive/oauth/callback`;
}

// ── GET /api/gdrive/status ────────────────────────────────────────────────────
// Public so landing page settings can show Google Drive state before login.
router.get("/status", (_req, res) => {
  try {
    return res.json({ success: true, isAuthorized: gdriveService.hasToken() });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message || "Auth check failed." });
  }
});

// ── GET /api/gdrive/auth-url ──────────────────────────────────────────────────
// Public so landing page settings can start OAuth before login.
router.get("/auth-url", (_req, res) => {
  try {
    const callbackUrl = resolveCallbackUrl(_req);
    const authUrl = gdriveService.getAuthUrl(callbackUrl);
    return res.json({ success: true, authUrl });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate auth URL.",
    });
  }
});

// ── GET /api/gdrive/oauth/callback  (Google redirects here) ──────────────────
// No requireAuth — this is called by Google's servers.
router.get("/oauth/callback", async (req, res) => {
  const error = req.query.error;
  if (error) {
    return res
      .status(400)
      .send(
        "<h3>Google authorization was canceled.</h3><p>You may close this tab.</p>",
      );
  }

  const code = String(req.query.code || "").trim();
  if (!code) {
    return res
      .status(400)
      .send("<h3>Authorization code not found.</h3><p>Please try again.</p>");
  }

  try {
    const callbackUrl = resolveCallbackUrl(req);
    await gdriveService.saveTokenFromCode(code, callbackUrl);
    return res
      .status(200)
      .send(
        "<h3>Google Drive connected successfully.</h3><p>You may close this tab and return to the app.</p>",
      );
  } catch (tokenError) {
    console.error("Token exchange failed:", tokenError);
    return res
      .status(500)
      .send(
        "<h3>Failed to finalize authorization.</h3><p>Please return to the app and try again.</p>",
      );
  }
});

// ── DELETE /api/gdrive/token ──────────────────────────────────────────────────
router.delete("/token", requireAuth, (_req, res) => {
  try {
    gdriveService.clearToken();
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to clear Google Drive auth.",
    });
  }
});

// ── GET /api/gdrive/download ──────────────────────────────────────────────────
// Proxies a Drive file download so Electron can save it locally.
// Query param: fileUrl (the Google Drive view/share URL)
router.get("/download", requireAuth, async (req, res) => {
  const fileUrl = String(req.query.fileUrl || "").trim();
  if (!fileUrl) {
    return res
      .status(400)
      .json({ success: false, message: "fileUrl is required." });
  }

  try {
    const { stream, mimeType, fileName } =
      await gdriveService.downloadFile(fileUrl);

    res.setHeader("Content-Type", mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName || "archive.pdf")}"`,
    );

    stream.pipe(res);
  } catch (error) {
    if (error?.code === "AUTH_REQUIRED") {
      return res
        .status(403)
        .json({ success: false, requiresAuth: true, message: error.message });
    }
    console.error("Drive download error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to download file.",
    });
  }
});

module.exports = router;
