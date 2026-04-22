const express = require("express");
const { query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { normalizeExternalPartnerPayload } = require("../helpers/normalize");
const cloudinaryService = require("../services/cloudinary");

const router = express.Router();

const DEPT_HEADER = "x-department";
function getDept(req) {
  return String(req.headers[DEPT_HEADER] || req.user?.department_code || "CCS").trim() || "CCS";
}

// ── GET /api/external-partners ────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const department = getDept(req);
    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email,
              company_contact, representative, job_description,
              representative_email, representative_contact, created_at, updated_at
       FROM external_partners
       WHERE department = ?
       ORDER BY id DESC`,
      [department],
    );
    return res.json({ success: true, partners: rows });
  } catch (error) {
    console.error("getExternalPartners error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to fetch external partners." });
  }
});

// ── POST /api/external-partners ───────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const department = getDept(req);
    const data = normalizeExternalPartnerPayload(
      { ...req.body, department },
      department,
    );

    if (!data.company_name || !data.address) {
      return res
        .status(400)
        .json({ success: false, message: "Company Name and Address are required." });
    }

    const result = await query(
      `INSERT INTO external_partners
       (logo, company_name, address, department, company_email, company_contact,
        representative, job_description, representative_email, representative_contact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.logo, data.company_name, data.address, data.department,
        data.company_email, data.company_contact, data.representative,
        data.job_description, data.representative_email, data.representative_contact,
      ],
    );

    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email,
              company_contact, representative, job_description,
              representative_email, representative_contact, created_at, updated_at
       FROM external_partners WHERE id = ? LIMIT 1`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      partner: rows[0],
      message: "External partner added successfully.",
    });
  } catch (error) {
    console.error("createExternalPartner error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to create external partner." });
  }
});

// ── PATCH /api/external-partners/:id ─────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid partner ID is required." });
    }

    const department = getDept(req);
    const data = normalizeExternalPartnerPayload(
      { ...req.body, department },
      department,
    );

    if (!data.company_name || !data.address) {
      return res
        .status(400)
        .json({ success: false, message: "Company Name and Address are required." });
    }

    const existing = await query(
      "SELECT id, logo FROM external_partners WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "External partner not found." });
    }

    const oldLogoUrl = existing[0]?.logo || "";

    await query(
      `UPDATE external_partners
       SET logo=?, company_name=?, address=?, department=?, company_email=?,
           company_contact=?, representative=?, job_description=?,
           representative_email=?, representative_contact=?
       WHERE id=?`,
      [
        data.logo, data.company_name, data.address, data.department,
        data.company_email, data.company_contact, data.representative,
        data.job_description, data.representative_email,
        data.representative_contact, id,
      ],
    );

    if (oldLogoUrl && data.logo !== oldLogoUrl) {
      try {
        await cloudinaryService.deleteByUrl(oldLogoUrl);
      } catch (cloudinaryErr) {
        console.warn("Could not delete old logo from Cloudinary:", cloudinaryErr.message);
      }
    }

    const rows = await query(
      `SELECT id, logo, company_name, address, department, company_email,
              company_contact, representative, job_description,
              representative_email, representative_contact, created_at, updated_at
       FROM external_partners WHERE id = ? AND department = ? LIMIT 1`,
      [id, department],
    );

    return res.json({ success: true, partner: rows[0], message: "Partner updated successfully." });
  } catch (error) {
    console.error("updateExternalPartner error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to update external partner." });
  }
});

// ── DELETE /api/external-partners/:id ────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "A valid partner ID is required." });
    }

    const department = getDept(req);
    const existing = await query(
      "SELECT id, logo FROM external_partners WHERE id = ? AND department = ? LIMIT 1",
      [id, department],
    );
    if (!existing || existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "External partner not found or already deleted." });
    }

    const logoUrl = existing[0]?.logo || "";
    await query("DELETE FROM external_partners WHERE id = ? AND department = ?", [id, department]);

    if (logoUrl) {
      try {
        await cloudinaryService.deleteByUrl(logoUrl);
      } catch (cloudinaryErr) {
        console.warn("Could not delete logo from Cloudinary:", cloudinaryErr.message);
      }
    }

    return res.json({ success: true, message: "External partner deleted successfully." });
  } catch (error) {
    console.error("deleteExternalPartner error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to delete external partner." });
  }
});

module.exports = router;
