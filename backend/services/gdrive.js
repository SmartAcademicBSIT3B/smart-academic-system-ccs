const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const TOKEN_PATH = path.join(__dirname, "..", ".tokens", "gdrive_token.json");

function ensureTokenDir() {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getOAuth2Client() {
  return getOAuth2ClientWithRedirectUri();
}

function getOAuth2ClientWithRedirectUri(redirectUriOverride) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    String(redirectUriOverride || "").trim() ||
    process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(redirectUriOverride) {
  const client = getOAuth2ClientWithRedirectUri(redirectUriOverride);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive"],
    prompt: "consent",
  });
}

async function saveTokenFromCode(code, redirectUriOverride) {
  ensureTokenDir();
  const client = getOAuth2ClientWithRedirectUri(redirectUriOverride);
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function hasToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      return !!(tokens?.access_token || tokens?.refresh_token);
    }
  } catch (_err) {}
  return false;
}

function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

function getAuthenticatedClient() {
  if (!hasToken()) {
    const err = new Error(
      "No valid OAuth token. Authorize via /api/gdrive/auth-url.",
    );
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const client = getOAuth2Client();
  client.setCredentials(tokens);
  return client;
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuthenticatedClient() });
}

function extractFileId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes("/")) return raw;
  try {
    const parsed = new URL(raw);
    const idParam = parsed.searchParams.get("id");
    if (idParam) return idParam;
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];
  } catch (_err) {
    const fallback = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fallback) return fallback[1];
    const qm = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (qm) return qm[1];
  }
  return "";
}

async function findOrCreateFolder(drive, parentId, folderName) {
  const escaped = String(folderName).replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escaped}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files?.[0]) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return created.data.id;
}

async function resolveFolderId(drive, folderPath) {
  const segments = String(folderPath || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  let parentId = "root";
  for (const seg of segments) {
    parentId = await findOrCreateFolder(drive, parentId, seg);
  }
  return parentId;
}

async function uploadFile(fileBuffer, fileName, mimeType, targetFolderPath) {
  const drive = getDriveClient();
  const folderId = await resolveFolderId(drive, targetFolderPath);

  const { Readable } = require("stream");
  const stream = Readable.from(fileBuffer);

  const { data: file } = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  await drive.permissions.create({
    fileId: file.id,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return `https://drive.google.com/uc?export=view&id=${file.id}`;
}

async function deleteFileByUrl(fileUrl) {
  const fileId = extractFileId(fileUrl);
  if (!fileId) return { success: false, message: "No Drive file ID found." };
  const drive = getDriveClient();
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return { success: true, fileId };
  } catch (error) {
    if (error?.code === 404)
      return { success: true, fileId, alreadyDeleted: true };
    throw error;
  }
}

async function downloadFile(fileUrl) {
  const fileId = extractFileId(fileUrl);
  if (!fileId)
    throw Object.assign(new Error("Invalid Drive URL."), {
      code: "INVALID_URL",
    });

  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });
  const fileName = meta.data.name || "archive.pdf";
  const mimeType = meta.data.mimeType || "application/octet-stream";

  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );

  return { stream: response.data, mimeType, fileName };
}

module.exports = {
  getAuthUrl,
  saveTokenFromCode,
  hasToken,
  clearToken,
  uploadFile,
  deleteFileByUrl,
  downloadFile,
  extractFileId,
};
