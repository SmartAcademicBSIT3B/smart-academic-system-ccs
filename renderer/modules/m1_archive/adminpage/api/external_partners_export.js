(function () {
  function getReportName() {
    const title = (
      document.querySelector(".page-title")?.textContent || "external_partners"
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    return `${title}_${date}`;
  }

  function getTable() {
    return document.getElementById("archives-table");
  }

  function escapeCsvCell(value) {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function tableToCsv(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("th,td"));
        return cells
          .map((cell) => {
            if (cell.querySelector("input[type='checkbox']")) return "";
            const img = cell.querySelector("img");
            if (img?.src) return escapeCsvCell(img.src);
            return escapeCsvCell(cell.textContent.trim());
          })
          .join(",");
      })
      .join("\n");
  }

  function downloadBlob(content, mime, filename) {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadTableAsHtmlDoc(table, filename, mime) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${table.outerHTML}</body></html>`;
    downloadBlob(html, mime, filename);
  }

  function initExternalPartnersExport() {
    const ui = window.ExternalPartnersUI;
    if (!ui) return;

    const exportModal = document.getElementById("external-export-modal");
    const openBtn = document.getElementById("external-partner-generate-btn");
    const cancelBtn = document.getElementById("external-export-cancel-btn");
    const csvBtn = document.getElementById("external-export-csv-btn");
    const excelBtn = document.getElementById("external-export-excel-btn");
    const pdfBtn = document.getElementById("external-export-pdf-btn");

    openBtn?.addEventListener("click", () => {
      ui.openModal(exportModal);
      if (typeof lucide !== "undefined") lucide.createIcons();
    });

    cancelBtn?.addEventListener("click", () => ui.closeModal(exportModal));
    exportModal?.addEventListener("click", (event) => {
      if (event.target === exportModal) ui.closeModal(exportModal);
    });

    csvBtn?.addEventListener("click", () => {
      const table = getTable();
      if (!table) return;
      const csv = tableToCsv(table);
      downloadBlob(csv, "text/csv;charset=utf-8", `${getReportName()}.csv`);
      ui.closeModal(exportModal);
      ui.showToast("CSV report downloaded.", "success");
    });

    excelBtn?.addEventListener("click", () => {
      const table = getTable();
      if (!table) return;
      downloadTableAsHtmlDoc(
        table,
        `${getReportName()}.xls`,
        "application/vnd.ms-excel",
      );
      ui.closeModal(exportModal);
      ui.showToast("Excel report downloaded.", "success");
    });

    pdfBtn?.addEventListener("click", () => {
      ui.closeModal(exportModal);
      window.print();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExternalPartnersExport);
  } else {
    initExternalPartnersExport();
  }
})();
