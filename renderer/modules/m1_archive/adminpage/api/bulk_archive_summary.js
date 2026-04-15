function formatBulkAuthors(authors) {
  if (!Array.isArray(authors)) return String(authors || "").trim();
  const parts = authors.map((v) => String(v || "").trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} & ${parts[2]}`;
}

async function extractBulkArchiveRows(files, defaults) {
  const list = Array.from(files || []);
  const rows = [];
  const safeDefaults = defaults || {};

  for (const file of list) {
    const extracted = await extractArchiveDataFromPdf(file);
    rows.push({
      fileName: file.name,
      title: extracted.title || "",
      authors: formatBulkAuthors(extracted.authors),
      date: extracted.date || "",
      section: safeDefaults.section || "",
      advisor: extracted.advisor || "",
      type: extracted.type || "Other",
      status: safeDefaults.status || "Approved",
      keywords: Array.isArray(extracted.keywords)
        ? extracted.keywords.join(", ")
        : String(extracted.keywords || ""),
    });
  }

  return rows;
}

window.extractBulkArchiveRows = extractBulkArchiveRows;
