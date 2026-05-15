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

  async function exportVisibleArchivesToExcel(options = {}) {
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
    const headingUtils = window.ReportExportUtils;

    if (!headingUtils?.buildExcelWorkbookHtml || !headingUtils?.escapeHtml) {
      throw new Error("The export heading utility is unavailable.");
    }

    const headerCells = ["No.", ...columns.map(({ label }) => label)]
      .map((label) => `<th>${headingUtils.escapeHtml(label)}</th>`)
      .join("");

    const bodyRows = rows
      .map((row, index) => {
        const cells = [
          `<td style=\"text-align:center\">${index + 1}</td>`,
          ...columns.map(({ index: cellIndex }) => {
            return `<td>${headingUtils.escapeHtml(resolveCellText(row.cells[cellIndex]))}</td>`;
          }),
        ].join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const workbookHtml = await headingUtils.buildExcelWorkbookHtml({
      reportTitle,
      generatedText,
      rowsCount: rows.length,
      filterSummary,
      headerCellsHtml: headerCells,
      bodyRowsHtml: bodyRows,
    });

    const fileName = String(options.fileName || "archives_report.xls").trim();
    downloadHtmlAsExcel(workbookHtml, fileName || "archives_report.xls");
    return true;
  }

  window.exportVisibleArchivesToExcel = exportVisibleArchivesToExcel;
})();
