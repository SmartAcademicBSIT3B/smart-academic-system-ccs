(function () {
  const state = {
    archives: [],
    filtered: [],
    activeArchiveId: null,
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

  function matchesCourse(section, course) {
    if (!course) return true;
    const sectionText = String(section || "").toUpperCase();
    return sectionText.startsWith(course) || sectionText.includes(course);
  }

  function getSelectedCourse() {
    const selected = document.querySelector('input[name="course"]:checked');
    return selected ? String(selected.value || "") : "";
  }

  function getSelectedSort() {
    const selected = document.querySelector('input[name="sort"]:checked');
    return selected ? String(selected.value || "date") : "date";
  }

  function getSearchQuery() {
    const input = document.getElementById("archive-search-input");
    return input
      ? String(input.value || "")
          .trim()
          .toLowerCase()
      : "";
  }

  function getArchiveId(archive) {
    return String(archive?.id ?? "");
  }

  function renderArchiveList() {
    const list = document.getElementById("archive-list");
    if (!list) return;

    if (state.filtered.length === 0) {
      list.innerHTML =
        '<div class="archive-card"><h3>No archives found</h3><p>Try changing your filters or search query.</p><span></span><p class="desc">The list is synced to the archives table and updates from the database.</p></div>';
      return;
    }

    list.innerHTML = state.filtered
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

    const activeCard =
      list.querySelector(".archive-card.active") ||
      list.querySelector(".archive-card");
    if (activeCard) {
      state.activeArchiveId = activeCard.dataset.archiveId || null;
      const activeArchive = state.filtered.find(
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
    const query = getSearchQuery();
    const selectedCourse = getSelectedCourse().toUpperCase();
    const selectedSort = getSelectedSort();

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
      const passesCourse = matchesCourse(archive.section, selectedCourse);
      return passesQuery && passesCourse;
    });

    state.filtered.sort((a, b) => {
      if (selectedSort === "az") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }
      if (selectedSort === "za") {
        return String(b.title || "").localeCompare(String(a.title || ""));
      }

      const aDate = new Date(a.date_published || 0).getTime();
      const bDate = new Date(b.date_published || 0).getTime();
      return bDate - aDate;
    });

    const exists = state.filtered.some(
      (item) => getArchiveId(item) === state.activeArchiveId,
    );
    if (!exists) {
      state.activeArchiveId = state.filtered[0]
        ? getArchiveId(state.filtered[0])
        : null;
    }

    renderArchiveList();
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

      if (!result || !result.success || !Array.isArray(result.archives)) {
        if (list) {
          list.innerHTML = `<div class="archive-card"><h3>Failed to load archives</h3><p>${escapeHtml(result?.message || "Unexpected response shape.")}</p><span></span><p class="desc">Try reloading this page.</p></div>`;
        }
        return;
      }

      state.archives = result.archives;
      state.filtered = result.archives.slice();
      state.activeArchiveId = state.filtered[0]
        ? getArchiveId(state.filtered[0])
        : null;
      applyFilters();
    } catch (error) {
      if (list) {
        list.innerHTML = `<div class="archive-card"><h3>Error loading archives</h3><p>${escapeHtml(error?.message || "Unknown error")}</p><span></span><p class="desc">Please try again.</p></div>`;
      }
    }
  }

  function wireEvents() {
    const toggleBtn = document.querySelector(".filter-toggle");
    const dropdown = document.querySelector(".filter-dropdown");
    const filterGroup = document.querySelector(".filter-group");
    const searchInput = document.getElementById("archive-search-input");
    const applyBtn = document.getElementById("apply-filter-btn");
    const list = document.getElementById("archive-list");
    const downloadBtn = document.getElementById("archive-download-btn");
    const viewfullBtn = document.querySelector(".viewfull-btn");

    if (toggleBtn && dropdown && filterGroup) {
      toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dropdown.classList.toggle("show");
        filterGroup.classList.toggle("active");
      });

      dropdown.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      document.addEventListener("click", () => {
        dropdown.classList.remove("show");
        filterGroup.classList.remove("active");
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", applyFilters);
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", applyFilters);
    }

    document
      .querySelectorAll('input[name="course"], input[name="sort"]')
      .forEach((inputEl) => {
        inputEl.addEventListener("change", applyFilters);
      });

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
    wireEvents();
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
