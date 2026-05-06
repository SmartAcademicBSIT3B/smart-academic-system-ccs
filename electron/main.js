const { app, BrowserWindow, ipcMain, dialog, shell, net } = require("electron");
const path = require("node:path");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const { pipeline } = require("node:stream/promises");
const { fileURLToPath } = require("node:url");
const dotenv = require("dotenv");

function getWritableUserDataPath() {
  try {
    return app.getPath("userData");
  } catch (_error) {
    return "";
  }
}

function loadRuntimeEnv() {
  const userDataPath = getWritableUserDataPath();
  const appDataPath = process.env.APPDATA || "";
  const appName = String(app.getName() || "").trim();

  const candidates = [
    process.env.SAS_ENV_PATH,
    userDataPath ? path.join(userDataPath, ".env") : "",
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env"),
    process.resourcesPath ? path.join(process.resourcesPath, ".env") : "",
    appDataPath
      ? path.join(appDataPath, "smart-academic-system-ccs", ".env")
      : "",
    appDataPath
      ? path.join(appDataPath, "Smart Academic System CCS", ".env")
      : "",
    appDataPath && appName ? path.join(appDataPath, appName, ".env") : "",
    path.join(path.dirname(process.execPath), ".env"),
  ].filter(Boolean);

  const seen = new Set();
  for (const envPath of candidates) {
    const normalized = path.normalize(envPath);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (fsSync.existsSync(normalized)) {
      dotenv.config({ path: normalized, override: false });
    }
  }
}

loadRuntimeEnv();

const PACKAGED_BACKEND_URL = "https://smart-academic-system-ccs.onrender.com";
const DEV_BACKEND_URL = "http://localhost:3000";
const configuredBackendUrl = String(process.env.BACKEND_URL || "").trim();

if (app.isPackaged) {
  if (
    !configuredBackendUrl ||
    /(^https?:\/\/(localhost|127\.0\.0\.1))(\/|$)/i.test(configuredBackendUrl)
  ) {
    process.env.BACKEND_URL = PACKAGED_BACKEND_URL;
  }
} else {
  // In local development (unpackaged), always use the local backend so code
  // changes take effect immediately.  The BACKEND_URL env var is ignored in
  // this mode; it is only honoured in a packaged build.
  process.env.BACKEND_URL = DEV_BACKEND_URL;
}

if (!process.env.GDRIVE_TOKEN_PATH) {
  const userDataPath = getWritableUserDataPath();
  if (userDataPath) {
    process.env.GDRIVE_TOKEN_PATH = path.join(
      userDataPath,
      ".tokens",
      "gdrive_token.json",
    );
  }
}

const api = require("./services/api_client");

const ARCHIVE_UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "renderer",
  "modules",
  "m1_archive",
  "adminpage",
  "uploads",
  "documents",
);

const DEFAULT_APP_SETTINGS = {
  department: {
    id: null,
    department_name: "",
    department_code: "CCS",
    logo_url: "",
  },
  localDocumentsPath: "",
};

let cachedAppSettings = null;

function getAppSettingsPath() {
  return path.join(app.getPath("userData"), "app-settings.json");
}

function normalizeDepartmentSetting(department) {
  const normalized =
    department && typeof department === "object" ? department : {};

  const idNumber = Number.parseInt(normalized.id, 10);
  const department_name = String(normalized.department_name || "").trim();
  const department_code =
    String(normalized.department_code || "").trim() ||
    String(DEFAULT_APP_SETTINGS.department.department_code);
  const logo_url = String(normalized.logo_url || "").trim();

  return {
    id: Number.isInteger(idNumber) ? idNumber : null,
    department_name,
    department_code,
    logo_url,
  };
}

function normalizeSettingsData(value) {
  const raw = value && typeof value === "object" ? value : {};
  const localDocumentsPath = String(raw.localDocumentsPath || "").trim();

  return {
    department: normalizeDepartmentSetting(raw.department),
    localDocumentsPath,
  };
}

async function ensureDepartmentDocumentsDirectory(departmentCode = "") {
  const docsRoot = path.join(
    app.getPath("documents"),
    "CTA Files",
    "Documents",
  );
  const safeDepartmentCode = sanitizeDriveFolderSegment(
    departmentCode || DEFAULT_APP_SETTINGS.department.department_code,
  );
  const targetPath = path.join(docsRoot, safeDepartmentCode);
  await fs.mkdir(targetPath, { recursive: true });
  return targetPath;
}

async function loadAppSettings() {
  if (cachedAppSettings) return cachedAppSettings;

  const settingsPath = getAppSettingsPath();

  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    cachedAppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...normalizeSettingsData(parsed),
    };

    if (!String(cachedAppSettings.localDocumentsPath || "").trim()) {
      cachedAppSettings.localDocumentsPath =
        await ensureDepartmentDocumentsDirectory(
          cachedAppSettings?.department?.department_code,
        );
    } else {
      await fs.mkdir(cachedAppSettings.localDocumentsPath, { recursive: true });
    }

    return cachedAppSettings;
  } catch (_error) {
    cachedAppSettings = { ...DEFAULT_APP_SETTINGS };
    cachedAppSettings.localDocumentsPath =
      await ensureDepartmentDocumentsDirectory(
        cachedAppSettings?.department?.department_code,
      );
    return cachedAppSettings;
  }
}

async function writeAppSettings(nextSettings) {
  const settingsPath = getAppSettingsPath();
  const normalized = {
    ...DEFAULT_APP_SETTINGS,
    ...normalizeSettingsData(nextSettings),
  };

  if (!String(normalized.localDocumentsPath || "").trim()) {
    normalized.localDocumentsPath = await ensureDepartmentDocumentsDirectory(
      normalized?.department?.department_code,
    );
  } else {
    await fs.mkdir(normalized.localDocumentsPath, { recursive: true });
  }

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(normalized, null, 2), "utf8");

  cachedAppSettings = normalized;
  return normalized;
}

