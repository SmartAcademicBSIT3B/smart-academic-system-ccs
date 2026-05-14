const unzipper = require("unzipper");

function normalizeZipEntryName(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .trim();
}

async function extractCsvEntriesFromZipBuffer(buffer) {
  const out = [];
  if (!Buffer.isBuffer(buffer)) return out;

  const zip = await unzipper.Open.buffer(buffer);
  for (const entry of zip.files) {
    if (!entry || entry.type !== "File") continue;

    const fileName = normalizeZipEntryName(entry.path);
    if (!/\.csv$/i.test(fileName)) continue;

    const content = await entry.buffer();
    out.push({
      fileName,
      content,
    });
  }

  return out;
}

module.exports = {
  extractCsvEntriesFromZipBuffer,
};
