const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const { pipeline } = require("node:stream/promises");
const { fileURLToPath } = require("node:url");
const { query } = require("../database/dbconnect");
const {
  uploadProfileImageToCloudinary,
  uploadExternalPartnerLogoToCloudinary,
  deleteCloudinaryAssetByUrl,
} = require("../services/cloudinary_config");
const {
  uploadProfileImage: uploadFileToGoogleDrive,
  deleteDriveFileByUrl,
  extractGoogleDriveFileId,
  getDriveClient,
} = require("../services/gdrive_service");
const {
  getAuthUrl,
  saveTokenFromCode,
  hasValidToken,
} = require("../services/gdrive_oauth");
const crypto = require("crypto");
const {
  sendOTP,
  verifyOTP,
  resetPassword,
  cleanupExpiredOTPs,
} = require("../services/otp_service");

const OTP_CLEANUP_INTERVAL_MS = parseInt(
  process.env.OTP_CLEANUP_INTERVAL_MS || "900000",
  10,
);

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

function getDownloadsDirectory() {
  return app.getPath("downloads");
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

  const downloadsDir = getDownloadsDirectory();
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

  const downloadsDir = getDownloadsDirectory();
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
  const raw = String(storedPath || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/\\/g, "/");
  const fileName = path.basename(normalized);
  if (!fileName) return "";

  return path.join(ARCHIVE_UPLOAD_DIR, fileName);
}

