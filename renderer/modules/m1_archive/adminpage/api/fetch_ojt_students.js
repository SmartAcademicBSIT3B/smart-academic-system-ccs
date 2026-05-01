function getElectronApiBridgeForOjtStudents() {
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

function renderOjtStudentsTableMessage(tbody, title, detail) {
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
    <tr data-placeholder="ojt-student-status">
      <td colspan="11" style="text-align:center; padding: 42px 24px; color: var(--text-secondary);">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
          <strong style="color: var(--text-primary);">${safeTitle}</strong>
          ${safeDetail ? `<span>${safeDetail}</span>` : ""}
        </div>
      </td>
    </tr>`;
}

function waitForOjtStudentRowRenderer(maxAttempts = 20, delayMs = 100) {
  return new Promise((resolve) => {
    let attempts = 0;

    function check() {
      if (typeof window.addOjtStudentRow === "function") {
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

async function loadOjtStudents() {
  const tbody = document.getElementById("ojt-students-table-body");
  if (!tbody) return;

  const electronAPI = getElectronApiBridgeForOjtStudents();
  if (!electronAPI || typeof electronAPI.getOjtStudents !== "function") {
    renderOjtStudentsTableMessage(
      tbody,
      "OJT Student API is unavailable.",
      "electronAPI.getOjtStudents is not exposed in this view.",
    );
    return;
  }

  renderOjtStudentsTableMessage(tbody, "Loading OJT students...", "");

  try {
    const result = await electronAPI.getOjtStudents();
    const rendererReady = await waitForOjtStudentRowRenderer();

    if (!result || !result.success) {
      renderOjtStudentsTableMessage(
        tbody,
        "Failed to load OJT students.",
        result?.message ||
          "The main process returned an unsuccessful response.",
      );
      return;
    }

    if (!rendererReady) {
      renderOjtStudentsTableMessage(
        tbody,
        "Table renderer is not ready.",
        "addOjtStudentRow was not available after page initialization.",
      );
      return;
    }

    const students = Array.isArray(result.students) ? result.students : [];
    tbody.innerHTML = "";

    if (!students.length) {
      renderOjtStudentsTableMessage(
        tbody,
        "No OJT students found.",
        "Use the + button to add your first OJT student.",
      );
      return;
    }

    students.forEach((student) => {
      window.addOjtStudentRow(student);
    });

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    if (window.ojtStudentsSearchFilter) {
      window.ojtStudentsSearchFilter.refresh();
    }
  } catch (error) {
    renderOjtStudentsTableMessage(
      tbody,
      "Error loading OJT students.",
      error?.message || "Unexpected error while fetching student data.",
    );
  }
}

window.getOjtStudentsElectronApiBridge = getElectronApiBridgeForOjtStudents;
window.loadOjtStudents = loadOjtStudents;
