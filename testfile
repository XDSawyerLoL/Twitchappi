const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 10000;
let serverProc = null;

function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeoutMs) return reject(new Error("server_timeout"));
        setTimeout(check, 700);
      });
    };
    check();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#08090c",
    autoHideMenuBar: true,
    title: "StreamerHub",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  serverProc = spawn(process.execPath, [path.join(__dirname, "app.js")], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), ELECTRON_RUN: "1" },
    stdio: "inherit"
  });

  serverProc.on("exit", () => {
    serverProc = null;
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}`);
    createWindow();
  } catch (e) {
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProc) {
    try { serverProc.kill(); } catch (_) {}
  }
});