function cleanExternalPartnerField(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeExternalPartnerPayload(payload = {}) {
  const department = String(payload.department || "").trim() || "CCS";

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
    await ensureExternalPartnersTable();
  } catch (error) {
    console.error("Failed to ensure external_partners table exists:", error);
  }

  createMainWindow();

  // Periodically remove expired and old used OTP rows.
  setInterval(async () => {
    try {
      await cleanupExpiredOTPs();
    } catch (error) {
      console.error("OTP cleanup error:", error);
    }
  }, OTP_CLEANUP_INTERVAL_MS);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
ipcMain.handle("login", async (event, email, password) => {
  try {
    const users = await query(
      "SELECT * FROM users WHERE email = ? AND status = ?",
      [email, "active"],
    );
    if (users.length === 0) {
      return { success: false, message: "Invalid email or password." };
    }
    const user = users[0];
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");
    if (hashedPassword !== user.password) {
      return { success: false, message: "Invalid email or password." };
    }
    return {
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: "An error occurred during login." };
  }
});

ipcMain.handle("getProfile", async (event, userId) => {
  try {
    const users = await query(
      "SELECT id, user_id, name, email, role, profile_image FROM users WHERE id = ?",
      [userId],
    );
    if (users.length === 0) {
      return { success: false, message: "User not found." };
    }
    return { success: true, user: users[0] };
  } catch (error) {
    console.error("Get profile error:", error);
    return {
      success: false,
      message: "An error occurred while fetching profile.",
    };
  }
});

ipcMain.handle("getSections", async () => {
  try {
    const sections = await query(
      "SELECT id, section_name FROM sections ORDER BY section_name ASC",
    );
    return { success: true, sections: sections || [] };
  } catch (error) {
    console.error("Get sections error:", error);
    return { success: false, message: "Failed to fetch sections." };
  }
});

ipcMain.handle("getProfessors", async () => {
  try {
    const professors = await query(
      "SELECT id, name FROM professors ORDER BY name ASC",
    );
    return { success: true, professors: professors || [] };
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

      const uploadedUrl = await uploadProfileImageToCloudinary(
        fileBuffer,
        fileName,
        mimeType,
        userId,
      );

      return { success: true, path: uploadedUrl };
    } catch (error) {
      console.error("Cloudinary profile upload error:", error);
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

      const uploadedUrl = await uploadExternalPartnerLogoToCloudinary(
        fileBuffer,
        fileName,
        mimeType,
        partnerId,
      );

      return { success: true, path: uploadedUrl };
    } catch (error) {
      console.error("Cloudinary external partner logo upload error:", error);
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
      const rawUrl = String(url || "").trim();
      if (
        !rawUrl ||
        (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))
      ) {
        return {
          success: false,
          message: "A valid http/https URL is required.",
        };
      }

      // Fetch the image from the external URL
      const response = await fetch(rawUrl);
      if (!response.ok) {
        return {
          success: false,
          message: `Failed to fetch image: HTTP ${response.status}`,
        };
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        return { success: false, message: "URL does not point to an image." };
      }

      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
      const fileName = `fetched_logo.${ext}`;

      const uploadedUrl = await uploadExternalPartnerLogoToCloudinary(
        fileBuffer,
        fileName,
        contentType,
        partnerId,
      );

      return { success: true, path: uploadedUrl };
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
      if (!userId || !name) {
        return { success: false, message: "Missing user ID or name." };
      }

      if (profileImagePath) {
        await query(
          "UPDATE users SET name = ?, profile_image = ? WHERE id = ?",
          [name, profileImagePath, userId],
        );
      } else {
        await query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
      }

      return { success: true };
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
    const title = String(payload.title || "").trim();
    const authors = String(payload.authors || "").trim();
    const section = String(payload.section || "").trim();
    const advisor = String(payload.advisor || "").trim();
    const datePublished = String(payload.date_published || "").trim();
    const keywords = String(payload.keywords || "").trim();
    const type = normalizeArchiveType(payload.type);
    const status = normalizeArchiveStatus(payload.status || "Pending");

    if (!title || !authors || !keywords) {
      return {
        success: false,
        message: "Title, Authors, and Keywords are required.",
      };
    }

    if (!type) {
      return {
        success: false,
        message: "Type must be either thesis or capstone.",
      };
    }

    if (!status) {
      return {
        success: false,
        message: "Status must be pending, approved, or rejected.",
      };
    }

    const localSourcePath = String(payload.localSourcePath || "").trim();
    const uploadedFileName = String(payload.fileName || "").trim();
    const fileContentBase64 = String(payload.fileContentBase64 || "").trim();
    const mimeType = String(payload.mimeType || "").trim() || "application/pdf";

    let localFilePath = "";
    let filePath = "";
    let usedFallback = false;

    if (!uploadedFileName) {
      return {
        success: false,
        message: "Please upload a PDF file before saving.",
      };
    }

    if (localSourcePath) {
      await fs.mkdir(ARCHIVE_UPLOAD_DIR, { recursive: true });

      const safeName = path.basename(
        uploadedFileName || path.basename(localSourcePath),
      );
      const storedFileName = `archive_${Date.now()}_${safeName}`;
      const destinationPath = path.join(ARCHIVE_UPLOAD_DIR, storedFileName);

      await fs.copyFile(localSourcePath, destinationPath);
      localFilePath = `uploads/documents/${storedFileName}`;

      try {
        const fileBuffer = await fs.readFile(localSourcePath);
        filePath = await uploadFileToGoogleDrive(
          fileBuffer,
          storedFileName,
          mimeType,
        );
      } catch (driveError) {
        if (driveError && driveError.code === "AUTH_REQUIRED") {
          try {
            await fs.unlink(destinationPath);
          } catch (_ignore) {}

          return {
            success: false,
            requiresAuth: true,
            message:
              "Google Drive authorization is required. Please authorize to upload to My Drive/CTA Files/Documents.",
          };
        }

        usedFallback = true;
        console.error("Archive Google Drive upload failed:", driveError);
      }
    } else if (fileContentBase64) {
      await fs.mkdir(ARCHIVE_UPLOAD_DIR, { recursive: true });

      const safeName = path.basename(uploadedFileName);
      const storedFileName = `archive_${Date.now()}_${safeName}`;
      const destinationPath = path.join(ARCHIVE_UPLOAD_DIR, storedFileName);
      const fileBuffer = Buffer.from(fileContentBase64, "base64");

      await fs.writeFile(destinationPath, fileBuffer);
      localFilePath = `uploads/documents/${storedFileName}`;

      try {
        filePath = await uploadFileToGoogleDrive(
          fileBuffer,
          storedFileName,
          mimeType,
        );
      } catch (driveError) {
        if (driveError && driveError.code === "AUTH_REQUIRED") {
          try {
            await fs.unlink(destinationPath);
          } catch (_ignore) {}

          return {
            success: false,
            requiresAuth: true,
            message:
              "Google Drive authorization is required. Please authorize to upload to My Drive/CTA Files/Documents.",
          };
        }

        usedFallback = true;
        console.error("Archive Google Drive upload failed:", driveError);
      }
    } else {
      return {
        success: false,
        message:
          "Failed to read the uploaded file. Please select the PDF again.",
      };
    }

    if (!filePath && localFilePath) {
      filePath = localFilePath;
      usedFallback = true;
    }

    const createdAt = toSqlDateTime();

    const result = await query(
      `INSERT INTO archives
      (title, authors, section, advisor, date_published, keywords, type, department, file_path, local_file_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        authors,
        section,
        advisor,
        datePublished || null,
        keywords,
        type,
        "CCS",
        filePath || null,
        localFilePath || null,
        status,
        createdAt,
      ],
    );

    const insertedId = result.insertId;
    const rows = await query(
      `SELECT id, title, authors, section, advisor, date_published, keywords, type, department,
              file_path, local_file_path, status, created_at
       FROM archives
       WHERE id = ?`,
      [insertedId],
    );

    return {
      success: true,
      archive: rows[0],
      usedFallback,
      message: usedFallback
        ? "Archive saved. Google Drive unavailable; local fallback was used."
        : "Archive saved successfully.",
    };
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
    const rows = await query(
      `SELECT id, title, authors, section, advisor, date_published, keywords, type, department,
              file_path, local_file_path, status, created_at
       FROM archives
       ORDER BY created_at DESC`,
    );
    return { success: true, archives: rows };
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
    const id = Number.parseInt(payload.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, message: "A valid archive ID is required." };
    }

    const title = String(payload.title || "").trim();
    const authors = String(payload.authors || "").trim();
    const section = String(payload.section || "").trim();
    const advisor = String(payload.advisor || "").trim();
    const datePublished = String(payload.date_published || "").trim();
    const keywords = String(payload.keywords || "").trim();
    const type = normalizeArchiveType(payload.type);
    const status = normalizeArchiveStatus(payload.status || "Pending");

    if (!title || !authors || !keywords) {
      return {
        success: false,
        message: "Title, Authors, and Keywords are required.",
      };
    }

    if (!type) {
      return {
        success: false,
        message: "Type must be either thesis or capstone.",
      };
    }

    if (!status) {
      return {
        success: false,
        message: "Status must be pending, approved, or rejected.",
      };
    }

    const existing = await query(
      `SELECT id FROM archives WHERE id = ? LIMIT 1`,
      [id],
    );

    if (!existing || existing.length === 0) {
      return { success: false, message: "Archive not found." };
    }

    await query(
      `UPDATE archives
       SET title = ?,
           authors = ?,
           section = ?,
           advisor = ?,
           date_published = ?,
           keywords = ?,
           type = ?,
           status = ?
       WHERE id = ?`,
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
      `SELECT id, title, authors, section, advisor, date_published, keywords, type, department,
              file_path, local_file_path, status, created_at
       FROM archives
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    return {
      success: true,
      archive: rows[0],
      message: "Archive updated successfully.",
    };
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
    const id = Number.parseInt(archiveId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, message: "A valid archive ID is required." };
    }

    const rows = await query(
      `SELECT id, file_path, local_file_path
       FROM archives
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    if (!rows || rows.length === 0) {
      return {
        success: false,
        message: "Archive not found or already deleted.",
      };
    }

    const archive = rows[0];
    const driveFileId = extractGoogleDriveFileId(archive.file_path);

    // Delete Drive file first (if present), so DB only deletes when remote cleanup succeeds.
    if (driveFileId) {
      try {
        await deleteDriveFileByUrl(archive.file_path);
      } catch (driveError) {
        if (driveError && driveError.code === "AUTH_REQUIRED") {
          return {
            success: false,
            requiresAuth: true,
            message:
              "Google Drive authorization is required before deleting this archive.",
          };
        }

        console.error("Google Drive delete failed:", driveError);
        return {
          success: false,
          message:
            driveError?.message ||
            "Failed to delete file from Google Drive. Archive was not removed.",
        };
      }
    }

    // Delete local file copy if present.
    const localAbsolutePath = resolveArchiveLocalFileAbsolutePath(
      archive.local_file_path || archive.file_path,
    );
    if (localAbsolutePath) {
      try {
        await fs.unlink(localAbsolutePath);
      } catch (fileError) {
        if (fileError?.code !== "ENOENT") {
          console.error("Local archive file delete failed:", fileError);
          return {
            success: false,
            message:
              fileError?.message ||
              "Failed to delete local archive file. Archive was not removed.",
          };
        }
      }
    }

    await query("DELETE FROM archives WHERE id = ?", [id]);

    return {
      success: true,
      message: "Archive deleted successfully.",
    };
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
    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email, company_contact,
              representative, job_description, representative_email,
              representative_contact, created_at, updated_at
       FROM external_partners
       ORDER BY id DESC`,
    );
    return { success: true, partners: rows };
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
    const data = normalizeExternalPartnerPayload(payload);

    if (!data.company_name || !data.address) {
      return {
        success: false,
        message: "Company Name and Address are required.",
      };
    }

    const result = await query(
      `INSERT INTO external_partners
      (logo, company_name, address, department, company_email, company_contact,
       representative, job_description, representative_email,
       representative_contact)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.logo,
        data.company_name,
        data.address,
        data.department,
        data.company_email,
        data.company_contact,
        data.representative,
        data.job_description,
        data.representative_email,
        data.representative_contact,
      ],
    );

    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email, company_contact,
              representative, job_description, representative_email,
              representative_contact, created_at, updated_at
       FROM external_partners
       WHERE id = ?
       LIMIT 1`,
      [result.insertId],
    );

    return {
      success: true,
      partner: rows[0],
      message: "External partner added successfully.",
    };
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
    const id = Number.parseInt(payload.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return {
        success: false,
        message: "A valid external partner ID is required.",
      };
    }

    const data = normalizeExternalPartnerPayload(payload);

    if (!data.company_name || !data.address) {
      return {
        success: false,
        message: "Company Name and Address are required.",
      };
    }

    const existing = await query(
      "SELECT id, logo FROM external_partners WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existing || existing.length === 0) {
      return { success: false, message: "External partner not found." };
    }

    const oldLogoUrl = existing[0]?.logo || "";

    await query(
      `UPDATE external_partners
       SET logo = ?,
           company_name = ?,
           address = ?,
           department = ?,
           company_email = ?,
           company_contact = ?,
           representative = ?,
           job_description = ?,
           representative_email = ?,
           representative_contact = ?
       WHERE id = ?`,
      [
        data.logo,
        data.company_name,
        data.address,
        data.department,
        data.company_email,
        data.company_contact,
        data.representative,
        data.job_description,
        data.representative_email,
        data.representative_contact,
        id,
      ],
    );

    // Delete old Cloudinary logo if it was replaced with a different URL
    if (oldLogoUrl && data.logo !== oldLogoUrl) {
      try {
        await deleteCloudinaryAssetByUrl(oldLogoUrl);
      } catch (cloudinaryErr) {
        console.warn(
          "Could not delete old logo from Cloudinary:",
          cloudinaryErr.message,
        );
      }
    }

    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email, company_contact,
              representative, job_description, representative_email,
              representative_contact, created_at, updated_at
       FROM external_partners
       WHERE id = ?
       LIMIT 1`,
      [id],
    );

    return {
      success: true,
      partner: rows[0],
      message: "External partner updated successfully.",
    };
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
    const id = Number.parseInt(partnerId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return {
        success: false,
        message: "A valid external partner ID is required.",
      };
    }

    const existing = await query(
      "SELECT id, logo FROM external_partners WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existing || existing.length === 0) {
      return {
        success: false,
        message: "External partner not found or already deleted.",
      };
    }

    const logoUrl = existing[0]?.logo || "";

    await query("DELETE FROM external_partners WHERE id = ?", [id]);

    // Delete logo from Cloudinary after successful DB delete
    if (logoUrl) {
      try {
        await deleteCloudinaryAssetByUrl(logoUrl);
      } catch (cloudinaryErr) {
        console.warn(
          "Could not delete logo from Cloudinary:",
          cloudinaryErr.message,
        );
      }
    }

    return { success: true, message: "External partner deleted successfully." };
  } catch (error) {
    console.error("deleteExternalPartner error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete external partner.",
    };
  }
});

ipcMain.handle("checkGoogleDriveAuth", async () => {
  try {
    return { success: true, isAuthorized: hasValidToken() };
  } catch (error) {
    return { success: false, message: error.message || "Auth check failed." };
  }
});

ipcMain.handle("getGoogleDriveAuthUrl", async () => {
  try {
    const authUrl = getAuthUrl();
    return { success: true, authUrl };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to generate Google auth URL.",
    };
  }
});

ipcMain.handle("saveGoogleDriveToken", async (event, authCode) => {
  try {
    if (!authCode || !String(authCode).trim()) {
      return { success: false, message: "Authorization code is required." };
    }

    await saveTokenFromCode(String(authCode).trim());
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to save Google Drive token.",
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

ipcMain.handle("downloadArchivesToDownloads", async (event, files = []) => {
  try {
    const requestedFiles = Array.isArray(files) ? files : [];
    if (!requestedFiles.length) {
      return {
        success: false,
        message: "No files were selected for download.",
      };
    }

    const requiresDriveAuth = requestedFiles.some((file) =>
      extractGoogleDriveFileId(file?.sourceUrl),
    );
    if (requiresDriveAuth && !hasValidToken()) {
      return {
        success: false,
        requiresAuth: true,
        message: "Google Drive authorization is required before downloading.",
      };
    }

    const downloaded = [];
    const failed = [];

    for (const file of requestedFiles) {
      try {
        const result = await downloadArchiveToDownloads(file);
        if (result?.requiresAuth) {
          return {
            success: false,
            requiresAuth: true,
            message:
              result.message ||
              "Google Drive authorization is required before downloading.",
          };
        }

        if (result?.success) {
          downloaded.push({
            fileName: result.fileName,
            savedPath: result.savedPath,
          });
        } else {
          failed.push({
            fileName: file?.fileName || "archive.pdf",
            message: result?.message || "Download failed.",
          });
        }
      } catch (error) {
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
      downloadDirectory: getDownloadsDirectory(),
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
    return await authorizeGoogleDriveInteractive();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Google interactive authorization failed.",
    };
  }
});

ipcMain.handle("logout", async (event) => {
  try {
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, message: "An error occurred during logout." };
  }
});

// Send OTP handler
ipcMain.handle("sendOTP", async (event, email) => {
  return await sendOTP(email, "reset_password");
});

// Verify OTP handler
ipcMain.handle("verifyOTP", async (event, email, otp) => {
  return await verifyOTP(email, otp, "reset_password");
});

// Reset password handler
ipcMain.handle("resetPassword", async (event, email, newPassword) => {
  return await resetPassword(email, newPassword);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
