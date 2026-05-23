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

  function getVisibleRows(table) {
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
      if (row.dataset.placeholder) return false;
      const style = window.getComputedStyle(row);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function getExportableColumns(table, options = {}) {
    if (!table) return [];
    const excludeIdAndLogo = Boolean(options.excludeIdAndLogo);

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
        if (excludeIdAndLogo) {
          const normalized = label.trim().toLowerCase();
          if (normalized === "id" || normalized === "logo") return false;
        }
        return true;
      });
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

  function escapeCsvCell(value) {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function resolveCellText(row, columnIndex) {
    const cell = row?.cells?.[columnIndex];
    if (!cell) return "";

    const img = cell.querySelector("img.external-company-logo");
    if (img) {
      const raw = String(img.getAttribute("src") || "").trim();
      if (raw && !raw.startsWith("data:image/svg+xml")) return raw;
      return "";
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

  function downloadTableAsHtmlDoc(table, filename, mime) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${table.outerHTML}</body></html>`;
    downloadBlob(html, mime, filename);
  }

  async function buildExcelHtml(table) {
    const columns = getExportableColumns(table);
    const rows = getVisibleRows(table);
    const generatedText = new Date().toLocaleString("en-US");
    const headingUtils = window.ReportExportUtils;

    if (!headingUtils?.buildExcelWorkbookHtml || !headingUtils?.escapeHtml) {
      throw new Error("The export heading utility is unavailable.");
    }

    const headerCells = columns
      .map(({ label }) => `<th>${headingUtils.escapeHtml(label)}</th>`)
      .join("");

    const bodyRows = rows
      .map((row) => {
        const cells = columns
          .map(
            ({ index }) =>
              `<td>${headingUtils.escapeHtml(resolveCellText(row, index))}</td>`,
          )
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return headingUtils.buildExcelWorkbookHtml({
      reportTitle: "External Partners Report",
      generatedText,
      rowsCount: rows.length,
      filterSummary: resolveFilterSummary(),
      headerCellsHtml: headerCells,
      bodyRowsHtml: bodyRows,
    });
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
    const existing = document.getElementById("external-pdf-preview-overlay");
    if (existing) {
      return {
        overlay: existing,
        frame: document.getElementById("external-pdf-preview-frame"),
        title: document.getElementById("external-pdf-preview-title"),
        closeBtn: document.getElementById("external-pdf-preview-close"),
        printBtn: document.getElementById("external-pdf-preview-print"),
        downloadBtn: document.getElementById("external-pdf-preview-download"),
      };
    }

    const overlay = document.createElement("div");
    overlay.id = "external-pdf-preview-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;display:none;z-index:20000;background:rgba(7,9,12,0.72);backdrop-filter:blur(1.5px);";

    overlay.innerHTML = `
      <div style="position:absolute;inset:26px;background:#f3f5f8;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 48px rgba(0,0,0,0.45);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #d8dee8;background:#fff;">
          <div id="external-pdf-preview-title" style="font:600 14px 'Segoe UI',Arial,sans-serif;color:#2a3340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Print Preview</div>
          <div style="display:flex;gap:8px;">
            <button id="external-pdf-preview-print" type="button" style="border:1px solid #243041;background:#243041;color:#fff;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Print</button>
            <button id="external-pdf-preview-download" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Download PDF</button>
            <button id="external-pdf-preview-close" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Close</button>
          </div>
        </div>
        <iframe id="external-pdf-preview-frame" title="PDF preview" style="border:0;width:100%;height:100%;background:#f3f5f8;"></iframe>
      </div>
    `;

    document.body.appendChild(overlay);

    return {
      overlay,
      frame: document.getElementById("external-pdf-preview-frame"),
      title: document.getElementById("external-pdf-preview-title"),
      closeBtn: document.getElementById("external-pdf-preview-close"),
      printBtn: document.getElementById("external-pdf-preview-print"),
      downloadBtn: document.getElementById("external-pdf-preview-download"),
    };
  }

  function openInlinePdfPreview(pdfBlobUrl, fileName) {
    const safeFileName = String(
      fileName || "external_partners_report.pdf",
    ).trim();
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

  async function exportVisibleExternalPartnersToPdf(options = {}) {
    const table = getTable();
    const rows = getVisibleRows(table);
    const columns = getExportableColumns(table, { excludeIdAndLogo: true });

    if (!rows.length) {
      throw new Error("There are no visible external partner rows to export.");
    }

    if (!columns.length) {
      throw new Error(
        "The external partner table does not have exportable columns.",
      );
    }

    if (!window.jspdf?.jsPDF) {
      throw new Error("The PDF library is not available.");
    }

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
    cursorY += headerHeight + 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(24, 28, 34);
    doc.text("External Partners Report", pageWidth / 2, cursorY, {
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
        fillColor: [25, 61, 109],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [246, 248, 251],
      },
      columnStyles: {
        0: { cellWidth: 30, halign: "center" },
      },
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
      options.fileName || "external_partners_report.pdf",
    ).trim();
    const pdfBlob = doc.output("blob");
    const pdfBlobUrl = URL.createObjectURL(pdfBlob);
    openInlinePdfPreview(
      pdfBlobUrl,
      fileName || "external_partners_report.pdf",
    );
    return true;
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
      const csv = buildCsvFromVisibleTable(table);
      downloadBlob(csv, "text/csv;charset=utf-8", `${getReportName()}.csv`);
      ui.closeModal(exportModal);
      ui.showToast("CSV report downloaded.", "success");
    });

    excelBtn?.addEventListener("click", async () => {
      const table = getTable();
      if (!table) return;
      try {
        const excelHtml = await buildExcelHtml(table);
        downloadBlob(
          new Blob(["\ufeff", excelHtml], {
            type: "application/vnd.ms-excel;charset=utf-8",
          }),
          "application/vnd.ms-excel;charset=utf-8",
          `${getReportName()}.xls`,
        );
        ui.closeModal(exportModal);
        ui.showToast("Excel report downloaded.", "success");
      } catch (error) {
        ui.showToast(error?.message || "Excel export failed.", "error");
      }
    });

    pdfBtn?.addEventListener("click", async () => {
      const loadingToast = ui.showToast("Preparing PDF preview...", "info", 0);

      try {
        await exportVisibleExternalPartnersToPdf({
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
    document.addEventListener("DOMContentLoaded", initExternalPartnersExport);
  } else {
    initExternalPartnersExport();
  }
})();
