function getElectronApiBridgeForExternalPartners() {
  if (window.electronAPI) return window.electronAPI;

  try {
    if (
      window.parent &&
      window.parent !== window &&
      window.parent.electronAPI
    ) {
      return window.parent.electronAPI;
    }
  } catch (_error) {
    // Ignore cross-context access errors.
  }

  try {
    if (window.top && window.top !== window && window.top.electronAPI) {
      return window.top.electronAPI;
    }
  } catch (_error) {
    // Ignore cross-context access errors.
  }

  return null;
}

function renderExternalPartnersTableMessage(tbody, title, detail) {
  if (!tbody) return;

  const safeTitle = String(title || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeDetail = String(detail || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  tbody.innerHTML = `
    <tr data-placeholder="external-partner-status">
      <td colspan="12" style="text-align:center; padding: 42px 24px; color: var(--text-secondary);">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
          <strong style="color: var(--text-primary);">${safeTitle}</strong>
          ${safeDetail ? `<span>${safeDetail}</span>` : ""}
        </div>
      </td>
    </tr>`;
}

function waitForExternalPartnerRowRenderer(maxAttempts = 20, delayMs = 100) {
  return new Promise((resolve) => {
    let attempts = 0;

    function check() {
      if (typeof window.addExternalPartnerRow === "function") {
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

async function loadExternalPartners() {
  const tbody = document.getElementById("external-partners-table-body");
  if (!tbody) return;

  const electronAPI = getElectronApiBridgeForExternalPartners();
  if (!electronAPI || typeof electronAPI.getExternalPartners !== "function") {
    renderExternalPartnersTableMessage(
      tbody,
      "External Partner API is unavailable.",
      "electronAPI.getExternalPartners is not exposed in this view.",
    );
    return;
  }

  renderExternalPartnersTableMessage(tbody, "Loading external partners...", "");

  try {
    const result = await electronAPI.getExternalPartners();
    const rendererReady = await waitForExternalPartnerRowRenderer();

    if (!result || !result.success) {
      renderExternalPartnersTableMessage(
        tbody,
        "Failed to load external partners.",
        result?.message ||
          "The main process returned an unsuccessful response.",
      );
      return;
    }

    if (!rendererReady) {
      renderExternalPartnersTableMessage(
        tbody,
        "Table renderer is not ready.",
        "addExternalPartnerRow was not available after page initialization.",
      );
      return;
    }

    const partners = Array.isArray(result.partners) ? result.partners : [];
    tbody.innerHTML = "";

    if (!partners.length) {
      renderExternalPartnersTableMessage(
        tbody,
        "No external partners found.",
        "Use the + button to add your first external partner.",
      );
      return;
    }

    partners.forEach((partner) => {
      window.addExternalPartnerRow(partner);
    });

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    if (window.externalPartnersSearchFilter) {
      window.externalPartnersSearchFilter.refresh();
    }
  } catch (error) {
    renderExternalPartnersTableMessage(
      tbody,
      "Error loading external partners.",
      error?.message || "Unexpected error while fetching partner data.",
    );
  }
}

window.getExternalPartnersElectronApiBridge =
  getElectronApiBridgeForExternalPartners;
window.loadExternalPartners = loadExternalPartners;
