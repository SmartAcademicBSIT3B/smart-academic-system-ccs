const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const USER_ID_FORMAT = /^[SCA]\d{2}-\d{5}$/;
const ALLOWED_ROLES = new Set(["admin", "coordinator"]);
const ALLOWED_STATUSES = new Set(["active", "inactive"]);
const MAIL_USER = String(process.env.MAIL_USER || "").trim();
const MAIL_PASS = String(process.env.MAIL_PASS || "").trim();
const PORTAL_URL = String(process.env.PORTAL_URL || "").trim();
let usersDepartmentPrepared = false;
let usersDepartmentPreparationPromise = null;
let setupOtpTablePrepared = false;
let setupOtpTablePreparationPromise = null;
const ADMIN_SETUP_OTP_PURPOSE = "setup_admin";
const ADMIN_SETUP_OTP_TTL_MS = 10 * 60 * 1000;
const ADMIN_SETUP_SEND_COOLDOWN_MS = 60 * 1000;
const adminSetupPendingRegistrations = new Map();
const adminSetupSendCooldown = new Map();

const mailTransporter =
  MAIL_USER && MAIL_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: MAIL_USER,
          pass: MAIL_PASS,
        },
      })
    : null;

function asText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  const normalized = asText(value).toLowerCase();
  return ALLOWED_STATUSES.has(normalized) ? normalized : "";
}

function normalizeRole(value) {
  const normalized = asText(value).toLowerCase();
  return ALLOWED_ROLES.has(normalized) ? normalized : "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function hashPassword(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function rolePrefix(role) {
  if (role === "admin") return "A";
  if (role === "coordinator") return "C";
  return "S";
}

function currentYearTwoDigits() {
  return String(new Date().getFullYear()).slice(-2);
}

function normalizeDepartment(value) {
  const raw = asText(value).toUpperCase();
  if (!raw) return "CCS";
  return raw;
}

function setupRegistrationKey(department, email) {
  return `${normalizeDepartment(department)}|${String(email || "")
    .trim()
    .toLowerCase()}`;
}

function buildSetupOtpStorageUserId(department, email) {
  return setupRegistrationKey(department, email);
}

function validateSetupPassword(password) {
  const raw = String(password || "");
  if (raw.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) {
    return "Password must include at least one letter and one number.";
  }
  return "";
}

function normalizeSetupAdminUserId(value) {
  return asText(value).toUpperCase();
}

function validateSetupAdminUserId(value) {
  const candidate = normalizeSetupAdminUserId(value);
  if (!candidate) return "";
  if (!USER_ID_FORMAT.test(candidate)) {
    return "user_id must follow format [S|C|A]YY-NNNNN.";
  }
  if (!candidate.startsWith("A")) {
    return "Admin user_id must start with prefix A.";
  }
  return "";
}

function purgeExpiredSetupData() {
  const now = Date.now();
  for (const [key, value] of adminSetupPendingRegistrations.entries()) {
    if (!value || Number(value.expiresAt) <= now) {
      adminSetupPendingRegistrations.delete(key);
    }
  }

  for (const [key, value] of adminSetupSendCooldown.entries()) {
    if (!value || Number(value) <= now) {
      adminSetupSendCooldown.delete(key);
    }
  }
}

