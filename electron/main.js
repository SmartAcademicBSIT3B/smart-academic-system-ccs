const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs/promises");
const { query } = require("../database/dbconnect");
const { supabase } = require("../services/supabase_config");
const { uploadProfileImage } = require("../services/gdrive_service");
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

app.whenReady().then(() => {
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

ipcMain.handle(
  "uploadProfileImage",
  async (event, { localPath, fileName, mimeType }) => {
    try {
      const fileBuffer = await fs.readFile(localPath);

      const uploadPath = `profiles/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("cta-files")
        .upload(uploadPath, fileBuffer, {
          contentType: mimeType,
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        return { success: false, message: "Could not upload profile image." };
      }

      const { data: publicUrlData } = supabase.storage
        .from("cta-files")
        .getPublicUrl(uploadPath);

      return { success: true, path: publicUrlData.publicUrl };
    } catch (error) {
      console.error("Supabase profile upload error:", error);
      return {
        success: false,
        message: error.message || "Upload failed. Please try again.",
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
        filePath = await uploadProfileImage(
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
        filePath = await uploadProfileImage(
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
      (title, authors, section, advisor, date_published, keywords, type, file_path, local_file_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        authors,
        section,
        advisor,
        datePublished || null,
        keywords,
        type,
        filePath || null,
        localFilePath || null,
        status,
        createdAt,
      ],
    );

    const insertedId = result.insertId;
    const rows = await query(
      `SELECT id, title, authors, section, advisor, date_published, keywords, type,
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
