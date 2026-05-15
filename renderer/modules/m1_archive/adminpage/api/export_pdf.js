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

  function resolveVisibleColumns() {
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
      return String(selectedOption?.textContent || select.value || "").trim();
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

  function resolveActiveFilterSummary() {
    const tags = Array.from(
      document.querySelectorAll("#active-filter-tags .filter-tag"),
    )
      .map((tag) => {
        const removeBtn = tag.querySelector(".filter-tag-remove");
        const clone = tag.cloneNode(true);
        clone.querySelector(".filter-tag-remove")?.remove();
        const text = String(clone.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (removeBtn && text.endsWith(removeBtn.textContent.trim())) {
          return text.slice(0, -removeBtn.textContent.trim().length).trim();
        }
        return text;
      })
      .filter(Boolean);

    return tags.length ? tags.join(" | ") : "Current view";
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
      image.onerror = () => {
        reject(new Error("Failed to load the PDF header image."));
      };
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureInlinePreviewElements() {
    const existing = document.getElementById("archive-pdf-preview-overlay");
    if (existing) {
      return {
        overlay: existing,
        frame: document.getElementById("archive-pdf-preview-frame"),
        title: document.getElementById("archive-pdf-preview-title"),
        closeBtn: document.getElementById("archive-pdf-preview-close"),
        printBtn: document.getElementById("archive-pdf-preview-print"),
        downloadBtn: document.getElementById("archive-pdf-preview-download"),
      };
    }

    const overlay = document.createElement("div");
    overlay.id = "archive-pdf-preview-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;display:none;z-index:20000;background:rgba(7,9,12,0.72);backdrop-filter:blur(1.5px);";

    overlay.innerHTML = `
      <div style="position:absolute;inset:26px;background:#f3f5f8;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 48px rgba(0,0,0,0.45);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #d8dee8;background:#fff;">
          <div id="archive-pdf-preview-title" style="font:600 14px 'Segoe UI',Arial,sans-serif;color:#2a3340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Print Preview</div>
          <div style="display:flex;gap:8px;">
            <button id="archive-pdf-preview-print" type="button" style="border:1px solid #243041;background:#243041;color:#fff;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Print</button>
            <button id="archive-pdf-preview-download" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Download PDF</button>
            <button id="archive-pdf-preview-close" type="button" style="border:1px solid #c6cedb;background:#fff;color:#243041;padding:7px 12px;border-radius:7px;font:500 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;">Close</button>
          </div>
        </div>
        <iframe id="archive-pdf-preview-frame" title="PDF preview" style="border:0;width:100%;height:100%;background:#f3f5f8;"></iframe>
      </div>
    `;

    document.body.appendChild(overlay);

    return {
      overlay,
      frame: document.getElementById("archive-pdf-preview-frame"),
      title: document.getElementById("archive-pdf-preview-title"),
      closeBtn: document.getElementById("archive-pdf-preview-close"),
      printBtn: document.getElementById("archive-pdf-preview-print"),
      downloadBtn: document.getElementById("archive-pdf-preview-download"),
    };
  }

  function openInlinePdfPreview(pdfBlobUrl, fileName) {
    const safeFileName = String(fileName || "archives_report.pdf").trim();
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

  async function exportVisibleArchivesToPdf(options = {}) {
    const rows = resolveVisibleArchiveRows();
    if (rows.length === 0) {
      throw new Error("There are no visible archive rows to export.");
    }

    const columns = resolveVisibleColumns();
    if (columns.length === 0) {
      throw new Error("The archive table does not have exportable columns.");
    }

    if (!window.jspdf?.jsPDF) {
      throw new Error("The PDF library is not available.");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const headerImageDataUrl = await resolveHeaderImageDataUrl();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 36;
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
    cursorY += headerHeight + 16;

    const reportTitle = "Thesis/Capstone Archives Report";
    const filterSummary = resolveActiveFilterSummary();
    const generatedText = `Generated: ${new Date().toLocaleString("en-US")}`;
    const showingText = `Rows: ${rows.length}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(24, 28, 34);
    doc.text(reportTitle, pageWidth / 2, cursorY, { align: "center" });
    cursorY += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(85, 93, 104);
    doc.text(generatedText, marginX, cursorY);
    doc.text(showingText, pageWidth - marginX, cursorY, { align: "right" });
    cursorY += 14;
    doc.text(`Filters: ${filterSummary}`, marginX, cursorY);
    cursorY += 18;

    const body = rows.map((row, index) => [
      String(index + 1),
      ...columns.map(({ index: cellIndex }) =>
        resolveCellText(row.cells[cellIndex]),
      ),
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [["No.", ...columns.map(({ label }) => label)]],
      body,
      margin: { left: marginX, right: marginX, bottom: 28 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 5,
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
        0: { cellWidth: 34, halign: "center" },
      },
      didDrawPage(data) {
        const pageNumber = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(100, 108, 118);
        doc.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 12, {
          align: "right",
        });
      },
    });

    const fileName = String(options.fileName || "archives_report.pdf").trim();
    const pdfBlob = doc.output("blob");
    const pdfBlobUrl = URL.createObjectURL(pdfBlob);
    openInlinePdfPreview(pdfBlobUrl, fileName || "archives_report.pdf");
    return true;
  }

  window.exportVisibleArchivesToPdf = exportVisibleArchivesToPdf;
})();
