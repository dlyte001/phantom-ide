"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("phantom", {
  askGhost: (payload) => electron.ipcRenderer.invoke("ghost:ask", payload)
});
