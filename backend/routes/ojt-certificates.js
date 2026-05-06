const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { sendOjtCertificateEmail } = require("../services/certificate-email");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

let tablePrepared = false;
async function ensureCertificatesTable() {
  if (tablePrepared) return;

  await query(`
    CREATE TABLE IF NOT EXISTS ojt_certificates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ojt_student_id INT NOT NULL,
      student_id_ref VARCHAR(120) NOT NULL,
      certificate_type VARCHAR(120) NOT NULL DEFAULT 'OJT Certification',
      issue_date DATE NOT NULL,
      file_url VARCHAR(512) NOT NULL,
      cloudinary_public_id VARCHAR(512) NULL,
      folder_path VARCHAR(512) NULL,
      file_name VARCHAR(255) NULL,
      email_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
      sent_to_email VARCHAR(255) NULL,
      sent_at DATETIME NULL,
      issued_by_user_id INT NULL,
      notes TEXT NULL,
      department VARCHAR(120) NOT NULL DEFAULT 'CCS',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_oc_student (ojt_student_id),
      INDEX idx_oc_dept (department),
      INDEX idx_oc_email_status (email_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  tablePrepared = true;
}

router.get("/:studentId", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const studentId = String(req.params.studentId || "").trim();
    await ensureCertificatesTable();

    const studentRows = await query(
      "SELECT id FROM ojt_students WHERE student_id = ? AND department = ? LIMIT 1",
      [studentId, dept],
    );
    if (!studentRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    const rows = await query(
      `SELECT * FROM ojt_certificates
       WHERE ojt_student_id = ? AND department = ?
       ORDER BY issue_date DESC, id DESC`,
      [studentRows[0].id, dept],
    );

    return res.json({ success: true, certificates: rows });
  } catch (error) {
    console.error("getOjtCertificates error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch certificates.",
    });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    await ensureCertificatesTable();

    const studentId = String(req.body.student_id || "").trim();
    const certificateType =
      String(req.body.certificate_type || "").trim() || "OJT Certification";
    const issueDate =
      String(req.body.issue_date || "").trim() ||
      new Date().toISOString().slice(0, 10);

    const fileUrl = String(req.body.file_url || "").trim();
    const publicId = String(req.body.cloudinary_public_id || "").trim() || null;
    const folderPath = String(req.body.folder_path || "").trim() || null;
    const fileName =
      String(req.body.file_name || "").trim() || "OJT-Certificate.pdf";

    if (!studentId || !fileUrl) {
      return res.status(400).json({
        success: false,
        message: "student_id and file_url are required.",
      });
    }

    const studentRows = await query(
      `SELECT id, student_id, name, email
       FROM ojt_students
       WHERE student_id = ? AND department = ?
       LIMIT 1`,
      [studentId, dept],
    );

    if (!studentRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found." });
    }

    const student = studentRows[0];

    const insertResult = await query(
      `INSERT INTO ojt_certificates
       (ojt_student_id, student_id_ref, certificate_type, issue_date, file_url,
        cloudinary_public_id, folder_path, file_name, email_status, sent_to_email, issued_by_user_id, notes, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        student.id,
        student.student_id,
        certificateType,
        issueDate,
        fileUrl,
        publicId,
        folderPath,
        fileName,
        student.email || null,
        req.user?.id || null,
        String(req.body.notes || "").trim() || null,
        dept,
      ],
    );

    const certificateId = insertResult.insertId;

    try {
      await sendOjtCertificateEmail({
        email: student.email,
        studentName: student.name,
        studentId: student.student_id,
        certificateType,
        issueDate,
        fileUrl,
        fileName,
      });

      await query(
        `UPDATE ojt_certificates
         SET email_status = 'sent', sent_to_email = ?, sent_at = NOW()
         WHERE id = ? AND department = ?`,
        [student.email || null, certificateId, dept],
      );
    } catch (emailError) {
      await query(
        `UPDATE ojt_certificates
         SET email_status = 'failed'
         WHERE id = ? AND department = ?`,
        [certificateId, dept],
      );

      return res.status(502).json({
        success: false,
        message:
          emailError.message ||
          "Certificate saved, but sending email to the student failed.",
        certificateId,
      });
    }

    const rows = await query(
      "SELECT * FROM ojt_certificates WHERE id = ? LIMIT 1",
      [certificateId],
    );

    return res.status(201).json({ success: true, certificate: rows[0] });
  } catch (error) {
    console.error("createOjtCertificate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create certificate.",
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const id = parseInt(req.params.id, 10);
    await ensureCertificatesTable();

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid certificate ID." });
    }

    const rows = await query(
      "SELECT * FROM ojt_certificates WHERE id = ? AND department = ? LIMIT 1",
      [id, dept],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Certificate not found." });
    }

    await query(
      "DELETE FROM ojt_certificates WHERE id = ? AND department = ?",
      [id, dept],
    );

    return res.json({ success: true, certificate: rows[0] });
  } catch (error) {
    console.error("deleteOjtCertificate error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete certificate.",
    });
  }
});

module.exports = router;