async function saveAppSettingsPatch(settingsPatch = {}) {
  const current = await loadAppSettings();
  const patch =
    settingsPatch && typeof settingsPatch === "object" ? settingsPatch : {};

  const patchIncludesDepartment = Object.prototype.hasOwnProperty.call(
    patch,
    "department",
  );
  const patchIncludesLocalPath = Object.prototype.hasOwnProperty.call(
    patch,
    "localDocumentsPath",
  );

  const next = {
    ...current,
    ...(patchIncludesLocalPath
      ? { localDocumentsPath: String(patch.localDocumentsPath || "").trim() }
      : {}),
    ...(patchIncludesDepartment
      ? {
          department: normalizeDepartmentSetting({
            ...current.department,
            ...(patch.department && typeof patch.department === "object"
              ? patch.department
              : {}),
          }),
        }
      : {}),
  };

  if (patchIncludesDepartment && !patchIncludesLocalPath) {
    next.localDocumentsPath = await ensureDepartmentDocumentsDirectory(
      next?.department?.department_code,
    );
  }

  if (!String(next.localDocumentsPath || "").trim()) {
    next.localDocumentsPath = await ensureDepartmentDocumentsDirectory(
      next?.department?.department_code,
    );
  }

  return writeAppSettings(next);
}

function getDefaultLocalDocumentsDirectory() {
  return path.join(app.getPath("documents"), "CTA Files", "Documents", "CCS");
}

