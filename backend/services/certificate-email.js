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

async function sendOjtCertificateEmail({
  email,
  studentName,
  studentId,
  certificateType,
  issueDate,
  fileUrl,
  fileName,
}) {
  if (!mailTransporter) {
    throw new Error(
      "MAIL_USER and MAIL_PASS must be configured to send certificate emails.",
    );
  }

  if (!email) {
    throw new Error("Student email is required to send certificate.");
  }

  const safeName = escapeHtml(studentName || "Student");
  const safeStudentId = escapeHtml(studentId || "-");
  const safeType = escapeHtml(certificateType || "OJT Certification");
  const safeIssueDate = escapeHtml(issueDate || "-");
  const safeFileUrl = escapeHtml(fileUrl || "");

  let attachment = null;
  if (fileUrl) {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(
        `Could not fetch certificate file (HTTP ${response.status}).`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    attachment = {
      filename: fileName || "OJT-Certificate.pdf",
      content: Buffer.from(arrayBuffer),
      contentType: "application/pdf",
    };
  }

  await mailTransporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject: "Official OJT Certification Issued",
    html: `
      <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9e3f0;border-radius:12px;overflow:hidden;">
          <div style="background:#0d4f8b;color:#ffffff;padding:18px 22px;">
            <h2 style="margin:0;font-size:20px;line-height:1.35;">OJT Certification Notice</h2>
          </div>
          <div style="padding:22px;line-height:1.65;">
            <p style="margin:0 0 12px;">Dear ${safeName},</p>
            <p style="margin:0 0 12px;">
              We are pleased to inform you that your <strong>${safeType}</strong> has been issued by the OJT Coordination Office.
            </p>

            <div style="border:1px solid #dbe7f5;border-radius:10px;padding:14px 16px;background:#f8fbff;margin:14px 0;">
              <p style="margin:0 0 8px;"><strong>Student ID:</strong> ${safeStudentId}</p>
              <p style="margin:0 0 8px;"><strong>Certificate Type:</strong> ${safeType}</p>
              <p style="margin:0;"><strong>Issue Date:</strong> ${safeIssueDate}</p>
            </div>

            <p style="margin:14px 0 8px;">
              Your certificate is attached to this email as a PDF file.
            </p>
            <p style="margin:0 0 12px; word-break:break-all; color:#334155; font-size:13px;">
              Download link: <a href="${safeFileUrl}" style="color:#0d4f8b;">${safeFileUrl}</a>
            </p>

            <p style="margin:0;">
              Please keep this document for your records. If you have any concerns, contact your coordinator.
            </p>
          </div>
        </div>
        <p style="max-width:680px;margin:10px auto 0;font-size:12px;color:#64748b;">
          This is an automated message from the Smart Academic OJT System. Please do not reply.
        </p>
      </div>
    `,
    attachments: attachment ? [attachment] : [],
  });
}

module.exports = {
  sendOjtCertificateEmail,
};
