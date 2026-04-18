(function () {
  const EMPTY_LOGO =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%2310151a'/%3E%3Cpath d='M15 44h34L39 28l-9 11-6-8-9 13z' fill='%233a3f46'/%3E%3Ccircle cx='24' cy='22' r='4' fill='%233a3f46'/%3E%3C/svg%3E";

  const selectedRows = new Set();
  let editingRow = null;
  let pendingDeleteRows = [];
  let activeActionRow = null;

  function getElectronAPI() {
    if (typeof window.getExternalPartnersElectronApiBridge === "function") {
      return window.getExternalPartnersElectronApiBridge();
    }
    return window.electronAPI || null;
  }

  function asText(value) {
    return String(value || "").trim();
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

  function partnerFromRow(row) {
    return {
      id: asText(row?.dataset?.id),
      logo: asText(row?.dataset?.logo),
      company_name: asText(row?.dataset?.companyName),
      address: asText(row?.dataset?.address),
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
    row.dataset.companyEmail = asText(partner.company_email);
    row.dataset.companyContact = asText(partner.company_contact);
    row.dataset.representative = asText(partner.representative);
    row.dataset.jobDescription = asText(partner.job_description);
    row.dataset.representativeEmail = asText(partner.representative_email);
    row.dataset.representativeContact = asText(partner.representative_contact);
  }

  function buildRowMarkup(partner) {
    const idValue = Number.parseInt(partner.id, 10);
    const displayId = Number.isFinite(idValue)
      ? String(idValue).padStart(3, "0")
      : esc(partner.id);

    const logoUrl = safeLogoUrl(partner.logo);

    return `
      <td><input type="checkbox" class="archive-checkbox row-check" /></td>
      <td>${displayId}</td>
      <td class="external-logo-cell"><img src="${esc(logoUrl)}" class="external-company-logo" alt="Company logo" onerror="this.src='${EMPTY_LOGO}';" /></td>
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

  function addExternalPartnerRow(partner) {
    const tbody = document.getElementById("external-partners-table-body");
    if (!tbody) return;

    const existing = tbody.querySelector(`tr[data-id='${String(partner.id)}']`);
    if (existing) {
      syncRowDataset(existing, partner);
      existing.innerHTML = buildRowMarkup(partner);
      return;
    }

    const row = document.createElement("tr");
    row.dataset.id = String(partner.id || "");
    syncRowDataset(row, partner);
    row.innerHTML = buildRowMarkup(partner);

    const firstDataRow = tbody.querySelector("tr:not([data-placeholder])");
    if (firstDataRow) {
      tbody.insertBefore(row, firstDataRow);
    } else {
      tbody.appendChild(row);
    }
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
  }

  function getFormValues() {
    return {
      logo: asText(document.getElementById("ep-logo")?.value),
      company_name: asText(document.getElementById("ep-company-name")?.value),
      address: asText(document.getElementById("ep-address")?.value),
      company_email: asText(document.getElementById("ep-company-email")?.value),
      company_contact: asText(
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
      representative_contact: asText(
        document.getElementById("ep-representative-contact")?.value,
      ),
    };
  }

  function resetForm() {
    setFormValues({});
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
    if (logo) {
      logo.src = safeLogoUrl(partner.logo);
      logo.onerror = () => {
        logo.src = EMPTY_LOGO;
      };
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
      if (pendingDeleteRows.length <= 1) {
        label.textContent =
          "This external partner will be permanently deleted.";
      } else {
        label.textContent = `${pendingDeleteRows.length} external partners will be permanently deleted.`;
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
    if (!payload.company_name || !payload.address) {
      ui.openModal(document.getElementById("external-required-fields-modal"));
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

    addExternalPartnerRow(result.partner);
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

    [
      document.getElementById("external-partner-modal"),
      document.getElementById("external-required-fields-modal"),
      document.getElementById("external-delete-confirm-modal"),
      document.getElementById("external-partner-view-modal"),
    ].forEach((modalEl) => {
      modalEl?.addEventListener("click", (event) => {
        if (event.target !== modalEl) return;
        window.ExternalPartnersUI?.closeModal(modalEl);
      });
    });

    window.addEventListener("scroll", closeActionMenu, { passive: true });
    window.addEventListener("resize", closeActionMenu, { passive: true });
  }

  function init() {
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    bindEvents();

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