async function isWritableDirectory(dirPath) {
  const target = String(dirPath || "").trim();
  if (!target) return false;

  try {
    await fs.mkdir(target, { recursive: true });
    const probePath = path.join(
      target,
      `.sas-write-test-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    );
    await fs.writeFile(probePath, "ok", "utf8");
    await fs.unlink(probePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function getConfiguredDocumentsDirectory() {
  const settings = await loadAppSettings();
  const configured = String(settings.localDocumentsPath || "").trim();
  if (configured && (await isWritableDirectory(configured))) {
    return configured;
  }

  const fallbackCandidates = [
    getDefaultLocalDocumentsDirectory(),
    app.getPath("downloads"),
  ];

  for (const candidate of fallbackCandidates) {
    if (await isWritableDirectory(candidate)) {
      return candidate;
    }
  }

  return getDefaultLocalDocumentsDirectory();
}

async function getActiveDepartmentCode() {
  const settings = await loadAppSettings();
  const code = String(settings?.department?.department_code || "").trim();
  return code || DEFAULT_APP_SETTINGS.department.department_code;
}

function sanitizeDriveFolderSegment(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_APP_SETTINGS.department.department_code;

  return raw.replace(/[\\/:*?"<>|]+/g, "-").trim() || "CCS";
}

function sanitizeDownloadFileName(fileName) {
  const cleaned = String(fileName || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ");

  return cleaned || "archive.pdf";
}

async function buildUniqueDownloadPath(downloadsDir, preferredFileName) {
  const parsed = path.parse(sanitizeDownloadFileName(preferredFileName));
  const baseName = parsed.name || "archive";
  const extension = parsed.ext || ".pdf";

  let attempt = 0;
  while (true) {
    const candidateName =
      attempt === 0
        ? `${baseName}${extension}`
        : `${baseName} (${attempt})${extension}`;
    const candidatePath = path.join(downloadsDir, candidateName);

    try {
      await fs.access(candidatePath);
      attempt += 1;
    } catch (_error) {
      return candidatePath;
    }
  }
}

function resolveLocalPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw);
    } catch (_error) {
      return "";
    }
  }

  return raw;
}

async function copyLocalArchiveToDownloads(localFilePath, preferredFileName) {
  const sourcePath = resolveLocalPath(localFilePath);
  if (!sourcePath) {
    return { success: false, message: "No local file path was provided." };
  }

  await fs.access(sourcePath);

  const downloadsDir = await getConfiguredDocumentsDirectory();
  await fs.mkdir(downloadsDir, { recursive: true });

  const resolvedName =
    preferredFileName || path.basename(sourcePath) || "archive.pdf";
  const destinationPath = await buildUniqueDownloadPath(
    downloadsDir,
    resolvedName,
  );

  await fs.copyFile(sourcePath, destinationPath);

  return {
    success: true,
    fileName: path.basename(destinationPath),
    savedPath: destinationPath,
  };
}

async function downloadDriveArchiveToDownloads(fileUrl, preferredFileName) {
  const fileId = extractGoogleDriveFileId(fileUrl);
  if (!fileId) {
    return { success: false, message: "No Google Drive file ID found." };
  }

  let drive;
  try {
    drive = getDriveClient();
  } catch (error) {
    if (error?.code === "AUTH_REQUIRED") {
      return {
        success: false,
        requiresAuth: true,
        message: "Google Drive authorization is required before downloading.",
      };
    }
    throw error;
  }

  const downloadsDir = await getConfiguredDocumentsDirectory();
  await fs.mkdir(downloadsDir, { recursive: true });

  const metadataResponse = await drive.files.get({
    fileId,
    fields: "name",
    supportsAllDrives: true,
  });
  const resolvedName =
    preferredFileName || metadataResponse.data?.name || `archive-${fileId}.pdf`;
  const destinationPath = await buildUniqueDownloadPath(
    downloadsDir,
    resolvedName,
  );

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "stream",
    },
  );

  await pipeline(response.data, fsSync.createWriteStream(destinationPath));

  return {
    success: true,
    fileName: path.basename(destinationPath),
    savedPath: destinationPath,
  };
}

async function downloadArchiveToDownloads(file = {}) {
  const sourceUrl = String(file.sourceUrl || "").trim();
  const localFilePath = String(file.localFilePath || "").trim();
  const preferredFileName = String(file.fileName || "").trim();

  if (extractGoogleDriveFileId(sourceUrl)) {
    return downloadDriveArchiveToDownloads(sourceUrl, preferredFileName);
  }

  if (localFilePath || sourceUrl) {
    return copyLocalArchiveToDownloads(
      localFilePath || sourceUrl,
      preferredFileName,
    );
  }

  return { success: false, message: "No downloadable file source found." };
}

function normalizeArchiveType(type) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();

  const allowed = {
    thesis: "Thesis",
    capstone: "Capstone",
  };

  return allowed[normalized] || null;
}

function normalizeArchiveStatus(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  const allowed = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };

  return allowed[normalized] || null;
}

function toSqlDateTime(date = new Date()) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

function resolveArchiveLocalFileAbsolutePath(storedPath) {
  const resolved = resolveLocalPath(storedPath);
  if (!resolved) return "";

  if (path.isAbsolute(resolved)) {
    return resolved;
  }

  const normalized = resolved.replace(/\\/g, "/");
  const fileName = path.basename(normalized);
  if (!fileName) return "";

  return path.join(ARCHIVE_UPLOAD_DIR, fileName);
}

function cleanExternalPartnerField(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeExternalPartnerPayload(
  payload = {},
  defaultDepartment = "CCS",
) {
  const department =
    String(payload.department || "").trim() ||
    String(defaultDepartment || "CCS");

  return {
    logo: cleanExternalPartnerField(payload.logo),
    company_name: String(payload.company_name || "").trim(),
    address: String(payload.address || "").trim(),
    department,
    company_email: cleanExternalPartnerField(payload.company_email),
    company_contact: cleanExternalPartnerField(payload.company_contact),
    representative: cleanExternalPartnerField(payload.representative),
    job_description: cleanExternalPartnerField(payload.job_description),
    representative_email: cleanExternalPartnerField(
      payload.representative_email,
    ),
    representative_contact: cleanExternalPartnerField(
      payload.representative_contact,
    ),
  };
}

function cleanOjtStudentField(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeOjtStudentPayload(payload = {}, defaultDepartment = "CCS") {
  const department =
    String(payload.department || "").trim() ||
    String(defaultDepartment || "CCS");
  const status = String(payload.status || "").trim() || "Deployed";

  return {
    student_id: String(payload.student_id || "").trim(),
    name: String(payload.name || "").trim(),
    section: String(payload.section || "").trim(),
    department,
    email: cleanOjtStudentField(payload.email),
    contact_no: cleanOjtStudentField(payload.contact_no),
    status,
    external_partner_assigned: cleanOjtStudentField(
      payload.external_partner_assigned,
    ),
    nature_of_business: cleanOjtStudentField(payload.nature_of_business),
  };
}

async function ensureExternalPartnersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS external_partners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      logo VARCHAR(512) NULL,
      company_name VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      company_email VARCHAR(255) NULL,
      company_contact VARCHAR(50) NULL,
      representative VARCHAR(255) NULL,
      job_description VARCHAR(255) NULL,
      representative_email VARCHAR(255) NULL,
      representative_contact VARCHAR(50) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_external_partners_company_name (company_name),
      INDEX idx_external_partners_representative (representative)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Backfill legacy databases where the table already exists without department.
  const departmentColumn = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'external_partners'
       AND COLUMN_NAME = 'department'
     LIMIT 1`,
  );

  if (!Array.isArray(departmentColumn) || departmentColumn.length === 0) {
    await query(
      `ALTER TABLE external_partners
       ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS'
       AFTER address`,
    );
  }

  await query(
    `UPDATE external_partners
     SET department = 'CCS'
     WHERE department IS NULL OR TRIM(department) = ''`,
  );
}

async function ensureOjtStudentsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ojt_students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(120) NOT NULL,
      name VARCHAR(255) NOT NULL,
      section VARCHAR(120) NOT NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      email VARCHAR(255) NULL,
      contact_no VARCHAR(50) NULL,
      status VARCHAR(120) NOT NULL DEFAULT 'Deployed',
      external_partner_assigned VARCHAR(255) NULL,
      nature_of_business VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ojt_students_student_id (student_id),
      INDEX idx_ojt_students_name (name),
      INDEX idx_ojt_students_section (section),
      INDEX idx_ojt_students_department (department),
      INDEX idx_ojt_students_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Backfill legacy databases where the table already exists without department.
  const departmentColumn = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ojt_students'
       AND COLUMN_NAME = 'department'
     LIMIT 1`,
  );

  if (!Array.isArray(departmentColumn) || departmentColumn.length === 0) {
    await query(
      `ALTER TABLE ojt_students
       ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS'
       AFTER section`,
    );
  }

  await query(
    `UPDATE ojt_students
     SET department = 'CCS'
     WHERE department IS NULL OR TRIM(department) = ''`,
  );
}

async function authorizeGoogleDriveInteractive() {
  const redirectUri = String(
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
  ).trim();
  if (!redirectUri) {
    return {
      success: false,
      message: "GOOGLE_OAUTH_REDIRECT_URI is not set.",
    };
  }

  let parsedRedirect;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch (_error) {
    return {
      success: false,
      message: "GOOGLE_OAUTH_REDIRECT_URI is invalid.",
    };
  }

  if (parsedRedirect.protocol !== "http:") {
    return {
      success: false,
      message:
        "Interactive auth currently supports only http redirect URIs (localhost/127.0.0.1).",
    };
  }

  const callbackHost = parsedRedirect.hostname;
  const callbackPort = Number(parsedRedirect.port || 80);
  const callbackPath = parsedRedirect.pathname || "/";

  return await new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;

      clearTimeout(timeoutHandle);
      try {
        server.close();
      } catch (_error) {}

      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(
          req.url || "/",
          `${parsedRedirect.protocol}//${req.headers.host || parsedRedirect.host}`,
        );

        if (requestUrl.pathname !== callbackPath) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const errorParam = requestUrl.searchParams.get("error");
        if (errorParam) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Google authorization was canceled.</h3><p>You may close this tab.</p>",
          );
          finish({
            success: false,
            message: `Google authorization failed: ${errorParam}`,
          });
          return;
        }

        const code = requestUrl.searchParams.get("code");
        if (!code) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Authorization code not found.</h3><p>Please try again.</p>",
          );
          finish({
            success: false,
            message: "Google callback did not include an authorization code.",
          });
          return;
        }

        try {
          await saveTokenFromCode(code);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Google Drive connected successfully.</h3><p>You may close this tab and return to the app.</p>",
          );
          finish({ success: true });
        } catch (tokenError) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Failed to finalize authorization.</h3><p>Please return to the app and try again.</p>",
          );
          finish({
            success: false,
            message:
              tokenError.message ||
              "Failed to exchange Google authorization code.",
          });
        }
      } catch (_error) {
        res.statusCode = 500;
        res.end("Authorization callback error.");
        finish({
          success: false,
          message: "Failed to process Google OAuth callback.",
        });
      }
    });

    server.on("error", (error) => {
      finish({
        success: false,
        message: `Could not start callback listener on ${callbackHost}:${callbackPort}. ${error.message}`,
      });
    });

    server.listen(callbackPort, callbackHost, async () => {
      try {
        const authUrl = getAuthUrl();
        await shell.openExternal(authUrl);
      } catch (error) {
        finish({
          success: false,
          message: error.message || "Failed to open Google authorization page.",
        });
      }
    });

    const timeoutHandle = setTimeout(() => {
      finish({
        success: false,
        message:
          "Timed out waiting for Google authorization callback. Please try again.",
      });
    }, 180000);
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "core", "index.html"),
  );
}

