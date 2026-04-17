function getElectronApiBridgeForArchives() {
  if (window.electronAPI) return window.electronAPI;

  try {
    if (
      window.parent &&
      window.parent !== window &&
      window.parent.electronAPI
    ) {
      return window.parent.electronAPI;
    }
  } catch (_e) {
    // Ignore cross-context access errors.
  }

  try {
    if (window.top && window.top !== window && window.top.electronAPI) {
      return window.top.electronAPI;
    }
  } catch (_e) {
    // Ignore cross-context access errors.
  }

  return null;
}

function escapeArchiveMessage(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderArchiveTableMessage(
  tbody,
  title,
  detail,
  showRetry = false,
  isLoading = false,
) {
  if (!tbody) return;

  const safeTitle = escapeArchiveMessage(title);
  const safeDetail = escapeArchiveMessage(detail);
  const retryButton = showRetry
    ? '<button type="button" id="archive-load-retry-btn" style="margin-top:12px;padding:8px 14px;border:1px solid var(--border);border-radius:6px;background:#12151a;color:var(--accent);cursor:pointer;font-size:13px;">Retry</button>'
    : "";
  const spinner = isLoading ? '<div class="table-loading-spinner"></div>' : "";

  tbody.innerHTML = `
    <tr data-placeholder="archive-status">
      <td colspan="14" style="text-align:center; padding: 48px 24px; color: var(--text-secondary); font-size: 14px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
          ${spinner}
          <strong style="color: var(--text-primary);">${safeTitle}</strong>
          ${safeDetail ? `<span>${safeDetail}</span>` : ""}
          ${retryButton}
        </div>
      </td>
    </tr>`;

  if (showRetry) {
    const retryBtn = document.getElementById("archive-load-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        loadArchives();
      });
    }
  }
}

function waitForArchiveRowRenderer(maxAttempts = 20, delayMs = 100) {
  return new Promise((resolve) => {
    let attempts = 0;

    function check() {
      if (typeof window.addArchiveRow === "function") {
        resolve(true);
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        resolve(false);
        return;
      }

      window.setTimeout(check, delayMs);
    }

    check();
  });
}

async function loadArchives() {
  const electronAPI = getElectronApiBridgeForArchives();
  if (!electronAPI || typeof electronAPI.getArchives !== "function") {
    console.warn("getArchives API is not available.");
    const tbody = document.getElementById("archives-table-body");
    renderArchiveTableMessage(
      tbody,
      "Archive API is unavailable.",
      "electronAPI.getArchives is not exposed in this view.",
      true,
    );
    return;
  }

  const tbody = document.getElementById("archives-table-body");
  if (!tbody) return;

  renderArchiveTableMessage(tbody, "Loading archives...", "", false, true);

  try {
    const result = await electronAPI.getArchives();
    const rendererReady = await waitForArchiveRowRenderer();

    if (!result || !result.success) {
      console.error("getArchives failed:", result?.message);
      renderArchiveTableMessage(
        tbody,
        "Failed to load archives.",
        result?.message ||
          "The main process returned an unsuccessful response.",
        true,
      );
      return;
    }

    if (!rendererReady) {
      console.error(
        "addArchiveRow is not available after waiting for initialization.",
      );
      renderArchiveTableMessage(
        tbody,
        "Archive table renderer is not ready.",
        "addArchiveRow was not available after page initialization.",
        true,
      );
      return;
    }

    if (!Array.isArray(result.archives)) {
      console.error("getArchives returned invalid shape:", result);
      renderArchiveTableMessage(
        tbody,
        "Invalid archive response.",
        "Expected result.archives to be an array.",
        true,
      );
      return;
    }

    const archives = result.archives;
    tbody.innerHTML = "";

    if (archives.length === 0) {
      renderArchiveTableMessage(
        tbody,
        "No archives found.",
        "The database query succeeded but returned zero rows.",
        false,
      );
      return;
    }

    let renderedCount = 0;
    const rowErrors = [];

    archives.forEach((archive, index) => {
      try {
        window.addArchiveRow(archive);
        renderedCount += 1;
      } catch (error) {
        rowErrors.push(
          `Row ${index + 1}${archive?.id ? ` (ID ${archive.id})` : ""}: ${error.message || error}`,
        );
        console.error("Archive row render failed:", archive, error);
      }
    });

    if (renderedCount === 0) {
      renderArchiveTableMessage(
        tbody,
        "Archive rows failed to render.",
        rowErrors[0] || "Rows were returned but none could be rendered.",
        true,
      );
      return;
    }

    if (rowErrors.length > 0) {
      console.warn("Some archive rows failed to render:", rowErrors);
    }

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    if (typeof window.archiveSearchFilter !== "undefined") {
      window.archiveSearchFilter.refresh();
    }
  } catch (error) {
    console.error("loadArchives error:", error);
    renderArchiveTableMessage(
      tbody,
      "Error loading archives.",
      error?.message || "Unexpected error while fetching archive data.",
      true,
    );
  }
}

window.loadArchives = loadArchives;
