const { google } = require("googleapis");
const { hasValidToken, getAuthenticatedClient } = require("./gdrive_oauth");

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const DRIVE_FOLDER_PATH =
  process.env.GOOGLE_DRIVE_FOLDER_PATH || "CTA Files/Documents";

let cachedResolvedFolderId = "";

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

async function resolveUploadFolderId(drive) {
  if (cachedResolvedFolderId) {
    return cachedResolvedFolderId;
  }

  const segments = String(DRIVE_FOLDER_PATH)
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
    cachedResolvedFolderId = DRIVE_FOLDER_ID;
    return cachedResolvedFolderId;
  }

  cachedResolvedFolderId = parentId;
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
async function uploadProfileImage(fileBuffer, fileName, mimeType) {
  const drive = getDriveClient();
  const folderId = await resolveUploadFolderId(drive);

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

module.exports = { uploadProfileImage, listFilesInFolder };
