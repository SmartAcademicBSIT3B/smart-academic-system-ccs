const { parse: parseCsvSync } = require("csv-parse/sync");
const { stringify: stringifyCsvSync } = require("csv-stringify/sync");

function normalizeCsvValue(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowsToCsv(rows = [], preferredColumns = []) {
  const list = Array.isArray(rows) ? rows : [];
  const explicitColumns = Array.isArray(preferredColumns)
    ? preferredColumns.filter(Boolean)
    : [];

  const inferredColumns = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (!inferredColumns.includes(key)) inferredColumns.push(key);
    }
  }

  const columns = explicitColumns.length ? explicitColumns : inferredColumns;

  const records = list.map((row) => {
    const out = {};
    for (const column of columns) {
      out[column] = normalizeCsvValue(row?.[column]);
    }
    return out;
  });

  const csvBody = stringifyCsvSync(records, {
    header: true,
    columns,
    quoted: true,
    quoted_empty: true,
    quoted_string: true,
  });

  // UTF-8 BOM helps Excel recognize encoding correctly.
  return `\uFEFF${csvBody}`;
}

function csvToRows(input) {
  const text = Buffer.isBuffer(input)
    ? input.toString("utf8")
    : String(input || "");

  return parseCsvSync(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
}

module.exports = {
  rowsToCsv,
  csvToRows,
};
