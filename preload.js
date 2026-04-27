const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true
});
