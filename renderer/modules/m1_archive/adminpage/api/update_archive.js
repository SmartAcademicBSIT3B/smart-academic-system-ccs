function getElectronApiBridgeForArchiveUpdate() {
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

async function updateArchiveRecord(payload) {
  const electronAPI = getElectronApiBridgeForArchiveUpdate();
  if (!electronAPI || typeof electronAPI.updateArchive !== "function") {
    return {
      success: false,
      message:
        "Archive update API is not available in this view. Please reload the app and try again.",
    };
  }

  return await electronAPI.updateArchive(payload);
}

function applyArchiveRowUpdate(
  editingRow,
  archive,
  fallback,
  formatMonthYearFn,
) {
  if (!editingRow || !archive) return;

  const fallbackData = fallback || {};

  const savedTitle = String(archive.title || fallbackData.title || "");
  const savedAuthors = String(archive.authors || fallbackData.authors || "");
  const savedSection = String(archive.section || fallbackData.section || "");
  const savedAdvisor = String(archive.advisor || fallbackData.advisor || "");
  const savedDate = String(
    archive.date_published || fallbackData.date_published || "",
  );
  const savedType = String(archive.type || fallbackData.type || "");
  const savedStatus = String(archive.status || fallbackData.status || "");
  const formatMonthYear =
    typeof formatMonthYearFn === "function"
      ? formatMonthYearFn
      : (value) => String(value || "");

  // Update visible cells (new column order: check|title|authors|section|advisor|date|type|status|actions)
  editingRow.cells[1].textContent = savedTitle;
  editingRow.cells[2].textContent = savedAuthors;
  editingRow.cells[3].textContent = savedSection;
  editingRow.cells[4].textContent = savedAdvisor;
  editingRow.cells[5].textContent = formatMonthYear(savedDate);
  editingRow.cells[6].textContent = savedType;

  const savedStatusRaw = savedStatus.trim().toLowerCase() || "pending";
  const statusDotClass =
    savedStatusRaw === "approved"
      ? "dot-approved"
      : savedStatusRaw === "rejected"
        ? "dot-rejected"
        : "dot-pending";
  editingRow.cells[7].innerHTML = `<span class="status-dot ${statusDotClass}"></span>${savedStatus}`;

  // Sync data-* attributes
  editingRow.dataset.title = savedTitle;
  editingRow.dataset.authors = savedAuthors;
  editingRow.dataset.section = savedSection;
  editingRow.dataset.advisor = savedAdvisor;
  editingRow.dataset.datePublished = savedDate;
  editingRow.dataset.keywords = String(
    archive.keywords || fallbackData.keywords || "",
  );
  editingRow.dataset.type = savedType;
  editingRow.dataset.status = savedStatus;
}

window.updateArchiveRecord = updateArchiveRecord;
window.applyArchiveRowUpdate = applyArchiveRowUpdate;