app.whenReady().then(async () => {
  try {
    const initialSettings = await loadAppSettings();
    const initialDeptCode = String(
      initialSettings?.department?.department_code || "",
    ).trim();
    if (initialDeptCode) {
      api.setDepartmentCode(initialDeptCode);
    }
  } catch (error) {
    console.error("Failed to initialize app settings:", error);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
ipcMain.handle(
  "login",
  async (
    event,
    email,
    password,
    departmentCode,
    secretLogin,
    preferredRole,
  ) => {
    try {
      const requestedDepartmentCode = String(departmentCode || "")
        .trim()
        .toUpperCase();
      const isSecretLogin = secretLogin === true;
      const normalizedPreferredRole = String(preferredRole || "")
        .trim()
        .toLowerCase();
      if (requestedDepartmentCode) {
        api.setDepartmentCode(requestedDepartmentCode);
      }

      const result = await api.post("/auth/login", {
        email,
        password,
        departmentCode: requestedDepartmentCode,
        secretLogin: isSecretLogin,
        preferredRole: normalizedPreferredRole || undefined,
      });
      if (result.success && result.token) {
        api.setToken(result.token);
        if (result.user?.department_code) {
          api.setDepartmentCode(result.user.department_code);
        }
      }
      return result;
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: "An error occurred during login." };
    }
  },
);

ipcMain.handle("getProfile", async (event, userId) => {
  try {
    return await api.get(`/auth/profile/${userId}`);
  } catch (error) {
    console.error("Get profile error:", error);
    return {
      success: false,
      message: "An error occurred while fetching profile.",
    };
  }
});

ipcMain.handle("getDepartments", async () => {
  try {
    return await api.get("/meta/departments");
  } catch (error) {
    console.error("getDepartments error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch departments.",
      departments: [],
    };
  }
});

ipcMain.handle("getAppSettings", async () => {
  try {
    const settings = await loadAppSettings();
    return { success: true, settings };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to load app settings.",
      settings: { ...DEFAULT_APP_SETTINGS },
    };
  }
});

ipcMain.handle("getBackendDiagnostics", async () => {
  try {
    return {
      success: true,
      diagnostics: {
        backendUrl: api.getBaseUrl(),
        configuredBackendUrl: String(process.env.BACKEND_URL || "").trim(),
        isPackaged: app.isPackaged,
        appVersion: app.getVersion(),
        appPath: app.getAppPath(),
        userDataPath: getWritableUserDataPath(),
        execPath: process.execPath,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to load backend diagnostics.",
    };
  }
});

ipcMain.handle("saveAppSettings", async (event, settingsPatch = {}) => {
  try {
    const settings = await saveAppSettingsPatch(settingsPatch);
    const savedDeptCode = String(
      settings?.department?.department_code || "",
    ).trim();
    if (savedDeptCode) {
      api.setDepartmentCode(savedDeptCode);
    }
    return { success: true, settings };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to save app settings.",
    };
  }
});

ipcMain.handle("selectLocalDocumentsDirectory", async () => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const defaultPath = await getConfiguredDocumentsDirectory();
    const { canceled, filePaths } = await dialog.showOpenDialog(focusedWindow, {
      title: "Select local documents folder",
      defaultPath,
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });

    if (canceled || !Array.isArray(filePaths) || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, path: String(filePaths[0] || "") };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to open folder picker.",
    };
  }
});

ipcMain.handle(
  "ensureDepartmentDocumentsDirectory",
  async (event, departmentCode = "") => {
    try {
      const directoryPath =
        await ensureDepartmentDocumentsDirectory(departmentCode);
      return { success: true, path: directoryPath };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Failed to prepare department folder.",
      };
    }
  },
);

ipcMain.handle("getSections", async (event, departmentCode = "") => {
  try {
    const department = encodeURIComponent(String(departmentCode || "").trim());
    const path = department
      ? `/meta/sections?department=${department}`
      : "/meta/sections";
    return await api.get(path);
  } catch (error) {
    console.error("Get sections error:", error);
    return { success: false, message: "Failed to fetch sections." };
  }
});

ipcMain.handle("getProfessors", async () => {
  try {
    return await api.get("/meta/professors");
  } catch (error) {
    console.error("Get professors error:", error);
    return { success: false, message: "Failed to fetch professors." };
  }
});

ipcMain.handle("selectProfileImage", async () => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(focusedWindow, {
      title: "Select profile image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = filePaths[0];
    const ext = path.extname(selectedPath).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };
    const mimeType = mimeMap[ext] || "image/jpeg";
    const fileName = `profile_${Date.now()}_${path.basename(selectedPath)}`;

    // Return the local path so the renderer can show the loader before uploading
    return { success: true, localPath: selectedPath, fileName, mimeType };
  } catch (error) {
    console.error("Select profile image error:", error);
    return { success: false, message: "Could not open file picker." };
  }
});

