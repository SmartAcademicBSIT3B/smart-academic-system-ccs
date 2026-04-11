const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  login: (email, password) => ipcRenderer.invoke("login", email, password),
  getProfile: (userId) => ipcRenderer.invoke("getProfile", userId),
});
