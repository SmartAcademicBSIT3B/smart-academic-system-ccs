const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const SUPER_ADMIN_EMAIL = "smartacademicbsit3b@gmail.com";
const SUPER_ADMIN_PASSWORD = "BSIT3B2026";
const SUPER_ADMIN_NAME = "Smart Academic Super Admin";
let superAdminPrepared = false;
let superAdminPreparationPromise = null;

// ── Mail transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ── In-memory OTP store ───────────────────────────────────────────────────────
const otpStore = new Map(); // key: email|purpose  value: { otp, expiresAt, used }
const loginFailures = new Map(); // key: normalized email value: { count, firstFailedAt, lockedUntil }
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function otpKey(email, purpose) {
  return `${String(email).toLowerCase()}|${purpose}`;
}

function loginKey(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function clearLoginFailures(email) {
  loginFailures.delete(loginKey(email));
}

function isLoginBlocked(email) {
  const key = loginKey(email);
  const entry = loginFailures.get(key);
  if (!entry) return false;

  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return true;
  }

  if (entry.lockedUntil && entry.lockedUntil <= now) {
    loginFailures.delete(key);
    return false;
  }

  if (entry.firstFailedAt && now - entry.firstFailedAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
  }

  return false;
}

function getRetryAfterSeconds(email) {
  const entry = loginFailures.get(loginKey(email));
  if (!entry || !entry.lockedUntil) return 0;

  const remainingMs = entry.lockedUntil - Date.now();
  if (remainingMs <= 0) return 0;

  return Math.ceil(remainingMs / 1000);
}

function recordFailedLogin(email) {
  const key = loginKey(email);
  const now = Date.now();
  const existing = loginFailures.get(key);

  if (!existing || now - existing.firstFailedAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, {
      count: 1,
      firstFailedAt: now,
      lockedUntil: null,
    });
    return;
  }

  const nextCount = existing.count + 1;
  const nextEntry = {
    count: nextCount,
    firstFailedAt: existing.firstFailedAt,
    lockedUntil:
      nextCount >= LOGIN_MAX_FAILURES
        ? now + LOGIN_LOCK_MS
        : existing.lockedUntil,
  };
  loginFailures.set(key, nextEntry);
}

function getJwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function normalizeDepartmentCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return code || "CCS";
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function hashPassword(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function currentYearTwoDigits() {
  return String(new Date().getFullYear()).slice(-2);
}

async function ensureSuperAdminUser() {
  if (superAdminPrepared) return;
  if (superAdminPreparationPromise) {
    await superAdminPreparationPromise;
    return;
  }

  superAdminPreparationPromise = (async () => {
    const existing = await query(
      `SELECT id
         FROM users
        WHERE LOWER(email) = LOWER(?)
        ORDER BY id ASC
        LIMIT 1`,
      [SUPER_ADMIN_EMAIL],
    );

    const hashed = hashPassword(SUPER_ADMIN_PASSWORD);

    if (Array.isArray(existing) && existing.length > 0) {
      await query(
        `UPDATE users
            SET name = ?,
                role = 'admin',
                status = 'active',
                password = ?
          WHERE id = ?`,
        [SUPER_ADMIN_NAME, hashed, existing[0].id],
      );
    } else {
      await query(
        `INSERT INTO users (user_id, name, email, role, status, department, password, profile_image)
         VALUES (?, ?, ?, 'admin', 'active', 'GLOBAL', ?, NULL)`,
        [
          `A${currentYearTwoDigits()}-99999`,
          SUPER_ADMIN_NAME,
          SUPER_ADMIN_EMAIL,
          hashed,
        ],
      );
    }

    superAdminPrepared = true;
  })();

  try {
    await superAdminPreparationPromise;
  } finally {
    superAdminPreparationPromise = null;
  }
}

function buildLoginPayload(
  user,
  selectedDepartmentCode,
  isSuperAdmin,
  roleOverride = "",
) {
  const normalizedOverride = String(roleOverride || "")
    .trim()
    .toLowerCase();
  const resolvedRole = normalizedOverride || user.role;

  return {
    id: user.id,
    user_id: user.user_id,
    email: user.email,
    role: resolvedRole,
    department_code: isSuperAdmin
      ? normalizeDepartmentCode(selectedDepartmentCode)
      : normalizeDepartmentCode(user.department),
    is_super_admin: Boolean(isSuperAdmin),
  };
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    await ensureSuperAdminUser();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const rawDepartmentCode = String(
      req.body.departmentCode || req.headers["x-department"] || "",
    )
      .trim()
      .toUpperCase();
    const hasSecretDepartmentPrefix = rawDepartmentCode.startsWith("SECRET:");
    const selectedDepartmentCode = normalizeDepartmentCode(
      hasSecretDepartmentPrefix
        ? rawDepartmentCode.slice("SECRET:".length)
        : rawDepartmentCode,
    );
    const isSecretLogin =
      req.body.secretLogin === true ||
      req.body.secretLogin === "true" ||
      hasSecretDepartmentPrefix;
    const preferredRole = String(req.body.preferredRole || "")
      .trim()
      .toLowerCase();

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    if (isLoginBlocked(email)) {
      const retryAfter = getRetryAfterSeconds(email);
      return res.status(429).json({
        success: false,
        message: `Too many login attempts. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    const hashedPassword = hashPassword(password);

    if (email === SUPER_ADMIN_EMAIL) {
      if (!isSecretLogin) {
        recordFailedLogin(email);
        return res.status(403).json({
          success: false,
          message: "to use this account, please contact the developers",
        });
      }

      const superAdminUsers = await query(
        `SELECT *
           FROM users
          WHERE LOWER(email) = LOWER(?)
            AND status = 'active'
          ORDER BY id ASC
          LIMIT 10`,
        [SUPER_ADMIN_EMAIL],
      );

      const superAdminUser = (
        Array.isArray(superAdminUsers) ? superAdminUsers : []
      ).find((row) => String(row.password || "") === hashedPassword);

      if (superAdminUser) {
        clearLoginFailures(email);
        const payload = buildLoginPayload(
          superAdminUser,
          selectedDepartmentCode,
          true,
        );

        const jwtSecret = getJwtSecret();
        if (!jwtSecret) {
          console.error("Login error: JWT_SECRET is not configured.");
          return res.status(500).json({
            success: false,
            message:
              "Server authentication is not configured (JWT_SECRET missing).",
          });
        }

        const token = jwt.sign(payload, jwtSecret, {
          expiresIn: process.env.JWT_EXPIRES_IN || "8h",
        });

        return res.json({
          success: true,
          token,
          user: {
            id: superAdminUser.id,
            user_id: superAdminUser.user_id,
            name: superAdminUser.name,
            email: superAdminUser.email,
            role: superAdminUser.role,
            department_code: normalizeDepartmentCode(selectedDepartmentCode),
            is_super_admin: true,
          },
        });
      }

      recordFailedLogin(email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const users = await query(
      "SELECT * FROM users WHERE email = ? AND status = ? AND UPPER(COALESCE(department, 'CCS')) = ?",
      [email, "active", selectedDepartmentCode],
    );

    if (users.length === 0) {
      const usersInOtherDept = await query(
        "SELECT id FROM users WHERE email = ? AND status = ? LIMIT 1",
        [email, "active"],
      );

      if (usersInOtherDept.length > 0) {
        recordFailedLogin(email);
        return res.status(403).json({
          success: false,
          message:
            "This account is not registered under the selected department.",
        });
      }
    }

    if (users.length === 0) {
      recordFailedLogin(email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const matchedUsers = users.filter(
      (user) => String(user.password || "") === hashedPassword,
    );

    if (matchedUsers.length === 0) {
      recordFailedLogin(email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const matchedAdminUser = matchedUsers.find(
      (item) =>
        String(item.role || "")
          .trim()
          .toLowerCase() === "admin",
    );

    if (matchedAdminUser && !preferredRole) {
      return res.json({
        success: false,
        requiresRoleSelection: true,
        availableRoles: ["admin", "coordinator"],
        message: "Select a role to continue.",
      });
    }

    if (
      preferredRole &&
      preferredRole !== "admin" &&
      preferredRole !== "coordinator"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid role selection.",
      });
    }

    let user = matchedUsers[0];
    let effectiveRole = String(user.role || "")
      .trim()
      .toLowerCase();

    if (matchedAdminUser && preferredRole) {
      user = matchedAdminUser;
      effectiveRole = preferredRole;
    } else if (preferredRole) {
      const roleMatchedUser = matchedUsers.find(
        (item) =>
          String(item.role || "")
            .trim()
            .toLowerCase() === preferredRole,
      );
      if (!roleMatchedUser) {
        recordFailedLogin(email);
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password." });
      }
      user = roleMatchedUser;
      effectiveRole = String(user.role || "")
        .trim()
        .toLowerCase();
    }

    clearLoginFailures(email);

    const payload = buildLoginPayload(
      user,
      selectedDepartmentCode,
      false,
      effectiveRole,
    );

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      console.error("Login error: JWT_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message:
          "Server authentication is not configured (JWT_SECRET missing).",
      });
    }

    const token = jwt.sign(payload, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: effectiveRole,
        department_code: normalizeDepartmentCode(user.department),
        is_super_admin: false,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred during login." });
  }
});

// ── GET /api/auth/profile/:userId ─────────────────────────────────────────────
router.get("/profile/:userId", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID." });
    }

    const users = await query(
      "SELECT id, user_id, name, email, role, profile_image FROM users WHERE id = ?",
      [userId],
    );

    if (users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    return res.json({ success: true, user: users[0] });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching profile.",
    });
  }
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.body.userId, 10);
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const profileImagePath = String(req.body.profileImagePath || "").trim();
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const actorId = Number.parseInt(req.user?.id, 10);

    if (!Number.isInteger(actorId) || actorId <= 0 || actorId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own profile.",
      });
    }

    if (!userId || !name || !email) {
      return res
        .status(400)
        .json({ success: false, message: "Missing user ID, name, or email." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (newPassword && newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long.",
      });
    }

    if (newPassword && !currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required to set a new password.",
      });
    }

    const rows = await query(
      `SELECT id, user_id, name, email, password, role, profile_image,
              UPPER(COALESCE(department, 'CCS')) AS department
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const existingUser = rows[0];
    const currentDepartment = normalizeDepartmentCode(
      existingUser.department || req.user?.department_code,
    );

    const duplicateEmailRows = await query(
      `SELECT id
         FROM users
        WHERE id <> ?
          AND LOWER(email) = LOWER(?)
          AND UPPER(COALESCE(department, 'CCS')) = ?
        LIMIT 1`,
      [userId, email, currentDepartment],
    );

    if (Array.isArray(duplicateEmailRows) && duplicateEmailRows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This email is already used by another account in your department.",
      });
    }

    let hashedNewPassword = "";
    if (newPassword) {
      const hashedCurrentPassword = hashPassword(currentPassword);
      if (hashedCurrentPassword !== String(existingUser.password || "")) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }
      hashedNewPassword = hashPassword(newPassword);
    }

    const nextProfileImagePath =
      profileImagePath || String(existingUser.profile_image || "");

    if (hashedNewPassword) {
      await query(
        "UPDATE users SET name = ?, email = ?, profile_image = ?, password = ? WHERE id = ?",
        [name, email, nextProfileImagePath, hashedNewPassword, userId],
      );
    } else {
      await query(
        "UPDATE users SET name = ?, email = ?, profile_image = ? WHERE id = ?",
        [name, email, nextProfileImagePath, userId],
      );
    }

    if (String(existingUser.name || "") !== name) {
      try {
        await query(
          `UPDATE section_assignments
              SET professor_name = ?
            WHERE professor_email = ?
              AND department = ?`,
          [name, String(existingUser.email || ""), currentDepartment],
        );
      } catch (sectionSyncError) {
        const errorCode = String(sectionSyncError?.code || "");
        if (
          errorCode !== "ER_NO_SUCH_TABLE" &&
          errorCode !== "ER_BAD_TABLE_ERROR"
        ) {
          throw sectionSyncError;
        }
      }
    }

    const updatedRows = await query(
      "SELECT id, user_id, name, email, role, profile_image FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    return res.json({ success: true, user: updatedRows[0] || null });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while saving profile.",
    });
  }
});