async function ensureAdminSetupOtpTable() {
  if (setupOtpTablePrepared) return;
  if (setupOtpTablePreparationPromise) {
    await setupOtpTablePreparationPromise;
    return;
  }

  setupOtpTablePreparationPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS admin_setup_otps (
        id BIGINT NOT NULL AUTO_INCREMENT,
        setup_key VARCHAR(320) NOT NULL,
        email VARCHAR(255) NOT NULL,
        department VARCHAR(120) NOT NULL,
        otp_code VARCHAR(16) NOT NULL,
        purpose VARCHAR(60) NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY ux_admin_setup_otps_key_purpose (setup_key, purpose),
        KEY idx_admin_setup_otps_lookup (setup_key, otp_code, purpose, is_used, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const setupKeyColumn = await query(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS max_length
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'admin_setup_otps'
          AND COLUMN_NAME = 'setup_key'
        LIMIT 1`,
    );

    const currentMaxLength = Number(setupKeyColumn?.[0]?.max_length) || 0;
    if (currentMaxLength > 0 && currentMaxLength < 320) {
      await query(
        `ALTER TABLE admin_setup_otps
         MODIFY COLUMN setup_key VARCHAR(320) NOT NULL`,
      );
    }

    setupOtpTablePrepared = true;
  })();

  try {
    await setupOtpTablePreparationPromise;
  } finally {
    setupOtpTablePreparationPromise = null;
  }
}

async function getActiveDepartmentAdmin(department) {
  const normalizedDepartment = normalizeDepartment(department);
  const rows = await query(
    `SELECT id, user_id, name, email
       FROM users
      WHERE department = ?
        AND role = 'admin'
        AND status = 'active'
      ORDER BY id ASC
      LIMIT 1`,
    [normalizedDepartment],
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function assertNoExistingEmailInDepartment(email, department) {
  const rows = await query(
    `SELECT id
       FROM users
      WHERE department = ?
        AND LOWER(email) = LOWER(?)
      LIMIT 1`,
    [normalizeDepartment(department), String(email || "").trim()],
  );

  if (Array.isArray(rows) && rows.length > 0) {
    throw new Error("email already exists.");
  }
}

async function storeSetupOtp(tempSetupUserId, otp) {
  await ensureAdminSetupOtpTable();

  const setupKey = String(tempSetupUserId || "").trim();
  const expiresAt = new Date(Date.now() + ADMIN_SETUP_OTP_TTL_MS);
  const [department = "CCS", email = ""] = setupKey.split("|");

  await query(
    `INSERT INTO admin_setup_otps (
       setup_key, email, department, otp_code, purpose, expires_at, is_used
     ) VALUES (?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       department = VALUES(department),
       otp_code = VALUES(otp_code),
       expires_at = VALUES(expires_at),
       is_used = 0`,
    [
      setupKey,
      String(email || "")
        .trim()
        .toLowerCase(),
      normalizeDepartment(department),
      String(otp || "").trim(),
      ADMIN_SETUP_OTP_PURPOSE,
      expiresAt,
    ],
  );
}

async function consumeSetupOtp(tempSetupUserId, otp) {
  await ensureAdminSetupOtpTable();

  const setupKey = String(tempSetupUserId || "").trim();
  const candidate = String(otp || "").trim();
  const rows = await query(
    `SELECT id
       FROM admin_setup_otps
      WHERE setup_key = ?
        AND otp_code = ?
        AND purpose = ?
        AND is_used = 0
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1`,
    [setupKey, candidate, ADMIN_SETUP_OTP_PURPOSE],
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  await query("UPDATE admin_setup_otps SET is_used = 1 WHERE id = ?", [
    rows[0].id,
  ]);
  return true;
}

async function sendAdminSetupOtpEmail({ email, otp, department, name }) {
  if (!mailTransporter) {
    throw new Error("MAIL_USER and MAIL_PASS must be configured to send OTP.");
  }

  const safeOtp = escapeHtml(otp);
  const safeName = escapeHtml(name || "Administrator");
  const safeDepartment = escapeHtml(department || "CCS");
  const expiryMinutes = 10;

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject: `Your OTP Code - Smart Academic System ${safeDepartment}`,
    text: `Hello ${name || "Administrator"}, your Smart Academic System setup OTP is ${otp}. This code expires in ${expiryMinutes} minutes. If you did not request this code, you can ignore this email.`,
    html: `
      <div style="margin:0;padding:24px;background:#f3f5f9;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #dbe2ea;overflow:hidden;">
          <div style="padding:18px 24px;background:#111827;color:#f9fafb;">
            <h2 style="margin:0;font-size:18px;letter-spacing:0.4px;">Smart Academic System ${safeDepartment}</h2>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hello ${safeName},</p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Use the one-time password below to continue first-time administrator setup for your department.</p>
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
}

function getRequestDepartment(req) {
  return normalizeDepartment(
    req?.headers?.["x-department"] || req?.user?.department_code || "CCS",
  );
}

async function ensureUsersDepartmentSupport() {
  if (usersDepartmentPrepared) return;
  if (usersDepartmentPreparationPromise) {
    await usersDepartmentPreparationPromise;
    return;
  }

  usersDepartmentPreparationPromise = (async () => {
    const departmentColumn = await query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'department'
        LIMIT 1`,
    );

    if (!Array.isArray(departmentColumn) || departmentColumn.length === 0) {
      await query(
        `ALTER TABLE users
         ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT 'CCS'`,
      );
    }

    await query(
      `UPDATE users
          SET department = 'CCS'
        WHERE department IS NULL OR TRIM(department) = ''`,
    );

    const stats = await query(
      `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'`,
    );

    const indexMap = new Map();
    (Array.isArray(stats) ? stats : []).forEach((row) => {
      const name = String(row.INDEX_NAME || "");
      if (!name) return;
      const entry = indexMap.get(name) || {
        nonUnique: Number(row.NON_UNIQUE),
        columns: [],
      };
      entry.columns.push({
        name: String(row.COLUMN_NAME || "").toLowerCase(),
        seq: Number(row.SEQ_IN_INDEX) || 0,
      });
      indexMap.set(name, entry);
    });

    // Collect index names that are referenced by foreign key constraints so we
    // never attempt to DROP an index that MySQL requires to enforce a FK.
    const fkStats = await query(
      `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    const fkIndexNames = new Set(
      (Array.isArray(fkStats) ? fkStats : []).map((r) =>
        String(r.CONSTRAINT_NAME || ""),
      ),
    );

    for (const [indexName, info] of indexMap.entries()) {
      if (String(indexName).toUpperCase() === "PRIMARY") continue;
      if (Number(info.nonUnique) !== 0) continue;
      if (fkIndexNames.has(indexName)) continue; // FK depends on this index — skip

      const orderedColumns = info.columns
        .sort((a, b) => a.seq - b.seq)
        .map((col) => col.name);

      const isLegacyUserIdUnique =
        orderedColumns.length === 1 && orderedColumns[0] === "user_id";
      const isLegacyEmailUnique =
        orderedColumns.length === 1 && orderedColumns[0] === "email";

      if (isLegacyUserIdUnique || isLegacyEmailUnique) {
        try {
          await query(`ALTER TABLE users DROP INDEX \`${indexName}\``);
        } catch (dropErr) {
          // If MySQL rejects due FK dependency, keep legacy index and continue.
          const message = String(dropErr?.message || "").toLowerCase();
          const isFkProtected =
            dropErr?.code === "ER_DROP_INDEX_FK" ||
            message.includes("needed in a foreign key constraint");

          if (!isFkProtected) {
            console.warn(
              `[ensureUsersDepartmentSupport] Could not drop index ${indexName}:`,
              dropErr?.message,
            );
          }
        }
      }
    }

    const hasDeptUserUnique = Array.from(indexMap.values()).some((info) => {
      if (Number(info.nonUnique) !== 0) return false;
      const cols = info.columns
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((col) => col.name);
      return (
        cols.length === 2 && cols[0] === "department" && cols[1] === "user_id"
      );
    });

    const hasDeptEmailUnique = Array.from(indexMap.values()).some((info) => {
      if (Number(info.nonUnique) !== 0) return false;
      const cols = info.columns
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((col) => col.name);
      return (
        cols.length === 2 && cols[0] === "department" && cols[1] === "email"
      );
    });

    if (!hasDeptUserUnique) {
      await query(
        "ALTER TABLE users ADD UNIQUE INDEX ux_users_department_user_id (department, user_id)",
      );
    }

    if (!hasDeptEmailUnique) {
      await query(
        "ALTER TABLE users ADD UNIQUE INDEX ux_users_department_email (department, email)",
      );
    }

    usersDepartmentPrepared = true;
  })();

  try {
    await usersDepartmentPreparationPromise;
  } finally {
    usersDepartmentPreparationPromise = null;
  }
}

