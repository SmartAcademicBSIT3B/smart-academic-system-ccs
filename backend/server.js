require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const archiveRoutes = require("./routes/archives");
const externalPartnerRoutes = require("./routes/external-partners");
const ojtStudentRoutes = require("./routes/ojt-students");
const metaRoutes = require("./routes/meta");
const gdriveRoutes = require("./routes/gdrive");
const uploadRoutes = require("./routes/upload");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Accept requests from the packaged Electron app (file://) and any configured
// origins.  electron-renderer pages load from file:// which browsers/Node send
// as a null origin, so we allow that explicitly in dev/test.
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      // file:// pages arrive with origin === undefined or "null"
      if (!origin || origin === "null" || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/archives", archiveRoutes);
app.use("/api/external-partners", externalPartnerRoutes);
app.use("/api/ojt-students", ojtStudentRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/gdrive", gdriveRoutes);
app.use("/api/upload", uploadRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    version: process.env.npm_package_version || "1.0.0-alpha.1",
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Smart Academic Backend running on port ${PORT}`);
});
