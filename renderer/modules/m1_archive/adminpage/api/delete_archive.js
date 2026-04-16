function getElectronApiBridgeForArchiveDelete() {
  if (window.electronAPI) return window.electronAPI;

  try {
    if (
      window.parent &&
      window.parent !== window &&
      window.parent.electronAPI
    ) {
      return window.parent.electronAPI;
    }
  } catch (_error) {
    // Ignore cross-context access errors.
  }

  try {
    if (window.top && window.top !== window && window.top.electronAPI) {
      return window.top.electronAPI;
    }
  } catch (_error) {
    // Ignore cross-context access errors.
  }

  return null;
}

function canConfirmArchiveDelete(value) {
  return String(value || "").trim() === "Confirm";
}

async function deleteArchiveRecord(archiveId) {
  const electronAPI = getElectronApiBridgeForArchiveDelete();
  if (!electronAPI || typeof electronAPI.deleteArchive !== "function") {
    return {
      success: false,
      message:
        "Archive delete API is unavailable in this view. Please reload the app.",
    };
  }

  return await electronAPI.deleteArchive(archiveId);
}

window.canConfirmArchiveDelete = canConfirmArchiveDelete;
window.deleteArchiveRecord = deleteArchiveRecord;
