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
  let appDefaultDepartment = "CCS";
  try {
    const cached = JSON.parse(localStorage.getItem("sas.app.settings") || "{}");
    appDefaultDepartment =
      String(cached?.department?.department_code || "").trim() || "CCS";
  } catch (_error) {}
  const savedDepartment = String(
    archive.department || fallbackData.department || appDefaultDepartment,
  );
  const savedStatus = String(archive.status || fallbackData.status || "");
  const formatMonthYear =
    typeof formatMonthYearFn === "function"
      ? formatMonthYearFn
      : (value) => String(value || "");

  // Visible column order: check|title|authors|section|advisor|date|type|status|actions
  editingRow.cells[1].textContent = savedTitle;
  editingRow.cells[2].textContent = savedAuthors;
  editingRow.cells[3].textContent = savedSection;
  editingRow.cells[4].textContent = savedAdvisor;
  editingRow.cells[5].textContent = formatMonthYear(savedDate);
  editingRow.cells[6].textContent = savedType;

  const normalizedStatus =
    typeof window.normalizeArchiveStatus === "function"
      ? window.normalizeArchiveStatus(savedStatus)
      : savedStatus || "Pending";
  const statusMarkup =
    typeof window.renderArchiveStatusSelect === "function"
      ? window.renderArchiveStatusSelect(normalizedStatus)
      : `<div class="row-status-control"><span class="status-dot ${normalizedStatus === "Approved" ? "dot-approved" : normalizedStatus === "Rejected" ? "dot-rejected" : "dot-pending"}"></span><select class="row-status-select"><option ${normalizedStatus === "Pending" ? "selected" : ""}>Pending</option><option ${normalizedStatus === "Approved" ? "selected" : ""}>Approved</option><option ${normalizedStatus === "Rejected" ? "selected" : ""}>Rejected</option></select></div>`;
  editingRow.cells[7].innerHTML = statusMarkup;

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
  editingRow.dataset.status = normalizedStatus;
  editingRow.dataset.department = savedDepartment;
  editingRow.dataset.linkedStudentIds = String(
    archive.linked_student_ids || fallbackData.linked_student_ids || "",
  );

  if (window.archiveSearchFilter?.refresh) {
    window.archiveSearchFilter.refresh();
  }
}

window.updateArchiveRecord = updateArchiveRecord;
window.applyArchiveRowUpdate = applyArchiveRowUpdate;