ipcMain.handle("selectExternalPartnerLogo", async () => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(focusedWindow, {
      title: "Select external partner logo",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = filePaths[0];
    const ext = path.extname(selectedPath).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };
    const mimeType = mimeMap[ext] || "image/jpeg";
    const fileName = `external_partner_logo_${Date.now()}_${path.basename(selectedPath)}`;

    return { success: true, localPath: selectedPath, fileName, mimeType };
  } catch (error) {
    console.error("Select external partner logo error:", error);
    return { success: false, message: "Could not open file picker." };
  }
});

ipcMain.handle(
  "uploadProfileImage",
  async (event, { localPath, fileName, mimeType, userId }) => {
    try {
      const fileBuffer = await fs.readFile(localPath);
      return await api.postFile(
        "/upload/profile-image",
        fileBuffer,
        fileName,
        mimeType,
        { userId },
      );
    } catch (error) {
      console.error("Profile upload error:", error);
      return {
        success: false,
        message: error.message || "Upload failed. Please try again.",
      };
    }
  },
);

ipcMain.handle(
  "uploadExternalPartnerLogo",
  async (event, { localPath, fileName, mimeType, partnerId }) => {
    try {
      const fileBuffer = await fs.readFile(localPath);
      return await api.postFile(
        "/upload/partner-logo",
        fileBuffer,
        fileName,
        mimeType,
        { partnerId },
      );
    } catch (error) {
      console.error("Partner logo upload error:", error);
      return {
        success: false,
        message: error.message || "Upload failed. Please try again.",
      };
    }
  },
);

ipcMain.handle(
  "fetchAndUploadExternalPartnerLogo",
  async (event, { url, partnerId }) => {
    try {
      return await api.post("/upload/partner-logo-url", { url, partnerId });
    } catch (error) {
      console.error("fetchAndUploadExternalPartnerLogo error:", error);
      return {
        success: false,
        message: error.message || "Failed to fetch and upload logo.",
      };
    }
  },
);

