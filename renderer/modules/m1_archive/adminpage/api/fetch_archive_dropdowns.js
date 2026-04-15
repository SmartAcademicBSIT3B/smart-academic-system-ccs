function getElectronApiBridge() {
  if (window.electronAPI) return window.electronAPI;

  try {
    if (
      window.parent &&
      window.parent !== window &&
      window.parent.electronAPI
    ) {
      return window.parent.electronAPI;
    }
  } catch (error) {
    // Ignore cross-context access errors.
  }

  try {
    if (window.top && window.top !== window && window.top.electronAPI) {
      return window.top.electronAPI;
    }
  } catch (error) {
    // Ignore cross-context access errors.
  }

  return null;
}

async function fetchSections() {
  try {
    const electronAPI = getElectronApiBridge();
    if (!electronAPI || typeof electronAPI.getSections !== "function") {
      console.warn("Electron API bridge for getSections is not available.");
      return [];
    }

    const result = await electronAPI.getSections();
    if (!result || !result.success) {
      console.warn("getSections returned unsuccessful response:", result);
      return [];
    }
    return result.sections || [];
  } catch (error) {
    console.error("fetchSections error:", error);
    return [];
  }
}

async function fetchProfessors() {
  try {
    const electronAPI = getElectronApiBridge();
    if (!electronAPI || typeof electronAPI.getProfessors !== "function") {
      console.warn("Electron API bridge for getProfessors is not available.");
      return [];
    }

    const result = await electronAPI.getProfessors();
    if (!result || !result.success) {
      console.warn("getProfessors returned unsuccessful response:", result);
      return [];
    }
    return result.professors || [];
  } catch (error) {
    console.error("fetchProfessors error:", error);
    return [];
  }
}

function fillSelect(selectEl, items, valueKey, labelKey, placeholderText) {
  if (!selectEl) return;

  const current = selectEl.value;
  selectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.textContent = placeholderText;
  placeholder.disabled = true;
  placeholder.selected = true;
  selectEl.appendChild(placeholder);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item[valueKey] || item[labelKey] || "";
    option.textContent = item[labelKey] || item[valueKey] || "";
    selectEl.appendChild(option);
  });

  if (current) {
    const exists = Array.from(selectEl.options).some(
      (opt) => opt.value === current,
    );
    if (exists) selectEl.value = current;
  }
}

async function loadArchiveDropdownOptions() {
  const sectionEl = document.getElementById("archive-section");
  const professorEl = document.getElementById("archive-professor");

  const [sections, professors] = await Promise.all([
    fetchSections(),
    fetchProfessors(),
  ]);

  fillSelect(sectionEl, sections, "section_name", "section_name", "Section");
  fillSelect(professorEl, professors, "name", "name", "Professor");
}

window.loadArchiveDropdownOptions = loadArchiveDropdownOptions;
