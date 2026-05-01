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

function otpKey(email, purpose) {
  return `${String(email).toLowerCase()}|${purpose}`;
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

function buildLoginPayload(user, selectedDepartmentCode, isSuperAdmin) {
  return {
    id: user.id,
    user_id: user.user_id,
    email: user.email,
    role: user.role,
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

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    const hashedPassword = hashPassword(password);

    if (email === SUPER_ADMIN_EMAIL) {
      if (!isSecretLogin) {
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
        return res.status(403).json({
          success: false,
          message:
            "This account is not registered under the selected department.",
        });
      }
    }

    if (users.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const user = users[0];

    if (hashedPassword !== user.password) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const payload = buildLoginPayload(user, selectedDepartmentCode, false);

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
        role: user.role,
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
    const profileImagePath = String(req.body.profileImagePath || "").trim();

    if (!userId || !name) {
      return res
        .status(400)
        .json({ success: false, message: "Missing user ID or name." });
    }

    if (profileImagePath) {
      await query("UPDATE users SET name = ?, profile_image = ? WHERE id = ?", [
        name,
        profileImagePath,
        userId,
      ]);
    } else {
      await query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while saving profile.",
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

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "Your OTP Code - Smart Academic System",
      html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
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