ipcMain.handle(
  "updateProfile",
  async (event, { userId, name, profileImagePath }) => {
    try {
      return await api.patch("/auth/profile", {
        userId,
        name,
        profileImagePath,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      return {
        success: false,
        message: "An error occurred while saving profile.",
      };
    }
  },
);

ipcMain.handle("createArchive", async (event, payload = {}) => {
  try {
    const {
      localSourcePath,
      fileName: uploadedFileName,
      fileContentBase64,
      mimeType = "application/pdf",
      ...fields
    } = payload;

    let fileBuffer = null;
    let storedFileName = null;

    if (localSourcePath) {
      fileBuffer = await fs.readFile(localSourcePath);
      storedFileName = `archive_${Date.now()}_${path.basename(uploadedFileName || localSourcePath)}`;
    } else if (fileContentBase64) {
      fileBuffer = Buffer.from(fileContentBase64, "base64");
      storedFileName = `archive_${Date.now()}_${path.basename(uploadedFileName || "archive.pdf")}`;
    }

    if (!fileBuffer) {
      return {
        success: false,
        message:
          "Failed to read the uploaded file. Please select the PDF again.",
      };
    }

    let persistedLocalFilePath = "";
    try {
      const configuredDocumentsDir = await getConfiguredDocumentsDirectory();
      if (configuredDocumentsDir) {
        await fs.mkdir(configuredDocumentsDir, { recursive: true });
        const localPreferredName = path.basename(
          uploadedFileName || "archive.pdf",
        );
        const localDestinationPath = await buildUniqueDownloadPath(
          configuredDocumentsDir,
          localPreferredName,
        );
        await fs.writeFile(localDestinationPath, fileBuffer);
        persistedLocalFilePath = localDestinationPath;
      }
    } catch (localPersistError) {
      console.error("Failed to persist local archive copy:", localPersistError);
      persistedLocalFilePath = resolveLocalPath(localSourcePath);
    }

    const archiveFields = {
      ...fields,
      ...(persistedLocalFilePath
        ? { local_file_path: persistedLocalFilePath }
        : {}),
    };

    return await api.postFile(
      "/archives",
      fileBuffer,
      storedFileName,
      mimeType,
      archiveFields,
    );
  } catch (error) {
    console.error("Create archive error:", error);
    return {
      success: false,
      message: error.message || "Failed to save archive.",
    };
  }
});

ipcMain.handle("getArchives", async () => {
  try {
    return await api.get("/archives");
  } catch (error) {
    console.error("getArchives error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch archives.",
    };
  }
});

ipcMain.handle("updateArchive", async (event, payload = {}) => {
  try {
    const { id, ...rest } = payload;
    return await api.patch(`/archives/${id}`, rest);
  } catch (error) {
    console.error("Update archive error:", error);
    return {
      success: false,
      message: error.message || "Failed to update archive.",
    };
  }
});

ipcMain.handle("deleteArchive", async (event, archiveId) => {
  try {
    return await api.del(`/archives/${archiveId}`);
  } catch (error) {
    console.error("Delete archive error:", error);
    return {
      success: false,
      message: error?.message || "Failed to delete archive.",
    };
  }
});

ipcMain.handle("getExternalPartners", async () => {
  try {
    return await api.get("/external-partners");
  } catch (error) {
    console.error("getExternalPartners error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch external partners.",
    };
  }
});

ipcMain.handle("createExternalPartner", async (event, payload = {}) => {
  try {
    return await api.post("/external-partners", payload);
  } catch (error) {
    console.error("createExternalPartner error:", error);
    return {
      success: false,
      message: error.message || "Failed to create external partner.",
    };
  }
});

ipcMain.handle("updateExternalPartner", async (event, payload = {}) => {
  try {
    const { id, ...rest } = payload;
    return await api.patch(`/external-partners/${id}`, rest);
  } catch (error) {
    console.error("updateExternalPartner error:", error);
    return {
      success: false,
      message: error.message || "Failed to update external partner.",
    };
  }
});

ipcMain.handle("deleteExternalPartner", async (event, partnerId) => {
  try {
    return await api.del(`/external-partners/${partnerId}`);
  } catch (error) {
    console.error("deleteExternalPartner error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete external partner.",
    };
  }
});

ipcMain.handle("getOjtStudents", async () => {
  try {
    return await api.get("/ojt-students");
  } catch (error) {
    console.error("getOjtStudents error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch OJT students.",
    };
  }
});

ipcMain.handle("createOjtStudent", async (event, payload = {}) => {
  try {
    return await api.post("/ojt-students", payload);
  } catch (error) {
    console.error("createOjtStudent error:", error);
    return {
      success: false,
      message: error.message || "Failed to create OJT student.",
    };
  }
});

ipcMain.handle("updateOjtStudent", async (event, payload = {}) => {
  try {
    const { id, ...rest } = payload;
    return await api.patch(`/ojt-students/${id}`, rest);
  } catch (error) {
    console.error("updateOjtStudent error:", error);
    return {
      success: false,
      message: error.message || "Failed to update OJT student.",
    };
  }
});

ipcMain.handle("deleteOjtStudent", async (event, studentId) => {
  try {
    return await api.del(`/ojt-students/${studentId}`);
  } catch (error) {
    console.error("deleteOjtStudent error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete OJT student.",
    };
  }
});

ipcMain.handle("getUsers", async () => {
  try {
    return await api.get("/users");
  } catch (error) {
    console.error("getUsers error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch users.",
    };
  }
});

ipcMain.handle("createUser", async (event, payload = {}) => {
  try {
    return await api.post("/users", payload);
  } catch (error) {
    console.error("createUser error:", error);
    return {
      success: false,
      message: error.message || "Failed to create user.",
    };
  }
});

ipcMain.handle("updateUser", async (event, payload = {}) => {
  try {
    const { id, ...rest } = payload;
    return await api.patch(`/users/${id}`, rest);
  } catch (error) {
    console.error("updateUser error:", error);
    return {
      success: false,
      message: error.message || "Failed to update user.",
    };
  }
});

ipcMain.handle("deleteUser", async (event, userId) => {
  try {
    return await api.del(`/users/${userId}`);
  } catch (error) {
    console.error("deleteUser error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete user.",
    };
  }
});

ipcMain.handle("getSectionAssignments", async () => {
  try {
    return await api.get("/section-assignments");
  } catch (error) {
    console.error("getSectionAssignments error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch section assignments.",
    };
  }
});

ipcMain.handle("createSectionAssignment", async (event, payload = {}) => {
  try {
    return await api.post("/section-assignments", payload);
  } catch (error) {
    console.error("createSectionAssignment error:", error);
    return {
      success: false,
      message: error.message || "Failed to create section assignment.",
    };
  }
});

ipcMain.handle("updateSectionAssignment", async (event, payload = {}) => {
  try {
    const { id, ...rest } = payload;
    return await api.patch(`/section-assignments/${id}`, rest);
  } catch (error) {
    console.error("updateSectionAssignment error:", error);
    return {
      success: false,
      message: error.message || "Failed to update section assignment.",
    };
  }
});

ipcMain.handle("deleteSectionAssignment", async (event, id) => {
  try {
    return await api.del(`/section-assignments/${id}`);
  } catch (error) {
    console.error("deleteSectionAssignment error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete section assignment.",
    };
  }
});

ipcMain.handle("createSection", async (event, payload) => {
  try {
    return await api.post("/sections", payload);
  } catch (error) {
    console.error("createSection error:", error);
    return {
      success: false,
      message: error.message || "Failed to create section.",
    };
  }
});

ipcMain.handle("updateSection", async (event, payload) => {
  try {
    const id = payload?.id || payload?.sectionId;
    return await api.patch(`/sections/${id}`, payload);
  } catch (error) {
    console.error("updateSection error:", error);
    return {
      success: false,
      message: error.message || "Failed to update section.",
    };
  }
});

ipcMain.handle("deleteSection", async (event, id) => {
  try {
    return await api.del(`/sections/${id}`);
  } catch (error) {
    console.error("deleteSection error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete section.",
    };
  }
});

ipcMain.handle("checkGoogleDriveAuth", async () => {
  try {
    return await api.get("/gdrive/status");
  } catch (error) {
    return { success: false, message: error.message || "Auth check failed." };
  }
});

ipcMain.handle("getGoogleDriveAuthUrl", async () => {
  try {
    return await api.get("/gdrive/auth-url");
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to generate Google auth URL.",
    };
  }
});

// saveGoogleDriveToken is no longer needed — backend handles OAuth callback directly.
// Kept for backward compatibility but is a no-op.
ipcMain.handle("saveGoogleDriveToken", async () => {
  return {
    success: true,
    message: "Token management is handled by the backend.",
  };
});

ipcMain.handle("clearGoogleDriveAuth", async () => {
  try {
    return await api.del("/gdrive/token");
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to clear Google Drive authentication.",
    };
  }
});

ipcMain.handle("openExternalUrl", async (event, url) => {
  try {
    if (!url || !String(url).trim()) {
      return { success: false, message: "URL is required." };
    }

    await shell.openExternal(String(url));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to open external URL.",
    };
  }
});

ipcMain.handle("fetchViewerFile", async (event, url) => {
  try {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) {
      return { success: false, message: "URL is required." };
    }

    console.log("[fetchViewerFile] Fetching via proxy:", normalizedUrl);

    // Route the request through the backend proxy so the server fetches
    // Cloudinary server-to-server, bypassing any browser CORS restrictions.
    const proxyPath = `/proxy/file?url=${encodeURIComponent(normalizedUrl)}`;
    const response = await api.get(proxyPath);

    console.log(
      "[fetchViewerFile] api.get response type:",
      typeof response,
      "hasArrayBuffer:",
      typeof response?.arrayBuffer === "function",
      "ok:",
      response?.ok,
      "status:",
      response?.status,
    );

    // api.get() returns the raw Response for non-JSON content types.
    if (!response || typeof response.arrayBuffer !== "function") {
      const msg = typeof response === "object" ? response?.message : null;
      console.error(
        "[fetchViewerFile] Proxy did not return a file response. Got:",
        response,
      );
      return {
        success: false,
        message: msg || "Proxy request did not return a file.",
      };
    }

    if (!response.ok) {
      let errBody = "";
      try {
        errBody = await response.text();
      } catch (_) {}
      console.error(
        `[fetchViewerFile] Proxy HTTP ${response.status}:`,
        errBody,
      );
      return {
        success: false,
        message: `Proxy error: HTTP ${response.status}. ${errBody}`.trim(),
      };
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      "[fetchViewerFile] Success. contentType:",
      contentType,
      "bytes:",
      buffer.length,
    );

    return {
      success: true,
      mimeType: contentType,
      dataBase64: buffer.toString("base64"),
    };
  } catch (error) {
    console.error("[fetchViewerFile] Caught exception:", error);
    return {
      success: false,
      message: error.message || "Failed to load viewer file.",
    };
  }
});

