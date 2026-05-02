const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  closeApp: () => ipcRenderer.invoke("closeApp"),
  login: (email, password, departmentCode, secretLogin, preferredRole) =>
    ipcRenderer.invoke(
      "login",
      email,
      password,
      departmentCode,
      secretLogin,
      preferredRole,
    ),
  getProfile: (userId) => ipcRenderer.invoke("getProfile", userId),
  getSections: (departmentCode) =>
    ipcRenderer.invoke("getSections", departmentCode),
  getDepartments: () => ipcRenderer.invoke("getDepartments"),
  getProfessors: () => ipcRenderer.invoke("getProfessors"),
  selectProfileImage: () => ipcRenderer.invoke("selectProfileImage"),
  selectExternalPartnerLogo: () =>
    ipcRenderer.invoke("selectExternalPartnerLogo"),
  uploadProfileImage: (fileInfo) =>
    ipcRenderer.invoke("uploadProfileImage", fileInfo),
  uploadExternalPartnerLogo: (fileInfo) =>
    ipcRenderer.invoke("uploadExternalPartnerLogo", fileInfo),
  fetchAndUploadExternalPartnerLogo: (opts) =>
    ipcRenderer.invoke("fetchAndUploadExternalPartnerLogo", opts),
  createArchive: (archiveData) =>
    ipcRenderer.invoke("createArchive", archiveData),
  updateArchive: (archiveData) =>
    ipcRenderer.invoke("updateArchive", archiveData),
  getArchives: () => ipcRenderer.invoke("getArchives"),
  deleteArchive: (archiveId) => ipcRenderer.invoke("deleteArchive", archiveId),
  getExternalPartners: () => ipcRenderer.invoke("getExternalPartners"),
  createExternalPartner: (partnerData) =>
    ipcRenderer.invoke("createExternalPartner", partnerData),
  updateExternalPartner: (partnerData) =>
    ipcRenderer.invoke("updateExternalPartner", partnerData),
  deleteExternalPartner: (partnerId) =>
    ipcRenderer.invoke("deleteExternalPartner", partnerId),
  getOjtStudents: () => ipcRenderer.invoke("getOjtStudents"),
  createOjtStudent: (studentData) =>
    ipcRenderer.invoke("createOjtStudent", studentData),
  updateOjtStudent: (studentData) =>
    ipcRenderer.invoke("updateOjtStudent", studentData),
  deleteOjtStudent: (studentId) =>
    ipcRenderer.invoke("deleteOjtStudent", studentId),
  getUsers: () => ipcRenderer.invoke("getUsers"),
  createUser: (userData) => ipcRenderer.invoke("createUser", userData),
  updateUser: (userData) => ipcRenderer.invoke("updateUser", userData),
  deleteUser: (userId) => ipcRenderer.invoke("deleteUser", userId),
  getSectionAssignments: () => ipcRenderer.invoke("getSectionAssignments"),
  createSectionAssignment: (payload) =>
    ipcRenderer.invoke("createSectionAssignment", payload),
  updateSectionAssignment: (payload) =>
    ipcRenderer.invoke("updateSectionAssignment", payload),
  deleteSectionAssignment: (id) =>
    ipcRenderer.invoke("deleteSectionAssignment", id),
  createSection: (payload) => ipcRenderer.invoke("createSection", payload),
  updateSection: (payload) => ipcRenderer.invoke("updateSection", payload),
  deleteSection: (id) => ipcRenderer.invoke("deleteSection", id),
  checkGoogleDriveAuth: () => ipcRenderer.invoke("checkGoogleDriveAuth"),
  getGoogleDriveAuthUrl: () => ipcRenderer.invoke("getGoogleDriveAuthUrl"),
  saveGoogleDriveToken: (authCode) =>
    ipcRenderer.invoke("saveGoogleDriveToken", authCode),
  openExternalUrl: (url) => ipcRenderer.invoke("openExternalUrl", url),
  downloadArchivesToDownloads: (files) =>
    ipcRenderer.invoke("downloadArchivesToDownloads", files),
  authorizeGoogleDriveInteractive: () =>
    ipcRenderer.invoke("authorizeGoogleDriveInteractive"),
  clearGoogleDriveAuth: () => ipcRenderer.invoke("clearGoogleDriveAuth"),
  getAppSettings: () => ipcRenderer.invoke("getAppSettings"),
  getBackendDiagnostics: () => ipcRenderer.invoke("getBackendDiagnostics"),
  saveAppSettings: (settingsPatch) =>
    ipcRenderer.invoke("saveAppSettings", settingsPatch),
  selectLocalDocumentsDirectory: () =>
    ipcRenderer.invoke("selectLocalDocumentsDirectory"),
  ensureDepartmentDocumentsDirectory: (departmentCode) =>
    ipcRenderer.invoke("ensureDepartmentDocumentsDirectory", departmentCode),
  updateProfile: (profileData) =>
    ipcRenderer.invoke("updateProfile", profileData),
  logout: () => ipcRenderer.invoke("logout"),
  sendOTP: (email) => ipcRenderer.invoke("sendOTP", email),
  verifyOTP: (email, otp) => ipcRenderer.invoke("verifyOTP", email, otp),
  resetPassword: (email, newPassword) =>
    ipcRenderer.invoke("resetPassword", email, newPassword),
});
