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
  selectPdfReportHeaderImage: async () => {
    try {
      return await ipcRenderer.invoke("selectPdfReportHeaderImage");
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message:
            "Header image picker is unavailable in this app session. Please restart the app.",
        };
      }
      throw error;
    }
  },
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
  getArchiveOjtLinks: (archiveId) =>
    ipcRenderer.invoke("getArchiveOjtLinks", archiveId),
  createArchiveOjtLink: (payload) =>
    ipcRenderer.invoke("createArchiveOjtLink", payload),
  deleteArchiveOjtLink: (archiveId, studentId) =>
    ipcRenderer.invoke("deleteArchiveOjtLink", archiveId, studentId),
  deleteArchive: (archiveId) => ipcRenderer.invoke("deleteArchive", archiveId),
  getExternalPartners: () => ipcRenderer.invoke("getExternalPartners"),
  createExternalPartner: (partnerData) =>
    ipcRenderer.invoke("createExternalPartner", partnerData),
  updateExternalPartner: (partnerData) =>
    ipcRenderer.invoke("updateExternalPartner", partnerData),
  deleteExternalPartner: (partnerId) =>
    ipcRenderer.invoke("deleteExternalPartner", partnerId),
  getOjtStudents: () => ipcRenderer.invoke("getOjtStudents"),
  getAdminDashboardSummary: () =>
    ipcRenderer.invoke("getAdminDashboardSummary"),
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
  fetchViewerFile: (url) => ipcRenderer.invoke("fetchViewerFile", url),
  downloadArchivesToDownloads: (files) =>
    ipcRenderer.invoke("downloadArchivesToDownloads", files),
  authorizeGoogleDriveInteractive: () =>
    ipcRenderer.invoke("authorizeGoogleDriveInteractive"),
  clearGoogleDriveAuth: () => ipcRenderer.invoke("clearGoogleDriveAuth"),
  getAppSettings: () => ipcRenderer.invoke("getAppSettings"),
  getApiBaseUrl: () => ipcRenderer.invoke("getApiBaseUrl"),
  getConfigurationSetupStatus: () =>
    ipcRenderer.invoke("getConfigurationSetupStatus"),
  getBackendDiagnostics: () => ipcRenderer.invoke("getBackendDiagnostics"),
  saveAppSettings: (settingsPatch) =>
    ipcRenderer.invoke("saveAppSettings", settingsPatch),
  checkSetupDepartmentAdminExists: (departmentCode) =>
    ipcRenderer.invoke("checkSetupDepartmentAdminExists", departmentCode),
  getSetupNextAdminUserId: (departmentCode) =>
    ipcRenderer.invoke("getSetupNextAdminUserId", departmentCode),
  sendSetupAdminOtp: (payload) =>
    ipcRenderer.invoke("sendSetupAdminOtp", payload),
  verifySetupAdminOtpAndCreate: (payload) =>
    ipcRenderer.invoke("verifySetupAdminOtpAndCreate", payload),
  markConfigurationSetupCompleted: (payload) =>
    ipcRenderer.invoke("markConfigurationSetupCompleted", payload),
  selectLocalDocumentsDirectory: () =>
    ipcRenderer.invoke("selectLocalDocumentsDirectory"),
  ensureDepartmentDocumentsDirectory: (departmentCode) =>
    ipcRenderer.invoke("ensureDepartmentDocumentsDirectory", departmentCode),
  updateProfile: (profileData) =>
    ipcRenderer.invoke("updateProfile", profileData),
  deleteMyProfile: (payload) => ipcRenderer.invoke("deleteMyProfile", payload),
  logout: () => ipcRenderer.invoke("logout"),
  sendOTP: (email) => ipcRenderer.invoke("sendOTP", email),
  verifyOTP: (email, otp) => ipcRenderer.invoke("verifyOTP", email, otp),
  resetPassword: (email, newPassword) =>
    ipcRenderer.invoke("resetPassword", email, newPassword),

  // ── OJT Coordinator ────────────────────────────────────────────────────────
  getCoordinatorSections: () => ipcRenderer.invoke("getCoordinatorSections"),
  getCoordinatorSectionStudents: (section) =>
    ipcRenderer.invoke("getCoordinatorSectionStudents", section),
  getCoordinatorStudentProfile: (studentId) =>
    ipcRenderer.invoke("getCoordinatorStudentProfile", studentId),
  getCoordinatorNotifications: async (params) => {
    try {
      return await ipcRenderer.invoke("getCoordinatorNotifications", params);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          notifications: [],
          message:
            "Coordinator notifications are unavailable in this app session.",
        };
      }
      throw error;
    }
  },
  updateStudentPartner: (payload) =>
    ipcRenderer.invoke("updateStudentPartner", payload),
  updateStudentOjtStatus: (payload) =>
    ipcRenderer.invoke("updateStudentOjtStatus", payload),
  getStudentStatusHistory: (studentId) =>
    ipcRenderer.invoke("getStudentStatusHistory", studentId),
  getCoordinatorCapstoneApproval: async (studentId) => {
    try {
      return await ipcRenderer.invoke(
        "getCoordinatorCapstoneApproval",
        studentId,
      );
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          isApproved: false,
          message: "Capstone approval check is unavailable.",
        };
      }
      throw error;
    }
  },

  // ── OJT Requirements ───────────────────────────────────────────────────────
  getOjtRequirementTemplates: (params) =>
    ipcRenderer.invoke("getOjtRequirementTemplates", params),
  createOjtRequirementTemplate: (payload) =>
    ipcRenderer.invoke("createOjtRequirementTemplate", payload),
  updateOjtRequirementTemplate: (payload) =>
    ipcRenderer.invoke("updateOjtRequirementTemplate", payload),
  deleteOjtRequirementTemplate: (id) =>
    ipcRenderer.invoke("deleteOjtRequirementTemplate", id),
  getStudentRequirements: (params) =>
    ipcRenderer.invoke("getStudentRequirements", params),
  createOjtRequirementSubmission: (payload) =>
    ipcRenderer.invoke("createOjtRequirementSubmission", payload),
  updateOjtRequirementSubmission: (payload) =>
    ipcRenderer.invoke("updateOjtRequirementSubmission", payload),
  deleteOjtRequirementSubmission: (id) =>
    ipcRenderer.invoke("deleteOjtRequirementSubmission", id),
  deleteCloudinaryFile: (publicId) =>
    ipcRenderer.invoke("deleteCloudinaryFile", publicId),
  selectOjtFile: () => ipcRenderer.invoke("selectOjtFile"),
  uploadOjtFile: (payload) => ipcRenderer.invoke("uploadOjtFile", payload),
  uploadOjtFileFromUrl: (payload) =>
    ipcRenderer.invoke("uploadOjtFileFromUrl", payload),

  // ── OJT Attendance ─────────────────────────────────────────────────────────
  getOjtAttendance: (params) => ipcRenderer.invoke("getOjtAttendance", params),
  createOjtAttendance: (payload) =>
    ipcRenderer.invoke("createOjtAttendance", payload),
  updateOjtAttendance: (payload) =>
    ipcRenderer.invoke("updateOjtAttendance", payload),
  deleteOjtAttendance: (id) => ipcRenderer.invoke("deleteOjtAttendance", id),

  // ── OJT Student Schedules ────────────────────────────────────────────────
  getOjtStudentSchedules: async (studentId) => {
    try {
      return await ipcRenderer.invoke("getOjtStudentSchedules", studentId);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          schedules: [],
          message:
            "Schedule handlers are unavailable in this app session. Please restart the app.",
        };
      }
      throw error;
    }
  },
  createOjtStudentSchedule: async (payload) => {
    try {
      return await ipcRenderer.invoke("createOjtStudentSchedule", payload);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message:
            "Schedule handlers are unavailable in this app session. Please restart the app.",
        };
      }
      throw error;
    }
  },
  updateOjtStudentSchedule: async (payload) => {
    try {
      return await ipcRenderer.invoke("updateOjtStudentSchedule", payload);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message:
            "Schedule handlers are unavailable in this app session. Please restart the app.",
        };
      }
      throw error;
    }
  },
  deleteOjtStudentSchedule: async (id) => {
    try {
      return await ipcRenderer.invoke("deleteOjtStudentSchedule", id);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message:
            "Schedule handlers are unavailable in this app session. Please restart the app.",
        };
      }
      throw error;
    }
  },

  // ── OJT Weekly Reports ─────────────────────────────────────────────────────
  getOjtWeeklyReports: (studentId) =>
    ipcRenderer.invoke("getOjtWeeklyReports", studentId),
  createOjtWeeklyReport: (payload) =>
    ipcRenderer.invoke("createOjtWeeklyReport", payload),
  updateOjtWeeklyReport: (payload) =>
    ipcRenderer.invoke("updateOjtWeeklyReport", payload),
  deleteOjtWeeklyReport: (id) =>
    ipcRenderer.invoke("deleteOjtWeeklyReport", id),

  // ── OJT Certificates ───────────────────────────────────────────────────────
  selectCertificateFile: async () => {
    try {
      return await ipcRenderer.invoke("selectCertificateFile");
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          canceled: true,
          message: "Certificate file picker is unavailable.",
        };
      }
      throw error;
    }
  },
  uploadOjtCertificateFile: async (payload) => {
    try {
      return await ipcRenderer.invoke("uploadOjtCertificateFile", payload);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message: "Certificate upload is unavailable.",
        };
      }
      throw error;
    }
  },
  getOjtCertificates: async (studentId) => {
    try {
      return await ipcRenderer.invoke("getOjtCertificates", studentId);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: true,
          certificates: [],
          message: "Certificate history is unavailable in this app session.",
        };
      }
      throw error;
    }
  },
  createOjtCertificate: async (payload) => {
    try {
      return await ipcRenderer.invoke("createOjtCertificate", payload);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message: "Certificate creation is unavailable.",
        };
      }
      throw error;
    }
  },
  deleteOjtCertificate: async (id) => {
    try {
      return await ipcRenderer.invoke("deleteOjtCertificate", id);
    } catch (error) {
      if (String(error?.message || "").includes("No handler registered")) {
        return {
          success: false,
          message: "Certificate deletion is unavailable.",
        };
      }
      throw error;
    }
  },
});
