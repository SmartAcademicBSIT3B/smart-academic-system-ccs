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
      authors.push(normalizeExtractedAuthorName(line.trim()));
    }
    if (authors.length >= 3) break;
  }
  return authors;
}

function toTitleCaseNamePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function normalizeExtractedAuthorName(value) {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  if (!raw.includes(",")) {
    return toTitleCaseNamePart(raw);
  }

  const parts = raw.split(",");
  const surname = toTitleCaseNamePart(parts[0] || "");
  const given = String(parts.slice(1).join(",") || "")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = given.split(" ").filter(Boolean);
  if (!tokens.length) return surname;

  const lastToken = String(tokens[tokens.length - 1] || "").trim();
  const hasTrailingInitial = /^[A-Za-z]\.?$/.test(lastToken);
  const givenNameTokens = hasTrailingInitial ? tokens.slice(0, -1) : tokens;
  const givenNames = toTitleCaseNamePart(givenNameTokens.join(" "));
  const middleInitial = hasTrailingInitial
    ? `${lastToken.charAt(0).toUpperCase()}.`
    : "";

  return [givenNames, middleInitial, surname].filter(Boolean).join(" ");
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

function uniqueNonEmpty(values, limit) {
  const seen = new Set();
  const result = [];
  const max = Number.isInteger(limit) ? limit : 30;

  for (const value of values || []) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^[,;:\-\u2013\u2014\s]+|[,;:\-\u2013\u2014\s]+$/g, "")
      .trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }

  return result;
}

function parseKeywordsFromInlineLabel(lines) {
  const keywordLabelPatterns = [
    /\bkeywords?\b\s*[:\-\u2013\u2014]\s*(.+)$/i,
    /\bkey\s+words?\b\s*[:\-\u2013\u2014]\s*(.+)$/i,
    /\bindex\s+terms?\b\s*[:\-\u2013\u2014]\s*(.+)$/i,
  ];
  const stopPattern =
    /^(abstract|introduction|chapter\b|acknowledg|table of contents|references|appendix)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of keywordLabelPatterns) {
      const match = line.match(pattern);
      if (!match) continue;

      const collected = [];
      if (match[1]) collected.push(match[1]);

      let nextIndex = i + 1;
      while (nextIndex < lines.length && collected.join(" ").length < 220) {
        const nextLine = lines[nextIndex].trim();
        if (!nextLine || stopPattern.test(nextLine)) break;
        if (/^[A-Z][A-Z\s]{6,}$/.test(nextLine)) break;
        collected.push(nextLine);
        if (/[.]$/.test(nextLine)) break;
        nextIndex += 1;
      }

      return uniqueNonEmpty(
        collected
          .join(" ")
          .split(/[,;]|\s\u2022\s|\s•\s/)
          .map((part) => part.replace(/^keywords?\s*[:\-\u2013\u2014]\s*/i, ""))
          .filter(Boolean),
        12,
      );
    }
  }

  return [];
}

function parsePdfKeywords(allText) {
  const lines = allText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const inlineKeywords = parseKeywordsFromInlineLabel(lines);
  if (inlineKeywords.length > 0) return inlineKeywords;

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
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (identifiers.some((id) => lower.includes(id))) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];
  const termPat =
    /^([A-Z][A-Za-z0-9\s\(\)\/\-&]{2,80})\s*(?:[\u2013\u2014\-:]|\s{2,})\s+/;
  const stopPat =
    /^(CHAPTER|REFERENCES|APPENDIX|BIBLIOGRAPHY|INDEX|ABSTRACT|ACKNOWLEDGMENT|ACKNOWLEDGEMENTS|TABLE OF CONTENTS)\b/i;
  const keywords = [];
  for (let i = startIdx; i < lines.length && keywords.length < 30; i++) {
    if (stopPat.test(lines[i])) break;
    const m = lines[i].match(termPat);
    if (m) keywords.push(m[1].trim());
  }
  return uniqueNonEmpty(keywords, 30);
}

