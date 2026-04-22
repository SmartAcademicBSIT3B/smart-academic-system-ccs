function normalizeArchiveType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return { thesis: "Thesis", capstone: "Capstone" }[normalized] || null;
}

function normalizeArchiveStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return (
    { pending: "Pending", approved: "Approved", rejected: "Rejected" }[
      normalized
    ] || null
  );
}

function toSqlDateTime(date = new Date()) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

function cleanField(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeExternalPartnerPayload(payload = {}, defaultDepartment = "CCS") {
  const department =
    String(payload.department || "").trim() || String(defaultDepartment || "CCS");
  return {
    logo: cleanField(payload.logo),
    company_name: String(payload.company_name || "").trim(),
    address: String(payload.address || "").trim(),
    department,
    company_email: cleanField(payload.company_email),
    company_contact: cleanField(payload.company_contact),
    representative: cleanField(payload.representative),
    job_description: cleanField(payload.job_description),
    representative_email: cleanField(payload.representative_email),
    representative_contact: cleanField(payload.representative_contact),
  };
}

function normalizeOjtStudentPayload(payload = {}, defaultDepartment = "CCS") {
  const department =
    String(payload.department || "").trim() || String(defaultDepartment || "CCS");
  return {
    student_id: String(payload.student_id || "").trim(),
    name: String(payload.name || "").trim(),
    section: String(payload.section || "").trim(),
    department,
    email: cleanField(payload.email),
    contact_no: cleanField(payload.contact_no),
    status: String(payload.status || "").trim() || "Deployed",
    external_partner_assigned: cleanField(payload.external_partner_assigned),
    nature_of_business: cleanField(payload.nature_of_business),
  };
}

module.exports = {
  normalizeArchiveType,
  normalizeArchiveStatus,
  toSqlDateTime,
  normalizeExternalPartnerPayload,
  normalizeOjtStudentPayload,
  cleanField,
};
