const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  login: (email, password) => ipcRenderer.invoke("login", email, password),
  getProfile: (userId) => ipcRenderer.invoke("getProfile", userId),
  selectProfileImage: () => ipcRenderer.invoke("selectProfileImage"),
  updateProfile: (profileData) =>
    ipcRenderer.invoke("updateProfile", profileData),
});
