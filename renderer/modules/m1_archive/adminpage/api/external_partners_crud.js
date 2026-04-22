(function () {
  const EMPTY_LOGO =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%2310151a'/%3E%3Cpath d='M15 44h34L39 28l-9 11-6-8-9 13z' fill='%233a3f46'/%3E%3Ccircle cx='24' cy='22' r='4' fill='%233a3f46'/%3E%3C/svg%3E";

  const selectedRows = new Set();
  let editingRow = null;
  let pendingDeleteRows = [];
  let activeActionRow = null;
  let viewingRow = null;
  let appDefaultDepartment = "CCS";

  function getElectronAPI() {
    if (typeof window.getExternalPartnersElectronApiBridge === "function") {
      return window.getExternalPartnersElectronApiBridge();
    }
    return window.electronAPI || null;
  }

  function asText(value) {
    return String(value || "").trim();
  }

  function resolveDepartmentFallback(value) {
    return asText(value) || appDefaultDepartment;
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
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function safeLogoUrl(value) {
    const raw = asText(value);
    if (!raw) return EMPTY_LOGO;
    return raw;
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCompanyInitials(value) {
    const words = asText(value).split(/\s+/).filter(Boolean);

    if (!words.length) return "CP";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  async function uploadExternalPartnerLogoFromPicker() {
    const ui = window.ExternalPartnersUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI) return;

    if (typeof electronAPI.selectExternalPartnerLogo !== "function") {
      ui.showToast("Logo picker API is unavailable.", "error");
      return;
    }

    if (typeof electronAPI.uploadExternalPartnerLogo !== "function") {
      ui.showToast("Logo upload API is unavailable.", "error");
      return;
    }

    let pickerResult;
    try {
      pickerResult = await electronAPI.selectExternalPartnerLogo();
    } catch (error) {
      ui.showToast("Could not open logo picker.", "error");
      return;
    }

    if (!pickerResult || pickerResult.canceled || !pickerResult.success) {
      return;
    }

    const partnerId = editingRow
      ? Number.parseInt(editingRow.dataset.id, 10)
      : null;

    const loadingToast = ui.showToast("Uploading logo...", "info", 1800);
    if (loadingToast) {
      loadingToast.classList.add("toast-loading");
    }

    try {
      const uploadResult = await electronAPI.uploadExternalPartnerLogo({
        localPath: pickerResult.localPath,
        fileName: pickerResult.fileName,
        mimeType: pickerResult.mimeType,
        partnerId:
          Number.isInteger(partnerId) && partnerId > 0 ? partnerId : null,
      });

      if (!uploadResult || !uploadResult.success || !uploadResult.path) {
        ui.showToast(uploadResult?.message || "Logo upload failed.", "error");
        return;
      }

      const logoInput = document.getElementById("ep-logo");
      if (logoInput) {
        logoInput.value = uploadResult.path;
      }
      updateCompanyProfilePreview();
      ui.showToast("Logo uploaded successfully.", "success");
    } catch (error) {
      ui.showToast(error?.message || "Logo upload failed.", "error");
    }
  }

  function updateCompanyProfilePreview() {
    const logoInput = document.getElementById("ep-logo");
    const nameInput = document.getElementById("ep-company-name");
    const logoPreview = document.getElementById("ep-logo-preview");
    const initialsEl = document.getElementById("ep-logo-initials");
    const namePreview = document.getElementById("ep-company-preview-name");

    const logoUrl = asText(logoInput?.value);
    const companyName = asText(nameInput?.value);

    if (namePreview) {
      namePreview.textContent = companyName || "Company Profile";
    }

    if (initialsEl) {
      initialsEl.textContent = getCompanyInitials(companyName);
      initialsEl.style.display = logoUrl ? "none" : "inline-flex";
    }

    if (logoPreview) {
      logoPreview.src = logoUrl || EMPTY_LOGO;
      logoPreview.onerror = () => {
        logoPreview.src = EMPTY_LOGO;
        if (initialsEl) initialsEl.style.display = "inline-flex";
      };
    }
  }

  function partnerFromRow(row) {
    return {
      id: asText(row?.dataset?.id),
      logo: asText(row?.dataset?.logo),
      company_name: asText(row?.dataset?.companyName),
      address: asText(row?.dataset?.address),
      department: resolveDepartmentFallback(row?.dataset?.department),
      company_email: asText(row?.dataset?.companyEmail),
      company_contact: asText(row?.dataset?.companyContact),
      representative: asText(row?.dataset?.representative),
      job_description: asText(row?.dataset?.jobDescription),
      representative_email: asText(row?.dataset?.representativeEmail),
      representative_contact: asText(row?.dataset?.representativeContact),
    };
  }

  function syncRowDataset(row, partner) {
    row.dataset.id = String(partner.id || "");
    row.dataset.logo = asText(partner.logo);
    row.dataset.companyName = asText(partner.company_name);
    row.dataset.address = asText(partner.address);
    row.dataset.department = resolveDepartmentFallback(partner.department);
    row.dataset.companyEmail = asText(partner.company_email);
    row.dataset.companyContact = asText(partner.company_contact);
    row.dataset.representative = asText(partner.representative);
    row.dataset.jobDescription = asText(partner.job_description);
    row.dataset.representativeEmail = asText(partner.representative_email);
    row.dataset.representativeContact = asText(partner.representative_contact);
  }

  function buildLogoCellMarkup(partner) {
    const logoUrl = safeLogoUrl(partner.logo);
    const initials = getCompanyInitials(partner.company_name);
    const partnerId = esc(partner.id);

    return `<td class="external-logo-cell">
      <div class="external-logo-wrapper" data-company="${esc(partner.company_name)}" data-initials="${initials}">
        <img src="${esc(logoUrl)}" class="external-company-logo" alt="Company logo" data-partner-id="${partnerId}" />
        <div class="external-logo-fallback" data-partner-id="${partnerId}">
          <span class="external-logo-fallback-initials">${initials}</span>
        </div>
      </div>
    </td>`;
  }

  function buildRowMarkup(partner) {
    const idValue = Number.parseInt(partner.id, 10);
    const displayId = Number.isFinite(idValue)
      ? String(idValue).padStart(3, "0")
      : esc(partner.id);

    return `
      <td><input type="checkbox" class="archive-checkbox row-check" /></td>
      <td>${displayId}</td>
      ${buildLogoCellMarkup(partner)}
      <td>${esc(partner.company_name)}</td>
      <td>${esc(partner.address)}</td>
      <td>${esc(partner.company_email)}</td>
      <td>${esc(partner.company_contact)}</td>
      <td>${esc(partner.representative)}</td>
      <td>${esc(partner.job_description)}</td>
      <td>${esc(partner.representative_email)}</td>
      <td>${esc(partner.representative_contact)}</td>
      <td class="action-cell"><button class="dots-btn" type="button"><i data-lucide="more-vertical"></i></button></td>
    `;
  }

  function flashInsertedPartnerRow(row) {
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

  function addExternalPartnerRow(partner, options = {}) {
    const highlight = Boolean(options.highlight);
    const tbody = document.getElementById("external-partners-table-body");
    if (!tbody) return;

    const existing = tbody.querySelector(`tr[data-id='${String(partner.id)}']`);
    if (existing) {
      syncRowDataset(existing, partner);
      existing.innerHTML = buildRowMarkup(partner);
      attachLogoErrorHandlers();
      return;
    }

    const row = document.createElement("tr");
    row.dataset.id = String(partner.id || "");
    syncRowDataset(row, partner);
    row.innerHTML = buildRowMarkup(partner);
    attachLogoErrorHandlers();

    const firstDataRow = tbody.querySelector("tr:not([data-placeholder])");
    if (firstDataRow) {
      tbody.insertBefore(row, firstDataRow);
    } else {
      tbody.appendChild(row);
    }

    if (highlight) {
      flashInsertedPartnerRow(row);
    }
  }

  function attachLogoErrorHandlers() {
    const imgs = document.querySelectorAll(".external-company-logo");
    imgs.forEach((img) => {
      img.addEventListener("error", () => {
        const wrapper = img.closest(".external-logo-wrapper");
        if (wrapper) {
          img.style.display = "none";
          const fallback = wrapper.querySelector(".external-logo-fallback");
          if (fallback) fallback.style.display = "flex";
        }
      });

      img.addEventListener("load", () => {
        const wrapper = img.closest(".external-logo-wrapper");
        if (wrapper) {
          img.style.display = "block";
          const fallback = wrapper.querySelector(".external-logo-fallback");
          if (fallback) fallback.style.display = "none";
        }
      });
    });
  }

  function setFormValues(partner) {
    document.getElementById("ep-logo").value = asText(partner.logo);
    document.getElementById("ep-company-name").value = asText(
      partner.company_name,
    );
    document.getElementById("ep-address").value = asText(partner.address);
    document.getElementById("ep-company-email").value = asText(
      partner.company_email,
    );
    document.getElementById("ep-company-contact").value = asText(
      partner.company_contact,
    );
    document.getElementById("ep-representative").value = asText(
      partner.representative,
    );
    document.getElementById("ep-job-description").value = asText(
      partner.job_description,
    );
    document.getElementById("ep-representative-email").value = asText(
      partner.representative_email,
    );
    document.getElementById("ep-representative-contact").value = asText(
      partner.representative_contact,
    );

    updateCompanyProfilePreview();
  }

  function getFormValues() {
    return {
      logo: asText(document.getElementById("ep-logo")?.value),
      company_name: asText(document.getElementById("ep-company-name")?.value),
      address: asText(document.getElementById("ep-address")?.value),
      department: appDefaultDepartment,
      company_email: asText(document.getElementById("ep-company-email")?.value),
      company_contact: normalizeDigits(
        document.getElementById("ep-company-contact")?.value,
      ),
      representative: asText(
        document.getElementById("ep-representative")?.value,
      ),
      job_description: asText(
        document.getElementById("ep-job-description")?.value,
      ),
      representative_email: asText(
        document.getElementById("ep-representative-email")?.value,
      ),
      representative_contact: normalizeDigits(
        document.getElementById("ep-representative-contact")?.value,
      ),
    };
  }

  function clearFieldError(fieldId) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("show");
    }
    if (inputEl) {
      inputEl.classList.remove("input-invalid");
    }
  }

  function setFieldError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = String(message || "");
      errorEl.classList.add("show");
    }
    if (inputEl) {
      inputEl.classList.add("input-invalid");
    }
  }

  function clearAllFieldErrors() {
    [
      "ep-company-name",
      "ep-address",
      "ep-company-email",
      "ep-company-contact",
      "ep-representative",
      "ep-representative-email",
      "ep-representative-contact",
    ].forEach(clearFieldError);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function isValidContactDigits(value) {
    return /^\d{7,15}$/.test(String(value || ""));
  }

  function validatePartnerPayload(payload) {
    const errors = {};

    if (!payload.company_name) {
      errors["ep-company-name"] = "Company name is required.";
    }
    if (!payload.address) {
      errors["ep-address"] = "Address is required.";
    }
    if (!payload.company_email) {
      errors["ep-company-email"] = "Company email is required.";
    } else if (!isValidEmail(payload.company_email)) {
      errors["ep-company-email"] = "Enter a valid company email.";
    }
    if (!payload.company_contact) {
      errors["ep-company-contact"] = "Company contact number is required.";
    } else if (!isValidContactDigits(payload.company_contact)) {
      errors["ep-company-contact"] = "Use 7 to 15 digits only.";
    }
    if (!payload.representative) {
      errors["ep-representative"] = "Representative is required.";
    }
    if (!payload.representative_email) {
      errors["ep-representative-email"] = "Representative email is required.";
    } else if (!isValidEmail(payload.representative_email)) {
      errors["ep-representative-email"] = "Enter a valid representative email.";
    }
    if (!payload.representative_contact) {
      errors["ep-representative-contact"] =
        "Representative contact number is required.";
    } else if (!isValidContactDigits(payload.representative_contact)) {
      errors["ep-representative-contact"] = "Use 7 to 15 digits only.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  function resetForm() {
    setFormValues({});
    clearAllFieldErrors();
    editingRow = null;
    const title = document.getElementById("external-partner-modal-title");
    if (title) title.textContent = "ADDING NEW EXTERNAL PARTNER";
  }

  function openFormForAdd() {
    resetForm();
    window.ExternalPartnersUI?.openModal(
      document.getElementById("external-partner-modal"),
    );
  }

  function openFormForEdit(row) {
    editingRow = row;
    const partner = partnerFromRow(row);
    setFormValues(partner);

    const title = document.getElementById("external-partner-modal-title");
    if (title) title.textContent = "EDIT EXTERNAL PARTNER";

    window.ExternalPartnersUI?.openModal(
      document.getElementById("external-partner-modal"),
    );
  }

  function openViewModal(row) {
    viewingRow = row;
    const partner = partnerFromRow(row);

    document.getElementById("epv-id").textContent = partner.id || "-";
    document.getElementById("epv-company-name").textContent =
      partner.company_name || "-";
    document.getElementById("epv-address").textContent = partner.address || "-";
    document.getElementById("epv-company-email").textContent =
      partner.company_email || "-";
    document.getElementById("epv-company-contact").textContent =
      partner.company_contact || "-";
    document.getElementById("epv-representative").textContent =
      partner.representative || "-";
    document.getElementById("epv-job-description").textContent =
      partner.job_description || "-";
    document.getElementById("epv-representative-email").textContent =
      partner.representative_email || "-";
    document.getElementById("epv-representative-contact").textContent =
      partner.representative_contact || "-";

    const logo = document.getElementById("epv-logo");
    const logoWrapper = document.getElementById("epv-logo-wrapper");
    const logoFallback = document.getElementById("epv-logo-fallback");
    const logoFallbackInitials = document.getElementById(
      "epv-logo-fallback-initials",
    );

    if (logo) {
      const logoUrl = safeLogoUrl(partner.logo);
      logo.src = logoUrl;
      logo.alt = partner.company_name || "Company logo";
      logo.onerror = () => {
        if (logo && logoWrapper) {
          logo.style.display = "none";
          if (logoFallback) logoFallback.style.display = "flex";
        }
      };
      logo.onload = () => {
        if (logo && logoWrapper) {
          logo.style.display = "block";
          if (logoFallback) logoFallback.style.display = "none";
        }
      };
    }

    if (logoFallbackInitials) {
      logoFallbackInitials.textContent = getCompanyInitials(
        partner.company_name,
      );
    }

    window.ExternalPartnersUI?.openModal(
      document.getElementById("external-partner-view-modal"),
    );
  }

  function closeActionMenu() {
    const menu = document.getElementById("archive-action-menu");
    if (menu) menu.style.display = "none";
    activeActionRow = null;
  }

  function openActionMenu(dotsBtn, row) {
    const menu = document.getElementById("archive-action-menu");
    if (!menu || !dotsBtn) return;

    activeActionRow = row;
    if (typeof lucide !== "undefined") lucide.createIcons({ nodes: [menu] });

    menu.style.display = "flex";

    const rect = dotsBtn.getBoundingClientRect();
    const menuW = 210;
    const menuH = menu.offsetHeight || 156;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top;
    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = rect.top - menuH - 4;
    }

    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) {
      left = window.innerWidth - menuW - 8;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  function updateSelectionUI() {
    const bar = document.getElementById("bulk-action-bar");
    const countEl = document.getElementById("bulk-action-count");
    const allCb = document.getElementById("select-all-archives");
    const rows = Array.from(
      document.querySelectorAll(
        "#external-partners-table-body tr:not([data-placeholder])",
      ),
    );

    if (countEl) {
      countEl.textContent = `${selectedRows.size} selected`;
    }

    if (bar) {
      const hasSelection = selectedRows.size > 0;
      bar.style.visibility = hasSelection ? "visible" : "hidden";
      bar.style.opacity = hasSelection ? "1" : "0";
      bar.style.pointerEvents = hasSelection ? "auto" : "none";
    }

    if (allCb) {
      allCb.checked = rows.length > 0 && selectedRows.size === rows.length;
      allCb.indeterminate =
        selectedRows.size > 0 && selectedRows.size < rows.length;
    }
  }

  function clearSelection() {
    selectedRows.clear();
    document
      .querySelectorAll(
        "#external-partners-table-body tr:not([data-placeholder])",
      )
      .forEach((row) => {
        row.classList.remove("row-selected");
        const cb = row.querySelector(".row-check");
        if (cb) cb.checked = false;
      });
    updateSelectionUI();
  }

  function setRowSelected(row, selected) {
    if (!row) return;
    const key = row.dataset.id;
    if (!key) return;

    if (selected) {
      selectedRows.add(key);
      row.classList.add("row-selected");
    } else {
      selectedRows.delete(key);
      row.classList.remove("row-selected");
    }

    const cb = row.querySelector(".row-check");
    if (cb) cb.checked = selected;
  }

  function openDeleteConfirm(rows) {
    pendingDeleteRows = Array.isArray(rows) ? rows : [];

    const label = document.getElementById("external-delete-confirm-target");
    if (label) {
      if (pendingDeleteRows.length === 1) {
        const partner = partnerFromRow(pendingDeleteRows[0]);
        label.textContent = `Are you sure you want to delete "${partner.company_name || "Unknown"}"?`;
      } else if (pendingDeleteRows.length > 1) {
        label.textContent = `Are you sure you want to delete ${pendingDeleteRows.length} external partners?`;
      } else {
        label.textContent =
          "This external partner will be permanently deleted.";
      }
    }

    const input = document.getElementById("external-delete-confirm-input");
    const submit = document.getElementById("external-delete-confirm-submit");
    if (input) input.value = "";
    if (submit) submit.disabled = true;

    window.ExternalPartnersUI?.openModal(
      document.getElementById("external-delete-confirm-modal"),
    );

    window.setTimeout(() => input?.focus(), 0);
  }

  function closeDeleteConfirm() {
    pendingDeleteRows = [];
    const input = document.getElementById("external-delete-confirm-input");
    const submit = document.getElementById("external-delete-confirm-submit");
    if (input) input.value = "";
    if (submit) submit.disabled = true;

    window.ExternalPartnersUI?.closeModal(
      document.getElementById("external-delete-confirm-modal"),
    );
  }

  async function savePartner() {
    const ui = window.ExternalPartnersUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI) return;

    const payload = getFormValues();
    clearAllFieldErrors();
    const validation = validatePartnerPayload(payload);

    if (!validation.valid) {
      Object.entries(validation.errors).forEach(([fieldId, message]) => {
        setFieldError(fieldId, message);
      });

      const firstField = Object.keys(validation.errors)[0];
      document.getElementById(firstField)?.focus();
      return;
    }

    const isEdit = Boolean(editingRow && editingRow.dataset.id);
    if (isEdit) {
      payload.id = Number.parseInt(editingRow.dataset.id, 10);
    }

    const result = isEdit
      ? await electronAPI.updateExternalPartner(payload)
      : await electronAPI.createExternalPartner(payload);

    if (!result || !result.success || !result.partner) {
      ui.showToast(
        result?.message || "Failed to save external partner.",
        "error",
      );
      return;
    }

    addExternalPartnerRow(result.partner, { highlight: !isEdit });
    ui.closeModal(document.getElementById("external-partner-modal"));
    ui.showToast(
      isEdit
        ? "External partner updated successfully."
        : "External partner added successfully.",
      "success",
    );

    if (window.externalPartnersSearchFilter) {
      window.externalPartnersSearchFilter.refresh();
    }

    resetForm();
    clearSelection();
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  async function deletePendingPartners() {
    const ui = window.ExternalPartnersUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI || !pendingDeleteRows.length) {
      closeDeleteConfirm();
      return;
    }

    const failed = [];

    for (const row of pendingDeleteRows) {
      const id = Number.parseInt(row?.dataset?.id, 10);
      if (!Number.isInteger(id) || id <= 0) continue;

      const result = await electronAPI.deleteExternalPartner(id);
      if (!result || !result.success) {
        failed.push(result?.message || `Failed to delete partner ID ${id}.`);
      } else if (row && row.parentNode) {
        row.parentNode.removeChild(row);
      }
    }

    closeDeleteConfirm();

    if (failed.length) {
      ui.showToast(failed[0], "error");
    } else {
      ui.showToast("External partner deleted successfully.", "success");
    }

    clearSelection();
    if (window.externalPartnersSearchFilter) {
      window.externalPartnersSearchFilter.refresh();
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
      "Logo",
      "Company Name",
      "Address",
      "Department",
      "Company Email",
      "Company Contact no.",
      "Representative",
      "Job Description",
      "Email Address",
      "Contact No.",
    ];

    const sample = [
      "https://example.com/logo.png",
      "Acme Corporation",
      "123 Business Ave, Makati City",
      appDefaultDepartment,
      "contact@acme.com",
      "09171234567",
      "Juan Dela Cruz",
      "HR Manager",
      "juan.delacruz@acme.com",
      "09181234567",
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
    anchor.download = "external_partners_template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function payloadFromCsvRecord(record) {
    return {
      logo: asText(record.logo),
      company_name: asText(record.company_name),
      address: asText(record.address),
      department: resolveDepartmentFallback(record.department),
      company_email: asText(record.company_email),
      company_contact: normalizeDigits(record.company_contact),
      representative: asText(record.representative),
      job_description: asText(record.job_description),
      representative_email: asText(record.representative_email),
      representative_contact: normalizeDigits(record.representative_contact),
    };
  }

  // Pending rows state for bulk preview modal
  let bulkPreviewRows = [];

  function buildBulkPreviewRow(record, rowIndex) {
    const initials = getCompanyInitials(record.company_name || "");
    const hasLogo = !!asText(record.logo);

    return `<tr data-bulk-row="${rowIndex}">
      <td>
        <div class="ep-bulk-logo-cell">
          <img
            class="ep-bulk-logo-preview"
            src="${esc(record.logo || "")}"
            alt="logo"
            style="display:${hasLogo ? "block" : "none"}"
          />
          <div class="ep-bulk-logo-fallback" style="display:${hasLogo ? "none" : "flex"}">
            <span class="ep-bulk-logo-fallback-initials">${esc(initials)}</span>
          </div>
          <input type="hidden" class="ep-bulk-logo-val" value="${esc(record.logo || "")}" />
          <input type="hidden" class="ep-bulk-department" value="${esc(record.department || appDefaultDepartment)}" />
          <button type="button" class="ep-bulk-upload-logo-btn" data-row="${rowIndex}">
            <i data-lucide="upload"></i> Logo
          </button>
        </div>
      </td>
      <td><input type="text" class="ep-bulk-company-name" value="${esc(record.company_name || "")}" placeholder="Company Name" /></td>
      <td><input type="text" class="ep-bulk-address" value="${esc(record.address || "")}" placeholder="Address" /></td>
      <td><input type="text" class="ep-bulk-company-email" value="${esc(record.company_email || "")}" placeholder="Company Email" /></td>
      <td><input type="text" class="ep-bulk-company-contact" value="${esc(record.company_contact || "")}" placeholder="Contact No." /></td>
      <td><input type="text" class="ep-bulk-representative" value="${esc(record.representative || "")}" placeholder="Representative" /></td>
      <td><input type="text" class="ep-bulk-job-description" value="${esc(record.job_description || "")}" placeholder="Job Description" /></td>
      <td><input type="text" class="ep-bulk-representative-email" value="${esc(record.representative_email || "")}" placeholder="Email Address" /></td>
      <td><input type="text" class="ep-bulk-representative-contact" value="${esc(record.representative_contact || "")}" placeholder="Contact No." /></td>
    </tr>`;
  }

  function openBulkPreviewModal(records) {
    bulkPreviewRows = records.map((r) => ({ ...r }));

    const tbody = document.getElementById("ep-bulk-summary-body");
    if (tbody) {
      tbody.innerHTML = records
        .map((r, i) => buildBulkPreviewRow(r, i))
        .join("");
      if (typeof lucide !== "undefined") lucide.createIcons();
    }

    // Attach logo upload buttons
    const rows = tbody?.querySelectorAll("tr[data-bulk-row]") || [];
    rows.forEach((tr) => {
      const btn = tr.querySelector(".ep-bulk-upload-logo-btn");
      if (btn) {
        btn.addEventListener("click", () =>
          uploadBulkRowLogo(tr, Number(tr.dataset.bulkRow)),
        );
      }
      // Live-update company name → fallback initials
      const nameInput = tr.querySelector(".ep-bulk-company-name");
      const fallbackInitials = tr.querySelector(
        ".ep-bulk-logo-fallback-initials",
      );
      if (nameInput && fallbackInitials) {
        nameInput.addEventListener("input", () => {
          fallbackInitials.textContent = getCompanyInitials(nameInput.value);
        });
      }
    });

    window.ExternalPartnersUI?.openModal(
      document.getElementById("ep-bulk-summary-modal"),
    );
  }

  async function uploadBulkRowLogo(tr, rowIndex) {
    const ui = window.ExternalPartnersUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI) return;
    if (
      typeof electronAPI.selectExternalPartnerLogo !== "function" ||
      typeof electronAPI.uploadExternalPartnerLogo !== "function"
    ) {
      ui.showToast("Logo upload API is unavailable.", "error");
      return;
    }

    let pickerResult;
    try {
      pickerResult = await electronAPI.selectExternalPartnerLogo();
    } catch {
      ui.showToast("Could not open logo picker.", "error");
      return;
    }

    if (!pickerResult || pickerResult.canceled || !pickerResult.success) return;

    const loadingToast = ui.showToast("Uploading logo...", "info", 1800);
    if (loadingToast) loadingToast.classList.add("toast-loading");

    try {
      const result = await electronAPI.uploadExternalPartnerLogo({
        localPath: pickerResult.localPath,
        fileName: pickerResult.fileName,
        mimeType: pickerResult.mimeType,
        partnerId: null,
      });

      if (!result || !result.success || !result.path) {
        ui.showToast(result?.message || "Logo upload failed.", "error");
        return;
      }

      const logoUrl = result.path;

      // Update hidden input
      const logoValInput = tr.querySelector(".ep-bulk-logo-val");
      if (logoValInput) logoValInput.value = logoUrl;

      // Update preview image
      const img = tr.querySelector(".ep-bulk-logo-preview");
      const fallback = tr.querySelector(".ep-bulk-logo-fallback");
      if (img) {
        img.src = logoUrl;
        img.style.display = "block";
      }
      if (fallback) fallback.style.display = "none";

      ui.showToast("Logo uploaded.", "success");
    } catch {
      ui.showToast("Logo upload error.", "error");
    }
  }

  function collectBulkPreviewData() {
    const tbody = document.getElementById("ep-bulk-summary-body");
    if (!tbody) return [];
    const trs = tbody.querySelectorAll("tr[data-bulk-row]");
    const result = [];
    trs.forEach((tr) => {
      result.push({
        logo: tr.querySelector(".ep-bulk-logo-val")?.value || "",
        company_name: tr.querySelector(".ep-bulk-company-name")?.value || "",
        address: tr.querySelector(".ep-bulk-address")?.value || "",
        department:
          tr.querySelector(".ep-bulk-department")?.value ||
          appDefaultDepartment,
        company_email: tr.querySelector(".ep-bulk-company-email")?.value || "",
        company_contact:
          tr.querySelector(".ep-bulk-company-contact")?.value || "",
        representative:
          tr.querySelector(".ep-bulk-representative")?.value || "",
        job_description:
          tr.querySelector(".ep-bulk-job-description")?.value || "",
        representative_email:
          tr.querySelector(".ep-bulk-representative-email")?.value || "",
        representative_contact:
          tr.querySelector(".ep-bulk-representative-contact")?.value || "",
      });
    });
    return result;
  }

  async function importBulkPreviewRows() {
    const ui = window.ExternalPartnersUI;
    const electronAPI = getElectronAPI();

    if (!ui || !electronAPI) return;

    const records = collectBulkPreviewData();
    if (!records.length) return;

    const loadingOverlay = document.getElementById("ep-bulk-loading-overlay");
    const loadingText = document.getElementById("ep-bulk-loading-text");
    if (loadingOverlay) loadingOverlay.style.display = "flex";

    const createdRows = [];
    const failedRows = [];

    for (let i = 0; i < records.length; i += 1) {
      if (loadingText)
        loadingText.textContent = `Importing row ${i + 1} of ${records.length}...`;

      const payload = payloadFromCsvRecord(records[i]);
      const validation = validatePartnerPayload(payload);
      if (!validation.valid) {
        const firstError =
          Object.values(validation.errors)[0] || "Invalid data.";
        failedRows.push(`Row ${i + 1}: ${firstError}`);
        continue;
      }

      const result = await electronAPI.createExternalPartner(payload);
      if (!result || !result.success || !result.partner) {
        failedRows.push(
          `Row ${i + 1}: ${result?.message || "Failed to create partner."}`,
        );
        continue;
      }

      createdRows.push(result.partner);
      addExternalPartnerRow(result.partner, { highlight: true });
    }

    if (loadingOverlay) loadingOverlay.style.display = "none";

    window.ExternalPartnersUI?.closeModal(
      document.getElementById("ep-bulk-summary-modal"),
    );

    if (window.externalPartnersSearchFilter) {
      window.externalPartnersSearchFilter.refresh();
    }

    if (createdRows.length) {
      ui.showToast(
        `${createdRows.length} external partner${createdRows.length === 1 ? "" : "s"} imported.`,
        "success",
      );
    }

    if (failedRows.length) {
      ui.showToast(failedRows[0], "error");
      console.warn("External partner bulk import errors:", failedRows);
    }
  }

  async function handleBulkCsvUpload(file) {
    const ui = window.ExternalPartnersUI;

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
      logo: indexOf(["logo"]),
      company_name: indexOf(["company name"]),
      address: indexOf(["address"]),
      department: indexOf(["department"]),
      company_email: indexOf(["company email"]),
      company_contact: indexOf(["company contact no", "company contact"]),
      representative: indexOf(["representative"]),
      job_description: indexOf(["job description"]),
      representative_email: indexOf(["email address", "representative email"]),
      representative_contact: indexOf(["contact no", "representative contact"]),
    };

    if (
      columnIndex.company_name < 0 ||
      columnIndex.address < 0 ||
      columnIndex.company_email < 0 ||
      columnIndex.company_contact < 0 ||
      columnIndex.representative < 0 ||
      columnIndex.representative_email < 0 ||
      columnIndex.representative_contact < 0
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
        logo: columnIndex.logo >= 0 ? rowData[columnIndex.logo] : "",
        company_name: rowData[columnIndex.company_name] || "",
        address: rowData[columnIndex.address] || "",
        department:
          columnIndex.department >= 0
            ? rowData[columnIndex.department] || appDefaultDepartment
            : appDefaultDepartment,
        company_email: rowData[columnIndex.company_email] || "",
        company_contact: rowData[columnIndex.company_contact] || "",
        representative: rowData[columnIndex.representative] || "",
        job_description:
          columnIndex.job_description >= 0
            ? rowData[columnIndex.job_description]
            : "",
        representative_email: rowData[columnIndex.representative_email] || "",
        representative_contact:
          rowData[columnIndex.representative_contact] || "",
      });
    }

    if (!parsedRecords.length) {
      ui.showToast("No valid data rows found in the CSV.", "error");
      return;
    }

    openBulkPreviewModal(parsedRecords);
  }

  function bindEvents() {
    const ui = window.ExternalPartnersUI;

    document
      .getElementById("external-partner-open-modal")
      ?.addEventListener("click", openFormForAdd);

    document
      .getElementById("external-partner-cancel-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("external-partner-modal"));
        resetForm();
      });

    document
      .getElementById("external-partner-save-btn")
      ?.addEventListener("click", savePartner);

    document
      .getElementById("ep-upload-logo-btn")
      ?.addEventListener("click", uploadExternalPartnerLogoFromPicker);

    document
      .getElementById("external-partner-download-template-btn")
      ?.addEventListener("click", () => {
        downloadCsvTemplate();
        ui?.showToast("CSV template downloaded.", "success");
      });

    document
      .getElementById("external-partner-upload-csv-btn")
      ?.addEventListener("click", () => {
        document.getElementById("external-partner-csv-input")?.click();
      });

    document
      .getElementById("external-partner-csv-input")
      ?.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await handleBulkCsvUpload(file);
        event.target.value = "";
      });

    document
      .getElementById("ep-bulk-summary-cancel")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("ep-bulk-summary-modal"));
        bulkPreviewRows = [];
      });

    document
      .getElementById("ep-bulk-summary-import")
      ?.addEventListener("click", importBulkPreviewRows);

    document
      .getElementById("ep-logo")
      ?.addEventListener("input", updateCompanyProfilePreview);

    document
      .getElementById("ep-company-name")
      ?.addEventListener("input", updateCompanyProfilePreview);

    [
      "ep-company-name",
      "ep-address",
      "ep-company-email",
      "ep-company-contact",
      "ep-representative",
      "ep-representative-email",
      "ep-representative-contact",
    ].forEach((fieldId) => {
      document.getElementById(fieldId)?.addEventListener("input", () => {
        if (
          fieldId === "ep-company-contact" ||
          fieldId === "ep-representative-contact"
        ) {
          const input = document.getElementById(fieldId);
          if (input) input.value = normalizeDigits(input.value);
        }
        clearFieldError(fieldId);
      });
    });

    document
      .getElementById("external-required-fields-ok-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(
          document.getElementById("external-required-fields-modal"),
        );
      });

    document
      .getElementById("external-view-close-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("external-partner-view-modal"));
      });

    document
      .getElementById("external-view-header-close-btn")
      ?.addEventListener("click", () => {
        ui?.closeModal(document.getElementById("external-partner-view-modal"));
      });

    document
      .getElementById("external-view-edit-btn")
      ?.addEventListener("click", () => {
        if (viewingRow) {
          ui?.closeModal(
            document.getElementById("external-partner-view-modal"),
          );
          openFormForEdit(viewingRow);
        }
      });

    document
      .getElementById("external-view-delete-btn")
      ?.addEventListener("click", () => {
        if (viewingRow) {
          ui?.closeModal(
            document.getElementById("external-partner-view-modal"),
          );
          openDeleteConfirm([viewingRow]);
        }
      });

    document
      .getElementById("external-delete-confirm-cancel")
      ?.addEventListener("click", closeDeleteConfirm);

    document
      .getElementById("external-delete-confirm-submit")
      ?.addEventListener("click", deletePendingPartners);

    document
      .getElementById("external-delete-confirm-input")
      ?.addEventListener("input", (event) => {
        const canDelete = String(event.target.value || "").trim() === "DELETE";
        const submitBtn = document.getElementById(
          "external-delete-confirm-submit",
        );
        if (submitBtn) submitBtn.disabled = !canDelete;
      });

    document
      .getElementById("bulk-delete-btn")
      ?.addEventListener("click", () => {
        const rows = Array.from(
          document.querySelectorAll(
            "#external-partners-table-body tr.row-selected",
          ),
        );
        if (!rows.length) return;
        openDeleteConfirm(rows);
      });

    document.getElementById("bulk-clear-btn")?.addEventListener("click", () => {
      clearSelection();
    });

    document
      .getElementById("select-all-archives")
      ?.addEventListener("change", (event) => {
        const rows = Array.from(
          document.querySelectorAll(
            "#external-partners-table-body tr:not([data-placeholder])",
          ),
        );
        rows.forEach((row) => setRowSelected(row, event.target.checked));
        updateSelectionUI();
      });

    document.addEventListener("click", (event) => {
      const dotsBtn = event.target.closest(".dots-btn");
      if (dotsBtn && dotsBtn.closest("#archives-table")) {
        event.preventDefault();
        event.stopPropagation();
        const row = dotsBtn.closest("tr");
        const menu = document.getElementById("archive-action-menu");
        const isAlreadyOpen =
          menu?.style.display === "flex" && activeActionRow === row;

        if (isAlreadyOpen) {
          closeActionMenu();
        } else {
          openActionMenu(dotsBtn, row);
        }
        return;
      }

      if (!event.target.closest("#archive-action-menu")) {
        closeActionMenu();
      }
    });

    document
      .getElementById("archive-action-menu")
      ?.addEventListener("click", (event) => {
        const button = event.target.closest("button.menu-action");
        if (!button || !activeActionRow) return;

        if (button.classList.contains("view-btn")) {
          openViewModal(activeActionRow);
        } else if (button.classList.contains("edit-btn")) {
          openFormForEdit(activeActionRow);
        } else if (button.classList.contains("delete-btn")) {
          openDeleteConfirm([activeActionRow]);
        }

        closeActionMenu();
      });

    document
      .getElementById("external-partners-table-body")
      ?.addEventListener("change", (event) => {
        const cb = event.target.closest(".row-check");
        if (!cb) return;

        const row = cb.closest("tr");
        setRowSelected(row, cb.checked);
        updateSelectionUI();
      });

    document
      .getElementById("external-partners-table-body")
      ?.addEventListener("click", (event) => {
        const row = event.target.closest("tr");
        if (!row) return;
        if (
          event.target.closest(".dots-btn") ||
          event.target.closest(".row-check") ||
          event.target.closest("a") ||
          event.target.closest("button")
        ) {
          return;
        }

        const nextSelected = !selectedRows.has(row.dataset.id);
        setRowSelected(row, nextSelected);
        updateSelectionUI();
      });

    document
      .getElementById("external-partners-table-body")
      ?.addEventListener("dblclick", (event) => {
        const row = event.target.closest("tr");
        if (!row) return;
        if (
          event.target.closest(".dots-btn") ||
          event.target.closest(".row-check") ||
          event.target.closest("button")
        ) {
          return;
        }
        openViewModal(row);
      });

    [
      document.getElementById("external-partner-modal"),
      document.getElementById("external-required-fields-modal"),
      document.getElementById("external-delete-confirm-modal"),
      document.getElementById("external-partner-view-modal"),
      document.getElementById("ep-bulk-summary-modal"),
    ].forEach((modalEl) => {
      modalEl?.addEventListener("click", (event) => {
        if (event.target !== modalEl) return;
        window.ExternalPartnersUI?.closeModal(modalEl);
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
    bindEvents();
    updateCompanyProfilePreview();

    if (typeof window.loadExternalPartners === "function") {
      window.loadExternalPartners();
    }
  }

  window.addExternalPartnerRow = addExternalPartnerRow;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
