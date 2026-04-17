(function () {
  function resolveVisibleArchiveRows() {
    return Array.from(
      document.querySelectorAll("#archives-table-body tr"),
    ).filter((row) => {
      if (row.dataset.placeholder) return false;
      const style = window.getComputedStyle(row);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function resolveExportableColumns() {
    return Array.from(document.querySelectorAll("#archives-table thead th"))
      .map((headerCell, index) => ({
        index,
        label: String(headerCell.textContent || "").trim(),
        headerCell,
      }))
      .filter(({ headerCell, label }) => {
        if (!label) return false;
        if (headerCell.classList.contains("col-check")) return false;
        if (headerCell.classList.contains("col-actions")) return false;
        return true;
      });
  }

  function resolveCellText(cell) {
    if (!cell) return "";

    const select = cell.querySelector("select");
    if (select) {
      const selectedOption = select.selectedOptions?.[0];
      return String(selectedOption?.textContent || select.value || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    return String(cell.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveDepartmentLabel(rows) {
    const labels = Array.from(
      new Set(
        rows
          .map((row) => String(row.dataset.department || "").trim())
          .filter(Boolean),
      ),
    );

    if (labels.length === 1) return labels[0];
    if (labels.length > 1) return "All Departments";
    return "CCS";
  }

  function resolveFilterSummary() {
    const tags = Array.from(
      document.querySelectorAll("#active-filter-tags .filter-tag"),
    )
      .map((tag) => {
        const clone = tag.cloneNode(true);
        clone.querySelector(".filter-tag-remove")?.remove();
        return String(clone.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(Boolean);

    return tags.length ? tags.join(" | ") : "Current view";
  }

  function downloadHtmlAsExcel(htmlContent, fileName) {
    const blob = new Blob(["\ufeff", htmlContent], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportVisibleArchivesToExcel(options = {}) {
    const rows = resolveVisibleArchiveRows();
    if (rows.length === 0) {
      throw new Error("There are no visible archive rows to export.");
    }

    const columns = resolveExportableColumns();
    if (columns.length === 0) {
      throw new Error("The archive table does not have exportable columns.");
    }

    const departmentLabel = resolveDepartmentLabel(rows);
    const reportTitle = `${departmentLabel} Archives Report`;
    const filterSummary = resolveFilterSummary();
    const generatedText = new Date().toLocaleString("en-US");

    const headerCells = ["No.", ...columns.map(({ label }) => label)]
      .map((label) => `<th>${escapeHtml(label)}</th>`)
      .join("");

    const bodyRows = rows
      .map((row, index) => {
        const cells = [
          `<td style=\"text-align:center\">${index + 1}</td>`,
          ...columns.map(({ index: cellIndex }) => {
            return `<td>${escapeHtml(resolveCellText(row.cells[cellIndex]))}</td>`;
          }),
        ].join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const workbookHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1d2430; }
      .meta { margin-bottom: 6px; }
      .title { font-weight: 700; font-size: 14pt; margin-bottom: 10px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #c6cedb; padding: 6px 8px; vertical-align: middle; }
      th { background: #1f2937; color: #ffffff; font-weight: 700; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="title">${escapeHtml(reportTitle)}</div>
    <div class="meta"><strong>Generated:</strong> ${escapeHtml(generatedText)}</div>
    <div class="meta"><strong>Rows:</strong> ${rows.length}</div>
    <div class="meta"><strong>Filters:</strong> ${escapeHtml(filterSummary)}</div>
    <br />
    <table>
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  </body>
</html>`;

    const fileName = String(options.fileName || "archives_report.xls").trim();
    downloadHtmlAsExcel(workbookHtml, fileName || "archives_report.xls");
    return true;
  }

  window.exportVisibleArchivesToExcel = exportVisibleArchivesToExcel;
})();
