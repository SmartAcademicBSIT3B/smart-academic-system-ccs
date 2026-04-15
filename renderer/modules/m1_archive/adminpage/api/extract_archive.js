// ── PDF extraction helpers for Manage Archives ──────────────────────────────
// Depends on PDF.js (pdfjsLib) being loaded before this script.

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

function groupTextIntoLines(items, tol) {
  tol = tol || 4;
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > tol) return dy;
    return a.transform[4] - b.transform[4];
  });
  const lineMap = new Map();
  for (const item of sorted) {
    const y = Math.round(item.transform[5] / tol) * tol;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push(item);
  }
  return Array.from(lineMap.values())
    .sort((a, b) => b[0].transform[5] - a[0].transform[5])
    .map((g) =>
      g
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0);
}

function parsePdfTitle(lines) {
  const stopPatterns = [
    /^(A |An )(Capstone|Thesis|Research|Study|Project)/i,
    /presented to/i,
    /In partial fulfillment/i,
    /College of/i,
    /Pamantasan/i,
    /^by:?$/i,
  ];
  const titleLines = [];
  for (const line of lines) {
    if (stopPatterns.some((p) => p.test(line))) break;
    if (line.length < 4) continue;
    titleLines.push(line.trim());
    if (titleLines.length >= 3) break;
  }
  return titleLines.join(" ").replace(/\s+/g, " ").trim();
}

function parsePdfAuthors(lines) {
  const authors = [];
  let inBy = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^by:?$/i.test(line)) {
      inBy = true;
      continue;
    }
    if (!inBy) continue;
    if (/^Advis[eo]r/i.test(line)) break;
    if (i + 1 < lines.length && /^Advis[eo]r/i.test(lines[i + 1].trim())) break;
    if (/^[A-Z][a-záéíóúñ]+[,\s]+[A-Z]/i.test(line) && authors.length < 3) {
      authors.push(line.trim());
    }
    if (authors.length >= 3) break;
  }
  return authors;
}

function parsePdfAdvisor(lines) {
  // The adviser name is the line immediately before the word "Adviser"
  for (let i = 1; i < lines.length; i++) {
    if (/^Advis[eo]r$/i.test(lines[i].trim())) {
      const candidate = lines[i - 1].trim();
      // Must look like a real name (contains letter + comma or space + letter)
      if (candidate.length > 3 && /[A-Za-z]/.test(candidate)) {
        return candidate;
      }
    }
  }
  return "";
}

function parsePdfType(lines) {
  const typeMap = [
    { pattern: /capstone/i, value: "Capstone" },
    { pattern: /thesis/i, value: "Thesis" },
    { pattern: /research/i, value: "Research" },
    { pattern: /project/i, value: "Project" },
  ];
  const joined = lines.slice(0, 20).join(" ");
  for (const { pattern, value } of typeMap) {
    if (pattern.test(joined)) return value;
  }
  return "Other";
}

function parsePdfKeywords(allText) {
  const identifiers = [
    "operational definition of terms",
    "definition of terms",
    "glossary of terms",
    "glossary",
    "key terms",
    "definitions",
    "list of terms",
    "terminology",
  ];
  const lines = allText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (identifiers.some((id) => lower.includes(id))) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];
  const termPat = /^([A-Z][A-Za-z\s\(\)\/\-]{2,60})\s*[\u2013\u2014\-]\s/;
  const stopPat = /^(CHAPTER|REFERENCES|APPENDIX|BIBLIOGRAPHY|INDEX)\b/i;
  const keywords = [];
  for (let i = startIdx; i < lines.length && keywords.length < 30; i++) {
    if (stopPat.test(lines[i])) break;
    const m = lines[i].match(termPat);
    if (m) keywords.push(m[1].trim());
  }
  return keywords;
}

function parsePdfDate(lines) {
  // Look for date pattern: "Month, YYYY" or "Month YYYY"
  // Examples: "January, 2024", "December 2023", "January 2025"
  const monthPattern =
    /(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i;

  // Search through the page lines (usually near the end for the date)
  for (const line of lines) {
    const match = line.match(monthPattern);
    if (match) {
      // Format as YYYY-MM-DD for HTML date input
      const monthName = match[1];
      const year = match[2];
      const monthNum = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
      return `${year}-${String(monthNum).padStart(2, "0")}-01`;
    }
  }

  return "";
}

/**
 * Extracts structured data from a PDF File object.
 * Returns { title, authors, advisor, type, keywords, date }.
 */
async function extractArchiveDataFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const page1 = await pdf.getPage(1);
  const p1Content = await page1.getTextContent();
  const page1Lines = groupTextIntoLines(p1Content.items);

  let allText = page1Lines.join("\n") + "\n";
  for (let i = 2; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const content = await pg.getTextContent();
    allText += groupTextIntoLines(content.items).join("\n") + "\n";
  }

  return {
    title: parsePdfTitle(page1Lines),
    authors: parsePdfAuthors(page1Lines),
    advisor: parsePdfAdvisor(page1Lines),
    type: parsePdfType(page1Lines),
    keywords: parsePdfKeywords(allText),
    date: parsePdfDate(page1Lines),
  };
}