ipcMain.handle("downloadArchivesToDownloads", async (event, files = []) => {
  try {
    const requestedFiles = Array.isArray(files) ? files : [];
    if (!requestedFiles.length) {
      return {
        success: false,
        message: "No files were selected for download.",
      };
    }

    const downloadsDir = app.getPath("downloads");
    const downloaded = [];
    const failed = [];

    for (const file of requestedFiles) {
      try {
        const { buffer, fileName } = await api.downloadFile(
          file.sourceUrl || file.file_path || "",
        );
        const destPath = path.join(downloadsDir, fileName);
        await fs.writeFile(destPath, buffer);
        downloaded.push({ fileName, savedPath: destPath });
      } catch (error) {
        if (error?.requiresAuth) {
          return {
            success: false,
            requiresAuth: true,
            message: error.message || "Google Drive authorization is required.",
          };
        }
        failed.push({
          fileName: file?.fileName || "archive.pdf",
          message: error.message || "Download failed.",
        });
      }
    }

    return {
      success: downloaded.length > 0 && failed.length === 0,
      downloaded,
      failed,
      downloadDirectory: downloadsDir,
      totalRequested: requestedFiles.length,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to download selected archives.",
    };
  }
});

ipcMain.handle("authorizeGoogleDriveInteractive", async () => {
  try {
    const result = await api.get("/gdrive/auth-url");
    if (!result?.authUrl)
      return {
        success: false,
        message: "Could not get auth URL from backend.",
      };
    await shell.openExternal(result.authUrl);
    return {
      success: true,
      message:
        "Browser opened for Google Drive authorization. Complete the flow, then retry.",
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Google interactive authorization failed.",
    };
  }
});

ipcMain.handle("logout", async () => {
  try {
    api.clearToken();
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, message: "An error occurred during logout." };
  }
});

ipcMain.handle("closeApp", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    } else {
      app.quit();
    }
    return { success: true };
  } catch (error) {
    console.error("Close app error:", error);
    return { success: false, message: "Failed to close app." };
  }
});

ipcMain.handle("sendOTP", async (event, email) => {
  try {
    return await api.post("/auth/send-otp", {
      email,
      purpose: "reset_password",
    });
  } catch (error) {
    return { success: false, message: error.message || "Failed to send OTP." };
  }
});

ipcMain.handle("verifyOTP", async (event, email, otp) => {
  try {
    return await api.post("/auth/verify-otp", {
      email,
      otp,
      purpose: "reset_password",
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to verify OTP.",
    };
  }
});

ipcMain.handle("resetPassword", async (event, email, newPassword) => {
  try {
    return await api.post("/auth/reset-password", { email, newPassword });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to reset password.",
    };
  }
});

// ── OJT Coordinator IPC handlers ──────────────────────────────────────────────

ipcMain.handle("getCoordinatorSections", async () => {
  try {
    return await api.get("/ojt-coordinator/my-sections");
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch coordinator sections.",
    };
  }
});

ipcMain.handle("getCoordinatorSectionStudents", async (event, section) => {
  try {
    return await api.get(
      `/ojt-coordinator/students/${encodeURIComponent(section)}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch section students.",
    };
  }
});

ipcMain.handle("getCoordinatorStudentProfile", async (event, studentId) => {
  try {
    return await api.get(
      `/ojt-coordinator/student/${encodeURIComponent(studentId)}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch student profile.",
    };
  }
});

ipcMain.handle("getCoordinatorNotifications", async (event, params = {}) => {
  try {
    const minutesBack = Math.max(
      1,
      parseInt(params?.minutesBack || params?.minutes_back || "30", 10),
    );
    const limit = Math.max(
      5,
      Math.min(100, parseInt(params?.limit || "20", 10)),
    );
    const qs = `?minutes_back=${encodeURIComponent(minutesBack)}&limit=${encodeURIComponent(limit)}`;
    return await api.get(`/ojt-coordinator/notifications${qs}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch coordinator notifications.",
    };
  }
});

ipcMain.handle("updateStudentPartner", async (event, payload) => {
  try {
    const studentId = payload?.student_id || payload?.studentId || "";
    return await api.patch(
      `/ojt-coordinator/student/${encodeURIComponent(studentId)}/partner`,
      payload,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update partner assignment.",
    };
  }
});

ipcMain.handle("updateStudentOjtStatus", async (event, payload) => {
  try {
    const studentId = payload?.student_id || payload?.studentId || "";
    return await api.patch(
      `/ojt-coordinator/student/${encodeURIComponent(studentId)}/status`,
      payload,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update student status.",
    };
  }
});

ipcMain.handle("getStudentStatusHistory", async (event, studentId) => {
  try {
    return await api.get(
      `/ojt-coordinator/student/${encodeURIComponent(studentId)}/status-history`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch status history.",
    };
  }
});

ipcMain.handle("getCoordinatorCapstoneApproval", async (event, studentId) => {
  try {
    return await api.get(
      `/ojt-coordinator/capstone-approval/${encodeURIComponent(studentId)}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to check capstone approval.",
    };
  }
});

// ── OJT Requirements IPC handlers ─────────────────────────────────────────────