async function generateNextUserId(role) {
  const prefix = rolePrefix(role);
  const yy = currentYearTwoDigits();
  const regex = `^${prefix}${yy}-[0-9]{5}$`;

  const rows = await query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(user_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM users
     WHERE user_id REGEXP ?`,
    [regex],
  );

  const maxSeq = Number.parseInt(rows?.[0]?.max_seq, 10) || 0;
  const next = maxSeq + 1;

  if (next > 99999) {
    const usedRows = await query(
      `SELECT CAST(SUBSTRING_INDEX(user_id, '-', -1) AS UNSIGNED) AS seq
         FROM users
        WHERE user_id REGEXP ?
        ORDER BY seq ASC`,
      [regex],
    );

    const used = new Set(
      (Array.isArray(usedRows) ? usedRows : [])
        .map((row) => Number.parseInt(row?.seq, 10))
        .filter((seq) => Number.isInteger(seq) && seq >= 1 && seq <= 99999),
    );

    for (let candidate = 1; candidate <= 99999; candidate += 1) {
      if (!used.has(candidate)) {
        return `${prefix}${yy}-${String(candidate).padStart(5, "0")}`;
      }
    }

    throw new Error("User ID sequence limit reached for current year.");
  }

  return `${prefix}${yy}-${String(next).padStart(5, "0")}`;
}

async function assertUniqueUserIdentity(
  userId,
  email,
  department,
  excludeUserId = null,
) {
  const normalizedDepartment = normalizeDepartment(department);
  const normalizedUserId = String(userId || "").trim();
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const userIdRows = await query(
    `SELECT id
       FROM users
      WHERE user_id = ?
      LIMIT 1`,
    [normalizedUserId],
  );

  const existingUserIdRow = Array.isArray(userIdRows) ? userIdRows[0] : null;
  if (
    existingUserIdRow &&
    (!Number.isInteger(excludeUserId) ||
      Number(existingUserIdRow.id) !== excludeUserId)
  ) {
    throw new Error("user_id already exists.");
  }

  const emailRows = await query(
    `SELECT id
       FROM users
      WHERE department = ?
        AND LOWER(email) = LOWER(?)
      LIMIT 1`,
    [normalizedDepartment, normalizedEmail],
  );

  const existingEmailRow = Array.isArray(emailRows) ? emailRows[0] : null;
  if (
    existingEmailRow &&
    (!Number.isInteger(excludeUserId) ||
      Number(existingEmailRow.id) !== excludeUserId)
  ) {
    throw new Error("email already exists.");
  }
}

async function resolveSetupAdminUserId(preferredUserId, email, department) {
  const desiredUserId = normalizeSetupAdminUserId(preferredUserId || "");
  const userIdMessage = validateSetupAdminUserId(desiredUserId);
  if (userIdMessage) {
    throw new Error(userIdMessage);
  }

  if (desiredUserId) {
    try {
      await assertUniqueUserIdentity(desiredUserId, email, department, null);
      return desiredUserId;
    } catch (error) {
      if (!/user_id already exists/i.test(String(error?.message || ""))) {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generatedUserId = await generateNextUserId("admin");
    try {
      await assertUniqueUserIdentity(generatedUserId, email, department, null);
      return generatedUserId;
    } catch (error) {
      if (/email already exists/i.test(String(error?.message || ""))) {
        throw error;
      }
      if (!/user_id already exists/i.test(String(error?.message || ""))) {
        throw error;
      }
    }
  }

  throw new Error("Could not allocate a unique admin user_id.");
}

function buildSetupDebugPayload(stage, extras = {}) {
  return {
    stage,
    ...extras,
  };
}

function respondWithSetupError(res, stage, error, extras = {}) {
  const rawMessage = String(error?.message || "");
  const normalized = rawMessage.toLowerCase();
  const debug = buildSetupDebugPayload(stage, {
    errorCode: String(error?.code || "").trim(),
    rawMessage,
    ...extras,
  });

  if (normalized.includes("an active admin already exists")) {
    return res.status(409).json({
      success: false,
      message: rawMessage,
      adminExists: true,
      debug,
    });
  }

  if (normalized.includes("email already exists")) {
    return res.status(409).json({
      success: false,
      message: "This email already exists in the selected department.",
      conflictType: "email",
      debug,
    });
  }

  if (normalized.includes("user_id already exists")) {
    return res.status(409).json({
      success: false,
      message:
        "The generated admin ID already exists. Please request OTP again to regenerate a new ID.",
      conflictType: "user_id",
      debug,
    });
  }

  if (error?.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: rawMessage || "A duplicate database value was detected.",
      conflictType: "duplicate_entry",
      debug,
    });
  }

  return res.status(500).json({
    success: false,
    message: rawMessage || "Setup request failed.",
    debug,
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendUserCredentialsEmail({
  email,
  name,
  userId,
  password,
  role,
  department,
}) {
  if (!mailTransporter) {
    throw new Error(
      "MAIL_USER and MAIL_PASS must be configured to email credentials.",
    );
  }

  const safeName = escapeHtml(name || "User");
  const safeUserId = escapeHtml(userId || "-");
  const safeEmail = escapeHtml(email || "-");
  const safePassword = escapeHtml(password || "");
  const safeRole = escapeHtml(role || "-");
  const safeDepartment = escapeHtml(department || "CCS");

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject: `Your Smart Academic System ${safeDepartment} Account Credentials`,
    html: `
      <div style="margin:0;padding:24px;background:#f5f8fb;font-family:Arial,sans-serif;color:#1b2530;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe6f2;border-radius:12px;overflow:hidden;">
          <div style="background:#1c3658;color:#ffffff;padding:18px 22px;">
            <h2 style="margin:0;font-size:20px;line-height:1.3;">Smart Academic System ${safeDepartment}</h2>
          </div>
          <div style="padding:22px;line-height:1.6;">
            <p style="margin:0 0 12px;">Hello ${safeName},</p>
            <p style="margin:0 0 14px;">Your account has been created or updated for the <strong>${safeDepartment}</strong> department. Use the credentials below to sign in.</p>
            <div style="border:1px solid #d3e1ef;border-radius:10px;padding:14px 16px;background:#f9fcff;">
              <p style="margin:0 0 8px;"><strong>User ID:</strong> ${safeUserId}</p>
              <p style="margin:0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
              <p style="margin:0 0 8px;"><strong>Department:</strong> ${safeDepartment}</p>
              <p style="margin:0 0 8px;"><strong>Role:</strong> ${safeRole}</p>
              <p style="margin:0;"><strong>Temporary Password:</strong> ${safePassword}</p>
            </div>
            <p style="margin:16px 0 0;color:#4f647a;font-size:13px;">Please change your password after first login.</p>
          </div>
        </div>
      </div>
    `,
  });
}

function sanitizeUserPayload(payload = {}, { requirePassword = false } = {}) {
  const user_id = asText(payload.user_id || payload.userId).toUpperCase();
  const name = asText(payload.name);
  const email = asText(payload.email).toLowerCase();
  const role = normalizeRole(payload.role);
  const status = normalizeStatus(payload.status);
  const profile_image = asText(payload.profile_image || payload.profileImage);
  const department = normalizeDepartment(
    payload.department || payload.department_code,
  );
  const rawPassword = String(payload.password || "");
  const autoGenerateUserId =
    payload.autoGenerateUserId === true ||
    payload.auto_generate_user_id === true;
  const sendCredentialsEmail =
    payload.sendCredentialsEmail === true ||
    payload.send_credentials_email === true;

  const errors = [];

  if (!autoGenerateUserId && !user_id) errors.push("user_id is required.");
  if (user_id && !USER_ID_FORMAT.test(user_id)) {
    errors.push("user_id must follow format [S|C|A]YY-NNNNN.");
  }
  if (!name) errors.push("name is required.");
  if (!email) {
    errors.push("email is required.");
  } else if (!isValidEmail(email)) {
    errors.push("email must be valid.");
  }
  if (!role) errors.push("role must be admin or coordinator.");
  if (!status) errors.push("status must be active or inactive.");

  if (requirePassword && !rawPassword.trim()) {
    errors.push("password is required.");
  }

  return {
    user_id,
    name,
    email,
    role,
    status,
    department,
    profile_image: profile_image || null,
    password: rawPassword,
    autoGenerateUserId,
    sendCredentialsEmail,
    errors,
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    department: row.department || "CCS",
    profile_image: row.profile_image || "",
    password: "****",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get("/setup/admin-exists", async (req, res) => {
  try {
    await ensureUsersDepartmentSupport();
    const departmentCode = normalizeDepartment(
      req.query.departmentCode || req.query.department || "CCS",
    );
    const admin = await getActiveDepartmentAdmin(departmentCode);

    return res.json({
      success: true,
      departmentCode,
      adminExists: Boolean(admin),
      admin: admin
        ? {
            user_id: admin.user_id,
            name: admin.name,
            email: admin.email,
          }
        : null,
    });
  } catch (error) {
    console.error("setup admin-exists error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check admin status.",
    });
  }
});

router.get("/setup/admin/next-user-id", async (req, res) => {
  try {
    await ensureUsersDepartmentSupport();
    const departmentCode = normalizeDepartment(
      req.query.departmentCode || req.query.department || "CCS",
    );

    const existingAdmin = await getActiveDepartmentAdmin(departmentCode);
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: "An active admin already exists for this department.",
        adminExists: true,
      });
    }

    const nextUserId = await generateNextUserId("admin");
    return res.json({ success: true, user_id: nextUserId, departmentCode });
  } catch (error) {
    console.error("setup next-user-id error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate admin ID.",
    });
  }
});

router.post("/setup/admin/send-otp", async (req, res) => {
  let departmentCode = "CCS";
  let email = "";
  let customUserId = "";
  try {
    await ensureUsersDepartmentSupport();
    purgeExpiredSetupData();

    departmentCode = normalizeDepartment(
      req.body.departmentCode || req.body.department || "CCS",
    );
    const name = asText(req.body.name);
    email = asText(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    customUserId = normalizeSetupAdminUserId(
      req.body.user_id || req.body.userId,
    );
    const profileImage = asText(
      req.body.profile_image || req.body.profileImage,
    );

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Full name is required." });
    }
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });
    }
    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Email must be valid." });
    }

    const passwordMessage = validateSetupPassword(password);
    if (passwordMessage) {
      return res.status(400).json({ success: false, message: passwordMessage });
    }

    const userIdMessage = validateSetupAdminUserId(customUserId);
    if (userIdMessage) {
      return res.status(400).json({ success: false, message: userIdMessage });
    }

    const existingAdmin = await getActiveDepartmentAdmin(departmentCode);
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: "An active admin already exists for this department.",
        adminExists: true,
      });
    }

    await assertNoExistingEmailInDepartment(email, departmentCode);

    const key = setupRegistrationKey(departmentCode, email);
    const now = Date.now();
    const cooldownEndsAt = Number(adminSetupSendCooldown.get(key) || 0);
    if (cooldownEndsAt > now) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP.",
        retryAfterSeconds: Math.ceil((cooldownEndsAt - now) / 1000),
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const tempSetupUserId = buildSetupOtpStorageUserId(departmentCode, email);
    await storeSetupOtp(tempSetupUserId, otp);
    await sendAdminSetupOtpEmail({
      email,
      otp,
      department: departmentCode,
      name,
    });

    adminSetupPendingRegistrations.set(key, {
      name,
      email,
      departmentCode,
      user_id: customUserId || "",
      profile_image: profileImage || "",
      hashedPassword: hashPassword(password),
      createdAt: now,
      expiresAt: now + ADMIN_SETUP_OTP_TTL_MS,
    });
    adminSetupSendCooldown.set(key, now + ADMIN_SETUP_SEND_COOLDOWN_MS);

    return res.json({
      success: true,
      message: "OTP sent successfully.",
      expiresInSeconds: Math.floor(ADMIN_SETUP_OTP_TTL_MS / 1000),
    });
  } catch (error) {
    console.error("setup send-otp error:", error);
    return respondWithSetupError(res, "send-otp", error, {
      departmentCode,
      email,
      userId: customUserId,
    });
  }
});

router.post("/setup/admin/verify-create", async (req, res) => {
  let departmentCode = "CCS";
  let email = "";
  try {
    await ensureUsersDepartmentSupport();
    purgeExpiredSetupData();

    departmentCode = normalizeDepartment(
      req.body.departmentCode || req.body.department || "CCS",
    );
    email = asText(req.body.email).toLowerCase();
    const otp = asText(req.body.otp);

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const key = setupRegistrationKey(departmentCode, email);
    const pending = adminSetupPendingRegistrations.get(key);
    if (!pending || Number(pending.expiresAt) <= Date.now()) {
      adminSetupPendingRegistrations.delete(key);
      return res.status(400).json({
        success: false,
        message: "Setup session expired. Please request a new OTP.",
      });
    }

    const existingAdmin = await getActiveDepartmentAdmin(departmentCode);
    if (existingAdmin) {
      adminSetupPendingRegistrations.delete(key);
      return res.status(409).json({
        success: false,
        message: "An active admin already exists for this department.",
        adminExists: true,
      });
    }

    const tempSetupUserId = buildSetupOtpStorageUserId(departmentCode, email);
    const isOtpValid = await consumeSetupOtp(tempSetupUserId, otp);
    if (!isOtpValid) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    let nextUserId = await resolveSetupAdminUserId(
      pending.user_id,
      email,
      departmentCode,
    );

    let insertResult = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        insertResult = await query(
          `INSERT INTO users (user_id, name, email, role, status, department, password, profile_image)
           VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?)`,
          [
            nextUserId,
            pending.name,
            email,
            departmentCode,
            pending.hashedPassword,
            asText(pending.profile_image) || null,
          ],
        );
        break;
      } catch (insertError) {
        const duplicateUserId =
          insertError?.code === "ER_DUP_ENTRY" &&
          /users\.user_id/i.test(String(insertError?.sqlMessage || ""));
        if (!duplicateUserId) {
          throw insertError;
        }
        nextUserId = await generateNextUserId("admin");
      }
    }

    if (!insertResult) {
      throw new Error("Could not allocate a unique admin user_id.");
    }

    const rows = await query(
      `SELECT id, user_id, name, email, role, status, department, profile_image
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [insertResult.insertId],
    );

    adminSetupPendingRegistrations.delete(key);
    adminSetupSendCooldown.delete(key);

    return res.status(201).json({
      success: true,
      message: "Administrator account created successfully.",
      user: mapUserRow(rows[0]),
    });
  } catch (error) {
    console.error("setup verify-create error:", error);
    return respondWithSetupError(res, "verify-create", error, {
      departmentCode,
      email,
      pendingUserId: adminSetupPendingRegistrations.get(
        setupRegistrationKey(departmentCode, email),
      )?.user_id,
    });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureUsersDepartmentSupport();
    const department = getRequestDepartment(req);
    const rows = await query(
      `SELECT id, user_id, name, email, role, status, department, profile_image
       FROM users
       WHERE department = ?
       ORDER BY id DESC`,
      [department],
    );

    return res.json({
      success: true,
      users: Array.isArray(rows) ? rows.map(mapUserRow) : [],
    });
  } catch (error) {
    console.error("getUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users.",
    });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    await ensureUsersDepartmentSupport();
    const payload = sanitizeUserPayload(req.body, { requirePassword: true });
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    let finalUserId = payload.user_id;
    if (payload.autoGenerateUserId || !finalUserId) {
      finalUserId = await generateNextUserId(payload.role);
    }

    await assertUniqueUserIdentity(
      finalUserId,
      payload.email,
      payload.department,
      null,
    );

    const hashedPassword = hashPassword(payload.password);

    const result = await query(
      `INSERT INTO users (user_id, name, email, role, status, department, password, profile_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalUserId,
        payload.name,
        payload.email,
        payload.role,
        payload.status,
        payload.department,
        hashedPassword,
        payload.profile_image,
      ],
    );

    const rows = await query(
      `SELECT id, user_id, name, email, role, status, department, profile_image
       FROM users WHERE id = ? LIMIT 1`,
      [result.insertId],
    );

    let emailWarning = "";
    if (payload.sendCredentialsEmail) {
      try {
        await sendUserCredentialsEmail({
          email: payload.email,
          name: payload.name,
          userId: finalUserId,
          password: payload.password,
          role: payload.role,
          department: payload.department,
        });
      } catch (mailError) {
        emailWarning =
          mailError?.message || "User created, but credentials email failed.";
      }
    }

    return res.status(201).json({
      success: true,
      user: mapUserRow(rows[0]),
      message: emailWarning
        ? `User added successfully. ${emailWarning}`
        : "User added successfully.",
    });
  } catch (error) {
    if (/already exists/i.test(error?.message || "")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "user_id or email already exists for this department.",
      });
    }

    console.error("createUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create user.",
    });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureUsersDepartmentSupport();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID is required.",
      });
    }

    const payload = sanitizeUserPayload(req.body, { requirePassword: false });
    if (payload.errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: payload.errors[0] });
    }

    const existing = await query("SELECT id FROM users WHERE id = ? LIMIT 1", [
      id,
    ]);
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    let finalUserId = payload.user_id;
    if (payload.autoGenerateUserId || !finalUserId) {
      finalUserId = await generateNextUserId(payload.role);
    }

    await assertUniqueUserIdentity(
      finalUserId,
      payload.email,
      payload.department,
      id,
    );

    const shouldUpdatePassword = Boolean(asText(payload.password));
    if (payload.sendCredentialsEmail && !shouldUpdatePassword) {
      return res.status(400).json({
        success: false,
        message:
          "Password is required when sending credentials email during update.",
      });
    }

    if (shouldUpdatePassword) {
      await query(
        `UPDATE users
         SET user_id = ?, name = ?, email = ?, role = ?, status = ?, department = ?, profile_image = ?, password = ?
         WHERE id = ?`,
        [
          finalUserId,
          payload.name,
          payload.email,
          payload.role,
          payload.status,
          payload.department,
          payload.profile_image,
          hashPassword(payload.password),
          id,
        ],
      );
    } else {
      await query(
        `UPDATE users
         SET user_id = ?, name = ?, email = ?, role = ?, status = ?, department = ?, profile_image = ?
         WHERE id = ?`,
        [
          finalUserId,
          payload.name,
          payload.email,
          payload.role,
          payload.status,
          payload.department,
          payload.profile_image,
          id,
        ],
      );
    }

    const rows = await query(
      `SELECT id, user_id, name, email, role, status, department, profile_image
       FROM users WHERE id = ? LIMIT 1`,
      [id],
    );

    let emailWarning = "";
    if (payload.sendCredentialsEmail && shouldUpdatePassword) {
      try {
        await sendUserCredentialsEmail({
          email: payload.email,
          name: payload.name,
          userId: finalUserId,
          password: payload.password,
          role: payload.role,
          department: payload.department,
        });
      } catch (mailError) {
        emailWarning =
          mailError?.message || "User updated, but credentials email failed.";
      }
    }

    return res.json({
      success: true,
      user: mapUserRow(rows[0]),
      message: emailWarning
        ? `User updated successfully. ${emailWarning}`
        : "User updated successfully.",
    });
  } catch (error) {
    if (/already exists/i.test(error?.message || "")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "user_id or email already exists for this department.",
      });
    }

    console.error("updateUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update user.",
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID is required.",
      });
    }

    const existing = await query("SELECT id FROM users WHERE id = ? LIMIT 1", [
      id,
    ]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found or already deleted.",
      });
    }

    await query("DELETE FROM users WHERE id = ?", [id]);

    return res.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete user.",
    });
  }
});

module.exports = router;
