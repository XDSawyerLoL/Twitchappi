'use strict';
const {app,BrowserWindow,shell,dialog}=require('electron');
const http=require('node:http');
const port=Number(process.env.SWAPP_LOCAL_HTTP_PORT||process.env.ORYON_LOCAL_HTTP_PORT||8081);
process.env.SWAPP_LOCAL_HTTP_PORT=String(port);
process.env.SWAPP_LOCAL_RTMP_PORT=String(process.env.SWAPP_LOCAL_RTMP_PORT||process.env.ORYON_LOCAL_RTMP_PORT||1935);
process.env.SWAPP_SITE_URL=process.env.SWAPP_SITE_URL||process.env.ORYON_SITE_URL||'https://swapp.tv';
app.setAppUserModelId('tv.swapp.live');
let started=false,opening=false;
function waitForLocalServer(timeoutMs=30000){
 return new Promise((resolve,reject)=>{
  const deadline=Date.now()+timeoutMs;
  function check(){
   const req=http.get({hostname:'127.0.0.1',port,path:'/health',timeout:1800},res=>{
    res.resume();
    if(res.statusCode===200)return resolve();
    retry();
   });
   req.on('timeout',()=>req.destroy(new Error('health_timeout')));
   req.on('error',retry);
  }
  function retry(){if(Date.now()>=deadline)return reject(new Error('SWAPP Live ne répond pas sur 127.0.0.1:'+port));setTimeout(check,450)}
  check();
 });
}
async function createWindow(){
 if(opening)return;opening=true;
 try{
  if(!started){started=true;require('./server')}
  await waitForLocalServer();
  const win=new BrowserWindow({
   width:1180,height:820,minWidth:900,minHeight:620,title:'SWAPP Live',
   autoHideMenuBar:true,backgroundColor:'#070914',
   webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  win.webContents.setWindowOpenHandler(({url})=>{
   try{const u=new URL(url);if(u.protocol==='https:' && (u.hostname==='swapp.tv'||u.hostname.endsWith('.swapp.tv')))shell.openExternal(url);}catch(_){}
   return{action:'deny'};
  });
  await win.loadURL('http://127.0.0.1:'+port+'/');
 }catch(err){
  dialog.showErrorBox('SWAPP Live — démarrage impossible',String(err?.message||err));
  app.quit();
 }finally{opening=false}
}
app.whenReady().then(createWindow).catch(err=>{dialog.showErrorBox('SWAPP Live',String(err));app.quit()});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