function monthTokenToNumber(token) {
  const normalized = String(token || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return monthMap[normalized] || 0;
}

function formatExtractedYearMonth(year, month) {
  const yearStr = String(year || "").trim();
  const monthNum = Number(month);
  if (!/^\d{4}$/.test(yearStr)) return "";
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) return "";

  return `${yearStr}-${String(monthNum).padStart(2, "0")}-01`;
}

function normalizePdfSearchText(value) {
  let normalized = String(value || "")
    .replace(/[\u00A0\u2000-\u200D\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // PDF text extraction often inserts spaces between each character.
  normalized = normalized.replace(/\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/g, (match) =>
    match.replace(/\s+/g, ""),
  );

  // It can also split digits like "2 0 2 4".
  normalized = normalized.replace(/\b(?:\d\s+){3,}\d\b/g, (match) =>
    match.replace(/\s+/g, ""),
  );

  // Normalize punctuation spacing around dates like "January , 2024".
  normalized = normalized
    .replace(/\s+([,./\-])/g, "$1")
    .replace(/([,./\-])\s+/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function extractDateFromTextTarget(target) {
  const text = normalizePdfSearchText(target || "");
  if (!text) return "";

  const monthTokenPattern =
    /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/i;
  const monthYearPattern = new RegExp(
    `${monthTokenPattern.source}\\.?[\\s,\\/\\-]*?(\\d{4})`,
    "i",
  );
  const yearMonthNamedPattern = new RegExp(
    `(\\d{4})[\\s,\\/\\-]*?${monthTokenPattern.source}`,
    "i",
  );
  const numericMonthYearPattern = /\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/;
  const yearMonthPattern = /\b(\d{4})[\/\-](0?[1-9]|1[0-2])\b/;

  const monthYearMatch = text.match(monthYearPattern);
  if (monthYearMatch) {
    const monthNum = monthTokenToNumber(monthYearMatch[1]);
    const formatted = formatExtractedYearMonth(monthYearMatch[2], monthNum);
    if (formatted) return formatted;
  }

  const yearMonthNamedMatch = text.match(yearMonthNamedPattern);
  if (yearMonthNamedMatch) {
    const monthNum = monthTokenToNumber(yearMonthNamedMatch[2]);
    const formatted = formatExtractedYearMonth(
      yearMonthNamedMatch[1],
      monthNum,
    );
    if (formatted) return formatted;
  }

  const numericMonthYearMatch = text.match(numericMonthYearPattern);
  if (numericMonthYearMatch) {
    const formatted = formatExtractedYearMonth(
      numericMonthYearMatch[2],
      Number(numericMonthYearMatch[1]),
    );
    if (formatted) return formatted;
  }

  const yearMonthMatch = text.match(yearMonthPattern);
  if (yearMonthMatch) {
    const formatted = formatExtractedYearMonth(
      yearMonthMatch[1],
      Number(yearMonthMatch[2]),
    );
    if (formatted) return formatted;
  }

  const compactText = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compactMonthYearMatch = compactText.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(\d{4})/i,
  );
  if (compactMonthYearMatch) {
    const monthNum = monthTokenToNumber(compactMonthYearMatch[1]);
    const formatted = formatExtractedYearMonth(
      compactMonthYearMatch[2],
      monthNum,
    );
    if (formatted) return formatted;
  }

  const compactYearMonthMatch = compactText.match(
    /(\d{4})(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)/i,
  );
  if (compactYearMonthMatch) {
    const monthNum = monthTokenToNumber(compactYearMonthMatch[2]);
    const formatted = formatExtractedYearMonth(
      compactYearMonthMatch[1],
      monthNum,
    );
    if (formatted) return formatted;
  }

  return "";
}

function parsePdfDate(lines, allText) {
  const frontLines = Array.isArray(lines) ? lines : [];
  const fullLines = String(allText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [...frontLines, ...fullLines.slice(0, 180)].map(
    normalizePdfSearchText,
  );
  const normalizedFullText = normalizePdfSearchText(allText || "");

  const searchTargets = [...candidates, normalizedFullText];

  for (const target of searchTargets) {
    const formatted = extractDateFromTextTarget(target);
    if (formatted) return formatted;
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
    date: parsePdfDate(page1Lines, allText),
  };
}
