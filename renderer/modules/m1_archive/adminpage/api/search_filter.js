/**
 * search_filter.js
 * Provides search, sort, and filter-tag logic for the Manage Archives table.
 * Exposed as window.archiveSearchFilter = { refresh, applyAll }.
 */
(function () {
  // ── State ─────────────────────────────────────────────────────────────────
  const _state = {
    query: "",
    sortField: "", // key in _sortFieldDataAttr
    sortDir: "asc",
    filters: {
      section: "",
      dateMonth: "",
      type: "",
      status: "",
    },
  };

  /** Maps sort-select values → tr.dataset property names */
  const _sortFieldDataAttr = {
    title: "title",
    authors: "authors",
    section: "section",
    advisor: "advisor",
    date: "datePublished",
    type: "type",
    status: "status",
  };

  /** Filter-select id → state.filters key */
  const _selectToFilterKey = {
    "af-section": "section",
    "af-year": "dateMonth",
    "af-type": "type",
    "af-status": "status",
  };

  /** state.filters key → filter-select id */
  const _filterKeyToSelect = {
    section: "af-section",
    dateMonth: "af-year",
    type: "af-type",
    status: "af-status",
  };

  /** Human-readable label for each filter key */
  const _filterKeyLabel = {
    section: "Section",
    dateMonth: "Date",
    type: "Type",
    status: "Status",
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _getDataRows() {
    const tbody = document.getElementById("archives-table-body");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr:not([data-placeholder])"));
  }

  function _rowMatchesQuery(row, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const searchable = [
      row.dataset.title || "",
      row.dataset.authors || "",
      row.dataset.section || "",
      row.dataset.advisor || "",
      row.dataset.keywords || "",
    ];
    return searchable.some((f) => f.toLowerCase().includes(q));
  }

  function _rowMatchesFilters(row) {
    const { section, dateMonth, type, status } = _state.filters;

    if (section && (row.dataset.section || "") !== section) return false;

    if (dateMonth) {
      const rowYM = _dateToYYYYMM(row.dataset.datePublished || "");
      if (rowYM !== dateMonth) return false;
    }

    if (type) {
      const rowType = (row.dataset.type || "").toLowerCase();
      if (rowType !== type.toLowerCase()) return false;
    }

    if (status) {
      const rowStatus = (row.dataset.status || "").toLowerCase();
      if (rowStatus !== status.toLowerCase()) return false;
    }

    return true;
  }

  // ── Core operations ───────────────────────────────────────────────────────
  function _applyVisibility() {
    const rows = _getDataRows();
    const query = _state.query.trim();
    rows.forEach((row) => {
      const visible = _rowMatchesQuery(row, query) && _rowMatchesFilters(row);
      row.style.display = visible ? "" : "none";
    });
  }

  function _sortRows() {
    const attrKey = _sortFieldDataAttr[_state.sortField];
    if (!attrKey) return;

    const tbody = document.getElementById("archives-table-body");
    if (!tbody) return;

    const rows = _getDataRows();
    rows.sort((a, b) => {
      const aVal = (a.dataset[attrKey] || "").toLowerCase();
      const bVal = (b.dataset[attrKey] || "").toLowerCase();

      // Date: lexicographic on YYYY-MM-DD is correct
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return _state.sortDir === "asc" ? cmp : -cmp;
    });

    rows.forEach((r) => tbody.appendChild(r));
  }

  function _applyAll() {
    _sortRows();
    _applyVisibility();
  }

  // ── Filter dropdown population ────────────────────────────────────────────
  /** Convert any date string to "YYYY-MM" for grouping/filtering */
  function _dateToYYYYMM(raw) {
    if (!raw) return "";
    const direct = raw.match(/^(\d{4}-\d{2})/);
    if (direct) return direct[1];
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    return "";
  }

  /** Format "YYYY-MM" as "Jan 2024" */
  function _formatMonthYear(yyyyMM) {
    if (!yyyyMM || yyyyMM.length < 7) return yyyyMM;
    const [y, m] = yyyyMM.split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const idx = parseInt(m, 10) - 1;
    if (idx < 0 || idx > 11) return yyyyMM;
    return `${months[idx]} ${y}`;
  }

  function _populateFilterDropdowns() {
    const rows = _getDataRows();

    const sections = new Set();
    const dates = new Set();
    const types = new Set();
    const statuses = new Set();

    rows.forEach((row) => {
      if (row.dataset.section) sections.add(row.dataset.section);
      const ym = _dateToYYYYMM(row.dataset.datePublished || "");
      if (ym) dates.add(ym);
      if (row.dataset.type) types.add(row.dataset.type);
      if (row.dataset.status) statuses.add(row.dataset.status);
    });

    _fillSelect(
      "af-section",
      Array.from(sections).sort(),
      _state.filters.section,
    );
    _fillDateSelect(
      "af-year",
      Array.from(dates).sort().reverse(),
      _state.filters.dateMonth,
    );
    _fillSelect("af-type", Array.from(types).sort(), _state.filters.type);
    _fillSelect(
      "af-status",
      Array.from(statuses).sort(),
      _state.filters.status,
    );
  }

  function _fillSelect(id, options, currentValue) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = currentValue || "";
    el.innerHTML =
      `<option value="">All</option>` +
      options
        .map(
          (o) =>
            `<option value="${_esc(o)}"${o === current ? " selected" : ""}>${_esc(o)}</option>`,
        )
        .join("");
    el.value = current;
  }
  /** Same as _fillSelect but displays YYYY-MM values as "Mon YYYY" */
  function _fillDateSelect(id, yyyyMMValues, currentValue) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = currentValue || "";
    el.innerHTML =
      `<option value="">All</option>` +
      yyyyMMValues
        .map(
          (v) =>
            `<option value="${_esc(v)}"${v === current ? " selected" : ""}>${_esc(_formatMonthYear(v))}</option>`,
        )
        .join("");
    el.value = current;
  }
  function _esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Active-tag chips ──────────────────────────────────────────────────────
  function _renderActiveTags() {
    const bar = document.getElementById("active-filter-tags");
    if (!bar) return;

    const tags = Object.entries(_state.filters)
      .filter(([, v]) => v !== "")
      .map(([key, val]) => ({ key, val }));

    if (tags.length === 0) {
      bar.innerHTML = "";
      return;
    }

    bar.innerHTML = tags
      .map(
        (t) =>
          `<span class="filter-tag" data-key="${t.key}">` +
          `${_esc(_filterKeyLabel[t.key])}: ${_esc(t.val)}` +
          `<button class="filter-tag-remove" type="button" aria-label="Remove ${_esc(_filterKeyLabel[t.key])} filter" data-key="${t.key}">×</button>` +
          `</span>`,
      )
      .join("");
  }

  // ── Sort direction button label ───────────────────────────────────────────
  function _updateSortDirBtn() {
    const btn = document.getElementById("archive-sort-dir");
    if (!btn) return;

    if (!_state.sortField) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";
    const icon =
      _state.sortDir === "asc"
        ? "arrow-up-narrow-wide"
        : "arrow-down-narrow-wide";
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    btn.title =
      _state.sortDir === "asc"
        ? "Ascending — click to sort descending"
        : "Descending — click to sort ascending";

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [btn] });
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  function _init() {
    // Search
    const searchEl = document.getElementById("archive-search");
    if (searchEl) {
      let debounceTimer;
      searchEl.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          _state.query = searchEl.value;
          _applyVisibility();
        }, 220);
      });
    }

    // Sort field select
    const sortEl = document.getElementById("archive-sort");
    if (sortEl) {
      sortEl.addEventListener("change", () => {
        _state.sortField = sortEl.value;
        _state.sortDir = "asc";
        _updateSortDirBtn();
        _sortRows();
        _applyVisibility();
      });
    }

    // Sort direction toggle
    const sortDirBtn = document.getElementById("archive-sort-dir");
    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        if (!_state.sortField) return;
        _state.sortDir = _state.sortDir === "asc" ? "desc" : "asc";
        _updateSortDirBtn();
        _sortRows();
        _applyVisibility();
      });
    }

    // Filter selects
    Object.keys(_selectToFilterKey).forEach((selectId) => {
      const el = document.getElementById(selectId);
      if (!el) return;
      el.addEventListener("change", () => {
        _state.filters[_selectToFilterKey[selectId]] = el.value;
        _renderActiveTags();
        _applyVisibility();
      });
    });

    // Remove a filter tag via its × button (delegated)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-tag-remove");
      if (!btn) return;
      const key = btn.dataset.key;
      if (!(key in _state.filters)) return;
      _state.filters[key] = "";
      const selectEl = document.getElementById(_filterKeyToSelect[key]);
      if (selectEl) selectEl.value = "";
      _renderActiveTags();
      _applyVisibility();
    });

    // Clear filters button
    const clearBtn = document.getElementById("archive-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        _state.query = "";
        _state.sortField = "";
        _state.sortDir = "asc";
        _state.filters = { section: "", dateMonth: "", type: "", status: "" };

        const searchEl2 = document.getElementById("archive-search");
        if (searchEl2) searchEl2.value = "";

        const sortEl2 = document.getElementById("archive-sort");
        if (sortEl2) sortEl2.value = "";

        Object.keys(_selectToFilterKey).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });

        _updateSortDirBtn();
        _renderActiveTags();
        _applyVisibility();
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  /**
   * refresh() — repopulate filter dropdowns from current rows,
   * re-render active tags, and re-apply all filters/sort.
   * Call this after rows are added or reloaded.
   */
  function refresh() {
    _populateFilterDropdowns();
    _renderActiveTags();
    _applyAll();
  }

  window.archiveSearchFilter = { refresh, applyAll: _applyAll };

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }
})();
