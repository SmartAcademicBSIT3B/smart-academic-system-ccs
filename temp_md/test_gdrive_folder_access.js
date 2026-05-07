require("dotenv").config();

const { listFilesInFolder } = require("../services/gdrive_service");

const folderId = process.argv[2] || "1pUA3iE69luJxk-6XVCme_07gz4ltcJT0";

async function run() {
  try {
    console.log("Testing folder access for:", folderId);

    const files = await listFilesInFolder(folderId);

    console.log("Access check passed.");
    console.log("Files found:", files.length);
    console.log(JSON.stringify(files, null, 2));
  } catch (error) {
    console.error("Access check failed:");
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

run();
