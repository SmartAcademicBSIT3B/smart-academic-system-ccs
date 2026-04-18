(function () {
  // ── Markup injection ──────────────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById("va-modal-style-bundle")) return;

    const styleEl = document.createElement("style");
    styleEl.id = "va-modal-style-bundle";
    styleEl.textContent = `
      #va-toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 9999;
        pointer-events: none;
      }

      .va-toast {
        background: #181c22;
        border: 1px solid #3a3f46;
        color: #c9ccd1;
        padding: 12px 18px;
        border-radius: 10px;
        font-size: 13.5px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: auto;
        max-width: 320px;
      }

      .va-toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      .va-toast-success { border-left: 3px solid #4caf7d; }
      .va-toast-error { border-left: 3px solid #e06c75; }
      .va-toast-info { border-left: 3px solid #9dc6ff; }

      .va-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9000;
        padding: 24px;
      }

      .va-modal-overlay.show { display: flex; }

      .va-modal-box {
        background: #12151a;
        border: 1px solid #3a3f46;
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 920px;
        height: 90vh;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
      }

      .va-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid #3a3f46;
        flex-shrink: 0;
        gap: 12px;
      }

      .va-modal-title {
        font-size: 14.5px;
        font-weight: 600;
        color: #c9ccd1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .va-modal-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .va-modal-close {
        background: transparent;
        border: 1px solid #3a3f46;
        color: #c9ccd1;
        cursor: pointer;
        border-radius: 8px;
        padding: 4px 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s;
      }

      .va-modal-close:hover { background: rgba(255, 255, 255, 0.07); }

      .va-modal-body {
        flex: 1;
        position: relative;
        overflow: hidden;
      }

      .va-modal-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #9aa0a6;
        font-size: 14px;
        background: #12151a;
      }

      .va-pdf-iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
        transition: opacity 0.2s ease;
      }

      .va-modal-box:fullscreen,
      .va-modal-box:-webkit-full-screen {
        max-width: 100%;
        width: 100%;
        height: 100%;
        border-radius: 0;
        border: none;
      }

      .va-error-overlay { z-index: 9100; }
      .va-error-box { max-width: 520px; height: auto; }

      .va-error-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #e06c75;
      }

      .va-error-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: #e06c75;
      }

      .va-error-body {
        padding: 18px 20px 10px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .va-error-message {
        font-size: 13.5px;
        color: #c9ccd1;
        line-height: 1.55;
      }

      .va-error-hints {
        list-style: disc;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12.5px;
        color: #9aa0a6;
        line-height: 1.5;
      }

      .va-error-hints strong { color: #c9ccd1; }

      .va-error-url-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .va-error-url-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        color: #9aa0a6;
        font-weight: 600;
      }

      .va-error-url {
        font-family: "Courier New", Courier, monospace;
        font-size: 11.5px;
        color: #9dc6ff;
        background: rgba(157, 198, 255, 0.07);
        border: 1px solid rgba(157, 198, 255, 0.18);
        border-radius: 6px;
        padding: 6px 10px;
        word-break: break-all;
        display: block;
        max-height: 72px;
        overflow-y: auto;
      }

      .va-error-footer {
        display: flex;
        justify-content: flex-end;
        padding: 12px 20px 16px;
        border-top: 1px solid #3a3f46;
      }

      .va-error-ok-btn {
        background: #181c22;
        border: 1px solid #3a3f46;
        color: #c9ccd1;
        padding: 8px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13.5px;
        transition: background 0.15s;
      }

      .va-error-ok-btn:hover { background: rgba(255, 255, 255, 0.07); }
    `;
    document.head.appendChild(styleEl);
  }

  function injectMarkup() {
    ensureStyles();
    if (!document.getElementById("va-toast-container")) {
      const el = document.createElement("div");
      el.id = "va-toast-container";
      document.body.appendChild(el);
    }

    if (!document.getElementById("va-pdf-modal")) {
      const el = document.createElement("div");
      el.id = "va-pdf-modal";
      el.className = "va-modal-overlay";
      el.innerHTML = `
        <div class="va-modal-box">
          <div class="va-modal-header">
            <span class="va-modal-title" id="va-modal-title">Document Viewer</span>
            <div class="va-modal-header-actions">
              <button class="va-modal-close" id="va-modal-fullscreen" type="button" aria-label="View in fullscreen">
                <i data-lucide="maximize-2"></i>
              </button>
              <button class="va-modal-close" id="va-modal-close" type="button" aria-label="Close">
                <i data-lucide="x"></i>
              </button>
            </div>
          </div>
          <div class="va-modal-body">
            <div class="va-modal-loading" id="va-modal-loading">Loading document…</div>
            <iframe id="va-pdf-iframe" class="va-pdf-iframe" title="PDF Document"></iframe>
          </div>
        </div>
      `;
      document.body.appendChild(el);

      document
        .getElementById("va-modal-close")
        .addEventListener("click", closePdfModal);

      document
        .getElementById("va-modal-fullscreen")
        .addEventListener("click", togglePdfFullscreen);

      // Keep fullscreen icon in sync when user exits via Esc/browser UI.
      document.addEventListener("fullscreenchange", syncFullscreenIcon);

      el.addEventListener("click", function (e) {
        if (e.target === el) closePdfModal();
      });

      document.addEventListener("keydown", function (e) {
        if (
          e.key === "Escape" &&
          el.classList.contains("show") &&
          !document.fullscreenElement
        )
          closePdfModal();
      });

      if (typeof lucide !== "undefined") {
        lucide.createIcons({ nodes: [el] });
      }
    }

    // ── Error dialog ──────────────────────────────────────────────────────
    if (!document.getElementById("va-error-modal")) {
      const el = document.createElement("div");
      el.id = "va-error-modal";
      el.className = "va-modal-overlay va-error-overlay";
      el.innerHTML = `
        <div class="va-modal-box va-error-box">
          <div class="va-modal-header">
            <span class="va-modal-title va-error-title">
              <i data-lucide="alert-triangle" class="va-error-icon"></i>
              Unable to Load Document
            </span>
            <button class="va-modal-close" id="va-error-close" type="button" aria-label="Close">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="va-error-body">
            <p class="va-error-message" id="va-error-message"></p>
            <ul class="va-error-hints">
              <li>Check that the file path or Google Drive link is correct in the database.</li>
              <li>If using a local path, confirm the file exists on this machine.</li>
              <li>If using a Google Drive link, make sure sharing is set to <strong>Anyone with the link</strong>.</li>
            </ul>
            <div class="va-error-url-row">
              <span class="va-error-url-label">URL attempted:</span>
              <code class="va-error-url" id="va-error-url"></code>
            </div>
          </div>
          <div class="va-error-footer">
            <button class="va-error-ok-btn" id="va-error-ok" type="button">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);

      document
        .getElementById("va-error-close")
        .addEventListener("click", closeErrorModal);
      document
        .getElementById("va-error-ok")
        .addEventListener("click", closeErrorModal);
      el.addEventListener("click", function (e) {
        if (e.target === el) closeErrorModal();
      });

      if (typeof lucide !== "undefined") {
        lucide.createIcons({ nodes: [el] });
      }
    }
  }

  // ── URL helpers ───────────────────────────────────────────────────────────

  function buildLocalUrl(archive) {
    const localPath = String(archive.local_file_path || "").trim();
    if (!localPath) return null;

    // Already a file:// URL — use as-is.
    if (localPath.startsWith("file://")) return localPath;

    // Absolute Windows path e.g. C:\... or C:/...
    if (/^[a-zA-Z]:[\\/]/.test(localPath)) {
      return "file:///" + localPath.replace(/\\/g, "/");
    }

    // Relative path stored in DB (e.g. "uploads/documents/archive_xxx.pdf")
    // The page lives at adminpage/htmls/view_archives.html, so go one level up
    // to reach adminpage/ and resolve from there.
    try {
      const adminpageBase = new URL("../", window.location.href).href;
      return new URL(localPath, adminpageBase).href;
    } catch (_) {
      // Last resort: just prefix with file:///
      return "file:///" + localPath.replace(/\\/g, "/").replace(/^\/+/, "");
    }
  }

  function buildDriveUrl(archive) {
    const filePath = String(archive.file_path || "").trim();
    if (!filePath) return null;
    if (filePath.includes("drive.google.com")) {
      const match = filePath.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return filePath || null;
  }

  // Keep a simple combined helper for callers that just need one URL.
  function buildPdfUrl(archive) {
    return buildLocalUrl(archive) || buildDriveUrl(archive);
  }

  // ── Error modal ───────────────────────────────────────────────────────────

  function showErrorModal(message, url) {
    const modal = document.getElementById("va-error-modal");
    const msgEl = document.getElementById("va-error-message");
    const urlEl = document.getElementById("va-error-url");
    if (!modal) return;

    if (msgEl)
      msgEl.textContent = message || "The document could not be displayed.";
    if (urlEl) {
      const display = String(url || "").trim();
      urlEl.textContent = display || "—";
      urlEl.title = display;
    }

    modal.classList.add("show");
  }

  function closeErrorModal() {
    const modal = document.getElementById("va-error-modal");
    if (modal) modal.classList.remove("show");
  }

  // ── PDF modal ─────────────────────────────────────────────────────────────

  // Track load-timeout per open session so stale timers don't fire after close.
  let _loadTimeoutId = null;

  function openPdfModal(archive) {
    const modal = document.getElementById("va-pdf-modal");
    const iframe = document.getElementById("va-pdf-iframe");
    const titleEl = document.getElementById("va-modal-title");
    const loadingEl = document.getElementById("va-modal-loading");
    if (!modal || !iframe) return;

    const localUrl = buildLocalUrl(archive);
    const driveUrl = buildDriveUrl(archive);
    const primaryUrl = localUrl || driveUrl;

    if (!primaryUrl) {
      showErrorModal(
        "This archive has no document file linked. Please check the database record.",
        null,
      );
      return;
    }

    if (titleEl) titleEl.textContent = archive.title || "Document Viewer";
    modal.classList.add("show");

    // loadUrl tries a URL; if it fails and fallbackUrl exists it retries once.
    function loadUrl(url, fallbackUrl) {
      if (_loadTimeoutId) {
        clearTimeout(_loadTimeoutId);
        _loadTimeoutId = null;
      }

      if (loadingEl) {
        loadingEl.textContent = "Loading document…";
        loadingEl.style.display = "flex";
      }
      iframe.style.opacity = "0";
      iframe.src = "";

      function handleFailure() {
        if (_loadTimeoutId) {
          clearTimeout(_loadTimeoutId);
          _loadTimeoutId = null;
        }
        if (fallbackUrl) {
          showToast(
            "Local file not found — switching to Google Drive…",
            "info",
          );
          loadUrl(fallbackUrl, null);
        } else {
          if (loadingEl) loadingEl.style.display = "none";
          closePdfModal();
          showErrorModal(
            "The document could not be loaded. The file may be missing or inaccessible.",
            url,
          );
        }
      }

      iframe.onerror = handleFailure;

      iframe.onload = function () {
        if (_loadTimeoutId) {
          clearTimeout(_loadTimeoutId);
          _loadTimeoutId = null;
        }

        // For local file:// URLs in Electron we can inspect the document for
        // error page content which indicates the file was not found.
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) {
            const bodyText = (doc.body?.innerText || "").trim();
            if (
              doc.title.toLowerCase().includes("not found") ||
              bodyText.toLowerCase().includes("file not found") ||
              bodyText.toLowerCase().includes("err_file_not_found") ||
              bodyText.toLowerCase().includes("no such file")
            ) {
              handleFailure();
              return;
            }
          }
        } catch (_) {
          // Cross-origin (e.g. Google Drive) — cannot inspect; treat as success.
        }

        if (loadingEl) loadingEl.style.display = "none";
        iframe.style.opacity = "1";
      };

      // Safety net: if neither onload nor onerror fires within 20 s, warn.
      _loadTimeoutId = setTimeout(() => {
        _loadTimeoutId = null;
        if (loadingEl && loadingEl.style.display !== "none") {
          loadingEl.textContent =
            "Still loading… If nothing appears, the file may be unavailable.";
        }
      }, 20000);

      iframe.src = url;
    }

    // Start with local URL; pass drive URL as the fallback (null if same or absent).
    const fallback = localUrl && driveUrl ? driveUrl : null;
    loadUrl(primaryUrl, fallback);
  }

  function togglePdfFullscreen() {
    const box = document.querySelector("#va-pdf-modal .va-modal-box");
    if (!box) return;

    if (!document.fullscreenElement) {
      box.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request failed:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function syncFullscreenIcon() {
    const btn = document.getElementById("va-modal-fullscreen");
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (!icon) return;

    if (document.fullscreenElement) {
      icon.setAttribute("data-lucide", "minimize-2");
      btn.setAttribute("aria-label", "Exit fullscreen");
    } else {
      icon.setAttribute("data-lucide", "maximize-2");
      btn.setAttribute("aria-label", "View in fullscreen");
    }

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [btn] });
    }
  }

  function closePdfModal() {
    const modal = document.getElementById("va-pdf-modal");
    const iframe = document.getElementById("va-pdf-iframe");
    if (!modal) return;

    if (_loadTimeoutId) {
      clearTimeout(_loadTimeoutId);
      _loadTimeoutId = null;
    }

    // Exit fullscreen before closing so the modal overlay cleans up properly.
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }

    modal.classList.remove("show");
    if (iframe) iframe.src = "";
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(message, type) {
    const container = document.getElementById("va-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `va-toast va-toast-${type || "info"}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("show"));
    });

    const duration = type === "error" ? 4500 : 3000;
    setTimeout(() => {
      toast.classList.remove("show");
      toast.addEventListener("transitionend", () => toast.remove(), {
        once: true,
      });
    }, duration);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectMarkup);
  } else {
    injectMarkup();
  }

  window.ViewArchivesModal = {
    showToast,
    openPdfModal,
    closePdfModal,
    showErrorModal,
  };
})();
