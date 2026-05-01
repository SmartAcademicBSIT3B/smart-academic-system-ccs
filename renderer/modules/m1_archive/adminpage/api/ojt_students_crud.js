(function () {
  const selectedRows = new Set();
  let editingRow = null;
  let pendingDeleteRows = [];
  let activeActionRow = null;
  let viewingRow = null;
  let appDefaultDepartment = "CCS";
  let sectionOptions = [];
  const partnerAutocomplete = {
    partners: [],
    filtered: [],
    activeIndex: -1,
    eventsBound: false,
  };

  function getElectronAPI() {
    if (typeof window.getOjtStudentsElectronApiBridge === "function") {
      return window.getOjtStudentsElectronApiBridge();
    }
    return window.electronAPI || null;
  }

  function asText(value) {
    return String(value || "").trim();
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function normalizeSearch(value) {
    return asText(value).toLowerCase();
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveDepartmentFallback(value) {
    return asText(value) || appDefaultDepartment;
  }

  function setLockedDepartmentField(value) {
    const departmentSelect = document.getElementById("ojt-department");
    if (!departmentSelect) return;

    const departmentCode = resolveDepartmentFallback(value);
    departmentSelect.innerHTML = "";

    const option = document.createElement("option");
    option.value = departmentCode;
    option.textContent = departmentCode;
    departmentSelect.appendChild(option);

    departmentSelect.value = departmentCode;
    departmentSelect.disabled = true;
  }

  function normalizeSectionName(section) {
    return asText(section?.sections_name || section?.section_name || "");
  }

  function renderSectionOptions(options = [], selectedValue = "") {
    const sectionSelect = document.getElementById("ojt-section");
    if (!sectionSelect) return;

    const wanted = asText(selectedValue);
    const normalizedOptions = Array.isArray(options)
      ? options.map((section) => normalizeSectionName(section)).filter(Boolean)
      : [];

    sectionSelect.innerHTML =
      '<option value="">Select Section</option>' +
      normalizedOptions
        .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
        .join("");

    if (!normalizedOptions.length) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No sections found";
      emptyOption.disabled = true;
      sectionSelect.appendChild(emptyOption);
    }

    if (wanted && normalizedOptions.includes(wanted)) {
      sectionSelect.value = wanted;
      return;
    }

    if (wanted) {
      const option = document.createElement("option");
      option.value = wanted;
      option.textContent = wanted;
      sectionSelect.appendChild(option);
      sectionSelect.value = wanted;
      return;
    }

    sectionSelect.value = "";
  }

  async function loadSectionsForDepartment(departmentCode, selectedValue = "") {
    const electronAPI = getElectronAPI();
    const department = resolveDepartmentFallback(departmentCode);
    const ui = window.OjtStudentsUI;

    if (!electronAPI || typeof electronAPI.getSections !== "function") {
      renderSectionOptions([], selectedValue);
      return;
    }

    try {
      const result = await electronAPI.getSections(department);
      if (!result || !result.success || !Array.isArray(result.sections)) {
        sectionOptions = [];
        renderSectionOptions([], selectedValue);
        if (ui?.showToast) {
          ui.showToast(
            result?.message || "Failed to load sections for this department.",
            "error",
          );
        }
        return;
      }

      sectionOptions = result.sections;
      renderSectionOptions(sectionOptions, selectedValue);
    } catch (_error) {
      sectionOptions = [];
      renderSectionOptions([], selectedValue);
      if (ui?.showToast) {
        ui.showToast("Failed to load sections for this department.", "error");
      }
    }
  }

  async function loadDefaultDepartmentSetting() {
    try {
      const cached = localStorage.getItem("sas.app.settings");
      if (cached) {
        const parsed = JSON.parse(cached);
        const candidate = asText(parsed?.department?.department_code);
        if (candidate) {
          appDefaultDepartment = candidate;
        }
      }
    } catch (_error) {}

    const electronAPI = getElectronAPI();
    if (!electronAPI || typeof electronAPI.getAppSettings !== "function") {
      return;
    }

    try {
      const response = await electronAPI.getAppSettings();
      const candidate = asText(response?.settings?.department?.department_code);
      if (candidate) {
        appDefaultDepartment = candidate;
      }
    } catch (_error) {}

    setLockedDepartmentField(appDefaultDepartment);
  }

  function renderNoDataPlaceholderIfEmpty() {
    const tbody = document.getElementById("ojt-students-table-body");
    if (!tbody) return;

    const hasDataRows = tbody.querySelector("tr:not([data-placeholder])");
    if (hasDataRows) return;

    tbody.innerHTML = `
      <tr data-placeholder="ojt-student-status">
        <td colspan="12" style="text-align:center; padding: 42px 24px; color: var(--text-secondary);">
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <strong style="color: var(--text-primary);">No OJT students found.</strong>
            <span>Use the + button to add your first OJT student.</span>
          </div>
        </td>
      </tr>`;
  }

  function getPartnerAutocompleteElements() {
    return {
      input: document.getElementById("ojt-external-partner-assigned"),
      panel: document.getElementById("ojt-partner-suggestions"),
      group: document.querySelector(".ojt-partner-autocomplete-group"),
    };
  }

  function closePartnerSuggestions() {
    const { input, panel } = getPartnerAutocompleteElements();
    if (!panel) return;

    panel.classList.remove("open");
    panel.innerHTML = "";
    partnerAutocomplete.filtered = [];
    partnerAutocomplete.activeIndex = -1;

    if (input) {
      input.setAttribute("aria-expanded", "false");
    }
  }

  function setActivePartnerOption(nextIndex) {
    const { panel } = getPartnerAutocompleteElements();
    if (!panel) return;

    const options = Array.from(panel.querySelectorAll(".ojt-partner-option"));
    if (!options.length) {
      partnerAutocomplete.activeIndex = -1;
      return;
    }

    const normalized =
      ((nextIndex % options.length) + options.length) % options.length;
    partnerAutocomplete.activeIndex = normalized;

    options.forEach((option, index) => {
      option.classList.toggle("is-active", index === normalized);
      option.setAttribute(
        "aria-selected",
        index === normalized ? "true" : "false",
      );
    });

    options[normalized].scrollIntoView({ block: "nearest" });
  }

  function applyPartnerSelection(partner) {
    const { input } = getPartnerAutocompleteElements();
    if (!input || !partner) return;

    input.value = asText(partner.company_name);
    closePartnerSuggestions();
  }

  function getPartnerMatches(rawQuery) {
    const query = normalizeSearch(rawQuery);
    const allPartners = Array.isArray(partnerAutocomplete.partners)
      ? partnerAutocomplete.partners
      : [];

    if (!query) return allPartners.slice(0, 8);

    const starts = [];
    const contains = [];

    allPartners.forEach((partner) => {
      const name = normalizeSearch(partner.company_name);
      if (!name) return;

      if (name.startsWith(query)) {
        starts.push(partner);
      } else if (name.includes(query)) {
        contains.push(partner);
      }
    });

    return starts.concat(contains).slice(0, 8);
  }

  function renderPartnerSuggestions(matches) {
    const { input, panel } = getPartnerAutocompleteElements();
    if (!panel || !input) return;

    panel.innerHTML = "";
    partnerAutocomplete.filtered = matches;
    partnerAutocomplete.activeIndex = -1;

    if (!Array.isArray(matches) || !matches.length) {
      const empty = document.createElement("div");
      empty.className = "ojt-partner-empty";
      empty.textContent = "No matching external partners";
      panel.appendChild(empty);
      panel.classList.add("open");
      input.setAttribute("aria-expanded", "true");
      return;
    }

    matches.forEach((partner, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "ojt-partner-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.index = String(index);

      const name = document.createElement("span");
      name.className = "ojt-partner-option-name";
      name.textContent = asText(partner.company_name);

      const meta = document.createElement("span");
      meta.className = "ojt-partner-option-meta";
      const address = asText(partner.address);
      const representative = asText(partner.representative);
      const metaBits = [address, representative].filter(Boolean);
      meta.textContent = metaBits.join(" • ") || "External partner";

      option.appendChild(name);
      option.appendChild(meta);

      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        applyPartnerSelection(partner);
      });

      panel.appendChild(option);
    });

    panel.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  }

  async function loadExternalPartnerSuggestions() {
    const electronAPI = getElectronAPI();
    if (!electronAPI || typeof electronAPI.getExternalPartners !== "function") {
      partnerAutocomplete.partners = [];
      return;
    }

    try {
      const result = await electronAPI.getExternalPartners();
      if (!result || !result.success) {
        partnerAutocomplete.partners = [];
        return;
      }

      const seen = new Set();
      const uniquePartners = [];
      const partners = Array.isArray(result.partners) ? result.partners : [];

      partners.forEach((partner) => {
        const companyName = asText(partner?.company_name);
        if (!companyName) return;

        const key = companyName.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        uniquePartners.push({
          company_name: companyName,
          address: asText(partner?.address),
          representative: asText(partner?.representative),
        });
      });

      uniquePartners.sort((a, b) =>
        a.company_name.localeCompare(b.company_name),
      );
      partnerAutocomplete.partners = uniquePartners;
    } catch (_error) {
      partnerAutocomplete.partners = [];
    }
  }

  function bindPartnerAutocomplete() {
    if (partnerAutocomplete.eventsBound) return;

    const { input, group } = getPartnerAutocompleteElements();
    if (!input || !group) return;

    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "ojt-partner-suggestions");

    input.addEventListener("focus", () => {
      renderPartnerSuggestions(getPartnerMatches(input.value));
    });

    input.addEventListener("input", () => {
      renderPartnerSuggestions(getPartnerMatches(input.value));
    });

    input.addEventListener("keydown", (event) => {
      const panelOpen = document
        .getElementById("ojt-partner-suggestions")
        ?.classList.contains("open");

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!panelOpen) {
          renderPartnerSuggestions(getPartnerMatches(input.value));
        }
        setActivePartnerOption(partnerAutocomplete.activeIndex + 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!panelOpen) {
          renderPartnerSuggestions(getPartnerMatches(input.value));
        }
        setActivePartnerOption(partnerAutocomplete.activeIndex - 1);
        return;
      }

      if (event.key === "Enter" && panelOpen) {
        if (partnerAutocomplete.activeIndex >= 0) {
          event.preventDefault();
          applyPartnerSelection(
            partnerAutocomplete.filtered[partnerAutocomplete.activeIndex],
          );
        }
        return;
      }

      if (event.key === "Escape") {
        closePartnerSuggestions();
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".ojt-partner-autocomplete-group")) {
        closePartnerSuggestions();
      }
    });

    partnerAutocomplete.eventsBound = true;
  }

  function studentFromRow(row) {
    return {
      id: asText(row?.dataset?.id),
      student_id: asText(row?.dataset?.studentId),
      name: asText(row?.dataset?.name),
      section: asText(row?.dataset?.section),
      department: asText(row?.dataset?.department),
      email: asText(row?.dataset?.email),
      contact_no: asText(row?.dataset?.contactNo),
      status: asText(row?.dataset?.status),
      external_partner_assigned: asText(row?.dataset?.externalPartnerAssigned),
      nature_of_business: asText(row?.dataset?.natureOfBusiness),
    };
  }

  function syncRowDataset(row, student) {
    row.dataset.id = String(student.id || "");
    row.dataset.studentId = asText(student.student_id);
    row.dataset.name = asText(student.name);
    row.dataset.section = asText(student.section);
    row.dataset.department = resolveDepartmentFallback(student.department);
    row.dataset.email = asText(student.email);
    row.dataset.contactNo = asText(student.contact_no);
    row.dataset.status = asText(student.status);
    row.dataset.externalPartnerAssigned = asText(
      student.external_partner_assigned,
    );
    row.dataset.natureOfBusiness = asText(student.nature_of_business);
  }

  function normalizeOjtStatus(value) {
    const normalized = asText(value).toLowerCase();
    if (normalized === "deployed") return "Deployed";
    if (normalized === "pre-deployment") return "Pre-Deployment";
    if (normalized === "pending requirements") return "Pending Requirements";
    return "Pending Requirements";
  }

  function ojtStatusDotClass(statusValue) {
    const status = normalizeOjtStatus(statusValue);
    if (status === "Deployed") return "ojt-dot-deployed";
    if (status === "Pre-Deployment") return "ojt-dot-pre-deployment";
    return "ojt-dot-pending-requirements";
  }

  function renderOjtStatusSelect(value, selectClass = "ojt-row-status-select") {
    const status = normalizeOjtStatus(value);
    const dotClass = ojtStatusDotClass(status);

    return `<div class="ojt-status-control"><span class="ojt-status-dot ${dotClass}"></span><select class="${esc(selectClass)}"><option ${status === "Pending Requirements" ? "selected" : ""}>Pending Requirements</option><option ${status === "Pre-Deployment" ? "selected" : ""}>Pre-Deployment</option><option ${status === "Deployed" ? "selected" : ""}>Deployed</option></select></div>`;
  }

  function renderOjtStatusBadge(value) {
    const status = normalizeOjtStatus(value);
    const dotClass = ojtStatusDotClass(status);
    return `<span class="ojt-view-status-badge"><span class="ojt-status-dot ${dotClass}"></span>${esc(status)}</span>`;
  }

  function renderViewModalStatusUI(value) {
    const status = normalizeOjtStatus(value);
    const dotClass = ojtStatusDotClass(status);

    const badge = document.getElementById("ojtv-status-badge");
    if (badge) {
      badge.innerHTML = `<span class="ojt-status-dot ${dotClass}"></span>${esc(status)}`;
    }

    const statusControl = document.getElementById("ojtv-status-control");
    if (statusControl) {
      statusControl.innerHTML = renderOjtStatusSelect(
        status,
        "ojtv-status-select",
      );
    }
  }

  function buildRowMarkup(student) {
    const statusValue = normalizeOjtStatus(student.status);

    return `
      <td><input type="checkbox" class="archive-checkbox row-check" /></td>
      <td>${esc(student.student_id)}</td>
      <td>${esc(student.name)}</td>
      <td>${esc(student.section)}</td>
      <td>${esc(student.email)}</td>
      <td>${esc(student.contact_no)}</td>
      <td>${esc(student.external_partner_assigned)}</td>
      <td>${esc(student.nature_of_business)}</td>
      <td class="col-status">${renderOjtStatusSelect(statusValue)}</td>
      <td class="action-cell"><button class="dots-btn" type="button"><i data-lucide="more-vertical"></i></button></td>
    `;
  }

  function getUpdatePayloadFromRow(row, nextStatus) {
    const student = studentFromRow(row);
    return {
      id: Number.parseInt(student.id, 10),
      student_id: student.student_id,
      name: student.name,
      section: student.section,
      department: student.department || appDefaultDepartment,
      email: student.email,
      contact_no: student.contact_no,
      status: normalizeOjtStatus(nextStatus),
      external_partner_assigned: student.external_partner_assigned,
      nature_of_business: student.nature_of_business,
    };
  }

  async function persistRowStatusChange(row, nextStatus, selectControl) {
    const electronAPI = getElectronAPI();
    const ui = window.OjtStudentsUI;
    if (!row || !electronAPI || !selectControl) return;

    const previousStatus = normalizeOjtStatus(row.dataset.status);
    const normalizedNextStatus = normalizeOjtStatus(nextStatus);
    if (previousStatus === normalizedNextStatus) return;

    const payload = getUpdatePayloadFromRow(row, normalizedNextStatus);
    if (!Number.isInteger(payload.id) || payload.id <= 0) {
      selectControl.value = previousStatus;
      return;
    }

    selectControl.disabled = true;
    const result = await electronAPI.updateOjtStudent(payload);
    selectControl.disabled = false;

    if (!result || !result.success || !result.student) {
      selectControl.value = previousStatus;
      ui?.showToast(result?.message || "Failed to update status.", "error");
      return;
    }

    row.dataset.status = normalizedNextStatus;
    const dot = row.querySelector(".ojt-status-dot");
    if (dot) {
      dot.className = `ojt-status-dot ${ojtStatusDotClass(normalizedNextStatus)}`;
    }

    if (viewingRow && viewingRow.dataset.id === row.dataset.id) {
      renderViewModalStatusUI(normalizedNextStatus);
    }

    ui?.showToast("OJT student status updated.", "success", 2200);
  }

  function flashInsertedRow(row) {
    if (!row) return;

    row.classList.remove("row-inserted");
    void row.offsetWidth;
    row.classList.add("row-inserted");

    if (row.offsetParent !== null) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    window.setTimeout(() => {
      row.classList.remove("row-inserted");
    }, 2400);
  }

  function addOjtStudentRow(student, options = {}) {
    const highlight = Boolean(options.highlight);
    const tbody = document.getElementById("ojt-students-table-body");
    if (!tbody) return;

    const placeholders = tbody.querySelectorAll("tr[data-placeholder]");
    placeholders.forEach((row) => row.remove());

    const existing = tbody.querySelector(`tr[data-id='${String(student.id)}']`);
    if (existing) {
      syncRowDataset(existing, student);
      existing.innerHTML = buildRowMarkup(student);
      return;
    }

    const row = document.createElement("tr");
    row.dataset.id = String(student.id || "");
    syncRowDataset(row, student);
    row.innerHTML = buildRowMarkup(student);

    const firstDataRow = tbody.querySelector("tr:not([data-placeholder])");
    if (firstDataRow) tbody.insertBefore(row, firstDataRow);
    else tbody.appendChild(row);

    if (highlight) flashInsertedRow(row);
  }

  function getFormValues() {
    return {
      student_id: asText(document.getElementById("ojt-student-id")?.value),
      name: asText(document.getElementById("ojt-name")?.value),
      section: asText(document.getElementById("ojt-section")?.value),
      department:
        asText(document.getElementById("ojt-department")?.value) ||
        appDefaultDepartment,
      email: asText(document.getElementById("ojt-email")?.value),
      contact_no: normalizeDigits(
        document.getElementById("ojt-contact-no")?.value,
      ),
      status:
        asText(document.getElementById("ojt-status")?.value) ||
        "Pending Requirements",
      external_partner_assigned: asText(
        document.getElementById("ojt-external-partner-assigned")?.value,
      ),
      nature_of_business: asText(
        document.getElementById("ojt-nature-of-business")?.value,
      ),
    };
  }

  function clearAllFieldErrors() {
    [
      "ojt-student-id",
      "ojt-name",
      "ojt-section",
      "ojt-email",
      "ojt-contact-no",
    ].forEach((id) => {
      const field = document.getElementById(id);
      const errorEl = document.getElementById(`${id}-error`);
      field?.classList.remove("input-invalid");
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.remove("show");
      }
    });
  }

  function setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}-error`);
    field?.classList.add("input-invalid");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    }
  }

  function validateEmail(value) {
    if (!value) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validatePayload(payload) {
    const errors = {};

    if (!payload.student_id)
      errors["ojt-student-id"] = "Student ID is required.";
    if (!payload.name) errors["ojt-name"] = "Name is required.";
    if (!payload.section) errors["ojt-section"] = "Section is required.";
    if (!payload.email) {
      errors["ojt-email"] =
        "Email is required to send student login credentials.";
    } else if (!validateEmail(payload.email)) {
      errors["ojt-email"] = "Please enter a valid email address.";
    }
    if (payload.contact_no && payload.contact_no.length < 7) {
      errors["ojt-contact-no"] = "Contact number is too short.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  function setFormValues(student) {
    document.getElementById("ojt-student-id").value = asText(
      student.student_id,
    );
    document.getElementById("ojt-name").value = asText(student.name);
    const targetDepartment = asText(
      resolveDepartmentFallback(student.department),
    );
    setLockedDepartmentField(targetDepartment);
    loadSectionsForDepartment(targetDepartment, asText(student.section));
    document.getElementById("ojt-email").value = asText(student.email);
    document.getElementById("ojt-contact-no").value = asText(
      student.contact_no,
    );
    document.getElementById("ojt-status").value =
      asText(student.status) || "Pending Requirements";
    document.getElementById("ojt-external-partner-assigned").value = asText(
      student.external_partner_assigned,
    );
    document.getElementById("ojt-nature-of-business").value = asText(
      student.nature_of_business,
    );
  }

  function resetForm() {
    setLockedDepartmentField(appDefaultDepartment);
    setFormValues({
      student_id: "",
      name: "",
      section: "",
      department: appDefaultDepartment,
      email: "",
      contact_no: "",
      status: "Pending Requirements",
      external_partner_assigned: "",
      nature_of_business: "",
    });
    loadSectionsForDepartment(appDefaultDepartment, "");
    clearAllFieldErrors();
    closePartnerSuggestions();
  }

  function openFormForAdd() {
    editingRow = null;
    document.getElementById("ojt-student-modal-title").textContent =
      "ADDING NEW OJT STUDENT";
    resetForm();
    window.OjtStudentsUI?.openModal(
      document.getElementById("ojt-student-modal"),
    );
    loadExternalPartnerSuggestions();
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  function openFormForEdit(row) {
    if (!row) return;
    editingRow = row;
    const student = studentFromRow(row);
    document.getElementById("ojt-student-modal-title").textContent =
      "EDIT OJT STUDENT";
    setFormValues(student);
    clearAllFieldErrors();
    window.OjtStudentsUI?.openModal(
      document.getElementById("ojt-student-modal"),
    );
    loadExternalPartnerSuggestions();
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  function renderViewModal(row) {
    const student = studentFromRow(row);
    document.getElementById("ojtv-student-id").textContent =
      asText(student.student_id) || "-";
    document.getElementById("ojtv-name").textContent =
      asText(student.name) || "-";
    document.getElementById("ojtv-section").textContent =
      asText(student.section) || "-";
    document.getElementById("ojtv-email").textContent =
      asText(student.email) || "-";
    document.getElementById("ojtv-contact-no").textContent =
      asText(student.contact_no) || "-";
    renderViewModalStatusUI(student.status);
    document.getElementById("ojtv-external-partner-assigned").textContent =
      asText(student.external_partner_assigned) || "-";
    document.getElementById("ojtv-nature-of-business").textContent =
      asText(student.nature_of_business) || "-";
  }

  function openViewModal(row) {
    if (!row) return;
    viewingRow = row;
    renderViewModal(row);
    window.OjtStudentsUI?.openModal(
      document.getElementById("ojt-student-view-modal"),
    );
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  function closeActionMenu() {
    const menu = document.getElementById("archive-action-menu");
    if (menu) menu.style.display = "none";
    activeActionRow = null;
  }

  function openActionMenu(dotsBtn, row) {
    const menu = document.getElementById("archive-action-menu");
    if (!menu || !dotsBtn || !row) return;

    activeActionRow = row;
    if (typeof lucide !== "undefined") lucide.createIcons({ nodes: [menu] });

    const rect = dotsBtn.getBoundingClientRect();
    const menuW = 210;
    const menuH = menu.offsetHeight || 190;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top;
    let left;

    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = Math.max(8, rect.top - menuH - 4);
    }

    left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8)
      left = window.innerWidth - menuW - 8;

    menu.style.transform = "";
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = "flex";
  }

  function updateSelectionUI() {
    const bar = document.getElementById("bulk-action-bar");
    const countEl = document.getElementById("bulk-action-count");
    if (!bar || !countEl) return;

    const count = selectedRows.size;
    countEl.textContent = `${count} selected`;

    if (count > 0) {
      bar.style.visibility = "visible";
      bar.style.opacity = "1";
      bar.style.pointerEvents = "auto";
    } else {
      bar.style.visibility = "hidden";
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }
  }

  function setRowSelected(row, value) {
    if (!row) return;
    const key = row.dataset.id;
    const checkbox = row.querySelector(".row-check");

    if (value) selectedRows.add(key);
    else selectedRows.delete(key);

    row.classList.toggle("row-selected", value);
    if (checkbox) checkbox.checked = value;
  }

  function clearSelection() {
    selectedRows.clear();
    document.querySelectorAll("#ojt-students-table-body tr").forEach((row) => {
      row.classList.remove("row-selected");
      const cb = row.querySelector(".row-check");
      if (cb) cb.checked = false;
    });

    const selectAll = document.getElementById("select-all-archives");
    if (selectAll) selectAll.checked = false;

    updateSelectionUI();
  }

  function openDeleteConfirm(rows) {
    pendingDeleteRows = Array.isArray(rows) ? rows : [];

    const label = document.getElementById("ojt-delete-confirm-target");
    if (label) {
      if (pendingDeleteRows.length === 1) {
        const student = studentFromRow(pendingDeleteRows[0]);
        label.textContent = `Are you sure you want to delete \"${student.name || "Unknown"}\"?`;
      } else if (pendingDeleteRows.length > 1) {
        label.textContent = `Are you sure you want to delete ${pendingDeleteRows.length} OJT students?`;
      } else {
        label.textContent = "This OJT student will be permanently deleted.";
      }
    }

    const input = document.getElementById("ojt-delete-confirm-input");
    const submit = document.getElementById("ojt-delete-confirm-submit");
    if (input) input.value = "";
    if (submit) submit.disabled = true;

    window.OjtStudentsUI?.openModal(
      document.getElementById("ojt-delete-confirm-modal"),
    );
  }

  function closeDeleteConfirm() {
    pendingDeleteRows = [];
    const input = document.getElementById("ojt-delete-confirm-input");
    const submit = document.getElementById("ojt-delete-confirm-submit");
    if (input) input.value = "";
    if (submit) submit.disabled = true;

    window.OjtStudentsUI?.closeModal(
      document.getElementById("ojt-delete-confirm-modal"),
    );
  }

  function setStudentModalLoading(isLoading, text) {
    const overlay = document.getElementById("ojt-student-loading-overlay");
    const label = document.getElementById("ojt-student-loading-text");
    const saveBtn = document.getElementById("ojt-student-save-btn");
    const cancelBtn = document.getElementById("ojt-student-cancel-btn");

    if (label && text) {
      label.textContent = text;
    }

    if (overlay) {
      overlay.style.display = isLoading ? "flex" : "none";
    }

    if (saveBtn) saveBtn.disabled = Boolean(isLoading);
    if (cancelBtn) cancelBtn.disabled = Boolean(isLoading);
  }

  async function saveStudent() {
    const ui = window.OjtStudentsUI;
    const electronAPI = getElectronAPI();
    if (!ui || !electronAPI) return;

    const payload = getFormValues();
    clearAllFieldErrors();
    const validation = validatePayload(payload);

    if (!validation.valid) {
      const requiredMissing =
        Boolean(validation.errors["ojt-student-id"]) ||
        Boolean(validation.errors["ojt-name"]) ||
        Boolean(validation.errors["ojt-section"]) ||
        Boolean(validation.errors["ojt-email"]);

      Object.entries(validation.errors).forEach(([fieldId, message]) => {
        setFieldError(fieldId, message);
      });

      if (requiredMissing) {
        ui.openModal(document.getElementById("ojt-required-fields-modal"));
      }

      const firstField = Object.keys(validation.errors)[0];
      document.getElementById(firstField)?.focus();
      return;
    }

    const isEdit = Boolean(editingRow && editingRow.dataset.id);
    if (isEdit) payload.id = Number.parseInt(editingRow.dataset.id, 10);
    if (!isEdit) payload.email_dispatch_mode = "wait";

    setStudentModalLoading(
      true,
      isEdit
        ? "Saving student changes..."
        : "Saving student record and creating account...",
    );

    const result = isEdit
      ? await electronAPI.updateOjtStudent(payload)
      : await electronAPI.createOjtStudent(payload);

    setStudentModalLoading(false);

    if (!result || !result.success || !result.student) {
      ui.showToast(result?.message || "Failed to save OJT student.", "error");
      return;
    }

    addOjtStudentRow(result.student, { highlight: !isEdit });
    ui.closeModal(document.getElementById("ojt-student-modal"));
    ui.showToast(
      isEdit
        ? "OJT student updated successfully."
        : "OJT student added successfully.",
      "success",
    );

    if (!isEdit) {
      if (result?.studentUser?.emailSent) {
        ui.showToast(
          "Student credentials email sent successfully.",
          "success",
          3600,
        );
      } else if (result?.studentUser?.emailQueued) {
        ui.showToast(
          "Student account created. Credentials email is being sent in the background.",
          "info",
          4200,
        );
      } else if (result?.studentUser?.emailError) {
        ui.showToast(
          `Student saved but email failed: ${result.studentUser.emailError}`,
          "error",
          5000,
        );
      }
    }

    if (window.ojtStudentsSearchFilter) {
      window.ojtStudentsSearchFilter.refresh();
    }

    resetForm();
    clearSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  async function deletePendingStudents() {
    const ui = window.OjtStudentsUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI || !pendingDeleteRows.length) {
      closeDeleteConfirm();
      return;
    }

    const failed = [];

    for (const row of pendingDeleteRows) {
      const id = Number.parseInt(row?.dataset?.id, 10);
      if (!Number.isInteger(id) || id <= 0) continue;

      const result = await electronAPI.deleteOjtStudent(id);
      if (!result || !result.success) {
        failed.push(
          result?.message || `Failed to delete OJT student ID ${id}.`,
        );
      } else if (row && row.parentNode) {
        row.parentNode.removeChild(row);
      }
    }

    closeDeleteConfirm();

    if (failed.length) ui.showToast(failed[0], "error");
    else ui.showToast("OJT student deleted successfully.", "success");

    clearSelection();
    renderNoDataPlaceholderIfEmpty();
    if (window.ojtStudentsSearchFilter) {
      window.ojtStudentsSearchFilter.refresh();
    }
  }

  function parseCsvRow(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }

    result.push(current);
    return result.map((value) => value.trim());
  }

  function normalizeHeader(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getTemplateCsvContent() {
    const headers = [
      "Student ID",
      "Name",
      "Section",
      "Department",
      "Email",
      "Contact no.",
      "Status",
      "External Partner Assigned",
      "Nature of Business",
    ];

    const sample = [
      "2021-0001",
      "Juan Dela Cruz",
      "BSIT-4A",
      appDefaultDepartment,
      "juan.delacruz@plpasig.edu.ph",
      "09171234567",
      "Deployed",
      "Acme Corporation",
      "Software Development",
    ];

    const toCsvCell = (value) => {
      const s = String(value ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    return `${headers.map(toCsvCell).join(",")}\n${sample.map(toCsvCell).join(",")}`;
  }

  function downloadCsvTemplate() {
    const blob = new Blob([getTemplateCsvContent()], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ojt_students_template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function payloadFromCsvRecord(record) {
    return {
      student_id: asText(record.student_id),
      name: asText(record.name),
      section: asText(record.section),
      department: asText(record.department) || appDefaultDepartment,
      email: asText(record.email),
      contact_no: normalizeDigits(record.contact_no),
      status: asText(record.status) || "Deployed",
      external_partner_assigned: asText(record.external_partner_assigned),
      nature_of_business: asText(record.nature_of_business),
    };
  }

  let bulkPreviewRows = [];

  function buildBulkPreviewRow(record) {
    return `<tr>
      <td><input type="text" class="ojt-bulk-student-id" value="${esc(record.student_id || "")}" /></td>
      <td><input type="text" class="ojt-bulk-name" value="${esc(record.name || "")}" /></td>
      <td><input type="text" class="ojt-bulk-section" value="${esc(record.section || "")}" /></td>
      <td><input type="text" class="ojt-bulk-department" value="${esc(record.department || appDefaultDepartment)}" /></td>
      <td><input type="text" class="ojt-bulk-email" value="${esc(record.email || "")}" /></td>
      <td><input type="text" class="ojt-bulk-contact-no" value="${esc(record.contact_no || "")}" /></td>
      <td><input type="text" class="ojt-bulk-status" value="${esc(record.status || "Deployed")}" /></td>
      <td><input type="text" class="ojt-bulk-external-partner-assigned" value="${esc(record.external_partner_assigned || "")}" /></td>
      <td><input type="text" class="ojt-bulk-nature-of-business" value="${esc(record.nature_of_business || "")}" /></td>
    </tr>`;
  }

  function openBulkPreviewModal(records) {
    bulkPreviewRows = records.map((r) => ({ ...r }));

    const tbody = document.getElementById("ojt-bulk-summary-body");
    if (tbody) {
      tbody.innerHTML = records.map((r) => buildBulkPreviewRow(r)).join("");
    }

    window.OjtStudentsUI?.openModal(
      document.getElementById("ojt-bulk-summary-modal"),
    );
  }

  function collectBulkPreviewData() {
    const tbody = document.getElementById("ojt-bulk-summary-body");
    if (!tbody) return [];

    return Array.from(tbody.querySelectorAll("tr")).map((tr) => ({
      student_id: tr.querySelector(".ojt-bulk-student-id")?.value || "",
      name: tr.querySelector(".ojt-bulk-name")?.value || "",
      section: tr.querySelector(".ojt-bulk-section")?.value || "",
      department:
        tr.querySelector(".ojt-bulk-department")?.value || appDefaultDepartment,
      email: tr.querySelector(".ojt-bulk-email")?.value || "",
      contact_no: tr.querySelector(".ojt-bulk-contact-no")?.value || "",
      status: tr.querySelector(".ojt-bulk-status")?.value || "Deployed",
      external_partner_assigned:
        tr.querySelector(".ojt-bulk-external-partner-assigned")?.value || "",
      nature_of_business:
        tr.querySelector(".ojt-bulk-nature-of-business")?.value || "",
    }));
  }

  async function importBulkPreviewRows() {
    const ui = window.OjtStudentsUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI) return;

    const records = collectBulkPreviewData();
    if (!records.length) return;

    const loadingOverlay = document.getElementById("ojt-bulk-loading-overlay");
    const loadingText = document.getElementById("ojt-bulk-loading-text");
    if (loadingOverlay) loadingOverlay.style.display = "flex";

    const createdRows = [];
    const failedRows = [];
    let queuedEmailCount = 0;

    for (let i = 0; i < records.length; i += 1) {
      if (loadingText) {
        loadingText.textContent = `Importing row ${i + 1} of ${records.length}...`;
      }

      const payload = payloadFromCsvRecord(records[i]);
      const validation = validatePayload(payload);
      if (!validation.valid) {
        const firstError =
          Object.values(validation.errors)[0] || "Invalid data.";
        failedRows.push(`Row ${i + 1}: ${firstError}`);
        continue;
      }

      const result = await electronAPI.createOjtStudent(payload);
      if (!result || !result.success || !result.student) {
        failedRows.push(
          `Row ${i + 1}: ${result?.message || "Failed to create student."}`,
        );
        continue;
      }

      if (result?.studentUser?.emailQueued) {
        queuedEmailCount += 1;
      }

      createdRows.push(result.student);
      addOjtStudentRow(result.student, { highlight: true });
    }

    if (loadingOverlay) loadingOverlay.style.display = "none";

    window.OjtStudentsUI?.closeModal(
      document.getElementById("ojt-bulk-summary-modal"),
    );

    if (window.ojtStudentsSearchFilter) {
      window.ojtStudentsSearchFilter.refresh();
    }

    if (createdRows.length) {
      ui.showToast(
        `${createdRows.length} OJT student${createdRows.length === 1 ? "" : "s"} imported.`,
        "success",
      );

      if (queuedEmailCount > 0) {
        ui.showToast(
          `${queuedEmailCount} credential email${queuedEmailCount === 1 ? " is" : "s are"} being sent in the background.`,
          "info",
          4200,
        );
      }
    }

    if (failedRows.length) {
      ui.showToast(failedRows[0], "error");
      console.warn("OJT student bulk import row errors:", failedRows);
    }
  }

  async function handleBulkCsvUpload(file) {
    const ui = window.OjtStudentsUI;

    if (!ui || !file) return;

    const rawText = await file.text();
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      ui.showToast(
        "CSV file must include a header and at least one row.",
        "error",
      );
      return;
    }

    const headerRow = parseCsvRow(lines[0]);
    const headerMap = {};
    headerRow.forEach((header, idx) => {
      headerMap[normalizeHeader(header)] = idx;
    });

    const indexOf = (aliases) => {
      for (const alias of aliases) {
        const index = headerMap[normalizeHeader(alias)];
        if (typeof index === "number") return index;
      }
      return -1;
    };

    const columnIndex = {
      student_id: indexOf(["student id"]),
      name: indexOf(["name"]),
      section: indexOf(["section"]),
      department: indexOf(["department"]),
      email: indexOf(["email"]),
      contact_no: indexOf(["contact no", "contact no.", "contact"]),
      status: indexOf(["status"]),
      external_partner_assigned: indexOf([
        "external partner assigned",
        "external partner",
        "partner",
      ]),
      nature_of_business: indexOf(["nature of business", "nature"]),
    };

    if (
      columnIndex.student_id < 0 ||
      columnIndex.name < 0 ||
      columnIndex.section < 0
    ) {
      ui.showToast(
        "CSV headers are invalid. Please use the downloaded template format.",
        "error",
      );
      return;
    }

    const parsedRecords = [];

    for (let i = 1; i < lines.length; i += 1) {
      const rowData = parseCsvRow(lines[i]);
      if (!rowData.length) continue;

      parsedRecords.push({
        student_id: rowData[columnIndex.student_id] || "",
        name: rowData[columnIndex.name] || "",
        section: rowData[columnIndex.section] || "",
        department:
          columnIndex.department >= 0
            ? rowData[columnIndex.department]
            : appDefaultDepartment,
        email: columnIndex.email >= 0 ? rowData[columnIndex.email] : "",
        contact_no:
          columnIndex.contact_no >= 0 ? rowData[columnIndex.contact_no] : "",
        status:
          columnIndex.status >= 0 ? rowData[columnIndex.status] : "Deployed",
        external_partner_assigned:
          columnIndex.external_partner_assigned >= 0
            ? rowData[columnIndex.external_partner_assigned]
            : "",
        nature_of_business:
          columnIndex.nature_of_business >= 0
            ? rowData[columnIndex.nature_of_business]
            : "",
      });
    }

    if (!parsedRecords.length) {
      ui.showToast("No valid data rows found in the CSV.", "error");
      return;
    }

    openBulkPreviewModal(parsedRecords);
  }

  function bindEvents() {
    const ui = window.OjtStudentsUI;

    document
      .getElementById("ojt-open-modal")
      ?.addEventListener("click", openFormForAdd);

    document
      .getElementById("ojt-student-cancel-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ojt-student-modal"));
        resetForm();
      });

    document
      .getElementById("ojt-student-save-btn")
      ?.addEventListener("click", saveStudent);

    document
      .getElementById("ojt-download-template-btn")
      ?.addEventListener("click", () => {
        downloadCsvTemplate();
        ui?.showToast("CSV template downloaded.", "success");
      });

    document
      .getElementById("ojt-upload-csv-btn")
      ?.addEventListener("click", () => {
        document.getElementById("ojt-csv-input")?.click();
      });

    document
      .getElementById("ojt-csv-input")
      ?.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await handleBulkCsvUpload(file);
        event.target.value = "";
      });

    document
      .getElementById("ojt-bulk-summary-cancel")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ojt-bulk-summary-modal"));
        bulkPreviewRows = [];
      });

    document
      .getElementById("ojt-bulk-summary-import")
      ?.addEventListener("click", importBulkPreviewRows);

    document
      .getElementById("ojt-required-fields-ok-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ojt-required-fields-modal"));
      });

    document
      .getElementById("ojt-delete-confirm-cancel")
      ?.addEventListener("click", closeDeleteConfirm);

    document
      .getElementById("ojt-delete-confirm-input")
      ?.addEventListener("input", (event) => {
        const value = String(event.target.value || "")
          .trim()
          .toUpperCase();
        const submit = document.getElementById("ojt-delete-confirm-submit");
        if (submit) submit.disabled = value !== "DELETE";
      });

    document
      .getElementById("ojt-delete-confirm-submit")
      ?.addEventListener("click", deletePendingStudents);

    document
      .getElementById("ojt-view-header-close-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ojt-student-view-modal"));
      });

    document
      .getElementById("ojt-view-close-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ojt-student-view-modal"));
      });

    document
      .getElementById("ojt-view-edit-btn")
      ?.addEventListener("click", () => {
        if (!viewingRow) return;
        ui?.closeModal(document.getElementById("ojt-student-view-modal"));
        openFormForEdit(viewingRow);
      });

    document
      .getElementById("ojt-view-delete-btn")
      ?.addEventListener("click", () => {
        if (!viewingRow) return;
        ui?.closeModal(document.getElementById("ojt-student-view-modal"));
        openDeleteConfirm([viewingRow]);
      });

    document.addEventListener("click", (event) => {
      const dots = event.target.closest(".dots-btn");
      const row = event.target.closest("#ojt-students-table-body tr");

      if (dots && row) {
        event.stopPropagation();
        const menu = document.getElementById("archive-action-menu");
        if (menu && menu.style.display === "flex" && activeActionRow === row) {
          closeActionMenu();
          return;
        }

        openActionMenu(dots, row);
        return;
      }

      if (!event.target.closest("#archive-action-menu")) {
        closeActionMenu();
      }
    });

    document.addEventListener("dblclick", (event) => {
      const row = event.target.closest("#ojt-students-table-body tr");
      if (!row || row.dataset.placeholder) return;
      openViewModal(row);
    });

    document
      .getElementById("archive-action-menu")
      ?.addEventListener("click", (event) => {
        const btn = event.target.closest("button");
        if (!btn || !activeActionRow) return;

        if (btn.classList.contains("view-btn")) {
          openViewModal(activeActionRow);
        } else if (btn.classList.contains("edit-btn")) {
          openFormForEdit(activeActionRow);
        } else if (btn.classList.contains("delete-btn")) {
          openDeleteConfirm([activeActionRow]);
        }

        closeActionMenu();
      });

    document.addEventListener("click", (event) => {
      const row = event.target.closest("#ojt-students-table-body tr");
      if (!row || row.dataset.placeholder) return;
      if (
        event.target.closest(".dots-btn") ||
        event.target.closest(".row-check") ||
        event.target.closest(".ojt-row-status-select")
      )
        return;
      if (event.target.closest("#archive-action-menu")) return;

      const currentlySelected = selectedRows.has(row.dataset.id);
      setRowSelected(row, !currentlySelected);
      updateSelectionUI();
    });

    document.addEventListener("change", (event) => {
      if (event.target?.id === "ojtv-status-select") {
        if (!viewingRow) return;
        persistRowStatusChange(viewingRow, event.target.value, event.target);
        return;
      }

      const rowStatusSelect = event.target.closest(".ojt-row-status-select");
      if (rowStatusSelect) {
        const row = rowStatusSelect.closest("tr");
        if (!row) return;
        persistRowStatusChange(row, rowStatusSelect.value, rowStatusSelect);
        return;
      }

      const rowCheck = event.target.closest(".row-check");
      if (rowCheck) {
        const row = rowCheck.closest("tr");
        if (!row) return;
        setRowSelected(row, rowCheck.checked);
        updateSelectionUI();
        return;
      }

      if (event.target.id === "select-all-archives") {
        const rows = Array.from(
          document.querySelectorAll(
            "#ojt-students-table-body tr:not([data-placeholder])",
          ),
        );
        rows.forEach((row) => setRowSelected(row, event.target.checked));
        updateSelectionUI();
      }
    });

    document
      .getElementById("bulk-delete-btn")
      ?.addEventListener("click", () => {
        const rows = Array.from(
          document.querySelectorAll("#ojt-students-table-body tr"),
        ).filter((row) => selectedRows.has(row.dataset.id));
        if (!rows.length) return;
        openDeleteConfirm(rows);
      });

    document
      .getElementById("bulk-clear-btn")
      ?.addEventListener("click", clearSelection);

    [
      document.getElementById("ojt-student-modal"),
      document.getElementById("ojt-required-fields-modal"),
      document.getElementById("ojt-delete-confirm-modal"),
      document.getElementById("ojt-student-view-modal"),
      document.getElementById("ojt-bulk-summary-modal"),
      document.getElementById("ojt-export-modal"),
    ].forEach((modalEl) => {
      modalEl?.addEventListener("click", (event) => {
        if (event.target !== modalEl) return;
        window.OjtStudentsUI?.closeModal(modalEl);
      });
    });

    window.addEventListener("scroll", closeActionMenu, { passive: true });
    window.addEventListener("resize", closeActionMenu, { passive: true });
  }

  async function init() {
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    await loadDefaultDepartmentSetting();
    setLockedDepartmentField(appDefaultDepartment);
    bindEvents();
    bindPartnerAutocomplete();
    await loadSectionsForDepartment(appDefaultDepartment, "");
    loadExternalPartnerSuggestions();

    if (typeof window.loadOjtStudents === "function") {
      window.loadOjtStudents();
    }
  }

  window.addOjtStudentRow = addOjtStudentRow;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
