(function () {
  function getReportName() {
    const title = (
      document.querySelector(".page-title")?.textContent || "ojt_students"
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

  function getVisibleRows(table) {
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
      if (row.dataset.placeholder) return false;
      const style = window.getComputedStyle(row);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function getExportableColumns(table) {
    if (!table) return [];
    return Array.from(table.querySelectorAll("thead th"))
      .map((headerCell, index) => ({
        index,
        label: String(headerCell.textContent || "").trim(),
        headerCell,
      }))
      .filter(({ label, headerCell }) => {
        if (!label) return false;
        if (headerCell.classList.contains("col-check")) return false;
        if (headerCell.classList.contains("col-actions")) return false;
        return true;
      });
  }

  function escapeCsvCell(value) {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function resolveCellText(row, columnIndex) {
    const cell = row?.cells?.[columnIndex];
    if (!cell) return "";

    const select = cell.querySelector("select");
    if (select) {
      const selectedLabel =
        select.selectedOptions && select.selectedOptions[0]
          ? select.selectedOptions[0].textContent
          : select.value;
      return String(selectedLabel || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    const input = cell.querySelector("input, textarea");
    if (input) {
      return String(input.value || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    return String(cell.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildCsvFromVisibleTable(table) {
    const columns = getExportableColumns(table);
    const rows = getVisibleRows(table);

    const header = columns.map(({ label }) => escapeCsvCell(label)).join(",");
    const body = rows.map((row) =>
      columns
        .map(({ index }) => escapeCsvCell(resolveCellText(row, index)))
        .join(","),
    );

    return [header, ...body].join("\n");
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildExcelHtml(table) {
    const columns = getExportableColumns(table);
    const rows = getVisibleRows(table);

    const headerCells = columns
      .map(({ label }) => `<th>${escapeHtml(label)}</th>`)
      .join("");

    const bodyRows = rows
      .map((row) => {
        const cells = columns
          .map(
            ({ index }) =>
              `<td>${escapeHtml(resolveCellText(row, index))}</td>`,
          )
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1d2430; }
      .title { font-weight: 700; font-size: 14pt; margin-bottom: 10px; }
      .meta { margin-bottom: 6px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #c6cedb; padding: 6px 8px; vertical-align: middle; }
      th { background: #1f2937; color: #ffffff; font-weight: 700; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="title">OJT Students Report</div>
    <div class="meta"><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-US"))}</div>
    <div class="meta"><strong>Rows:</strong> ${rows.length}</div>
    <br />
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;
  }

  function loadImageAsDataUrl(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not prepare the PDF header image."));
          return;
        }
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () =>
        reject(new Error("Failed to load the PDF header image."));
      image.src = src;
    });
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

  async function resolveHeaderImageDataUrl() {
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

    try {
      return await loadImageAsDataUrl(candidateUrl);
    } catch (_error) {
      return await loadImageAsDataUrl(defaultHeaderUrl);
    }
  }

  function ensureInlinePreviewElements() {
    const existing = document.getElementById("ojt-pdf-preview-overlay");
    if (existing) {
      return {
        overlay: existing,
        frame: document.getElementById("ojt-pdf-preview-frame"),
        title: document.getElementById("ojt-pdf-preview-title"),
        closeBtn: document.getElementById("ojt-pdf-preview-close"),
        printBtn: document.getElementById("ojt-pdf-preview-print"),
        downloadBtn: document.getElementById("ojt-pdf-preview-download"),
      };
    }

    const overlay = document.createElement("div");
    overlay.id = "ojt-pdf-preview-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;display:none;z-index:20000;background:rgba(7,9,12,0.72);backdrop-filter:blur(1.5px);";

    overlay.innerHTML = `
      <div style="position:absolute;inset:26px;background:#f3f5f8;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 48px rgba(0,0,0,0.45);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #d8dee8;background:#fff;">
          <div id="ojt-pdf-preview-title" style="font:600 14px 'Segoe UI',Arial,sans-serif;color:#2a3340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Print Preview</div>
          <div style="display:flex;gap:8px;">
            <button id="ojt-pdf-preview-print" type="button" style="border:1px solid #243041;background:#243041;color:#fff;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Print</button>
            <button id="ojt-pdf-preview-download" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Download PDF</button>
            <button id="ojt-pdf-preview-close" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Close</button>
          </div>
        </div>
        <iframe id="ojt-pdf-preview-frame" title="PDF preview" style="border:0;width:100%;height:100%;background:#f3f5f8;"></iframe>
      </div>
    `;

    document.body.appendChild(overlay);

    return {
      overlay,
      frame: document.getElementById("ojt-pdf-preview-frame"),
      title: document.getElementById("ojt-pdf-preview-title"),
      closeBtn: document.getElementById("ojt-pdf-preview-close"),
      printBtn: document.getElementById("ojt-pdf-preview-print"),
      downloadBtn: document.getElementById("ojt-pdf-preview-download"),
    };
  }

  function openInlinePdfPreview(pdfBlobUrl, fileName) {
    const safeFileName = String(fileName || "ojt_students_report.pdf").trim();
    const ui = ensureInlinePreviewElements();

    const previousUrl = ui.overlay.dataset.blobUrl || "";
    if (previousUrl) {
      try {
        URL.revokeObjectURL(previousUrl);
      } catch (_error) {
        // Ignore stale URL cleanup failures.
      }
    }

    ui.overlay.dataset.blobUrl = pdfBlobUrl;
    ui.overlay.style.display = "block";
    ui.title.textContent = `Print Preview: ${safeFileName}`;
    ui.frame.src = pdfBlobUrl;

    const closePreview = () => {
      ui.overlay.style.display = "none";
      ui.frame.src = "about:blank";
      const activeUrl = ui.overlay.dataset.blobUrl || "";
      ui.overlay.dataset.blobUrl = "";
      if (activeUrl) {
        try {
          URL.revokeObjectURL(activeUrl);
        } catch (_error) {
          // Ignore cleanup failures.
        }
      }
    };

    ui.closeBtn.onclick = closePreview;
    ui.overlay.onclick = (event) => {
      if (event.target === ui.overlay) closePreview();
    };

    ui.downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = pdfBlobUrl;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    ui.printBtn.onclick = () => {
      try {
        if (ui.frame.contentWindow) {
          ui.frame.contentWindow.focus();
          ui.frame.contentWindow.print();
          return;
        }
      } catch (_error) {
        // Fall back to top-level print if iframe print fails.
      }
      window.print();
    };
  }

  async function exportVisibleOjtStudentsToPdf(options = {}) {
    const table = getTable();
    const rows = getVisibleRows(table);
    const columns = getExportableColumns(table);

    if (!rows.length)
      throw new Error("There are no visible OJT student rows to export.");
    if (!columns.length)
      throw new Error(
        "The OJT student table does not have exportable columns.",
      );
    if (!window.jspdf?.jsPDF)
      throw new Error("The PDF library is not available.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const headerImageDataUrl = await resolveHeaderImageDataUrl();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 32;
    let cursorY = 26;

    const imageProps = doc.getImageProperties(headerImageDataUrl);
    const headerWidth = pageWidth - marginX * 2;
    const headerHeight = Math.min(
      92,
      (imageProps.height / imageProps.width) * headerWidth,
    );
    doc.addImage(
      headerImageDataUrl,
      "PNG",
      marginX,
      cursorY,
      headerWidth,
      headerHeight,
    );
    cursorY += headerHeight + 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(24, 28, 34);
    doc.text("OJT Students Report", pageWidth / 2, cursorY, {
      align: "center",
    });
    cursorY += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(85, 93, 104);
    doc.text(
      `Generated: ${new Date().toLocaleString("en-US")}`,
      marginX,
      cursorY,
    );
    doc.text(`Rows: ${rows.length}`, pageWidth - marginX, cursorY, {
      align: "right",
    });
    cursorY += 16;

    const body = rows.map((row, index) => [
      String(index + 1),
      ...columns.map(({ index: cellIndex }) => resolveCellText(row, cellIndex)),
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [["No.", ...columns.map(({ label }) => label)]],
      body,
      margin: { left: marginX, right: marginX, bottom: 28 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.4,
        cellPadding: 4.5,
        overflow: "linebreak",
        lineColor: [210, 216, 224],
        lineWidth: 0.4,
        textColor: [24, 28, 34],
        valign: "middle",
      },
      headStyles: {
        fillColor: [24, 28, 34],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles: { 0: { cellWidth: 30, halign: "center" } },
      didDrawPage() {
        const pageNumber = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(100, 108, 118);
        doc.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 12, {
          align: "right",
        });
      },
    });

    const fileName = String(
      options.fileName || "ojt_students_report.pdf",
    ).trim();
    const pdfBlob = doc.output("blob");
    const pdfBlobUrl = URL.createObjectURL(pdfBlob);
    openInlinePdfPreview(pdfBlobUrl, fileName || "ojt_students_report.pdf");
    return true;
  }

  function initOjtStudentsExport() {
    const ui = window.OjtStudentsUI;
    if (!ui) return;

    const exportModal = document.getElementById("ojt-export-modal");
    const openBtn = document.getElementById("ojt-generate-btn");
    const cancelBtn = document.getElementById("ojt-export-cancel-btn");
    const csvBtn = document.getElementById("ojt-export-csv-btn");
    const excelBtn = document.getElementById("ojt-export-excel-btn");
    const pdfBtn = document.getElementById("ojt-export-pdf-btn");

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
      const csv = buildCsvFromVisibleTable(table);
      downloadBlob(csv, "text/csv;charset=utf-8", `${getReportName()}.csv`);
      ui.closeModal(exportModal);
      ui.showToast("CSV report downloaded.", "success");
    });

    excelBtn?.addEventListener("click", () => {
      const table = getTable();
      if (!table) return;
      const excelHtml = buildExcelHtml(table);
      downloadBlob(
        new Blob(["\ufeff", excelHtml], {
          type: "application/vnd.ms-excel;charset=utf-8",
        }),
        "application/vnd.ms-excel;charset=utf-8",
        `${getReportName()}.xls`,
      );
      ui.closeModal(exportModal);
      ui.showToast("Excel report downloaded.", "success");
    });

    pdfBtn?.addEventListener("click", async () => {
      const loadingToast = ui.showToast("Preparing PDF preview...", "info", 0);

      try {
        await exportVisibleOjtStudentsToPdf({
          fileName: `${getReportName()}.pdf`,
        });
        ui.closeModal(exportModal);
        ui.showToast("PDF preview is ready.", "success");
      } catch (error) {
        ui.showToast(error?.message || "PDF export failed.", "error");
      } finally {
        if (loadingToast && typeof loadingToast.remove === "function") {
          loadingToast.remove();
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOjtStudentsExport);
  } else {
    initOjtStudentsExport();
  }
})();
