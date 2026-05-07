require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs");

const authRoutes = require("./routes/auth");
const archiveRoutes = require("./routes/archives");
const externalPartnerRoutes = require("./routes/external-partners");
const ojtStudentRoutes = require("./routes/ojt-students");
const ojtCoordinatorRoutes = require("./routes/ojt-coordinator");
const ojtRequirementsRoutes = require("./routes/ojt-requirements");
const ojtAttendanceRoutes = require("./routes/ojt-attendance");
const ojtWeeklyReportsRoutes = require("./routes/ojt-weekly-reports");
const ojtCertificatesRoutes = require("./routes/ojt-certificates");
const usersRoutes = require("./routes/users");
const sectionAssignmentsRoutes = require("./routes/section-assignments");
const sectionsRoutes = require("./routes/sections");
const metaRoutes = require("./routes/meta");
const gdriveRoutes = require("./routes/gdrive");
const uploadRoutes = require("./routes/upload");
const proxyRoutes = require("./routes/proxy");
const { syncAllArchiveOjtLinks } = require("./helpers/archive-ojt-link");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

function resolveBackendVersion() {
  if (String(process.env.npm_package_version || "").trim()) {
    return process.env.npm_package_version;
  }

  try {
    const packagePath = path.join(__dirname, "package.json");
    const raw = fs.readFileSync(packagePath, "utf8");
    const parsed = JSON.parse(raw);
    const version = String(parsed?.version || "").trim();
    if (version) return version;
  } catch (_error) {
    // Fall through to the static fallback below.
  }

  return "1.0.0-beta.1";
}

const backendVersion = resolveBackendVersion();

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
app.use("/api/ojt-coordinator", ojtCoordinatorRoutes);
app.use("/api/ojt-requirements", ojtRequirementsRoutes);
app.use("/api/ojt-attendance", ojtAttendanceRoutes);
app.use("/api/ojt-weekly-reports", ojtWeeklyReportsRoutes);
app.use("/api/ojt-certificates", ojtCertificatesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/section-assignments", sectionAssignmentsRoutes);
app.use("/api/sections", sectionsRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/gdrive", gdriveRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/proxy", proxyRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    version: backendVersion,
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

function startArchiveOjtLinkScheduler() {
  const intervalMs = Number.parseInt(
    process.env.ARCHIVE_OJT_LINK_SYNC_INTERVAL_MS || "300000",
    10,
  );
  const safeIntervalMs =
    Number.isInteger(intervalMs) && intervalMs >= 60000 ? intervalMs : 300000;

  let running = false;

  const runSync = async (source) => {
    if (running) return;
    running = true;

    try {
      await syncAllArchiveOjtLinks();
      console.log(
        `[archive-ojt-link] sync complete via ${source} at ${new Date().toISOString()}`,
      );
    } catch (error) {
      console.error("[archive-ojt-link] periodic sync failed:", error);
    } finally {
      running = false;
    }
  };

  // Initial sync shortly after startup.
  setTimeout(() => {
    runSync("startup");
  }, 5000);

  setInterval(() => {
    runSync("interval");
  }, safeIntervalMs);

  console.log(
    `[archive-ojt-link] scheduler started (interval: ${safeIntervalMs} ms)`,
  );
}

app.listen(PORT, () => {
  console.log(`Smart Academic Backend running on port ${PORT}`);
  startArchiveOjtLinkScheduler();
});
