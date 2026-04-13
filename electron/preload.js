const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  login: (email, password) => ipcRenderer.invoke("login", email, password),
  getProfile: (userId) => ipcRenderer.invoke("getProfile", userId),
  selectProfileImage: () => ipcRenderer.invoke("selectProfileImage"),
  updateProfile: (profileData) =>
    ipcRenderer.invoke("updateProfile", profileData),
  logout: () => ipcRenderer.invoke("logout"),
  sendOTP: (email) => ipcRenderer.invoke("sendOTP", email),
  verifyOTP: (email, otp) => ipcRenderer.invoke("verifyOTP", email, otp),
  resetPassword: (email, newPassword) =>
    ipcRenderer.invoke("resetPassword", email, newPassword),
});
