(function () {
  const state = {
    query: "",
    sortField: "",
    sortDir: "asc",
    filters: {
      company: [],
      city: [],
      representative: [],
      job: [],
    },
  };

  const sortFieldDataAttr = {
    id: "id",
    company_name: "companyName",
    address: "address",
    company_email: "companyEmail",
    company_contact: "companyContact",
    representative: "representative",
    job_description: "jobDescription",
    representative_email: "representativeEmail",
    representative_contact: "representativeContact",
  };

  const selectToFilterKey = {
    "epf-company": "company",
    "epf-city": "city",
    "epf-representative": "representative",
    "epf-job": "job",
  };

  const filterKeyToSelect = {
    company: "epf-company",
    city: "epf-city",
    representative: "epf-representative",
    job: "epf-job",
  };

  const filterKeyLabel = {
    company: "Company",
    city: "Address",
    representative: "Representative",
    job: "Job",
  };

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getDataRows() {
    const tbody = document.getElementById("external-partners-table-body");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr:not([data-placeholder])"));
  }

  function rowMatchesQuery(row, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const searchable = [
      row.dataset.id || "",
      row.dataset.companyName || "",
      row.dataset.address || "",
      row.dataset.companyEmail || "",
      row.dataset.companyContact || "",
      row.dataset.representative || "",
      row.dataset.jobDescription || "",
      row.dataset.representativeEmail || "",
      row.dataset.representativeContact || "",
    ];
    return searchable.some((field) => field.toLowerCase().includes(q));
  }

  function rowMatchesFilters(row) {
    const { company, city, representative, job } = state.filters;

    if (company.length && !company.includes(row.dataset.companyName || "")) {
      return false;
    }

    if (city.length && !city.includes(row.dataset.address || "")) {
      return false;
    }

    if (
      representative.length &&
      !representative.includes(row.dataset.representative || "")
    ) {
      return false;
    }

    if (job.length && !job.includes(row.dataset.jobDescription || "")) {
      return false;
    }

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

    const tbody = document.getElementById("external-partners-table-body");
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

    const companies = new Set();
    const cities = new Set();
    const representatives = new Set();
    const jobs = new Set();

    rows.forEach((row) => {
      if (row.dataset.companyName) companies.add(row.dataset.companyName);
      if (row.dataset.address) cities.add(row.dataset.address);
      if (row.dataset.representative) {
        representatives.add(row.dataset.representative);
      }
      if (row.dataset.jobDescription) jobs.add(row.dataset.jobDescription);
    });

    fillSelect(
      "epf-company",
      Array.from(companies).sort(),
      state.filters.company,
    );
    fillSelect("epf-city", Array.from(cities).sort(), state.filters.city);
    fillSelect(
      "epf-representative",
      Array.from(representatives).sort(),
      state.filters.representative,
    );
    fillSelect("epf-job", Array.from(jobs).sort(), state.filters.job);
  }

  function renderActiveTags() {
    const bar = document.getElementById("external-active-filter-tags");
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
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(normalized);
    }
  }

  function updateSortDirBtn() {
    const btn = document.getElementById("external-partner-sort-dir");
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
    const searchEl = document.getElementById("external-partner-search");
    if (searchEl) {
      let debounceTimer;
      searchEl.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.query = searchEl.value;
          applyVisibility();
        }, 220);
      });
    }

    const sortEl = document.getElementById("external-partner-sort");
    if (sortEl) {
      sortEl.addEventListener("change", () => {
        state.sortField = sortEl.value;
        state.sortDir = "asc";
        updateSortDirBtn();
        applyAll();
      });
    }

    const sortDirBtn = document.getElementById("external-partner-sort-dir");
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

    const clearBtn = document.getElementById("external-partner-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.query = "";
        state.sortField = "";
        state.sortDir = "asc";
        state.filters = {
          company: [],
          city: [],
          representative: [],
          job: [],
        };

        const searchInput = document.getElementById("external-partner-search");
        if (searchInput) searchInput.value = "";

        const sortInput = document.getElementById("external-partner-sort");
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

  window.externalPartnersSearchFilter = { refresh, applyAll };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
