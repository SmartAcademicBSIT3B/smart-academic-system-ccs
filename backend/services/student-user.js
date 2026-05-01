const crypto = require("crypto");
const nodemailer = require("nodemailer");

const MAIL_USER = String(process.env.MAIL_USER || "").trim();
const MAIL_PASS = String(process.env.MAIL_PASS || "").trim();

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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function generateTemporaryPassword(length = 12) {
  const raw = crypto.randomBytes(24).toString("base64url");
  return raw.slice(0, Math.max(8, length));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

async function sendStudentWelcomeEmail({ email, name, studentId, password }) {
  if (!mailTransporter) {
    throw new Error(
      "MAIL_USER and MAIL_PASS must be configured to send student credentials.",
    );
  }

  const safeName = escapeHtml(name || "Student");
  const safeStudentId = escapeHtml(studentId || "-");
  const safeEmail = escapeHtml(email || "-");
  const safePassword = escapeHtml(password || "");

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject: "Your Student Portal Account - Smart Academic System CCS",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;line-height:1.5;color:#222;">
        <h2 style="margin:0 0 12px;">Student Portal Login Credentials</h2>
        <p style="margin:0 0 12px;">Hello ${safeName},</p>
        <p style="margin:0 0 12px;">Your student portal account has been created.</p>
        <div style="border:1px solid #ddd;border-radius:8px;padding:12px 14px;background:#fafafa;">
          <p style="margin:0 0 6px;"><strong>Student ID:</strong> ${safeStudentId}</p>
          <p style="margin:0 0 6px;"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin:0;"><strong>Temporary Password:</strong> ${safePassword}</p>
        </div>
        <p style="margin:12px 0 0;">Please change your password after your first login.</p>
      </div>
    `,
  });
}

/**
 * Inserts or updates the students_user row inside an existing transaction.
 * Does NOT send email — returns the email payload so the caller can send
 * it AFTER committing the transaction (so a failed email never rolls back
 * the DB write).
 */
async function createOrUpdateStudentUser(connection, studentData) {
  const normalizedEmail = String(studentData.email || "")
    .trim()
    .toLowerCase();
  const studentId = String(studentData.student_id || "").trim();
  const name = String(studentData.name || "").trim();
  const status = "active"; // students_user always starts active regardless of OJT deployment status

  const [existingRows] = await connection.execute(
    "SELECT id FROM students_user WHERE student_id = ? LIMIT 1",
    [studentId],
  );

  if (existingRows.length > 0) {
    await connection.execute(
      `UPDATE students_user
       SET name = ?, email = ?, status = ?
       WHERE id = ?`,
      [name, normalizedEmail, status, existingRows[0].id],
    );
    return { mode: "updated", emailPayload: null };
  }

  const temporaryPassword = generateTemporaryPassword(12);
  const passwordHash = hashPassword(temporaryPassword);

  await connection.execute(
    `INSERT INTO students_user
     (student_id, name, email, password, status, created_at, profile_image_url)
     VALUES (?, ?, ?, ?, ?, NOW(), NULL)`,
    [studentId, name, normalizedEmail, passwordHash, status],
  );

  return {
    mode: "created",
    emailPayload: {
      email: normalizedEmail,
      name,
      studentId,
      password: temporaryPassword,
    },
  };
}

module.exports = {
  createOrUpdateStudentUser,
  sendStudentWelcomeEmail,
};
