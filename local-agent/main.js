const { app, BrowserWindow, shell } = require('electron');

process.env.ORYON_LOCAL_HTTP_PORT = process.env.ORYON_LOCAL_HTTP_PORT || process.env.SWAPP_LOCAL_HTTP_PORT || '8081';
process.env.ORYON_LOCAL_RTMP_PORT = process.env.ORYON_LOCAL_RTMP_PORT || process.env.SWAPP_LOCAL_RTMP_PORT || '1935';
process.env.ORYON_SITE_URL = process.env.ORYON_SITE_URL || process.env.SWAPP_SITE_URL || 'https://swapp.tv';

require('./server');

function createWindow(){
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Swapp Local',
    backgroundColor: '#070914',
    webPreferences: { contextIsolation: true }
  });
  setTimeout(() => win.loadURL(`http://localhost:${process.env.ORYON_LOCAL_HTTP_PORT}`), 900);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if(process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if(BrowserWindow.getAllWindows().length === 0) createWindow(); });
