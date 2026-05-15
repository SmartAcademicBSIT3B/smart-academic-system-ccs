(function () {
  const DEFAULT_FILTER_TEXT = "Current view";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toHeaderImageUrl(pathValue) {
    const raw = String(pathValue || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) return raw;
    if (/^[a-zA-Z]:\\/.test(raw)) {
      return `file:///${raw.replace(/\\/g, "/")}`;
    }
    if (raw.startsWith("/")) return `file://${raw}`;
    return raw;
  }

  async function resolveHeaderImageSourceForExcel() {
    const defaultHeaderUrl = new URL(
      "../../images/header-template.png",
      window.location.href,
    ).href;

    let candidateUrl = defaultHeaderUrl;
    try {
      const api = window.electronAPI || window.parent?.electronAPI;
      if (api?.getAppSettings) {
        const settingsResult = await api.getAppSettings();
        if (settingsResult?.success && settingsResult.settings) {
          const selectedPath = String(
            settingsResult.settings.selectedPdfReportHeaderPath || "",
          ).trim();
          if (selectedPath) {
            candidateUrl = toHeaderImageUrl(selectedPath) || defaultHeaderUrl;
          }
        }
      }
    } catch (_error) {
      candidateUrl = defaultHeaderUrl;
    }

    return candidateUrl || defaultHeaderUrl;
  }

  function buildExcelHeadingHtml(options = {}) {
    const title = escapeHtml(options.reportTitle || "Report");
    const generatedText = escapeHtml(
      options.generatedText || new Date().toLocaleString("en-US"),
    );
    const rowsCount = Number(options.rowsCount || 0);
    const filterSummary = escapeHtml(
      options.filterSummary || DEFAULT_FILTER_TEXT,
    );
    const imageSrc = String(options.headerImageSrc || "").trim();

    const imageMarkup = imageSrc
      ? `<table class="report-image-table" role="presentation"><tbody><tr class="report-image-row"><td class="report-image-cell"><img class="report-image" src="${escapeHtml(imageSrc)}" alt="Report header" /></td></tr></tbody></table>`
      : "";

    return `
    ${imageMarkup}
    <div class="report-title">${title}</div>
    <div class="report-meta"><strong>Generated:</strong> ${generatedText}</div>
    <div class="report-meta"><strong>Rows:</strong> ${rowsCount}</div>
    <div class="report-meta"><strong>Filters:</strong> ${filterSummary}</div>
    <br />`;
  }

  async function buildExcelWorkbookHtml(options = {}) {
    const headerImageSrc = await resolveHeaderImageSourceForExcel();
    const headingHtml = buildExcelHeadingHtml({
      reportTitle: options.reportTitle,
      generatedText: options.generatedText,
      rowsCount: options.rowsCount,
      filterSummary: options.filterSummary,
      headerImageSrc,
    });

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1d2430; }
      .report-image-table { width: 100%; border-collapse: collapse; border: none; margin-bottom: 12px; }
      .report-image-table td { border: none; padding: 0; }
      .report-image-row { height: 120pt; mso-height-source: userset; }
      .report-image-cell { height: 120pt; mso-height-source: userset; vertical-align: middle; }
      .report-image { width: 100%; max-width: 1060px; max-height: 150px; height: auto; display: block; object-fit: contain; }
      .report-title { font-weight: 700; font-size: 14pt; margin-bottom: 10px; }
      .report-meta { margin-bottom: 6px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #c6cedb; padding: 6px 8px; vertical-align: middle; }
      th { background: #1f2937; color: #ffffff; font-weight: 700; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style>
  </head>
  <body>
    ${headingHtml}
    <table>
      <thead>
        <tr>${String(options.headerCellsHtml || "")}</tr>
      </thead>
      <tbody>
        ${String(options.bodyRowsHtml || "")}
      </tbody>
    </table>
  </body>
</html>`;
  }

  window.ReportExportUtils = {
    escapeHtml,
    buildExcelWorkbookHtml,
  };
})();
