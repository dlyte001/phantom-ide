"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("phantom", {
  checkHealth: () => electron.ipcRenderer.invoke("ghost:health"),
  askGhost: (payload) => electron.ipcRenderer.invoke("ghost:ask", payload)
});
