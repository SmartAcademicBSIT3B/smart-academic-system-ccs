const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { query } = require("../database/dbconnect");
const { supabase } = require("../services/supabase_config");
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

ipcMain.handle("selectProfileImage", async () => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(focusedWindow, {
      title: "Select profile image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false };
    }

    const selectedPath = filePaths[0];
    const fileName = `profile_${Date.now()}_${path.basename(selectedPath)}`;
    const fileBuffer = await fs.readFile(selectedPath);
    const uploadPath = `profiles/${fileName}`;

    const { data, error: uploadError } = await supabase.storage
      .from("cta-files")
      .upload(uploadPath, fileBuffer, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return { success: false, message: "Could not upload profile image." };
    }

    const { data: publicUrlData, error: publicUrlError } = supabase.storage
      .from("cta-files")
      .getPublicUrl(uploadPath);

    if (publicUrlError) {
      console.error("Supabase public URL error:", publicUrlError);
      return { success: false, message: "Could not get public image URL." };
    }

    return { success: true, path: publicUrlData.publicUrl };
  } catch (error) {
    console.error("Select profile image error:", error);
    return { success: false, message: "Could not select profile image." };
  }
});

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
