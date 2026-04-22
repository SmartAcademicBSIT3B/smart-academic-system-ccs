const { google } = require("googleapis");
const { hasValidToken, getAuthenticatedClient } = require("./gdrive_oauth");

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const DRIVE_FOLDER_PATH =
  process.env.GOOGLE_DRIVE_FOLDER_PATH || "CTA Files/Documents";

const cachedResolvedFolderIds = new Map();

function getDriveClient() {
  if (!hasValidToken()) {
    const authError = new Error(
      "No valid OAuth token. User must authenticate first via Google Drive.",
    );
    authError.code = "AUTH_REQUIRED";
    throw authError;
  }

  const oauth2Client = getAuthenticatedClient();
  return google.drive({ version: "v3", auth: oauth2Client });
}

async function findChildFolderId(drive, parentId, folderName) {
  const escapedName = String(folderName).replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files && response.data.files[0]
    ? response.data.files[0].id
    : "";
}

async function createChildFolder(drive, parentId, folderName) {
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.id;
}

async function resolveUploadFolderId(drive, targetFolderPath = "") {
  const normalizedFolderPath = String(targetFolderPath || DRIVE_FOLDER_PATH)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");

  if (cachedResolvedFolderIds.has(normalizedFolderPath)) {
    return cachedResolvedFolderIds.get(normalizedFolderPath);
  }

  const segments = normalizedFolderPath
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let parentId = "root";
  for (const segment of segments) {
    const existingId = await findChildFolderId(drive, parentId, segment);
    parentId =
      existingId || (await createChildFolder(drive, parentId, segment));
  }

  if (segments.length === 0 && DRIVE_FOLDER_ID) {
    cachedResolvedFolderIds.set(normalizedFolderPath, DRIVE_FOLDER_ID);
    return DRIVE_FOLDER_ID;
  }

  cachedResolvedFolderIds.set(normalizedFolderPath, parentId);
  return parentId;
}

/**
 * Uploads a file buffer to the Google Drive folder.
 * Makes the file publicly readable and returns the direct view URL.
 *
 * @param {Buffer} fileBuffer - The file contents
 * @param {string} fileName - The name to give the file in Drive
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadProfileImage(
  fileBuffer,
  fileName,
  mimeType,
  targetFolderPath = "",
) {
  const drive = getDriveClient();
  const folderId = await resolveUploadFolderId(drive, targetFolderPath);

  const { Readable } = require("stream");
  const stream = Readable.from(fileBuffer);

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: stream,
  };

  const { data: file } = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  // Make the file publicly readable
  await drive.permissions.create({
    fileId: file.id,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  // Return a direct-view URL
  return `https://drive.google.com/uc?export=view&id=${file.id}`;
}

async function listFilesInFolder(folderId = DRIVE_FOLDER_ID) {
  const drive = getDriveClient();
  const resolvedFolderId = folderId || (await resolveUploadFolderId(drive));

  const res = await drive.files.list({
    q: `'${resolvedFolderId}' in parents and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "files(id,name,mimeType,owners(displayName,emailAddress))",
    pageSize: 20,
  });

  return res.data.files || [];
}

function extractGoogleDriveFileId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Already a raw Drive file ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const idParam = parsed.searchParams.get("id");
    if (idParam) return idParam;

    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
  } catch (_error) {
    const fallbackMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fallbackMatch && fallbackMatch[1]) return fallbackMatch[1];

    const queryMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch && queryMatch[1]) return queryMatch[1];
  }

  return "";
}

async function deleteDriveFileByUrl(fileUrl) {
  const fileId = extractGoogleDriveFileId(fileUrl);
  if (!fileId) {
    return { success: false, message: "No Google Drive file ID found." };
  }

  const drive = getDriveClient();
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });

    return { success: true, fileId };
  } catch (error) {
    if (error?.code === 404) {
      // File already removed in Drive; treat as success for idempotency.
      return { success: true, fileId, alreadyDeleted: true };
    }

    throw error;
  }
}

module.exports = {
  uploadProfileImage,
  listFilesInFolder,
  deleteDriveFileByUrl,
  extractGoogleDriveFileId,
  getDriveClient,
};
