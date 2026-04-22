(function () {
  const MANAGE_ARCHIVE_SEARCH_KEY = "manageArchivesSearchTitle";
  const APP_SETTINGS_KEY = "sas.app.settings";
  const DEFAULT_DEPARTMENT_CODE = "CCS";

  const state = {
    archives: [],
    filtered: [],
    activeArchiveId: null,
    query: "",
    sortField: "",
    sortDir: "asc",
    currentPage: 1,
    pageSize: 10,
    filters: {
      section: [],
      dateMonth: [],
      type: [],
      status: [],
    },
  };

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

  function getCurrentRole() {
    try {
      const userStr = localStorage.getItem("user");
      if (!userStr) return "";
      const user = JSON.parse(userStr);
      return String(user?.role || "")
        .trim()
        .toLowerCase();
    } catch (error) {
      console.error("Unable to parse local user data:", error);
      return "";
    }
  }

  function normalizeDepartmentCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function getDepartmentCodeFromLocalSettings() {
    try {
      const raw = localStorage.getItem(APP_SETTINGS_KEY);
      if (!raw) return "";

      const parsed = JSON.parse(raw);
      return normalizeDepartmentCode(parsed?.department?.department_code);
    } catch (_error) {
      return "";
    }
  }

  async function getActiveDepartmentCode() {
    const localCode = getDepartmentCodeFromLocalSettings();

    const api = getElectronApiBridge();
    if (!api || typeof api.getAppSettings !== "function") {
      return localCode || DEFAULT_DEPARTMENT_CODE;
    }

    try {
      const result = await api.getAppSettings();
      const persistedCode = normalizeDepartmentCode(
        result?.settings?.department?.department_code,
      );

      if (result?.success && result?.settings && persistedCode) {
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(result.settings));
      }

      return persistedCode || localCode || DEFAULT_DEPARTMENT_CODE;
    } catch (_error) {
      return localCode || DEFAULT_DEPARTMENT_CODE;
    }
  }

  function isAdminUser() {
    return getCurrentRole() === "admin";
  }

  function applyManageDocumentAccess() {
    const manageDocumentTooltip = document.getElementById(
      "manage-document-tooltip",
    );
    if (!manageDocumentTooltip) return;

    const manageDocumentBtn = document.getElementById("manage-document-btn");
    const isAdmin = isAdminUser();

    if (!isAdmin) {
      manageDocumentTooltip.hidden = true;
      manageDocumentTooltip.style.display = "none";
      manageDocumentTooltip.setAttribute("aria-hidden", "true");

      if (manageDocumentBtn) {
        manageDocumentBtn.disabled = true;
        manageDocumentBtn.tabIndex = -1;
      }

      manageDocumentTooltip.remove();
      return;
    }

    manageDocumentTooltip.hidden = false;
    manageDocumentTooltip.style.display = "inline-block";
    manageDocumentTooltip.removeAttribute("aria-hidden");

    if (manageDocumentBtn) {
      manageDocumentBtn.disabled = false;
      manageDocumentBtn.removeAttribute("tabindex");
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMonthYear(dateValue) {
    const raw = String(dateValue || "").trim();
    if (!raw) return "No date";

    const date = new Date(raw);
    if (isNaN(date.getTime())) return raw;

    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  function getKeywordsSnippet(keywords) {
    const raw = String(keywords || "").trim();
    if (!raw) return "No keywords provided.";

    if (raw.length <= 110) return raw;
    return `${raw.slice(0, 107)}...`;
  }

  function getKeywordList(value) {
    return String(value || "")
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function renderKeywordTagsMarkup(value) {
    const keywords = getKeywordList(value);
    if (!keywords.length) {
      return '<span class="preview-meta-empty">No keywords</span>';
    }

    return keywords
      .map(
        (keyword) =>
          `<span class="preview-keyword-tag">${escapeHtml(keyword)}</span>`,
      )
      .join("");
  }

  function createStableSeed(input) {
    const raw = String(input || "");
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }

  function sampleKeywords(value, seedSource, maxVisible = 3) {
    const keywords = getKeywordList(value);
    if (keywords.length <= maxVisible) {
      return { visible: keywords, remaining: 0 };
    }

    // Keep random pick stable per archive to avoid visual flicker on re-render.
    let seed = createStableSeed(seedSource || value || "");
    const scored = keywords.map((keyword, index) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return { keyword, score: seed, index };
    });

    const visible = scored
      .sort((a, b) => a.score - b.score)
      .slice(0, maxVisible)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.keyword);

    return {
      visible,
      remaining: Math.max(0, keywords.length - visible.length),
    };
  }

  function renderListKeywordTagsMarkup(value, seedSource, maxVisible = 3) {
    const sampled = sampleKeywords(value, seedSource, maxVisible);
    if (!sampled.visible.length) {
      return '<span class="archive-keyword-empty">No keywords</span>';
    }

    const chips = sampled.visible
      .map(
        (keyword) =>
          `<span class="archive-keyword-tag">${escapeHtml(keyword)}</span>`,
      )
      .join("");

    if (!sampled.remaining) return chips;
    return `${chips}<span class="archive-keyword-tag archive-keyword-more">+${sampled.remaining}</span>`;
  }

  const filterSelectToKey = {
    "af-section": "section",
    "af-year": "dateMonth",
    "af-type": "type",
    "af-status": "status",
  };

  const filterKeyToSelect = {
    section: "af-section",
    dateMonth: "af-year",
    type: "af-type",
    status: "af-status",
  };

  const filterKeyLabel = {
    section: "Section",
    dateMonth: "Date",
    type: "Type",
    status: "Status",
  };

  function getSearchInputValue() {
    const input = document.getElementById("archive-search-input");
    return input
      ? String(input.value || "")
          .trim()
          .toLowerCase()
      : "";
  }

  function dateToYYYYMM(raw) {
    if (!raw) return "";
    const direct = String(raw).match(/^(\d{4}-\d{2})/);
    if (direct) return direct[1];
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    return "";
  }

  function formatYearMonth(yyyyMM) {
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

  function hasActiveFilters() {
    return Object.values(state.filters).some(
      (arr) => Array.isArray(arr) && arr.length,
    );
  }

  function shouldPaginateList() {
    return !state.query && !hasActiveFilters();
  }

  function getVisibleArchives() {
    if (!shouldPaginateList()) {
      return state.filtered;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(state.filtered.length / state.pageSize),
    );
    if (state.currentPage > totalPages) {
      state.currentPage = totalPages;
    }

    const start = (state.currentPage - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  function hasActiveSearchOrSort() {
    return Boolean(getSearchInputValue()) || Boolean(state.sortField);
  }

  function updateClearFiltersVisibility() {
    const clearBtn = document.getElementById("archive-clear-filters");
    if (!clearBtn) return;
    clearBtn.style.display =
      hasActiveFilters() || hasActiveSearchOrSort() ? "" : "none";
  }

  function updateSortDirBtn() {
    const btn = document.getElementById("archive-sort-dir");
    const sortSelect = document.getElementById("archive-sort");
    const selectWrapper = sortSelect?.closest(".select-wrapper");
    if (!btn) return;

    if (!state.sortField) {
      btn.classList.remove("is-visible");
      if (selectWrapper) {
        selectWrapper.classList.remove("has-value");
      }
      return;
    }

    btn.classList.add("is-visible");
    if (selectWrapper) {
      selectWrapper.classList.add("has-value");
    }
    const icon =
      state.sortDir === "asc"
        ? "arrow-up-narrow-wide"
        : "arrow-down-narrow-wide";
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    btn.title =
      state.sortDir === "asc"
        ? "Ascending - click to sort descending"
        : "Descending - click to sort ascending";

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [btn] });
    }
  }

  function updateArchiveCount(displayCount) {
    const countEl = document.getElementById("archive-count");
    if (!countEl) return;
    countEl.textContent = `${displayCount}/${state.archives.length}`;
  }

  function updatePaginationControls() {
    const pagination = document.getElementById("archive-pagination");
    const prevBtn = document.getElementById("archive-prev-page");
    const nextBtn = document.getElementById("archive-next-page");
    const pageLabel = document.getElementById("archive-page-label");
    if (!pagination || !prevBtn || !nextBtn || !pageLabel) return;

    if (!shouldPaginateList()) {
      pagination.style.display = "none";
      pageLabel.textContent = "Filtered";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(state.filtered.length / state.pageSize),
    );
    pagination.style.display = "inline-flex";
    pageLabel.textContent = `Page ${state.currentPage} of ${totalPages}`;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= totalPages;
  }

  function applySearch() {
    state.query = getSearchInputValue();
    state.currentPage = 1;
    applyFilters();
  }

  function navigateToManageArchivePage() {
    const archive = state.archives.find(
      (item) => getArchiveId(item) === state.activeArchiveId,
    );

    if (!archive) {
      if (window.ViewArchivesModal) {
        window.ViewArchivesModal.showToast("No archive selected.", "error");
      }
      return;
    }

    try {
      sessionStorage.setItem(
        MANAGE_ARCHIVE_SEARCH_KEY,
        String(archive.title || "").trim(),
      );
    } catch (_error) {
      // Ignore session storage errors and continue navigation.
    }

    window.location.href = "./manage_archives.html";
  }

  function openManageConfirmModal() {
    if (!isAdminUser()) return;

    const modal = document.getElementById("manage-confirm-modal");
    if (!modal) {
      navigateToManageArchivePage();
      return;
    }
    modal.classList.add("is-open");
  }

  function closeManageConfirmModal() {
    const modal = document.getElementById("manage-confirm-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function setSidebarHoverState(isHovered) {
    const page = document.querySelector(".page");
    if (!page) return;
    page.classList.toggle("sidebar-hover", Boolean(isHovered));
  }

  function wireSidebarHoverBridge() {
    window.addEventListener("message", (event) => {
      const data = event?.data;
      if (!data || data.type !== "main-menu-sidebar-hover") return;
      setSidebarHoverState(Boolean(data.hovered));
    });
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function populateFilterSelect(id, options, currentValues) {
    const el = document.getElementById(id);
    if (!el) return;

    const selected = Array.isArray(currentValues) ? currentValues : [];
    const allLabel = selected.length
      ? `All (${selected.length} selected)`
      : "All";

    el.innerHTML =
      `<option value="">${allLabel}</option>` +
      options
        .map((o) => {
          const isSelected = selected.includes(o);
          const label = isSelected ? `${o} [selected]` : o;
          return `<option value="${esc(o)}" data-selected="${isSelected ? "true" : "false"}">${esc(label)}</option>`;
        })
        .join("");
    el.value = "";
  }

  function populateDateFilterSelect(id, options, currentValues) {
    const el = document.getElementById(id);
    if (!el) return;

    const selected = Array.isArray(currentValues) ? currentValues : [];
    const allLabel = selected.length
      ? `All (${selected.length} selected)`
      : "All";

    el.innerHTML =
      `<option value="">${allLabel}</option>` +
      options
        .map((v) => {
          const isSelected = selected.includes(v);
          const formatted = formatYearMonth(v);
          const label = isSelected ? `${formatted} [selected]` : formatted;
          return `<option value="${esc(v)}" data-selected="${isSelected ? "true" : "false"}">${esc(label)}</option>`;
        })
        .join("");
    el.value = "";
  }

  function populateFilterDropdowns() {
    const sections = new Set();
    const dates = new Set();
    const types = new Set();
    const statuses = new Set();

    state.archives.forEach((archive) => {
      if (archive.section) sections.add(String(archive.section));
      const ym = dateToYYYYMM(archive.date_published || "");
      if (ym) dates.add(ym);
      if (archive.type) types.add(String(archive.type));
      if (archive.status) statuses.add(String(archive.status));
    });

    populateFilterSelect(
      "af-section",
      Array.from(sections).sort(),
      state.filters.section,
    );
    populateDateFilterSelect(
      "af-year",
      Array.from(dates).sort().reverse(),
      state.filters.dateMonth,
    );
    populateFilterSelect(
      "af-type",
      Array.from(types).sort(),
      state.filters.type,
    );
    populateFilterSelect(
      "af-status",
      Array.from(statuses).sort(),
      state.filters.status,
    );
  }

  function renderActiveFilterTags() {
    const bar = document.getElementById("active-filter-tags");
    if (!bar) return;

    const tags = Object.entries(state.filters).flatMap(([key, values]) => {
      const arr = Array.isArray(values) ? values : [];
      return arr.map((val) => ({ key, val }));
    });

    if (!tags.length) {
      bar.innerHTML = "";
      updateClearFiltersVisibility();
      return;
    }

    bar.innerHTML = tags
      .map(
        (tag) =>
          `<span class="filter-tag" data-key="${tag.key}">` +
          `${esc(filterKeyLabel[tag.key])}: ${esc(tag.key === "dateMonth" ? formatYearMonth(tag.val) : tag.val)}` +
          `<button class="filter-tag-remove" type="button" aria-label="Remove ${esc(filterKeyLabel[tag.key])} filter" data-key="${tag.key}" data-value="${esc(tag.val)}">x</button>` +
          `</span>`,
      )
      .join("");

    updateClearFiltersVisibility();
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

  function getArchiveId(archive) {
    return String(archive?.id ?? "");
  }

  function renderArchiveList() {
    const list = document.getElementById("archive-list");
    if (!list) return;

    const visibleArchives = getVisibleArchives();

    if (state.filtered.length === 0) {
      list.innerHTML =
        '<div class="archive-card"><h3>No archives found</h3><p>Try changing your filters or search query.</p><span></span><p class="desc">The list is synced to the archives table and updates from the database.</p></div>';
      updateArchiveCount(0);
      updatePaginationControls();
      renderPreview(null);
      return;
    }

    list.innerHTML = visibleArchives
      .map((archive, index) => {
        const id = getArchiveId(archive);
        const isActive =
          state.activeArchiveId === id ||
          (!state.activeArchiveId && index === 0);

        return `
          <div class="archive-card${isActive ? " active" : ""}" data-archive-id="${escapeHtml(id)}">
            <h3>${escapeHtml(archive.title || "Untitled")}</h3>
            <p>${escapeHtml(archive.authors || "No author")}</p>
            <span>${escapeHtml(formatMonthYear(archive.date_published))}</span>
            <div class="archive-card-keywords">${renderListKeywordTagsMarkup(archive.keywords, id, 3)}</div>
          </div>
        `;
      })
      .join("");

    updateArchiveCount(visibleArchives.length);
    updatePaginationControls();

    const activeCard =
      list.querySelector(".archive-card.active") ||
      list.querySelector(".archive-card");
    if (activeCard) {
      state.activeArchiveId = activeCard.dataset.archiveId || null;
      const activeArchive = visibleArchives.find(
        (item) => getArchiveId(item) === state.activeArchiveId,
      );
      renderPreview(activeArchive || null);
    }

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [list] });
    }
  }

  function renderPreview(archive) {
    const previewBox = document.querySelector(".preview-box");
    const downloadBtn = document.getElementById("archive-download-btn");

    if (!previewBox) return;

    if (!archive) {
      previewBox.innerHTML =
        '<div style="padding:16px;color:#9AA0A6;">Select an archive to preview details.</div>';
      if (downloadBtn) {
        downloadBtn.dataset.filePath = "";
        downloadBtn.dataset.localFilePath = "";
        downloadBtn.dataset.archiveTitle = "";
        downloadBtn.disabled = true;
      }
      if (window.ViewArchivesFlipCard) {
        window.ViewArchivesFlipCard.clear();
      }
      return;
    }

    previewBox.innerHTML = `
      <div
        class="preview-flip-shell"
        data-archive-id="${escapeHtml(getArchiveId(archive))}"
        data-archive-title="${escapeHtml(archive.title || "")}" 
        data-file-path="${escapeHtml(archive.file_path || "")}" 
        data-local-file-path="${escapeHtml(archive.local_file_path || "")}" 
      >
        <div class="preview-flip-card">
          <div class="preview-flip-face preview-flip-front">
            <div class="preview-face-content">
              <h3 style="font-size:18px; color:#C9CCD1;">${escapeHtml(archive.title || "Untitled")}</h3>
              <p style="font-size:13px; color:#9AA0A6;"><strong style="color:#C9CCD1;">Authors:</strong> ${escapeHtml(archive.authors || "No author")}</p>
              <p style="font-size:13px; color:#9AA0A6;"><strong style="color:#C9CCD1;">Section:</strong> ${escapeHtml(archive.section || "N/A")}</p>
              <p style="font-size:13px; color:#9AA0A6;"><strong style="color:#C9CCD1;">Advisor:</strong> ${escapeHtml(archive.advisor || "N/A")}</p>
              <p style="font-size:13px; color:#9AA0A6;"><strong style="color:#C9CCD1;">Published:</strong> ${escapeHtml(formatMonthYear(archive.date_published))}</p>
              <div class="preview-keywords-section">
                <span class="preview-meta-label">Keywords</span>
                <div class="preview-keywords">${renderKeywordTagsMarkup(archive.keywords)}</div>
              </div>
            </div>
          </div>
          <div class="preview-flip-face preview-flip-back">
            <div class="preview-face-content preview-abstract-panel">
              <div class="preview-paper">
                <h4 class="preview-abstract-title">${escapeHtml(archive.title || "Untitled")}</h4>
                <h5 class="preview-abstract-heading">ABSTRACT</h5>
                <p class="preview-abstract-text">Flip to this side to load the abstract preview.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (downloadBtn) {
      downloadBtn.dataset.filePath = String(archive.file_path || "");
      downloadBtn.dataset.localFilePath = String(archive.local_file_path || "");
      downloadBtn.dataset.archiveTitle = String(archive.title || "");
      downloadBtn.disabled = false;
    }

    if (window.ViewArchivesFlipCard) {
      window.ViewArchivesFlipCard.hydrateArchive(archive);
    }
  }

  function applyFilters() {
    const query = String(state.query || "")
      .trim()
      .toLowerCase();

    state.filtered = state.archives.filter((archive) => {
      const searchable = [
        archive.title || "",
        archive.authors || "",
        archive.keywords || "",
        archive.section || "",
        archive.advisor || "",
      ]
        .join(" ")
        .toLowerCase();

      const passesQuery = !query || searchable.includes(query);

      const sectionFilters = state.filters.section;
      const dateFilters = state.filters.dateMonth;
      const typeFilters = state.filters.type.map((v) =>
        String(v).toLowerCase(),
      );
      const statusFilters = state.filters.status.map((v) =>
        String(v).toLowerCase(),
      );

      const sectionValue = String(archive.section || "");
      if (sectionFilters.length && !sectionFilters.includes(sectionValue)) {
        return false;
      }

      const rowYM = dateToYYYYMM(archive.date_published || "");
      if (dateFilters.length && !dateFilters.includes(rowYM)) {
        return false;
      }

      const typeValue = String(archive.type || "").toLowerCase();
      if (typeFilters.length && !typeFilters.includes(typeValue)) {
        return false;
      }

      const statusValue = String(archive.status || "").toLowerCase();
      if (statusFilters.length && !statusFilters.includes(statusValue)) {
        return false;
      }

      return passesQuery;
    });

    state.filtered.sort((a, b) => {
      const sortField = state.sortField;
      if (!sortField) {
        const aDate = new Date(a.date_published || 0).getTime();
        const bDate = new Date(b.date_published || 0).getTime();
        return bDate - aDate;
      }

      const getSortValue = (item) => {
        if (sortField === "title")
          return String(item.title || "").toLowerCase();
        if (sortField === "authors")
          return String(item.authors || "").toLowerCase();
        if (sortField === "section")
          return String(item.section || "").toLowerCase();
        if (sortField === "advisor")
          return String(item.advisor || "").toLowerCase();
        if (sortField === "type") return String(item.type || "").toLowerCase();
        if (sortField === "status")
          return String(item.status || "").toLowerCase();
        if (sortField === "date")
          return new Date(item.date_published || 0).getTime();
        return "";
      };

      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return state.sortDir === "asc" ? cmp : -cmp;
    });

    const exists = state.filtered.some(
      (item) => getArchiveId(item) === state.activeArchiveId,
    );
    if (!exists) {
      state.activeArchiveId = state.filtered[0]
        ? getArchiveId(state.filtered[0])
        : null;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(state.filtered.length / state.pageSize),
    );
    if (state.currentPage > totalPages) {
      state.currentPage = totalPages;
    }

    renderArchiveList();
    renderActiveFilterTags();
    updateSortDirBtn();
  }

  async function loadArchivesForViewPage() {
    const list = document.getElementById("archive-list");
    if (list) {
      list.innerHTML =
        '<div class="archive-card"><h3>Loading archives...</h3><p>Fetching records from the database.</p><span></span><p class="desc">Please wait.</p></div>';
    }

    const api = getElectronApiBridge();
    if (!api || typeof api.getArchives !== "function") {
      if (list) {
        list.innerHTML =
          '<div class="archive-card"><h3>Archive API unavailable</h3><p>electronAPI.getArchives is not exposed in this view.</p><span></span><p class="desc">Check preload bridge configuration.</p></div>';
      }
      return;
    }

    try {
      const result = await api.getArchives();
      const activeDepartmentCode = await getActiveDepartmentCode();

      if (!result || !result.success || !Array.isArray(result.archives)) {
        if (list) {
          list.innerHTML = `<div class="archive-card"><h3>Failed to load archives</h3><p>${escapeHtml(result?.message || "Unexpected response shape.")}</p><span></span><p class="desc">Try reloading this page.</p></div>`;
        }
        return;
      }

      const scopedArchives = result.archives.filter((archive) => {
        const archiveDepartment = normalizeDepartmentCode(archive?.department);
        return archiveDepartment === activeDepartmentCode;
      });

      if (scopedArchives.length === 0) {
        state.archives = [];
        state.filtered = [];
        if (list) {
          list.innerHTML = `<div class="archive-card"><h3>No archives found for ${escapeHtml(activeDepartmentCode)}</h3><p>The selected department currently has no archive records.</p><span></span><p class="desc">Change department in landing page settings to view another dataset.</p></div>`;
        }
        renderArchiveList();
        renderActiveFilterTags();
        updateSortDirBtn();
        return;
      }

      state.archives = scopedArchives;
      state.filtered = scopedArchives.slice();
      state.activeArchiveId = state.filtered[0]
        ? getArchiveId(state.filtered[0])
        : null;
      populateFilterDropdowns();
      renderActiveFilterTags();
      updateSortDirBtn();
      applyFilters();
    } catch (error) {
      if (list) {
        list.innerHTML = `<div class="archive-card"><h3>Error loading archives</h3><p>${escapeHtml(error?.message || "Unknown error")}</p><span></span><p class="desc">Please try again.</p></div>`;
      }
    }
  }

  function wireEvents() {
    const filterPanelToggleBtn = document.getElementById("filter-panel-toggle");
    const filterPanel = document.getElementById("filter-panel");
    const searchInput = document.getElementById("archive-search-input");
    const searchBtn = document.getElementById("archive-search-btn");
    const sortSelect = document.getElementById("archive-sort");
    const sortDirBtn = document.getElementById("archive-sort-dir");
    const clearFiltersBtn = document.getElementById("archive-clear-filters");
    const activeFilterTags = document.getElementById("active-filter-tags");
    const list = document.getElementById("archive-list");
    const prevPageBtn = document.getElementById("archive-prev-page");
    const nextPageBtn = document.getElementById("archive-next-page");
    const downloadBtn = document.getElementById("archive-download-btn");
    const manageDocumentBtn = document.getElementById("manage-document-btn");
    const manageConfirmModal = document.getElementById("manage-confirm-modal");
    const manageConfirmCancel = document.getElementById(
      "manage-confirm-cancel",
    );
    const manageConfirmProceed = document.getElementById(
      "manage-confirm-proceed",
    );
    const viewfullBtn = document.querySelector(".viewfull-btn");

    if (filterPanelToggleBtn && filterPanel) {
      filterPanelToggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = filterPanel.classList.toggle("is-open");
        filterPanelToggleBtn.classList.toggle("is-open", isOpen);
      });

      filterPanel.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      document.addEventListener("click", () => {
        filterPanel.classList.remove("is-open");
        filterPanelToggleBtn.classList.remove("is-open");
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", updateClearFiltersVisibility);
      searchInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        applySearch();
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener("click", applySearch);
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        state.sortField = String(sortSelect.value || "");
        state.sortDir = "asc";
        state.currentPage = 1;
        applyFilters();
      });
    }

    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        if (!state.sortField) return;
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        applyFilters();
      });
    }

    Object.keys(filterSelectToKey).forEach((selectId) => {
      const el = document.getElementById(selectId);
      if (!el) return;
      el.addEventListener("change", () => {
        const key = filterSelectToKey[selectId];
        const selectedValue = String(el.value || "").trim();

        if (!selectedValue) {
          state.filters[key] = [];
        } else {
          toggleFilterValue(key, selectedValue);
        }

        state.currentPage = 1;
        populateFilterDropdowns();
        applyFilters();
      });
    });

    activeFilterTags?.addEventListener("click", (event) => {
      const btn = event.target.closest(".filter-tag-remove");
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();

      const key = String(btn.dataset.key || "");
      const value = String(btn.dataset.value || "").trim();
      if (!(key in state.filters)) return;

      state.filters[key] = state.filters[key].filter((v) => v !== value);

      const selectEl = document.getElementById(filterKeyToSelect[key]);
      if (selectEl) selectEl.value = "";

      state.currentPage = 1;
      populateFilterDropdowns();
      applyFilters();
    });

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener("click", () => {
        state.filters = {
          section: [],
          dateMonth: [],
          type: [],
          status: [],
        };
        state.query = "";
        state.currentPage = 1;
        state.sortField = "";
        state.sortDir = "asc";

        const searchEl = document.getElementById("archive-search-input");
        if (searchEl) searchEl.value = "";

        const sortEl = document.getElementById("archive-sort");
        if (sortEl) sortEl.value = "";

        Object.keys(filterSelectToKey).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });

        populateFilterDropdowns();
        applyFilters();
      });
    }

    if (prevPageBtn) {
      prevPageBtn.addEventListener("click", () => {
        if (!shouldPaginateList() || state.currentPage <= 1) return;
        state.currentPage -= 1;
        renderArchiveList();
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener("click", () => {
        if (!shouldPaginateList()) return;
        const totalPages = Math.max(
          1,
          Math.ceil(state.filtered.length / state.pageSize),
        );
        if (state.currentPage >= totalPages) return;
        state.currentPage += 1;
        renderArchiveList();
      });
    }

    if (list) {
      list.addEventListener("click", (event) => {
        const card = event.target.closest(".archive-card[data-archive-id]");
        if (!card) return;

        const selectedId = card.dataset.archiveId || "";
        state.activeArchiveId = selectedId;

        list.querySelectorAll(".archive-card.active").forEach((node) => {
          node.classList.remove("active");
        });
        card.classList.add("active");

        const archive = state.filtered.find(
          (item) => getArchiveId(item) === selectedId,
        );
        renderPreview(archive || null);
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        const sourceUrl = String(downloadBtn.dataset.filePath || "");
        const localFilePath = String(downloadBtn.dataset.localFilePath || "");

        if (!sourceUrl && !localFilePath) {
          if (window.ViewArchivesModal) {
            window.ViewArchivesModal.showToast(
              "No file linked to this archive.",
              "error",
            );
          }
          return;
        }

        const toast = window.ViewArchivesModal;
        if (toast) toast.showToast("Starting download…", "info");

        const api = getElectronApiBridge();
        if (!api || typeof api.downloadArchivesToDownloads !== "function") {
          if (toast) toast.showToast("Download API is not available.", "error");
          return;
        }

        try {
          const rawTitle = String(
            downloadBtn.dataset.archiveTitle || "archive",
          ).trim();
          const safeTitle =
            rawTitle.replace(/[/\\:*?"<>|]/g, "_").replace(/\s+/g, "_") ||
            "archive";
          const fileName = `${safeTitle}.pdf`;
          await api.downloadArchivesToDownloads([
            { sourceUrl, localFilePath, fileName },
          ]);
          if (toast)
            toast.showToast("File downloaded successfully.", "success");
        } catch (error) {
          console.error("Download failed:", error);
          if (toast)
            toast.showToast("Download failed. Please try again.", "error");
        }
      });
    }

    if (manageDocumentBtn) {
      manageDocumentBtn.addEventListener("click", openManageConfirmModal);
    }

    if (manageConfirmCancel) {
      manageConfirmCancel.addEventListener("click", closeManageConfirmModal);
    }

    if (manageConfirmProceed) {
      manageConfirmProceed.addEventListener("click", () => {
        closeManageConfirmModal();
        navigateToManageArchivePage();
      });
    }

    if (manageConfirmModal) {
      manageConfirmModal.addEventListener("click", (event) => {
        if (event.target !== manageConfirmModal) return;
        closeManageConfirmModal();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeManageConfirmModal();
    });

    if (viewfullBtn) {
      viewfullBtn.addEventListener("click", () => {
        const archive = state.filtered.find(
          (item) => getArchiveId(item) === state.activeArchiveId,
        );
        if (!archive) {
          if (window.ViewArchivesModal) {
            window.ViewArchivesModal.showToast("No archive selected.", "error");
          }
          return;
        }
        if (window.ViewArchivesModal) {
          window.ViewArchivesModal.openPdfModal(archive);
        }
      });
    }
  }

  function initViewArchivesPage() {
    applyManageDocumentAccess();
    wireEvents();
    wireSidebarHoverBridge();
    loadArchivesForViewPage();

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initViewArchivesPage);
  } else {
    initViewArchivesPage();
  }
})();