// ── DELETE /api/auth/profile/:userId ────────────────────────────────────────
router.delete("/profile/:userId", requireAuth, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    const currentPassword = String(req.body?.currentPassword || "");
    const actorId = Number.parseInt(req.user?.id, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID." });
    }

    if (!Number.isInteger(actorId) || actorId <= 0 || actorId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own profile.",
      });
    }

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required to delete your profile.",
      });
    }

    const users = await query(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    if (!Array.isArray(users) || users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const hashedCurrentPassword = hashPassword(currentPassword);
    if (hashedCurrentPassword !== String(users[0].password || "")) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    await query("DELETE FROM users WHERE id = ?", [userId]);

    return res.json({
      success: true,
      message: "Profile deleted successfully.",
    });
  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete profile.",
    });
  }
});

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const purpose = String(req.body.purpose || "reset_password");

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });
    }

    const users = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [
      email,
    ]);
    if (users.length === 0) {
      // Don't reveal existence; still return success to avoid enumeration.
      return res.json({
        success: true,
        message: "If that email exists, an OTP was sent.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(otpKey(email, purpose), { otp, expiresAt, used: false });

    const expiryMinutes = 10;
    const safeOtp = otp.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "Your OTP Code - Smart Academic System",
      text: `Your Smart Academic System OTP is ${otp}. This code expires in ${expiryMinutes} minutes. If you did not request this code, you can ignore this email.`,
      html: `
        <div style="margin:0;padding:24px;background:#f3f5f9;font-family:Arial,sans-serif;color:#1f2937;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #dbe2ea;overflow:hidden;">
            <div style="padding:18px 24px;background:#111827;color:#f9fafb;">
              <h2 style="margin:0;font-size:18px;letter-spacing:0.4px;">Smart Academic System</h2>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Use the one-time password below to continue your account recovery request.</p>
              <div style="margin:16px 0 18px;padding:14px 16px;border-radius:12px;background:#eef4ff;border:1px solid #bfd5ff;text-align:center;">
                <span style="display:block;font-size:12px;letter-spacing:1px;color:#4b5563;margin-bottom:6px;text-transform:uppercase;">Your OTP Code</span>
                <span style="font-size:32px;letter-spacing:6px;font-weight:700;color:#111827;">${safeOtp}</span>
              </div>
              <p style="margin:0 0 10px;font-size:14px;color:#4b5563;">This code expires in <strong>${expiryMinutes} minutes</strong> and can be used only once.</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">If you did not request this code, you can safely ignore this email.</p>
            </div>
          </div>
        </div>`,
    });

    return res.json({
      success: true,
      message: "If that email exists, an OTP was sent.",
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to send OTP." });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const purpose = String(req.body.purpose || "reset_password");

    const entry = otpStore.get(otpKey(email, purpose));

    if (!entry || entry.used || Date.now() > entry.expiresAt) {
      return res.json({ success: false, message: "Invalid or expired OTP." });
    }

    if (entry.otp !== otp) {
      return res.json({ success: false, message: "Invalid OTP." });
    }

    entry.used = true;
    return res.json({ success: true, message: "OTP verified." });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to verify OTP." });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required.",
      });
    }

    // Require the OTP to have been verified first.
    const entry = otpStore.get(otpKey(email, "reset_password"));
    if (!entry || !entry.used) {
      return res.status(403).json({
        success: false,
        message: "OTP verification required before resetting password.",
      });
    }

    const hashed = crypto
      .createHash("sha256")
      .update(newPassword)
      .digest("hex");

    await query("UPDATE users SET password = ? WHERE email = ?", [
      hashed,
      email,
    ]);

    otpStore.delete(otpKey(email, "reset_password"));

    return res.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reset password." });
  }
});

module.exports = router;
