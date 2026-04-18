(function () {
  const state = {
    query: "",
    sortField: "",
    sortDir: "asc",
    filters: {
      section: [],
      department: [],
      status: [],
      partner: [],
    },
  };

  const sortFieldDataAttr = {
    id: "id",
    student_id: "studentId",
    name: "name",
    section: "section",
    department: "department",
    email: "email",
    contact_no: "contactNo",
    status: "status",
    external_partner_assigned: "externalPartnerAssigned",
    nature_of_business: "natureOfBusiness",
  };

  const selectToFilterKey = {
    "ojtf-section": "section",
    "ojtf-department": "department",
    "ojtf-status": "status",
    "ojtf-partner": "partner",
  };

  const filterKeyToSelect = {
    section: "ojtf-section",
    department: "ojtf-department",
    status: "ojtf-status",
    partner: "ojtf-partner",
  };

  const filterKeyLabel = {
    section: "Section",
    department: "Department",
    status: "Status",
    partner: "External Partner",
  };

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/\"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getDataRows() {
    const tbody = document.getElementById("ojt-students-table-body");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr:not([data-placeholder])"));
  }

  function rowMatchesQuery(row, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const searchable = [
      row.dataset.id || "",
      row.dataset.studentId || "",
      row.dataset.name || "",
      row.dataset.section || "",
      row.dataset.department || "",
      row.dataset.email || "",
      row.dataset.contactNo || "",
      row.dataset.status || "",
      row.dataset.externalPartnerAssigned || "",
      row.dataset.natureOfBusiness || "",
    ];
    return searchable.some((field) => field.toLowerCase().includes(q));
  }

  function rowMatchesFilters(row) {
    const { section, department, status, partner } = state.filters;

    if (section.length && !section.includes(row.dataset.section || ""))
      return false;
    if (department.length && !department.includes(row.dataset.department || ""))
      return false;
    if (status.length && !status.includes(row.dataset.status || ""))
      return false;
    if (
      partner.length &&
      !partner.includes(row.dataset.externalPartnerAssigned || "")
    )
      return false;

    return true;
  }

  function applyVisibility() {
    const rows = getDataRows();
    const query = state.query.trim();

    rows.forEach((row) => {
      const visible = rowMatchesQuery(row, query) && rowMatchesFilters(row);
      row.style.display = visible ? "" : "none";
    });
  }

  function sortRows() {
    const attrKey = sortFieldDataAttr[state.sortField];
    if (!attrKey) return;

    const tbody = document.getElementById("ojt-students-table-body");
    if (!tbody) return;

    const rows = getDataRows();
    rows.sort((a, b) => {
      const aVal = String(a.dataset[attrKey] || "").toLowerCase();
      const bVal = String(b.dataset[attrKey] || "").toLowerCase();

      let cmp = 0;
      if (attrKey === "id") {
        const aNum = Number.parseInt(aVal, 10) || 0;
        const bNum = Number.parseInt(bVal, 10) || 0;
        cmp = aNum - bNum;
      } else {
        cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }

      return state.sortDir === "asc" ? cmp : -cmp;
    });

    rows.forEach((row) => tbody.appendChild(row));
  }

  function fillSelect(id, options, selectedValues) {
    const el = document.getElementById(id);
    if (!el) return;

    const selected = Array.isArray(selectedValues) ? selectedValues : [];
    const allLabel = selected.length
      ? `All (${selected.length} selected)`
      : "All";

    el.innerHTML =
      `<option value="">${allLabel}</option>` +
      options
        .map((option) => {
          const isSelected = selected.includes(option);
          const label = isSelected ? `${option} [selected]` : option;
          return `<option value="${esc(option)}" data-selected="${isSelected ? "true" : "false"}">${esc(label)}</option>`;
        })
        .join("");

    el.value = "";
  }

  function populateFilterDropdowns() {
    const rows = getDataRows();

    const sections = new Set();
    const departments = new Set();
    const statuses = new Set();
    const partners = new Set();

    rows.forEach((row) => {
      if (row.dataset.section) sections.add(row.dataset.section);
      if (row.dataset.department) departments.add(row.dataset.department);
      if (row.dataset.status) statuses.add(row.dataset.status);
      if (row.dataset.externalPartnerAssigned) {
        partners.add(row.dataset.externalPartnerAssigned);
      }
    });

    fillSelect(
      "ojtf-section",
      Array.from(sections).sort(),
      state.filters.section,
    );
    fillSelect(
      "ojtf-department",
      Array.from(departments).sort(),
      state.filters.department,
    );
    fillSelect(
      "ojtf-status",
      Array.from(statuses).sort(),
      state.filters.status,
    );
    fillSelect(
      "ojtf-partner",
      Array.from(partners).sort(),
      state.filters.partner,
    );
  }

  function renderActiveTags() {
    const bar = document.getElementById("ojt-active-filter-tags");
    if (!bar) return;

    const tags = Object.entries(state.filters).flatMap(([key, values]) => {
      const list = Array.isArray(values) ? values : [];
      return list.map((value) => ({ key, value }));
    });

    if (!tags.length) {
      bar.innerHTML = "";
      return;
    }

    bar.innerHTML = tags
      .map(
        (tag) =>
          `<span class="filter-tag" data-key="${tag.key}">` +
          `${esc(filterKeyLabel[tag.key])}: ${esc(tag.value)}` +
          `<button class="filter-tag-remove" type="button" aria-label="Remove ${esc(filterKeyLabel[tag.key])} filter" data-key="${tag.key}" data-value="${esc(tag.value)}">x</button>` +
          `</span>`,
      )
      .join("");
  }

  function toggleFilterValue(filterKey, value) {
    const normalized = String(value || "").trim();
    if (!normalized || !(state.filters[filterKey] instanceof Array)) return;

    const list = state.filters[filterKey];
    const idx = list.indexOf(normalized);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(normalized);
  }

  function updateSortDirBtn() {
    const btn = document.getElementById("ojt-sort-dir");
    if (!btn) return;

    if (!state.sortField) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";
    const icon =
      state.sortDir === "asc"
        ? "arrow-up-narrow-wide"
        : "arrow-down-narrow-wide";
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [btn] });
    }
  }

  function applyAll() {
    sortRows();
    applyVisibility();
  }

  function refresh() {
    populateFilterDropdowns();
    renderActiveTags();
    applyAll();
  }

  function init() {
    const searchEl = document.getElementById("ojt-search");
    if (searchEl) {
      let debounceTimer;
      searchEl.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          state.query = searchEl.value;
          applyVisibility();
        }, 220);
      });
    }

    const sortEl = document.getElementById("ojt-sort");
    if (sortEl) {
      sortEl.addEventListener("change", () => {
        state.sortField = sortEl.value;
        state.sortDir = "asc";
        updateSortDirBtn();
        applyAll();
      });
    }

    const sortDirBtn = document.getElementById("ojt-sort-dir");
    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        if (!state.sortField) return;
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        updateSortDirBtn();
        applyAll();
      });
    }

    Object.keys(selectToFilterKey).forEach((selectId) => {
      const el = document.getElementById(selectId);
      if (!el) return;

      el.addEventListener("change", () => {
        const key = selectToFilterKey[selectId];
        const selectedValue = String(el.value || "").trim();

        if (!selectedValue) {
          state.filters[key] = [];
        } else {
          toggleFilterValue(key, selectedValue);
        }

        populateFilterDropdowns();
        renderActiveTags();
        applyVisibility();
      });
    });

    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".filter-tag-remove");
      if (!btn) return;

      const key = btn.dataset.key;
      const value = String(btn.dataset.value || "").trim();
      if (!(key in state.filters) || !state.filters[key].length) return;

      state.filters[key] = state.filters[key].filter((item) => item !== value);

      const selectEl = document.getElementById(filterKeyToSelect[key]);
      if (selectEl) selectEl.value = "";

      populateFilterDropdowns();
      renderActiveTags();
      applyVisibility();
    });

    const clearBtn = document.getElementById("ojt-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.query = "";
        state.sortField = "";
        state.sortDir = "asc";
        state.filters = {
          section: [],
          department: [],
          status: [],
          partner: [],
        };

        const searchInput = document.getElementById("ojt-search");
        if (searchInput) searchInput.value = "";

        const sortInput = document.getElementById("ojt-sort");
        if (sortInput) sortInput.value = "";

        Object.keys(selectToFilterKey).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });

        updateSortDirBtn();
        populateFilterDropdowns();
        renderActiveTags();
        applyVisibility();
      });
    }
  }

  window.ojtStudentsSearchFilter = { refresh, applyAll };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
