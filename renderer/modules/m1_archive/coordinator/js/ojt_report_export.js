(function () {
  const REPORT_CONFIG = {
    section: {
      mode: "section",
      modalId: "coordinator-section-report-modal",
      triggerId: "sectionPdfReportBtn",
      title: "OJT Section Report",
      subtitle: "Generate a live PDF preview for your assigned sections.",
      reportNamePrefix: "ojt_section_report",
    },
    student: {
      mode: "student",
      modalId: "coordinator-student-report-modal",
      triggerId: "studentPdfReportBtn",
      title: "Student OJT Report",
      subtitle: "Generate a detailed PDF preview for the selected student.",
      reportNamePrefix: "ojt_student_report",
    },
  };

  const SECTION_STATUS_OPTIONS = [
    { value: "Pending Requirements", label: "Pending Requirements" },
    { value: "Pre-Deployment", label: "Pre-Deployment" },
    { value: "Deployed", label: "Deployed" },
    { value: "OJT Complete", label: "OJT Complete" },
  ];

  const SECTION_ORIENTATION_OPTIONS = [
    { value: "portrait", label: "Portrait" },
    { value: "landscape", label: "Horizontal" },
  ];

  const SECTION_REPORT_TITLE_KEY = "sas.ojt.section.report.title";

  const REQUIREMENT_OUTCOME_OPTIONS = [
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "submitted", label: "Submitted" },
    { value: "pending", label: "Pending" },
  ];

  let stylesInjected = false;
  let headerImagePromise = null;

  function ensureStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.textContent = `
      .report-trigger-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 38px;
        padding: 0 14px;
        border-radius: 10px;
        border: 1px solid rgba(157, 198, 255, 0.28);
        background: linear-gradient(180deg, rgba(157, 198, 255, 0.18), rgba(157, 198, 255, 0.08));
        color: var(--primary-text);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
      }
      .report-trigger-btn:hover {
        transform: translateY(-1px);
        border-color: var(--accent-blue);
        color: #fff;
        background: linear-gradient(180deg, rgba(157, 198, 255, 0.28), rgba(157, 198, 255, 0.12));
      }
      .report-trigger-btn svg {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        fill: none;
      }
      .ojt-report-overlay {
        position: fixed;
        inset: 0;
        z-index: 25000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(5, 7, 10, 0.74);
        backdrop-filter: blur(2px);
      }
      .ojt-report-overlay.open {
        display: flex;
      }
      .ojt-report-shell {
        width: min(1440px, 100%);
        height: min(900px, calc(100vh - 36px));
        display: grid;
        grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
        border-radius: 20px;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(21, 25, 31, 0.98), rgba(14, 17, 21, 0.98));
        border: 1px solid rgba(157, 198, 255, 0.16);
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
      }
      .ojt-report-sidebar {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 18px;
        border-right: 1px solid rgba(255, 255, 255, 0.06);
        overflow: auto;
      }
      .ojt-report-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      }
      .ojt-report-title {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.04em;
        color: #fff;
      }
      .ojt-report-subtitle {
        font-size: 12px;
        line-height: 1.55;
        color: var(--secondary-text);
      }
      .ojt-report-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(157, 198, 255, 0.04);
      }
      .ojt-report-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .ojt-report-section-title {
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fff;
      }
      .ojt-report-section-subtitle {
        font-size: 11px;
        color: var(--secondary-text);
        line-height: 1.45;
      }
      .ojt-report-title-editor {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: rgba(157, 198, 255, 0.04);
      }
      .ojt-report-title-editor-head {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ojt-report-title-editor-label {
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fff;
      }
      .ojt-report-title-editor-note {
        font-size: 11px;
        color: var(--secondary-text);
        line-height: 1.45;
      }
      .ojt-report-title-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .ojt-report-title-input {
        flex: 1;
        min-width: 0;
        height: 38px;
        border-radius: 10px;
        border: 1px solid rgba(157, 198, 255, 0.18);
        background: rgba(10, 14, 20, 0.55);
        color: #fff;
        padding: 0 12px;
        font-size: 12px;
        outline: none;
      }
      .ojt-report-title-input:focus {
        border-color: rgba(157, 198, 255, 0.48);
        box-shadow: 0 0 0 3px rgba(157, 198, 255, 0.08);
      }
      .ojt-report-title-save {
        border: 1px solid rgba(157, 198, 255, 0.2);
        background: rgba(157, 198, 255, 0.12);
        color: #fff;
        border-radius: 10px;
        height: 38px;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      .ojt-report-title-save:hover {
        border-color: rgba(157, 198, 255, 0.42);
        background: rgba(157, 198, 255, 0.18);
      }
      .ojt-report-title-feedback {
        min-height: 16px;
        font-size: 11px;
        color: #9fd3a9;
      }
      .ojt-report-title-feedback.error {
        color: #ff9f9f;
      }
      .ojt-report-checklist {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 250px;
        overflow: auto;
        padding-right: 4px;
      }
      .ojt-report-check {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 13px;
        color: var(--primary-text);
        line-height: 1.4;
      }
      .ojt-report-check input {
        margin-top: 2px;
        accent-color: #9dc6ff;
      }
      .ojt-report-orientation-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }
      .ojt-report-orientation-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .ojt-report-radio-btn {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(157, 198, 255, 0.16);
        background: rgba(157, 198, 255, 0.06);
        cursor: pointer;
      }
      .ojt-report-radio-btn:hover {
        border-color: rgba(157, 198, 255, 0.34);
        background: rgba(157, 198, 255, 0.1);
      }
      .ojt-report-radio-btn input {
        margin-top: 2px;
        accent-color: #9dc6ff;
      }
      .ojt-report-radio-btn strong {
        display: block;
        font-size: 12px;
        color: #fff;
      }
      .ojt-report-radio-btn small {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: var(--secondary-text);
        line-height: 1.35;
      }
      .ojt-report-check small {
        display: block;
        color: var(--secondary-text);
        font-size: 11px;
        margin-top: 2px;
      }
      .ojt-report-mini-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ojt-report-mini-btn {
        border: 1px solid rgba(157, 198, 255, 0.18);
        background: rgba(157, 198, 255, 0.08);
        color: var(--primary-text);
        border-radius: 9px;
        padding: 7px 10px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .ojt-report-mini-btn:hover {
        border-color: rgba(157, 198, 255, 0.38);
        background: rgba(157, 198, 255, 0.14);
      }
      .ojt-report-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: linear-gradient(180deg, rgba(243, 245, 248, 0.98), rgba(240, 243, 247, 0.98));
      }
      .ojt-report-mainbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(36, 48, 65, 0.12);
        background: #fff;
      }
      .ojt-report-main-title {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .ojt-report-main-title strong {
        color: #1c2430;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }
      .ojt-report-main-title span {
        color: #667182;
        font-size: 12px;
        line-height: 1.35;
      }
      .ojt-report-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ojt-report-action-btn {
        border: 1px solid #c6cedb;
        background: #fff;
        color: #243041;
        border-radius: 9px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .ojt-report-action-btn.primary {
        background: #243041;
        color: #fff;
        border-color: #243041;
      }
      .ojt-report-action-btn:hover {
        filter: brightness(0.98);
      }
      .ojt-report-preview-wrap {
        position: relative;
        flex: 1;
        min-height: 0;
        background: #eef2f7;
      }
      .ojt-report-preview-frame {
        width: 100%;
        height: 100%;
        border: 0;
        background: #eef2f7;
      }
      .ojt-report-preview-loading,
      .ojt-report-preview-empty,
      .ojt-report-preview-error {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        color: #516072;
        font-size: 14px;
        line-height: 1.5;
        background: linear-gradient(180deg, rgba(243, 245, 248, 0.9), rgba(235, 239, 244, 0.9));
      }
      .ojt-report-preview-error {
        color: #b12f2f;
      }
      .ojt-report-preview-note {
        margin-top: 8px;
        font-size: 11px;
        color: #718096;
      }
      .ojt-report-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ojt-report-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(157, 198, 255, 0.22);
        background: rgba(157, 198, 255, 0.08);
        font-size: 11px;
        font-weight: 800;
        color: #eef5ff;
      }
      .ojt-report-badge::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #d6e8ff;
        flex-shrink: 0;
      }
      .ojt-report-empty-state {
        padding: 14px;
        border-radius: 12px;
        border: 1px dashed rgba(157, 198, 255, 0.22);
        color: var(--secondary-text);
        font-size: 12px;
        line-height: 1.45;
        background: rgba(255, 255, 255, 0.04);
      }
      @media (max-width: 1100px) {
        .ojt-report-shell {
          grid-template-columns: 1fr;
          height: min(930px, calc(100vh - 36px));
        }
        .ojt-report-sidebar {
          border-right: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          max-height: 360px;
        }
      }
      @media (max-width: 720px) {
        .ojt-report-shell {
          height: calc(100vh - 18px);
        }
        .ojt-report-mainbar,
        .ojt-report-sidebar {
          padding: 12px;
        }
        .ojt-report-mainbar {
          flex-direction: column;
          align-items: stretch;
        }
        .ojt-report-orientation-options {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getApi(options) {
    if (typeof options?.getApi === "function") return options.getApi();
    if (window.electronAPI) return window.electronAPI;
    try {
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.electronAPI
      ) {
        return window.parent.electronAPI;
      }
    } catch (_error) {}
    try {
      if (window.top && window.top !== window && window.top.electronAPI) {
        return window.top.electronAPI;
      }
    } catch (_error) {}
    return null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function text(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeStatus(value) {
    const normalized = text(value).toLowerCase();
    if (!normalized) return "Pending Requirements";
    if (normalized === "pending requirements") return "Pending Requirements";
    if (normalized === "pre-deployment") return "Pre-Deployment";
    if (normalized === "deployed") return "Deployed";
    if (normalized === "ojt complete") return "OJT Complete";
    return normalized
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function normalizeOutcome(value) {
    const normalized = text(value).toLowerCase();
    if (normalized === "verified") return "approved";
    if (normalized === "rejected") return "rejected";
    if (normalized === "submitted") return "submitted";
    return normalized || "pending";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value) || "—";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value) || "—";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMinutes(minutes) {
    const total = Number(minutes) || 0;
    if (!total) return "—";
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (!hours) return `${mins}m`;
    return `${hours}h ${mins}m`;
  }

  function sanitizeFileNameSegment(value) {
    return text(value)
      .replace(/[<>:"/\\|?*]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
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

  async function resolveHeaderImageDataUrl() {
    if (headerImagePromise) return headerImagePromise;

    headerImagePromise = (async () => {
      const defaultHeaderUrl = new URL(
        "../../images/header-template.png",
        window.location.href,
      ).href;
      let candidateUrl = defaultHeaderUrl;

      try {
        const api = getApi();
        if (api?.getAppSettings) {
          const settingsResult = await api.getAppSettings();
          if (settingsResult?.success && settingsResult.settings) {
            const selectedPath = text(
              settingsResult.settings.selectedPdfReportHeaderPath || "",
            );
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
    })();

    return headerImagePromise;
  }

  function createPreviewModal(mode) {
    const config = REPORT_CONFIG[mode];
    const existing = document.getElementById(config.modalId);
    if (existing) {
      return {
        overlay: existing,
        sidebar: existing.querySelector(".ojt-report-sidebar"),
        title: existing.querySelector("[data-role='report-title']"),
        subtitle: existing.querySelector("[data-role='report-subtitle']"),
        summary: existing.querySelector("[data-role='report-summary']"),
        content: existing.querySelector("[data-role='report-content']"),
        iframe: existing.querySelector("[data-role='report-iframe']"),
        loading: existing.querySelector("[data-role='report-loading']"),
        empty: existing.querySelector("[data-role='report-empty']"),
        error: existing.querySelector("[data-role='report-error']"),
        closeBtn: existing.querySelector("[data-action='close-report']"),
        downloadBtn: existing.querySelector("[data-action='download-report']"),
        printBtn: existing.querySelector("[data-action='print-report']"),
      };
    }

    const overlay = document.createElement("div");
    overlay.id = config.modalId;
    overlay.className = "ojt-report-overlay";
    overlay.innerHTML = `
      <div class="ojt-report-shell" role="dialog" aria-modal="true" aria-label="${escapeHtml(config.title)}">
        <aside class="ojt-report-sidebar">
          <div class="ojt-report-header">
            <div class="ojt-report-title" data-role="report-title">${escapeHtml(config.title)}</div>
            <div class="ojt-report-subtitle" data-role="report-subtitle">${escapeHtml(config.subtitle)}</div>
          </div>
          ${
            config.mode === "section"
              ? `
          <div class="ojt-report-title-editor">
            <div class="ojt-report-title-editor-head">
              <div class="ojt-report-title-editor-label">Report Title</div>
              <div class="ojt-report-title-editor-note">Change the section report title used in the preview and PDF export.</div>
            </div>
            <div class="ojt-report-title-row">
              <input type="text" class="ojt-report-title-input" data-role="section-title-input" maxlength="80" placeholder="Enter report title" />
              <button type="button" class="ojt-report-title-save" data-action="save-section-title">Save</button>
            </div>
            <div class="ojt-report-title-feedback" data-role="section-title-feedback"></div>
          </div>
          `
              : ""
          }
          <div class="ojt-report-section">
            <div class="ojt-report-section-head">
              <div>
                <div class="ojt-report-section-title">Live Summary</div>
                <div class="ojt-report-section-subtitle" data-role="report-summary">Loading report data...</div>
              </div>
            </div>
            <div class="ojt-report-badge-row" data-role="report-summary-badges"></div>
          </div>
          <div class="ojt-report-section" data-role="filter-section"></div>
          <div class="ojt-report-section" data-role="detail-section"></div>
          <div class="ojt-report-mini-actions">
            <button type="button" class="ojt-report-mini-btn" data-action="close-report">Close</button>
            <button type="button" class="ojt-report-mini-btn" data-action="download-report">Download PDF</button>
            <button type="button" class="ojt-report-mini-btn" data-action="print-report">Print</button>
          </div>
        </aside>
        <main class="ojt-report-main">
          <div class="ojt-report-mainbar">
            <div class="ojt-report-main-title">
              <strong data-role="report-content">PDF Preview</strong>
              <span>Change filters on the left and the preview updates automatically.</span>
            </div>
            <div class="ojt-report-toolbar">
              <button type="button" class="ojt-report-action-btn" data-action="close-report">Close</button>
              <button type="button" class="ojt-report-action-btn" data-action="download-report">Download</button>
              <button type="button" class="ojt-report-action-btn primary" data-action="print-report">Print</button>
            </div>
          </div>
          <div class="ojt-report-preview-wrap">
            <div class="ojt-report-preview-loading" data-role="report-loading">Preparing preview...</div>
            <div class="ojt-report-preview-empty" data-role="report-empty" style="display:none;">Select filters to build the report.</div>
            <div class="ojt-report-preview-error" data-role="report-error" style="display:none;"></div>
            <iframe class="ojt-report-preview-frame" data-role="report-iframe" title="PDF preview"></iframe>
          </div>
        </main>
      </div>
    `;

    document.body.appendChild(overlay);
    return {
      overlay,
      sidebar: overlay.querySelector(".ojt-report-sidebar"),
      title: overlay.querySelector("[data-role='report-title']"),
      subtitle: overlay.querySelector("[data-role='report-subtitle']"),
      summary: overlay.querySelector("[data-role='report-summary']"),
      content: overlay.querySelector("[data-role='report-content']"),
      titleInput: overlay.querySelector("[data-role='section-title-input']"),
      titleFeedback: overlay.querySelector(
        "[data-role='section-title-feedback']",
      ),
      iframe: overlay.querySelector("[data-role='report-iframe']"),
      loading: overlay.querySelector("[data-role='report-loading']"),
      empty: overlay.querySelector("[data-role='report-empty']"),
      error: overlay.querySelector("[data-role='report-error']"),
      closeBtn: overlay.querySelector("[data-action='close-report']"),
      downloadBtn: overlay.querySelector("[data-action='download-report']"),
      printBtn: overlay.querySelector("[data-action='print-report']"),
      saveTitleBtn: overlay.querySelector("[data-action='save-section-title']"),
    };
  }

  function setModalVisibility(modal, visible) {
    if (!modal) return;
    modal.classList.toggle("open", visible);
    document.body.style.overflow = visible ? "hidden" : "";
  }

  function showPreviewState(modal, state, message) {
    const loading = modal.loading;
    const empty = modal.empty;
    const error = modal.error;
    if (loading) loading.style.display = state === "loading" ? "flex" : "none";
    if (empty) empty.style.display = state === "empty" ? "flex" : "none";
    if (error) {
      error.style.display = state === "error" ? "flex" : "none";
      error.textContent = state === "error" ? message || "" : "";
    }
  }

  function createCheckbox({ id, label, checked, note, value, className = "" }) {
    return `
      <label class="ojt-report-check ${className}">
        <input type="checkbox" id="${escapeHtml(id)}" value="${escapeHtml(value ?? id)}" ${checked ? "checked" : ""} />
        <span>
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </span>
      </label>
    `;
  }

  function createRadio({
    id,
    name,
    label,
    checked,
    note,
    value,
    className = "",
  }) {
    return `
      <label class="ojt-report-check ${className}">
        <input type="radio" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value ?? id)}" ${checked ? "checked" : ""} />
        <span>
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </span>
      </label>
    `;
  }

  function normalizeSectionReportTitle(value) {
    const title = text(value).replace(/\s+/g, " ");
    return title || REPORT_CONFIG.section.title;
  }

  function getSavedSectionReportTitle() {
    try {
      return normalizeSectionReportTitle(
        localStorage.getItem(SECTION_REPORT_TITLE_KEY),
      );
    } catch (_error) {
      return REPORT_CONFIG.section.title;
    }
  }

  function saveSectionReportTitle(title) {
    const normalized = normalizeSectionReportTitle(title);
    localStorage.setItem(SECTION_REPORT_TITLE_KEY, normalized);
    return normalized;
  }

  function buildSectionFilterMarkup(state) {
    const sectionItems = state.sections.map((section) =>
      createCheckbox({
        id: `section-opt-${state.id}-${section.section_name}`,
        label: section.section_name,
        checked: true,
        note: `${Number(section.student_count) || 0} students`,
        value: section.section_name,
      }),
    );

    const statusItems = SECTION_STATUS_OPTIONS.map((option) =>
      createCheckbox({
        id: `status-opt-${state.id}-${option.value}`,
        label: option.label,
        checked: true,
        value: option.value,
      }),
    );

    return `
      <div class="ojt-report-section-head">
        <div>
          <div class="ojt-report-section-title">Sections</div>
          <div class="ojt-report-section-subtitle">Choose the assigned sections to include in the report.</div>
        </div>
        <div class="ojt-report-mini-actions">
          <button type="button" class="ojt-report-mini-btn" data-action="sections-all">All</button>
          <button type="button" class="ojt-report-mini-btn" data-action="sections-none">None</button>
        </div>
      </div>
      <div class="ojt-report-checklist" data-role="section-list">${sectionItems.join("")}</div>
      <div style="height: 1px; background: rgba(255,255,255,0.07);"></div>
      <div class="ojt-report-section-head">
        <div>
          <div class="ojt-report-section-title">OJT Status</div>
          <div class="ojt-report-section-subtitle">Filter the student rows by deployment status.</div>
        </div>
      </div>
      <div class="ojt-report-checklist" data-role="status-list">${statusItems.join("")}</div>
      <div style="height: 1px; background: rgba(255,255,255,0.07);"></div>
      <div class="ojt-report-section-head">
        <div>
          <div class="ojt-report-section-title">Report Extras</div>
          <div class="ojt-report-section-subtitle">Include dashboard-style chart summaries in the PDF.</div>
        </div>
      </div>
      <div class="ojt-report-orientation-group">
        <div class="ojt-report-section-head">
          <div>
            <div class="ojt-report-section-title">Page Orientation</div>
            <div class="ojt-report-section-subtitle">Choose how the PDF preview and printed file should be laid out.</div>
          </div>
        </div>
        <div class="ojt-report-orientation-options">
          ${SECTION_ORIENTATION_OPTIONS.map((option, index) =>
            createRadio({
              id: `section-orientation-${state.id}-${option.value}`,
              name: `section-orientation-${state.id}`,
              label: option.label,
              checked: index === 0,
              note:
                option.value === "portrait"
                  ? "Best for fewer columns and compact summaries."
                  : "Best for wider tables and charts.",
              value: option.value,
              className: "ojt-report-radio-btn",
            }),
          ).join("")}
        </div>
      </div>
      <div class="ojt-report-checklist">
        ${createCheckbox({
          id: `section-charts-${state.id}`,
          label: "Show charts (dashboard style)",
          checked: false,
          note: "Adds deployment status, section population, and specialization charts.",
          value: "charts",
        })}
        ${createCheckbox({
          id: `section-partner-${state.id}`,
          label: "Show partner column",
          checked: true,
          note: "Includes the external partner column in the student table.",
          value: "partner",
        })}
        ${createCheckbox({
          id: `section-specialization-${state.id}`,
          label: "Show specialization column",
          checked: true,
          note: "Includes the specialization / nature of business column.",
          value: "specialization",
        })}
        ${createCheckbox({
          id: `section-email-${state.id}`,
          label: "Show student email",
          checked: false,
          note: "Adds an email column in the student table.",
          value: "email",
        })}
        ${createCheckbox({
          id: `section-phone-${state.id}`,
          label: "Show student phone",
          checked: false,
          note: "Adds a contact number column in the student table.",
          value: "phone",
        })}
      </div>
    `;
  }

  function buildStudentFilterMarkup(state) {
    const detailItems = [
      createCheckbox({
        id: `detail-profile-${state.id}`,
        label: "Profile information",
        checked: true,
        note: "Name, contact, section, partner, and status fields.",
        value: "profile",
      }),
      createCheckbox({
        id: `detail-attendance-${state.id}`,
        label: "Attendance records",
        checked: true,
        note: "Daily time records with totals.",
        value: "attendance",
      }),
      createCheckbox({
        id: `detail-weekly-${state.id}`,
        label: "Weekly reports",
        checked: true,
        note: "Weekly submissions and review status.",
        value: "weekly",
      }),
    ];

    const prePostItems = [
      createCheckbox({
        id: `detail-pre-${state.id}`,
        label: "Pre requirements",
        checked: true,
        note: "Requirement entries from the pre-OJT set.",
        value: "pre",
      }),
      createCheckbox({
        id: `detail-post-${state.id}`,
        label: "Post requirements",
        checked: true,
        note: "Requirement entries from the post-OJT set.",
        value: "post",
      }),
    ];

    const outcomeItems = REQUIREMENT_OUTCOME_OPTIONS.map((option) =>
      createCheckbox({
        id: `outcome-${state.id}-${option.value}`,
        label: option.label,
        checked: true,
        value: option.value,
      }),
    );

    return `
      <div>
        <div class="ojt-report-section-head">
          <div>
            <div class="ojt-report-section-title">Report Blocks</div>
            <div class="ojt-report-section-subtitle">Toggle which student sections appear in the PDF.</div>
          </div>
        </div>
        <div class="ojt-report-checklist">${detailItems.join("")}</div>
      </div>
      <div style="height: 1px; background: rgba(255,255,255,0.07);"></div>
      <div>
        <div class="ojt-report-section-head">
          <div>
            <div class="ojt-report-section-title">Requirements</div>
            <div class="ojt-report-section-subtitle">Choose the requirement groups and outcomes to include.</div>
          </div>
        </div>
        <div class="ojt-report-checklist">${prePostItems.join("")}</div>
      </div>
      <div>
        <div class="ojt-report-section-head">
          <div>
            <div class="ojt-report-section-title">Requirement Outcome</div>
            <div class="ojt-report-section-subtitle">Show approved, rejected, or both requirement results.</div>
          </div>
        </div>
        <div class="ojt-report-checklist">${outcomeItems.join("")}</div>
      </div>
    `;
  }

  function getSelectedValues(container, selector) {
    return Array.from(container.querySelectorAll(selector))
      .filter((input) => input.checked)
      .map((input) => String(input.value || input.id || "").trim())
      .filter(Boolean);
  }

  function collectSectionFilters(modal, state) {
    const selectedSections = getSelectedValues(
      modal.overlay,
      `[id^='section-opt-${state.id}-']`,
    );
    const selectedStatuses = getSelectedValues(
      modal.overlay,
      `[id^='status-opt-${state.id}-']`,
    ).map(normalizeStatus);
    const includeCharts = Boolean(
      modal.overlay.querySelector(`#section-charts-${state.id}`)?.checked,
    );
    const orientation =
      modal.overlay.querySelector(
        `input[name='section-orientation-${state.id}']:checked`,
      )?.value || "portrait";
    const includeEmail = Boolean(
      modal.overlay.querySelector(`#section-email-${state.id}`)?.checked,
    );
    const includePhone = Boolean(
      modal.overlay.querySelector(`#section-phone-${state.id}`)?.checked,
    );
    const includePartner = Boolean(
      modal.overlay.querySelector(`#section-partner-${state.id}`)?.checked,
    );
    const includeSpecialization = Boolean(
      modal.overlay.querySelector(`#section-specialization-${state.id}`)
        ?.checked,
    );
    return {
      selectedSections,
      selectedStatuses,
      includeCharts,
      orientation,
      includeEmail,
      includePhone,
      includePartner,
      includeSpecialization,
    };
  }

  function collectStudentFilters(modal, state) {
    const includeProfile = Boolean(
      modal.overlay.querySelector(`#detail-profile-${state.id}`)?.checked,
    );
    const includeAttendance = Boolean(
      modal.overlay.querySelector(`#detail-attendance-${state.id}`)?.checked,
    );
    const includeWeekly = Boolean(
      modal.overlay.querySelector(`#detail-weekly-${state.id}`)?.checked,
    );
    const includePre = Boolean(
      modal.overlay.querySelector(`#detail-pre-${state.id}`)?.checked,
    );
    const includePost = Boolean(
      modal.overlay.querySelector(`#detail-post-${state.id}`)?.checked,
    );
    const outcomes = getSelectedValues(
      modal.overlay,
      `[id^='outcome-${state.id}-']`,
    ).map(normalizeOutcome);

    return {
      includeProfile,
      includeAttendance,
      includeWeekly,
      includePre,
      includePost,
      outcomes,
    };
  }

  function setSummary(modal, textValue, badges = []) {
    if (modal.summary) modal.summary.textContent = textValue;
    const row = modal.overlay.querySelector(
      "[data-role='report-summary-badges']",
    );
    if (!row) return;
    row.innerHTML = badges
      .map(
        (badge) => `<span class="ojt-report-badge">${escapeHtml(badge)}</span>`,
      )
      .join("");
  }

  function renderSectionPdfRows(students, filters) {
    const head = ["Student ID", "Name", "Section", "Status"];
    if (filters.includeEmail) head.splice(2, 0, "Email");
    if (filters.includePhone)
      head.splice(2 + (filters.includeEmail ? 1 : 0), 0, "Phone");
    if (filters.includePartner) head.push("Partner");
    if (filters.includeSpecialization) head.push("Specialization");

    const body = students
      .filter((student) =>
        filters.selectedSections.includes(text(student.section)),
      )
      .filter((student) =>
        filters.selectedStatuses.includes(normalizeStatus(student.status)),
      )
      .map((student) => {
        const row = [
          text(student.student_id) || "—",
          text(student.display_name || student.name) || "—",
        ];
        if (filters.includeEmail) {
          row.push(text(student.email) || "—");
        }
        if (filters.includePhone) {
          row.push(
            text(
              student.contact_no || student.phone || student.contact_number,
            ) || "—",
          );
        }
        row.push(text(student.section) || "—", normalizeStatus(student.status));
        if (filters.includePartner) {
          row.push(text(student.external_partner_assigned) || "—");
        }
        if (filters.includeSpecialization) {
          row.push(text(student.nature_of_business) || "—");
        }
        return row;
      });

    return { head, body };
  }

  function buildSectionColumnStyles(headers, pageWidth, marginX) {
    const weights = {
      "Student ID": 0.9,
      Name: 1.4,
      Email: 1.8,
      Phone: 1.2,
      Section: 1.1,
      Status: 1.1,
      Partner: 1.5,
      Specialization: 1.7,
    };
    const availableWidth = Math.max(220, pageWidth - marginX * 2);
    const totalWeight = headers.reduce(
      (sum, header) => sum + (weights[header] || 1),
      0,
    );

    return headers.reduce((styles, header, index) => {
      const weight = weights[header] || 1;
      const width = Math.max(
        42,
        Math.floor((availableWidth * weight) / totalWeight),
      );
      styles[index] = { cellWidth: width };
      return styles;
    }, {});
  }

  function toSortedEntries(entriesMap) {
    return Object.entries(entriesMap)
      .map(([label, value]) => ({ label, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }

  function buildSectionChartMetrics(filteredStudents) {
    const deploymentStatusMap = {};
    const populationPerSectionMap = {};
    const specializationMap = {};

    for (const student of filteredStudents) {
      const status = normalizeStatus(student.status);
      const sectionName = text(student.section) || "Unassigned";
      const specialization = text(student.nature_of_business) || "Unspecified";

      deploymentStatusMap[status] = (deploymentStatusMap[status] || 0) + 1;
      populationPerSectionMap[sectionName] =
        (populationPerSectionMap[sectionName] || 0) + 1;

      if (status === "Deployed") {
        specializationMap[specialization] =
          (specializationMap[specialization] || 0) + 1;
      }
    }

    return {
      deploymentStatusEntries: toSortedEntries(deploymentStatusMap),
      populationPerSectionEntries: toSortedEntries(populationPerSectionMap),
      specializationEntries: toSortedEntries(specializationMap),
    };
  }

  function drawSectionMetricChart(doc, options) {
    const {
      title,
      entries,
      x,
      y,
      width,
      maxRows = 6,
      barColor = [25, 61, 109],
    } = options;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(24, 28, 34);
    doc.text(title, x, y);

    const chartEntries = (entries || []).slice(0, maxRows);
    if (!chartEntries.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(122, 132, 145);
      doc.text("No data for this chart.", x, y + 14);
      return 30;
    }

    const maxValue = Math.max(
      ...chartEntries.map((entry) => Number(entry.value) || 0),
      1,
    );
    const rowHeight = 16;
    const barStartX = x + 82;
    const barMaxWidth = Math.max(45, width - 130);
    let cursorY = y + 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    for (const entry of chartEntries) {
      const label = text(entry.label) || "Unlabeled";
      const value = Number(entry.value) || 0;
      const barWidth = Math.max(
        2,
        Math.round((value / maxValue) * barMaxWidth),
      );

      doc.setTextColor(45, 55, 69);
      doc.text(label.slice(0, 18), x, cursorY + 6);

      doc.setDrawColor(216, 224, 234);
      doc.setFillColor(240, 244, 249);
      doc.roundedRect(barStartX, cursorY, barMaxWidth, 8, 2, 2, "FD");

      doc.setFillColor(...barColor);
      doc.roundedRect(barStartX, cursorY, barWidth, 8, 2, 2, "F");

      doc.setTextColor(60, 72, 89);
      doc.text(String(value), barStartX + barMaxWidth + 6, cursorY + 6);

      cursorY += rowHeight;
    }

    return cursorY - y + 4;
  }

  function renderRequirementRows(items, selectedOutcomes) {
    return items
      .map((item) => {
        const template = item?.template || {};
        const submission = item?.submission || null;
        const outcome = normalizeOutcome(
          submission?.status || template?.status || "pending",
        );
        return {
          outcome,
          row: [
            text(template.name) || "Requirement",
            text(template.scope) || "—",
            outcome === "approved"
              ? "Approved"
              : outcome === "rejected"
                ? "Rejected"
                : outcome === "submitted"
                  ? "Submitted"
                  : "Pending",
            formatDate(
              submission?.verified_at ||
                submission?.updated_at ||
                submission?.created_at,
            ),
            text(submission?.notes) || "—",
          ],
        };
      })
      .filter((entry) => selectedOutcomes.includes(entry.outcome))
      .map((entry) => entry.row);
  }

  function getStudentSummary(student) {
    return [
      `ID: ${text(student?.student_id) || "—"}`,
      `Section: ${text(student?.section) || "—"}`,
      `Status: ${normalizeStatus(student?.status)}`,
    ];
  }

  async function loadSectionData(api) {
    const sectionResult = await api.getCoordinatorSections();
    if (!sectionResult?.success) {
      throw new Error(
        sectionResult?.message || "Failed to load assigned sections.",
      );
    }

    const sections = Array.isArray(sectionResult.sections)
      ? sectionResult.sections
      : [];
    const studentResponses = await Promise.all(
      sections.map(async (section) => {
        const result = await api.getCoordinatorSectionStudents(
          section.section_name,
        );
        if (!result?.success) {
          throw new Error(
            result?.message ||
              `Failed to load students for ${section.section_name}.`,
          );
        }
        return {
          section_name: section.section_name,
          students: Array.isArray(result.students) ? result.students : [],
        };
      }),
    );

    return {
      sections,
      sectionsByName: new Map(
        studentResponses.map((entry) => [entry.section_name, entry.students]),
      ),
    };
  }

  async function loadStudentData(api, studentId) {
    const id = text(studentId);
    if (!id) throw new Error("Student ID is required for the report.");

    const [
      profileResult,
      preRequirementsResult,
      postRequirementsResult,
      attendanceResult,
      weeklyResult,
    ] = await Promise.all([
      api.getCoordinatorStudentProfile(id),
      api.getStudentRequirements({ studentId: id, type: "pre" }),
      api.getStudentRequirements({ studentId: id, type: "post" }),
      api.getOjtAttendance({ studentId: id }),
      api.getOjtWeeklyReports(id),
    ]);

    if (!profileResult?.success) {
      throw new Error(
        profileResult?.message || "Failed to load student profile.",
      );
    }
    if (!preRequirementsResult?.success) {
      throw new Error(
        preRequirementsResult?.message || "Failed to load pre requirements.",
      );
    }
    if (!postRequirementsResult?.success) {
      throw new Error(
        postRequirementsResult?.message || "Failed to load post requirements.",
      );
    }
    if (!attendanceResult?.success) {
      throw new Error(
        attendanceResult?.message || "Failed to load attendance records.",
      );
    }
    if (!weeklyResult?.success) {
      throw new Error(
        weeklyResult?.message || "Failed to load weekly reports.",
      );
    }

    return {
      student: profileResult.student || null,
      requirements: {
        pre: Array.isArray(preRequirementsResult.requirements)
          ? preRequirementsResult.requirements
          : [],
        post: Array.isArray(postRequirementsResult.requirements)
          ? postRequirementsResult.requirements
          : [],
      },
      attendance: Array.isArray(attendanceResult.records)
        ? attendanceResult.records
        : [],
      attendanceSummary: attendanceResult.summary || null,
      weeklyReports: Array.isArray(weeklyResult.reports)
        ? weeklyResult.reports
        : [],
    };
  }

  function updateIframe(modal, blobUrl, fileName) {
    if (modal.iframe) {
      modal.iframe.src = blobUrl;
    }
    if (modal.content) {
      modal.content.textContent = `PDF Preview: ${fileName}`;
    }
  }

  function clearIframe(modal) {
    if (modal.iframe) {
      modal.iframe.src = "about:blank";
    }
  }

  function wireDownloadAndPrint(modal, state) {
    const fileName = state.currentFileName || "report.pdf";
    const blobUrl = state.currentBlobUrl || "";
    const download = () => {
      if (!blobUrl) return;
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    const printReport = () => {
      if (!blobUrl || !modal.iframe) return;
      try {
        const frameWindow = modal.iframe.contentWindow;
        if (frameWindow) {
          frameWindow.focus();
          frameWindow.print();
          return;
        }
      } catch (_error) {}
      window.print();
    };

    if (modal.downloadBtn) modal.downloadBtn.onclick = download;
    if (modal.printBtn) modal.printBtn.onclick = printReport;
    const downloadButtons = modal.overlay.querySelectorAll(
      "[data-action='download-report']",
    );
    downloadButtons.forEach((button) => {
      button.onclick = download;
    });
    const printButtons = modal.overlay.querySelectorAll(
      "[data-action='print-report']",
    );
    printButtons.forEach((button) => {
      button.onclick = printReport;
    });
  }

  async function buildSectionPdf(state, filters) {
    const api = state.api;
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error("The PDF library is not available.");

    const students = [];
    for (const sectionName of filters.selectedSections) {
      const sectionStudents = state.sectionsByName.get(sectionName) || [];
      students.push(
        ...sectionStudents.map((student) => ({
          ...student,
          section: text(student.section) || sectionName,
        })),
      );
    }

    const filteredStudents = students
      .filter((student) =>
        filters.selectedSections.includes(text(student.section)),
      )
      .filter((student) =>
        filters.selectedStatuses.includes(normalizeStatus(student.status)),
      );
    const tableData = renderSectionPdfRows(filteredStudents, {
      selectedSections: filters.selectedSections,
      selectedStatuses: filters.selectedStatuses,
      includeEmail: filters.includeEmail,
      includePhone: filters.includePhone,
      includePartner: filters.includePartner,
      includeSpecialization: filters.includeSpecialization,
    });
    const rows = tableData.body;
    const orientation =
      filters.orientation === "landscape" ? "landscape" : "portrait";
    const reportTitle = normalizeSectionReportTitle(state.reportTitle);
    const doc = new jsPDF({
      orientation,
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
      86,
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
    cursorY += headerHeight + 12;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(24, 28, 34);
    doc.text(reportTitle, pageWidth / 2, cursorY, { align: "center" });
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

    const summarySections = filters.selectedSections.join(", ") || "None";
    const summaryStatuses = filters.selectedStatuses.join(", ") || "None";
    const summaryLines = [
      `Sections: ${summarySections}`,
      `Statuses: ${summaryStatuses}`,
      `Orientation: ${orientation === "landscape" ? "Horizontal" : "Portrait"}`,
      `Contact fields: ${
        [
          filters.includeEmail ? "Email" : null,
          filters.includePhone ? "Phone" : null,
          filters.includePartner ? "Partner" : null,
          filters.includeSpecialization ? "Specialization" : null,
        ]
          .filter(Boolean)
          .join(", ") || "None"
      }`,
      `Matching students: ${rows.length}`,
    ];
    const wrappedSummary = doc.splitTextToSize(
      summaryLines.join(" | "),
      pageWidth - marginX * 2,
    );
    doc.text(wrappedSummary, marginX, cursorY);
    cursorY += wrappedSummary.length * 12 + 6;

    if (filters.includeCharts) {
      const metrics = buildSectionChartMetrics(filteredStudents);
      const chartBlockWidth = pageWidth - marginX * 2;
      const chartGap = 10;

      const neededHeight = 220;
      if (cursorY + neededHeight > pageHeight - 46) {
        doc.addPage();
        cursorY = 32;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(24, 28, 34);
      doc.text("Charts", marginX, cursorY);
      cursorY += 12;

      const statusHeight = drawSectionMetricChart(doc, {
        title: "Deployment Status",
        entries: metrics.deploymentStatusEntries,
        x: marginX,
        y: cursorY,
        width: chartBlockWidth,
        maxRows: 5,
        barColor: [25, 61, 109],
      });
      cursorY += statusHeight + chartGap;

      const sectionHeight = drawSectionMetricChart(doc, {
        title: "Population Per Section",
        entries: metrics.populationPerSectionEntries,
        x: marginX,
        y: cursorY,
        width: chartBlockWidth,
        maxRows: 6,
        barColor: [64, 99, 146],
      });
      cursorY += sectionHeight + chartGap;

      const specializationHeight = drawSectionMetricChart(doc, {
        title: "Deployment by Specialization",
        entries: metrics.specializationEntries,
        x: marginX,
        y: cursorY,
        width: chartBlockWidth,
        maxRows: 6,
        barColor: [88, 128, 180],
      });
      cursorY += specializationHeight + 6;
    }

    if (!rows.length) {
      doc.setFontSize(11);
      doc.setTextColor(120, 130, 145);
      doc.text("No students match the selected filters.", marginX, cursorY + 8);
      return doc;
    }

    doc.autoTable({
      startY: cursorY,
      head: [tableData.head],
      body: rows,
      margin: { left: marginX, right: marginX, bottom: 28 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize:
          orientation === "landscape"
            ? 7.4
            : tableData.head.length > 5
              ? 6.9
              : 7.8,
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
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles: buildSectionColumnStyles(
        tableData.head,
        pageWidth,
        marginX,
      ),
      didDrawPage() {
        const pageNumber = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(100, 108, 118);
        doc.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 12, {
          align: "right",
        });
      },
    });

    return doc;
  }

  function renderProfileInfoRows(student) {
    return [
      ["Student ID", text(student?.student_id) || "—"],
      ["Name", text(student?.display_name || student?.name) || "—"],
      ["Section", text(student?.section) || "—"],
      ["Department", text(student?.department) || "—"],
      ["Status", normalizeStatus(student?.status)],
      ["Email", text(student?.email) || "—"],
      ["Contact No.", text(student?.contact_no) || "—"],
      ["External Partner", text(student?.external_partner_assigned) || "—"],
      ["Specialization", text(student?.nature_of_business) || "—"],
      ["Archive Link", text(student?.connected_archive_status) || "—"],
    ];
  }

  async function resolveStudentProfileImageDataUrl(student) {
    const raw = text(student?.profile_image_url);
    if (!raw) return "";
    const imageUrl = toHeaderImageUrl(raw);
    if (!imageUrl) return "";
    try {
      return await loadImageAsDataUrl(imageUrl);
    } catch (_error) {
      return "";
    }
  }

  function buildStudentReportFileName(student) {
    const datePart = new Date().toISOString().slice(0, 10);
    const namePart = sanitizeFileNameSegment(
      student?.display_name ||
        student?.name ||
        student?.student_id ||
        "student",
    );
    return `${REPORT_CONFIG.student.reportNamePrefix}_${namePart}_${datePart}.pdf`;
  }

  function renderRequirementSectionRows(items, selectedOutcomes) {
    const rows = [];
    for (const item of items) {
      const template = item?.template || {};
      const submission = item?.submission || null;
      const outcome = normalizeOutcome(submission?.status || "pending");
      if (!selectedOutcomes.includes(outcome)) continue;

      rows.push([
        text(template.name) || "Requirement",
        outcome === "approved"
          ? "Approved"
          : outcome === "rejected"
            ? "Rejected"
            : outcome === "submitted"
              ? "Submitted"
              : "Pending",
        formatDate(
          submission?.verified_at ||
            submission?.updated_at ||
            submission?.created_at,
        ),
        text(submission?.notes) || "—",
      ]);
    }
    return rows;
  }

  function renderAttendanceRows(records) {
    return records.map((record) => [
      formatDate(record.attendance_date),
      formatDateTime(record.datetime_in),
      formatDateTime(record.datetime_out),
      formatMinutes(record.duration_minutes),
      normalizeStatus(record.status),
      text(record.notes) || "—",
    ]);
  }

  function renderWeeklyRows(records) {
    return records.map((record) => [
      `Week ${text(record.week_number) || "—"}`,
      formatDate(record.week_start_date),
      text(record.status) || "—",
      text(record.file_name) || text(record.file_url) || "—",
    ]);
  }

  async function buildStudentPdf(state, filters) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error("The PDF library is not available.");

    const student = state.student || {};
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
      86,
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
    cursorY += headerHeight + 12;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(24, 28, 34);
    doc.text("Student OJT Report", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(85, 93, 104);
    doc.text(
      `Generated: ${new Date().toLocaleString("en-US")}`,
      marginX,
      cursorY,
    );
    doc.text(
      `Student: ${text(student.display_name || student.name) || text(student.student_id) || "—"}`,
      pageWidth - marginX,
      cursorY,
      { align: "right" },
    );
    cursorY += 16;

    const selectedBlocks = [
      filters.includeProfile ? "Profile" : null,
      filters.includeAttendance ? "Attendance" : null,
      filters.includeWeekly ? "Weekly" : null,
      filters.includePre ? "Pre Requirements" : null,
      filters.includePost ? "Post Requirements" : null,
    ].filter(Boolean);
    const summaryLines = [
      `Selected blocks: ${selectedBlocks.join(", ") || "None"}`,
      `Requirement outcomes: ${filters.outcomes.map((value) => (value === "approved" ? "Approved" : value === "rejected" ? "Rejected" : value === "submitted" ? "Submitted" : "Pending")).join(", ") || "None"}`,
    ];
    const wrappedSummary = doc.splitTextToSize(
      summaryLines.join(" | "),
      pageWidth - marginX * 2,
    );
    doc.text(wrappedSummary, marginX, cursorY);
    cursorY += wrappedSummary.length * 12 + 10;

    if (filters.includeProfile) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(24, 28, 34);
      doc.text("Profile Information", marginX, cursorY);
      cursorY += 8;

      const profileImageDataUrl =
        await resolveStudentProfileImageDataUrl(student);
      const profileTableStartY = profileImageDataUrl ? cursorY + 56 : cursorY;
      if (profileImageDataUrl) {
        try {
          doc.addImage(
            profileImageDataUrl,
            "PNG",
            pageWidth - marginX - 66,
            cursorY - 10,
            48,
            48,
          );
        } catch (_error) {
          // Continue without the portrait if the image cannot be embedded.
        }
      }

      doc.autoTable({
        startY: profileTableStartY,
        body: renderProfileInfoRows(student),
        theme: "grid",
        margin: { left: marginX, right: marginX, bottom: 24 },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 4.2,
          overflow: "linebreak",
          lineColor: [210, 216, 224],
          lineWidth: 0.4,
          textColor: [24, 28, 34],
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: 122, fontStyle: "bold" },
          1: { cellWidth: 360 },
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
      cursorY = doc.lastAutoTable.finalY + 18;
    }

    const requirementSections = [];
    if (filters.includePre)
      requirementSections.push({
        key: "pre",
        label: "Pre Requirements",
        rows: renderRequirementSectionRows(
          state.requirements.pre || [],
          filters.outcomes,
        ),
      });
    if (filters.includePost)
      requirementSections.push({
        key: "post",
        label: "Post Requirements",
        rows: renderRequirementSectionRows(
          state.requirements.post || [],
          filters.outcomes,
        ),
      });

    for (const section of requirementSections) {
      if (cursorY > pageHeight - 110) {
        doc.addPage();
        cursorY = 32;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(24, 28, 34);
      doc.text(section.label, marginX, cursorY);
      cursorY += 8;
      if (!section.rows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(120, 130, 145);
        doc.text(
          "No requirement entries match the selected outcomes.",
          marginX,
          cursorY + 8,
        );
        cursorY += 24;
        continue;
      }
      doc.autoTable({
        startY: cursorY,
        head: [["Requirement", "Outcome", "Updated", "Notes"]],
        body: section.rows,
        theme: "grid",
        margin: { left: marginX, right: marginX, bottom: 24 },
        styles: {
          font: "helvetica",
          fontSize: 7.6,
          cellPadding: 4.2,
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
        alternateRowStyles: { fillColor: [246, 248, 251] },
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 64 },
          2: { cellWidth: 74 },
          3: { cellWidth: 160 },
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
      cursorY = doc.lastAutoTable.finalY + 18;
    }

    if (filters.includeAttendance) {
      if (cursorY > pageHeight - 120) {
        doc.addPage();
        cursorY = 32;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(24, 28, 34);
      doc.text("Attendance Records", marginX, cursorY);
      cursorY += 8;
      const rows = renderAttendanceRows(state.attendance || []);
      if (!rows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(120, 130, 145);
        doc.text("No attendance records found.", marginX, cursorY + 8);
        cursorY += 24;
      } else {
        const summary = state.attendanceSummary || {};
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(90, 100, 112);
        doc.text(
          `Total: ${Number(summary.total) || rows.length} | Present: ${Number(summary.present) || 0} | Absent: ${Number(summary.absent) || 0} | Late: ${Number(summary.late) || 0}`,
          marginX,
          cursorY,
        );
        cursorY += 10;
        doc.autoTable({
          startY: cursorY,
          head: [
            ["Date", "Time In", "Time Out", "Duration", "Status", "Notes"],
          ],
          body: rows,
          theme: "grid",
          margin: { left: marginX, right: marginX, bottom: 24 },
          styles: {
            font: "helvetica",
            fontSize: 7.4,
            cellPadding: 4,
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
          alternateRowStyles: { fillColor: [246, 248, 251] },
          columnStyles: {
            0: { cellWidth: 72 },
            1: { cellWidth: 74 },
            2: { cellWidth: 74 },
            3: { cellWidth: 54 },
            4: { cellWidth: 62 },
            5: { cellWidth: 170 },
          },
          didDrawPage() {
            const pageNumber = doc.getNumberOfPages();
            doc.setFontSize(9);
            doc.setTextColor(100, 108, 118);
            doc.text(
              `Page ${pageNumber}`,
              pageWidth - marginX,
              pageHeight - 12,
              { align: "right" },
            );
          },
        });
        cursorY = doc.lastAutoTable.finalY + 18;
      }
    }

    if (filters.includeWeekly) {
      if (cursorY > pageHeight - 120) {
        doc.addPage();
        cursorY = 32;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(24, 28, 34);
      doc.text("Weekly Reports", marginX, cursorY);
      cursorY += 8;
      const rows = renderWeeklyRows(state.weeklyReports || []);
      if (!rows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(120, 130, 145);
        doc.text("No weekly reports found.", marginX, cursorY + 8);
      } else {
        doc.autoTable({
          startY: cursorY,
          head: [["Week", "Week Start", "Status", "File"]],
          body: rows,
          theme: "grid",
          margin: { left: marginX, right: marginX, bottom: 24 },
          styles: {
            font: "helvetica",
            fontSize: 7.4,
            cellPadding: 4,
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
          alternateRowStyles: { fillColor: [246, 248, 251] },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 70 },
            2: { cellWidth: 62 },
            3: { cellWidth: 150 },
          },
          didDrawPage() {
            const pageNumber = doc.getNumberOfPages();
            doc.setFontSize(9);
            doc.setTextColor(100, 108, 118);
            doc.text(
              `Page ${pageNumber}`,
              pageWidth - marginX,
              pageHeight - 12,
              { align: "right" },
            );
          },
        });
      }
    }

    return doc;
  }

  async function createPdfBlobUrl(mode, state, filters) {
    const doc =
      mode === "section"
        ? await buildSectionPdf(state, filters)
        : await buildStudentPdf(state, filters);
    const blob = doc.output("blob");
    return URL.createObjectURL(blob);
  }

  function clearPreviousBlob(state) {
    if (state.currentBlobUrl) {
      try {
        URL.revokeObjectURL(state.currentBlobUrl);
      } catch (_error) {}
    }
    state.currentBlobUrl = "";
  }

  async function refreshPreview(mode, state) {
    const modal = state.modal;
    if (!modal) return;

    const token = ++state.renderToken;
    const filters =
      mode === "section"
        ? collectSectionFilters(modal, state)
        : collectStudentFilters(modal, state);

    const hasSelection =
      mode === "section"
        ? filters.selectedSections.length > 0 &&
          filters.selectedStatuses.length > 0
        : filters.includeProfile ||
          filters.includeAttendance ||
          filters.includeWeekly ||
          filters.includePre ||
          filters.includePost;

    if (!hasSelection) {
      clearPreviousBlob(state);
      showPreviewState(modal, "empty", "");
      setSummary(
        modal,
        mode === "section"
          ? "No sections or statuses selected."
          : "No report blocks selected.",
        [],
      );
      clearIframe(modal);
      return;
    }

    showPreviewState(modal, "loading", "");

    try {
      const blobUrl = await createPdfBlobUrl(mode, state, filters);
      if (token !== state.renderToken) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_error) {}
        return;
      }

      clearPreviousBlob(state);
      state.currentBlobUrl = blobUrl;
      state.currentFileName =
        mode === "student"
          ? buildStudentReportFileName(state.student)
          : `${state.reportNamePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`;
      updateIframe(modal, blobUrl, state.currentFileName);
      showPreviewState(modal, "", "");
      wireDownloadAndPrint(modal, state);
    } catch (error) {
      if (token !== state.renderToken) return;
      clearPreviousBlob(state);
      showPreviewState(
        modal,
        "error",
        error?.message || "Failed to generate the PDF preview.",
      );
    }
  }

  function bindCheckboxListeners(modal, state, mode) {
    const scope = modal.overlay;
    scope
      .querySelectorAll("input[type='checkbox'], input[type='radio']")
      .forEach((input) => {
        input.addEventListener("change", () => {
          if (mode === "section") {
            const selectedSections = getSelectedValues(
              scope,
              `[id^='section-opt-${state.id}-']`,
            );
            const selectedStatuses = getSelectedValues(
              scope,
              `[id^='status-opt-${state.id}-']`,
            ).map(normalizeStatus);
            const includeCharts = Boolean(
              scope.querySelector(`#section-charts-${state.id}`)?.checked,
            );
            const includeEmail = Boolean(
              scope.querySelector(`#section-email-${state.id}`)?.checked,
            );
            const includePhone = Boolean(
              scope.querySelector(`#section-phone-${state.id}`)?.checked,
            );
            const includePartner = Boolean(
              scope.querySelector(`#section-partner-${state.id}`)?.checked,
            );
            const includeSpecialization = Boolean(
              scope.querySelector(`#section-specialization-${state.id}`)
                ?.checked,
            );
            const orientation =
              scope.querySelector(
                `input[name='section-orientation-${state.id}']:checked`,
              )?.value || "portrait";
            const contactBadges = [
              includeEmail ? "Email on" : null,
              includePhone ? "Phone on" : null,
              includePartner ? "Partner on" : null,
              includeSpecialization ? "Specialization on" : null,
              orientation === "landscape" ? "Horizontal" : "Portrait",
            ].filter(Boolean);
            setSummary(
              modal,
              `${selectedSections.length} section(s) selected and ${selectedStatuses.length} status bucket(s) active.`,
              [
                `${selectedSections.length} sections`,
                `${selectedStatuses.length} statuses`,
                includeCharts ? "Charts on" : "Charts off",
                ...contactBadges,
              ],
            );
          } else {
            const filters = collectStudentFilters(modal, state);
            const blocks = [
              filters.includeProfile ? "Profile" : null,
              filters.includeAttendance ? "Attendance" : null,
              filters.includeWeekly ? "Weekly" : null,
              filters.includePre ? "Pre" : null,
              filters.includePost ? "Post" : null,
            ].filter(Boolean);
            setSummary(modal, `${blocks.length} report block(s) selected.`, [
              ...blocks,
              `${filters.outcomes.length} outcome(s)`,
            ]);
          }
          scheduleRefresh(mode, state);
        });
      });
  }

  function bindSectionTitleControls(modal, state) {
    if (!modal.titleInput || !modal.saveTitleBtn) return;

    const commitTitle = (value) => {
      const normalized = saveSectionReportTitle(value);
      state.reportTitle = normalized;
      if (modal.title) modal.title.textContent = normalized;
      modal.titleInput.value = normalized;
      if (modal.titleFeedback) {
        modal.titleFeedback.textContent = "Report title saved.";
        modal.titleFeedback.classList.remove("error");
      }
      scheduleRefresh("section", state);
    };

    modal.titleInput.value = normalizeSectionReportTitle(state.reportTitle);
    modal.saveTitleBtn.addEventListener("click", () => {
      const value = modal.titleInput.value;
      if (!text(value)) {
        if (modal.titleFeedback) {
          modal.titleFeedback.textContent = "Please enter a report title.";
          modal.titleFeedback.classList.add("error");
        }
        modal.titleInput.focus();
        return;
      }
      commitTitle(value);
    });

    modal.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        modal.saveTitleBtn.click();
      }
    });
  }

  function scheduleRefresh(mode, state) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      refreshPreview(mode, state);
    }, 160);
  }

  function wireCloseButtons(modal, state) {
    const close = () => {
      setModalVisibility(modal.overlay, false);
      clearTimeout(state.refreshTimer);
      state.renderToken += 1;
      clearPreviousBlob(state);
      clearIframe(modal);
      setSummary(modal, modal.initialSummaryText, modal.initialBadges || []);
      showPreviewState(modal, "", "");
    };

    modal.overlay
      .querySelectorAll("[data-action='close-report']")
      .forEach((button) => {
        button.addEventListener("click", close);
      });
    modal.overlay.addEventListener("click", (event) => {
      if (event.target === modal.overlay) close();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.overlay.classList.contains("open")) {
        close();
      }
    });
  }

  async function openSectionReport(state) {
    const api = state.api;
    if (!api) {
      throw new Error("Coordinator API is unavailable.");
    }

    if (!state.loaded) {
      showPreviewState(state.modal, "loading", "");
      const data = await loadSectionData(api);
      state.sections = data.sections;
      state.sectionsByName = data.sectionsByName;
      state.loaded = true;
      state.modal.filterSection.innerHTML = buildSectionFilterMarkup(state);
      bindCheckboxListeners(state.modal, state, "section");
      state.modal.overlay
        .querySelector("[data-action='sections-all']")
        ?.addEventListener("click", () => {
          state.modal.overlay
            .querySelectorAll(`[id^='section-opt-${state.id}-']`)
            .forEach((input) => {
              input.checked = true;
            });
          scheduleRefresh("section", state);
        });
      state.modal.overlay
        .querySelector("[data-action='sections-none']")
        ?.addEventListener("click", () => {
          state.modal.overlay
            .querySelectorAll(`[id^='section-opt-${state.id}-']`)
            .forEach((input) => {
              input.checked = false;
            });
          scheduleRefresh("section", state);
        });
    }

    setSummary(
      state.modal,
      `${state.sections.length} assigned section(s) loaded.`,
      state.sections.map((section) => section.section_name),
    );
    showPreviewState(state.modal, "loading", "");
    setModalVisibility(state.modal.overlay, true);
    scheduleRefresh("section", state);
  }

  async function openStudentReport(state) {
    const api = state.api;
    if (!api) {
      throw new Error("Coordinator API is unavailable.");
    }

    if (!state.loaded) {
      showPreviewState(state.modal, "loading", "");
      state.studentData = await loadStudentData(api, state.studentId);
      state.student = state.studentData.student || null;
      state.requirements = state.studentData.requirements;
      state.attendance = state.studentData.attendance;
      state.attendanceSummary = state.studentData.attendanceSummary;
      state.weeklyReports = state.studentData.weeklyReports;
      state.loaded = true;
      state.modal.detailSection.innerHTML = "";
      bindCheckboxListeners(state.modal, state, "student");
    }

    const studentLabel =
      text(
        state.student?.display_name || state.student?.name || state.studentId,
      ) || state.studentId;
    setSummary(
      state.modal,
      `Previewing report for ${studentLabel}.`,
      getStudentSummary(state.student),
    );
    showPreviewState(state.modal, "loading", "");
    setModalVisibility(state.modal.overlay, true);
    scheduleRefresh("student", state);
  }

  function initSectionReport(options = {}) {
    ensureStyles();

    const state = {
      id: `section-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...REPORT_CONFIG.section,
      api: getApi(options),
      loaded: false,
      sections: [],
      sectionsByName: new Map(),
      currentBlobUrl: "",
      currentFileName: "",
      renderToken: 0,
      refreshTimer: null,
      reportTitle: getSavedSectionReportTitle(),
      modal: null,
    };

    state.modal = createPreviewModal("section");
    state.modal.initialSummaryText = "Loading report data...";
    state.modal.initialBadges = [];
    state.modal.filterSection = state.modal.overlay.querySelector(
      "[data-role='filter-section']",
    );
    state.modal.detailSection = state.modal.overlay.querySelector(
      "[data-role='detail-section']",
    );
    if (state.modal.title) {
      state.modal.title.textContent = normalizeSectionReportTitle(
        state.reportTitle,
      );
    }
    bindSectionTitleControls(state.modal, state);
    state.modal.filterSection.innerHTML = buildSectionFilterMarkup(state);
    state.modal.detailSection.innerHTML =
      "<div class='ojt-report-empty-state'>Filter the assigned sections and OJT statuses to generate the PDF preview.</div>";
    setSummary(state.modal, "Loading report data...", []);
    wireCloseButtons(state.modal, state);

    const trigger = document.getElementById(REPORT_CONFIG.section.triggerId);
    if (trigger) {
      trigger.addEventListener("click", async () => {
        try {
          await openSectionReport(state);
        } catch (error) {
          state.modal.detailSection.innerHTML = `<div class='ojt-report-empty-state' style='color:#b12f2f;'>${escapeHtml(error?.message || "Failed to open the report.")}</div>`;
          setModalVisibility(state.modal.overlay, true);
        }
      });
    }

    return state;
  }

  function initStudentReport(options = {}) {
    ensureStyles();

    const studentId = text(
      options.studentId || options.getStudentId?.() || options.student_id || "",
    );
    const state = {
      id: `student-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...REPORT_CONFIG.student,
      api: getApi(options),
      studentId,
      loaded: false,
      studentData: null,
      student: null,
      requirements: { pre: [], post: [] },
      attendance: [],
      attendanceSummary: null,
      weeklyReports: [],
      currentBlobUrl: "",
      currentFileName: "",
      renderToken: 0,
      refreshTimer: null,
      modal: null,
    };

    state.modal = createPreviewModal("student");
    state.modal.initialSummaryText = "Loading student report data...";
    state.modal.initialBadges = [];
    state.modal.filterSection = state.modal.overlay.querySelector(
      "[data-role='filter-section']",
    );
    state.modal.detailSection = state.modal.overlay.querySelector(
      "[data-role='detail-section']",
    );
    state.modal.filterSection.innerHTML = buildStudentFilterMarkup(state);
    state.modal.detailSection.innerHTML = `<div class='ojt-report-empty-state'>Open the student report to load profile, attendance, weekly reports, and requirement data.</div>`;
    setSummary(state.modal, "Loading student report data...", []);
    wireCloseButtons(state.modal, state);

    const trigger = document.getElementById(REPORT_CONFIG.student.triggerId);
    if (trigger && !studentId) {
      trigger.disabled = true;
      trigger.title = "Student ID is unavailable for this report.";
    }
    if (trigger) {
      trigger.addEventListener("click", async () => {
        try {
          if (!state.studentId) {
            throw new Error("Student ID is unavailable for this report.");
          }
          await openStudentReport(state);
        } catch (error) {
          state.modal.detailSection.innerHTML = `<div class='ojt-report-empty-state' style='color:#b12f2f;'>${escapeHtml(error?.message || "Failed to open the report.")}</div>`;
          setModalVisibility(state.modal.overlay, true);
        }
      });
    }

    return state;
  }

  window.OjtCoordinatorReport = {
    initSectionReport,
    initStudentReport,
  };
})();
