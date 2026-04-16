const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  login: (email, password) => ipcRenderer.invoke("login", email, password),
  getProfile: (userId) => ipcRenderer.invoke("getProfile", userId),
  getSections: () => ipcRenderer.invoke("getSections"),
  getProfessors: () => ipcRenderer.invoke("getProfessors"),
  selectProfileImage: () => ipcRenderer.invoke("selectProfileImage"),
  uploadProfileImage: (fileInfo) =>
    ipcRenderer.invoke("uploadProfileImage", fileInfo),
  createArchive: (archiveData) =>
    ipcRenderer.invoke("createArchive", archiveData),
  getArchives: () => ipcRenderer.invoke("getArchives"),
  deleteArchive: (archiveId) => ipcRenderer.invoke("deleteArchive", archiveId),
  checkGoogleDriveAuth: () => ipcRenderer.invoke("checkGoogleDriveAuth"),
  getGoogleDriveAuthUrl: () => ipcRenderer.invoke("getGoogleDriveAuthUrl"),
  saveGoogleDriveToken: (authCode) =>
    ipcRenderer.invoke("saveGoogleDriveToken", authCode),
  openExternalUrl: (url) => ipcRenderer.invoke("openExternalUrl", url),
  downloadArchivesToDownloads: (files) =>
    ipcRenderer.invoke("downloadArchivesToDownloads", files),
  authorizeGoogleDriveInteractive: () =>
    ipcRenderer.invoke("authorizeGoogleDriveInteractive"),
  updateProfile: (profileData) =>
    ipcRenderer.invoke("updateProfile", profileData),
  logout: () => ipcRenderer.invoke("logout"),
  sendOTP: (email) => ipcRenderer.invoke("sendOTP", email),
  verifyOTP: (email, otp) => ipcRenderer.invoke("verifyOTP", email, otp),
  resetPassword: (email, newPassword) =>
    ipcRenderer.invoke("resetPassword", email, newPassword),
});
