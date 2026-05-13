(function () {
  const state = {
    isFlipped: false,
    activeArchiveId: "",
    cache: new Map(),
    requestToken: 0,
    pdfJsPromise: null,
  };

  function getShell() {
    return document.querySelector(".preview-flip-shell");
  }

  function getAbstractTextEl() {
    return document.querySelector(".preview-abstract-text");
  }

  function getCurrentArchiveMeta() {
    const shell = getShell();
    if (!shell) return null;

    return {
      id: String(shell.dataset.archiveId || ""),
      title: String(shell.dataset.archiveTitle || ""),
      localFilePath: String(shell.dataset.localFilePath || ""),
      filePath: String(shell.dataset.filePath || ""),
    };
  }

  function syncFlipUi() {
    const shell = getShell();
    if (!shell) return;

    shell.classList.toggle("is-flipped", state.isFlipped);

    const btn = document.getElementById("flip-preview-btn");
    if (btn) {
      btn.textContent = state.isFlipped ? "Show Details" : "Flip Card";
    }
  }

  function buildLocalUrl(archive) {
    const localPath = String(
      archive.localFilePath || archive.local_file_path || "",
    ).trim();
    if (!localPath) return null;

    if (localPath.startsWith("file://")) return localPath;

    if (/^[a-zA-Z]:[\\/]/.test(localPath)) {
      return "file:///" + localPath.replace(/\\/g, "/");
    }

    try {
      const adminpageBase = new URL("../", window.location.href).href;
      return new URL(localPath, adminpageBase).href;
    } catch (_error) {
      return "file:///" + localPath.replace(/\\/g, "/").replace(/^\/+/, "");
    }
  }

  function buildDriveCandidates(archive) {
    const filePath = String(archive.filePath || archive.file_path || "").trim();
    if (!filePath) return [];

    if (!filePath.includes("drive.google.com")) {
      return [filePath];
    }

    const idMatch =
      filePath.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      filePath.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (!idMatch) {
      return [filePath];
    }

    const fileId = idMatch[1];
    return [
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/file/d/${fileId}/preview`,
    ];
  }

  function buildPdfCandidates(archive) {
    const candidates = [];
    const local = buildLocalUrl(archive);
    if (local) candidates.push(local);

    for (const item of buildDriveCandidates(archive)) {
      if (item && !candidates.includes(item)) {
        candidates.push(item);
      }
    }

    return candidates;
  }

  async function getPdfJs() {
    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    if (state.pdfJsPromise) {
      return state.pdfJsPromise;
    }

    state.pdfJsPromise =
      import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs")
        .then((mod) => {
          mod.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs";
          return mod;
        })
        .catch((error) => {
          state.pdfJsPromise = null;
          throw error;
        });

    return state.pdfJsPromise;
  }

  async function readPdfText(pdfJs, url) {
    const loadingTask = pdfJs.getDocument({ url });
    const pdf = await loadingTask.promise;

    const maxPages = Math.min(pdf.numPages, 8);
    let combined = "";

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const textLine = content.items
        .map((item) => String(item.str || ""))
        .join(" ");
      combined += `${textLine}\n`;
    }

    return combined;
  }

  function extractAbstract(text) {
    const cleaned = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "No readable text was found in this PDF.";

    function findNarrativeStart(value) {
      const starters = [
        /\bthis\s+study\b/i,
        /\bthe\s+study\b/i,
        /\bthis\s+research\b/i,
        /\bthe\s+research\b/i,
        /\bthis\s+paper\b/i,
        /\bthis\s+thesis\b/i,
        /\bthis\s+capstone\b/i,
        /\bthe\s+purpose\s+of\s+this\s+study\b/i,
        /\bthe\s+objective\s+of\s+this\s+study\b/i,
      ];

      let best = -1;
      for (const rx of starters) {
        const match = rx.exec(value);
        if (match && (best < 0 || match.index < best)) {
          best = match.index;
        }
      }
      return best;
    }

    const lower = cleaned.toLowerCase();
    const abstractIndex = lower.indexOf("abstract");

    if (abstractIndex < 0) {
      return cleaned.slice(0, 900) + (cleaned.length > 900 ? "..." : "");
    }

    const afterAbstract = cleaned
      .slice(abstractIndex + "abstract".length)
      .trim();
    const narrativeStart = findNarrativeStart(afterAbstract);
    const normalizedAbstract =
      narrativeStart >= 0
        ? afterAbstract.slice(narrativeStart).trim()
        : afterAbstract;

    const stopMatchers = [
      /\bkeywords?\b/i,
      /\bindex terms\b/i,
      /\bintroduction\b/i,
      /\bchapter\s*1\b/i,
    ];

    let end = normalizedAbstract.length;
    for (const matcher of stopMatchers) {
      const match = matcher.exec(normalizedAbstract);
      if (match && match.index > 160) {
        end = Math.min(end, match.index);
      }
    }

    const extracted = normalizedAbstract.slice(0, Math.min(end, 1400)).trim();
    if (!extracted) {
      return cleaned.slice(0, 900) + (cleaned.length > 900 ? "..." : "");
    }

    return extracted + (normalizedAbstract.length > end ? "..." : "");
  }

  async function loadAbstractForCurrentArchive() {
    const target = getAbstractTextEl();
    const archive = getCurrentArchiveMeta();
    if (!target || !archive || !archive.id) return;

    const cacheKey = archive.id;
    if (state.cache.has(cacheKey)) {
      target.textContent = state.cache.get(cacheKey);
      return;
    }

    const candidates = buildPdfCandidates(archive);
    if (!candidates.length) {
      target.textContent = "No PDF link is available for this archive.";
      return;
    }

    target.textContent = "Extracting abstract from PDF...";

    const token = ++state.requestToken;

    try {
      const pdfJs = await getPdfJs();
      let extracted = "";
      let lastError = null;

      for (const url of candidates) {
        try {
          const fullText = await readPdfText(pdfJs, url);
          extracted = extractAbstract(fullText);
          if (extracted) break;
        } catch (error) {
          lastError = error;
        }
      }

      if (token !== state.requestToken) return;

      if (!extracted) {
        extracted =
          "Unable to extract abstract from this PDF. Open the full document for complete preview.";
        if (lastError) {
          console.warn("Abstract extraction failed:", lastError);
        }
      }

      state.cache.set(cacheKey, extracted);
      target.textContent = extracted;
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("Failed to load PDF parser:", error);
      target.textContent =
        "Could not load PDF parser for abstract preview. Use See Full Document for direct viewing.";
    }
  }

  function hydrateArchive(archive) {
    if (!archive) {
      state.activeArchiveId = "";
      return;
    }

    state.activeArchiveId = String(archive.id || "");
    syncFlipUi();

    if (state.isFlipped) {
      loadAbstractForCurrentArchive();
    }
  }

  function clear() {
    state.activeArchiveId = "";
    state.requestToken += 1;
    syncFlipUi();
  }

  function toggle() {
    state.isFlipped = !state.isFlipped;
    syncFlipUi();

    if (state.isFlipped) {
      loadAbstractForCurrentArchive();
    }
  }

  function init() {
    const flipBtn = document.getElementById("flip-preview-btn");
    if (flipBtn) {
      flipBtn.addEventListener("click", toggle);
    }

    syncFlipUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ViewArchivesFlipCard = {
    init,
    toggle,
    clear,
    hydrateArchive,
  };
})();
