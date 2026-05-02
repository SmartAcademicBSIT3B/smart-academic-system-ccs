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
  const params = [department, userId, email];
  let sql = `SELECT id, user_id, email, department
               FROM users
              WHERE department = ?
                AND (user_id = ? OR email = ?)`;

  if (Number.isInteger(excludeUserId) && excludeUserId > 0) {
    sql += " AND id <> ?";
    params.push(excludeUserId);
  }

  sql += " LIMIT 10";

  const rows = await query(sql, params);
  if (!Array.isArray(rows) || rows.length === 0) return;

  const sameUserId = rows.find((row) => String(row.user_id) === String(userId));
  if (sameUserId) {
    throw new Error("user_id already exists.");
  }

  const normalizedEmail = String(email || "").toLowerCase();
  const sameEmail = rows.find(
    (row) => String(row.email || "").toLowerCase() === normalizedEmail,
  );
  if (sameEmail) {
    throw new Error("email already exists.");
  }
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
