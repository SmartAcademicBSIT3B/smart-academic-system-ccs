const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const { hasValidToken, getAuthenticatedClient } = require("./gdrive_oauth");

const DRIVE_FOLDER_ID =
  process.env.GOOGLE_DRIVE_FOLDER_ID || "1pUA3iE69luJxk-6XVCme_07gz4ltcJT0";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

function getDriveClient() {
  if (!hasValidToken()) {
    throw new Error(
      "No valid OAuth token. User must authenticate first via Google Drive.",
    );
  }

  const oauth2Client = getAuthenticatedClient();
  return google.drive({ version: "v3", auth: oauth2Client });
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

  const { Readable } = require("stream");
  const stream = Readable.from(fileBuffer);

  const fileMetadata = {
    name: fileName,
    parents: [DRIVE_FOLDER_ID],
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

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "files(id,name,mimeType,owners(displayName,emailAddress))",
    pageSize: 20,
  });

  return res.data.files || [];
}

module.exports = { uploadProfileImage, listFilesInFolder };
