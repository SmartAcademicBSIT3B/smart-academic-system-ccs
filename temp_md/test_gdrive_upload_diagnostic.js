require("dotenv").config();

const { Readable } = require("stream");
const { getDriveClient } = require("../services/gdrive_service");

const DEFAULT_FOLDER_ID = "1pUA3iE69luJxk-6XVCme_07gz4ltcJT0";

async function run() {
  const folderId = process.argv[2] || DEFAULT_FOLDER_ID;
  const drive = getDriveClient();

  const fileName = `diag_${Date.now()}.txt`;
  const body = Readable.from(["diagnostic upload test\n"]);

  try {
    console.log("Running tiny upload diagnostic...");
    console.log("Folder ID:", folderId);

    const createRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: "text/plain",
      },
      media: {
        mimeType: "text/plain",
        body,
      },
      fields: "id,name,parents,driveId",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    console.log("Upload succeeded:");
    console.log(JSON.stringify(createRes.data, null, 2));

    // Cleanup so diagnostics do not clutter the folder.
    if (createRes.data && createRes.data.id) {
      await drive.files.delete({
        fileId: createRes.data.id,
        supportsAllDrives: true,
      });
      console.log("Diagnostic file deleted:", createRes.data.id);
    }
  } catch (error) {
    console.error("Upload failed. Full error payload follows.");

    const payload = {
      message: error.message,
      code: error.code,
      status: error.status,
      errors: error.errors,
      responseStatus: error.response ? error.response.status : null,
      responseStatusText: error.response ? error.response.statusText : null,
      responseData: error.response ? error.response.data : null,
      stack: error.stack,
    };

    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  }
}

run();
