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

function formatStatusLabel(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "ojt complete") return "OJT Complete";
  if (normalized.includes("deployed")) return "Deployed";
  return String(status || "").trim() || "Updated";
}

async function sendOjtDeploymentStatusEmail({
  email,
  studentName,
  studentId,
  status,
  previousStatus,
}) {
  if (!mailTransporter) {
    throw new Error(
      "MAIL_USER and MAIL_PASS must be configured to send deployment emails.",
    );
  }

  if (!email) {
    throw new Error(
      "Student email is required to send deployment status email.",
    );
  }

  const safeName = escapeHtml(studentName || "Student");
  const safeStudentId = escapeHtml(studentId || "-");
  const safeStatus = escapeHtml(formatStatusLabel(status));
  const safePreviousStatus = escapeHtml(
    String(previousStatus || "Pending Requirements").trim(),
  );
  const issuedAt = new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const safeIssuedAt = escapeHtml(issuedAt);

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject: `OJT Status Update: ${safeStatus}`,
    html: `
      <div style="margin:0;padding:28px;background:#eef3f8;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #d5e0ec;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
          <div style="background:linear-gradient(135deg,#0f4c81,#0a6fb5);padding:22px 24px;color:#ffffff;">
            <p style="margin:0;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;">Smart Academic System CCS</p>
            <h2 style="margin:6px 0 0;font-size:22px;line-height:1.35;font-weight:700;">Official OJT Deployment Notification</h2>
          </div>

          <div style="padding:24px;line-height:1.65;">
            <p style="margin:0 0 12px;">Dear ${safeName},</p>
            <p style="margin:0 0 14px;">
              This is to formally inform you that your OJT status has been updated by the OJT Coordination Office.
            </p>

            <div style="margin:16px 0;padding:14px 16px;border:1px solid #d8e5f2;border-radius:10px;background:#f8fbff;">
              <p style="margin:0 0 8px;"><strong>Student ID:</strong> ${safeStudentId}</p>
              <p style="margin:0 0 8px;"><strong>Previous Status:</strong> ${safePreviousStatus}</p>
              <p style="margin:0 0 8px;"><strong>Current Status:</strong> ${safeStatus}</p>
              <p style="margin:0;"><strong>Update Time:</strong> ${safeIssuedAt}</p>
            </div>

            <p style="margin:0 0 10px;">
              If your status is <strong>Deployed</strong>, please continue complying with all internship and reporting requirements.
            </p>
            <p style="margin:0 0 10px;">
              If your status is <strong>OJT Complete</strong>, your requirement completion has been acknowledged by the office.
            </p>
            <p style="margin:0;">
              For clarifications, please contact your assigned OJT coordinator.
            </p>
          </div>
        </div>

        <p style="max-width:700px;margin:10px auto 0;font-size:12px;color:#64748b;">
          This is an automated message from the Smart Academic System CCS. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

module.exports = {
  sendOjtDeploymentStatusEmail,
  formatStatusLabel,
};
