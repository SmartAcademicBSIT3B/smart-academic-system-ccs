const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { query } = require("../database/dbconnect");
const crypto = require("crypto");

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
    const uploadsDir = path.resolve(
      __dirname,
      "..",
      "renderer",
      "modules",
      "m1_archive",
      "adminpage",
      "uploads",
      "profile",
    );
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `profile_${Date.now()}_${path.basename(selectedPath)}`;
    const destinationPath = path.join(uploadsDir, fileName);
    await fs.copyFile(selectedPath, destinationPath);

    const htmlDir = path.resolve(
      __dirname,
      "..",
      "renderer",
      "modules",
      "m1_archive",
      "adminpage",
      "htmls",
    );
    const profileImagePath = path
      .relative(htmlDir, destinationPath)
      .split(path.sep)
      .join("/");

    return { success: true, path: profileImagePath };
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
