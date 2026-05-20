const crypto = require("crypto");
const nodemailer = require("nodemailer");

const MAIL_USER = String(process.env.MAIL_USER || "").trim();
const MAIL_PASS = String(process.env.MAIL_PASS || "").trim();
const PORTAL_URL_PLACEHOLDER = "https://plp-gsrs-portal.onrender.com";

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
  const safePortalUrl = escapeHtml(PORTAL_URL_PLACEHOLDER);

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject:
      "Your Account Credentials - PLP GSRS (Graduating Students Requirements Submission) Portal",
    html: `
      <div style="margin:0;padding:24px;background:#f4fbf6;font-family:Arial,sans-serif;color:#1d2a1f;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dcefe2;border-radius:12px;overflow:hidden;">
          <div style="background:#0f8f4a;color:#ffffff;padding:18px 22px;">
            <h2 style="margin:0;font-size:20px;line-height:1.3;">PLP GSRS (Graduating Students Requirements Submission) Portal</h2>
          </div>

          <div style="padding:22px;line-height:1.6;">
            <p style="margin:0 0 12px;">Hello ${safeName},</p>
            <p style="margin:0 0 14px;">
              Your student portal account has been created. Please use the credentials below to sign in.
            </p>

            <div style="border:1px solid #cfe7d8;border-radius:10px;padding:14px 16px;background:#f8fdf9;">
              <p style="margin:0 0 8px;"><strong>Student ID:</strong> ${safeStudentId}</p>
              <p style="margin:0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
              <p style="margin:0;"><strong>Temporary Password:</strong> ${safePassword}</p>
            </div>

            <p style="margin:16px 0 10px;">
              Portal link:
            </p>
            <p style="margin:0 0 16px;word-break:break-all;">
              <a href="${safePortalUrl}" style="color:#0f8f4a;text-decoration:none;font-weight:600;">${safePortalUrl}</a>
            </p>

            <p style="margin:0 0 10px;">
              For your security, please change your password immediately after your first login.
            </p>

            <p style="margin:0;color:#4b5f4f;font-size:13px;">
              If you did not expect this account, please contact your school administrator.
            </p>
          </div>
        </div>

        <p style="max-width:640px;margin:10px auto 0;font-size:12px;color:#5f7464;">
          This is an automated message from PLP GSRS. Please do not reply to this email.
        </p>
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