ipcMain.handle("getOjtRequirementTemplates", async (event, params) => {
  try {
    const qs = new URLSearchParams(params || {}).toString();
    return await api.get(`/ojt-requirements/templates${qs ? `?${qs}` : ""}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch requirement templates.",
    };
  }
});

ipcMain.handle("createOjtRequirementTemplate", async (event, payload) => {
  try {
    return await api.post("/ojt-requirements/templates", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to create requirement template.",
    };
  }
});

ipcMain.handle("updateOjtRequirementTemplate", async (event, payload) => {
  try {
    const id = payload?.id;
    return await api.patch(`/ojt-requirements/templates/${id}`, payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update requirement template.",
    };
  }
});

ipcMain.handle("deleteOjtRequirementSubmission", async (event, id) => {
  try {
    return await api.del(`/ojt-requirements/submissions/${id}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete requirement submission.",
    };
  }
});

ipcMain.handle("deleteOjtRequirementTemplate", async (event, id) => {
  try {
    return await api.del(`/ojt-requirements/templates/${id}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete requirement template.",
    };
  }
});

ipcMain.handle("getStudentRequirements", async (event, params) => {
  try {
    const { studentId, type } = params || {};
    const qs = new URLSearchParams({ type: type || "pre" }).toString();
    return await api.get(
      `/ojt-requirements/submissions/${encodeURIComponent(studentId)}?${qs}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch student requirements.",
    };
  }
});

ipcMain.handle("createOjtRequirementSubmission", async (event, payload) => {
  try {
    return await api.post("/ojt-requirements/submissions", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to create requirement submission.",
    };
  }
});

ipcMain.handle("updateOjtRequirementSubmission", async (event, payload) => {
  try {
    const id = payload?.id;
    return await api.patch(`/ojt-requirements/submissions/${id}`, payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update requirement submission.",
    };
  }
});

ipcMain.handle("deleteCloudinaryFile", async (event, publicId) => {
  try {
    return await api.del("/upload/file", { publicId });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete file.",
    };
  }
});

ipcMain.handle("uploadOjtFile", async (event, payload) => {
  try {
    const { filePath, studentId, folderType } = payload || {};
    if (!filePath || !studentId || !folderType) {
      return {
        success: false,
        message: "filePath, studentId, and folderType are required.",
      };
    }
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg";
    return await api.postFile(
      "/upload/ojt-file",
      fileBuffer,
      fileName,
      mimeType,
      {
        studentId,
        folderType,
        fileName,
      },
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to upload OJT file.",
    };
  }
});

ipcMain.handle("uploadOjtFileFromUrl", async (event, payload) => {
  try {
    return await api.post("/upload/ojt-file-url", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch and upload OJT file.",
    };
  }
});

ipcMain.handle("selectOjtFile", async () => {
  try {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Documents & Images",
          extensions: ["pdf", "jpg", "jpeg", "png", "gif", "webp"],
        },
      ],
    });
    if (result.canceled || !result.filePaths.length)
      return { success: false, canceled: true };
    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to open file dialog.",
    };
  }
});

ipcMain.handle("selectCertificateFile", async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePaths.length)
      return { success: false, canceled: true };
    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to open certificate file dialog.",
    };
  }
});

ipcMain.handle("uploadOjtCertificateFile", async (event, payload) => {
  try {
    const { filePath, studentId } = payload || {};
    if (!filePath || !studentId) {
      return {
        success: false,
        message: "filePath and studentId are required.",
      };
    }

    if (path.extname(filePath).toLowerCase() !== ".pdf") {
      return {
        success: false,
        message: "Only PDF files are allowed for OJT certificates.",
      };
    }

    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    return await api.postFile(
      "/upload/ojt-certificate",
      fileBuffer,
      fileName,
      "application/pdf",
      {
        studentId,
        fileName,
      },
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to upload OJT certificate file.",
    };
  }
});

ipcMain.handle("getOjtCertificates", async (event, studentId) => {
  try {
    return await api.get(`/ojt-certificates/${encodeURIComponent(studentId)}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch OJT certificates.",
    };
  }
});

ipcMain.handle("createOjtCertificate", async (event, payload) => {
  try {
    return await api.post("/ojt-certificates", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to create OJT certificate.",
    };
  }
});

ipcMain.handle("deleteOjtCertificate", async (event, id) => {
  try {
    return await api.del(`/ojt-certificates/${id}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete OJT certificate.",
    };
  }
});

// ── OJT Attendance IPC handlers ───────────────────────────────────────────────

ipcMain.handle("getOjtAttendance", async (event, params) => {
  try {
    const { studentId, month } = params || {};
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    return await api.get(
      `/ojt-attendance/${encodeURIComponent(studentId)}${qs}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch attendance.",
    };
  }
});

ipcMain.handle("createOjtAttendance", async (event, payload) => {
  try {
    return await api.post("/ojt-attendance", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to create attendance record.",
    };
  }
});

ipcMain.handle("updateOjtAttendance", async (event, payload) => {
  try {
    const id = payload?.id;
    return await api.patch(`/ojt-attendance/${id}`, payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update attendance record.",
    };
  }
});

ipcMain.handle("deleteOjtAttendance", async (event, id) => {
  try {
    return await api.del(`/ojt-attendance/${id}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete attendance record.",
    };
  }
});

// ── OJT Weekly Reports IPC handlers ──────────────────────────────────────────

ipcMain.handle("getOjtWeeklyReports", async (event, studentId) => {
  try {
    return await api.get(
      `/ojt-weekly-reports/${encodeURIComponent(studentId)}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch weekly reports.",
    };
  }
});

ipcMain.handle("createOjtWeeklyReport", async (event, payload) => {
  try {
    return await api.post("/ojt-weekly-reports", payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to save weekly report.",
    };
  }
});

ipcMain.handle("updateOjtWeeklyReport", async (event, payload) => {
  try {
    const id = payload?.id;
    return await api.patch(`/ojt-weekly-reports/${id}`, payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update weekly report.",
    };
  }
});

ipcMain.handle("deleteOjtWeeklyReport", async (event, id) => {
  try {
    return await api.del(`/ojt-weekly-reports/${id}`);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to delete weekly report.",
    };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
