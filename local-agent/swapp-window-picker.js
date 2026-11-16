'use strict';
/* Win32 window picker, no shell commands constructed from titles or HWNDs.
 * ffmpeg-static 5.2 includes FFmpeg 6.1.x, whose gdigrab supports title=,
 * but not FFmpeg 7.0's hwnd= option. We validate the exact selected HWND
 * and refuse ambiguous titles rather than accidentally showing another app.
 */
const {execFile}=require('node:child_process');
const path=require('node:path');

const HWND_RE=/^[1-9][0-9]{0,18}$/;

function parseWindows(output){
 let data;
 try{data=JSON.parse(String(output||'[]').trim()||'[]')}
 catch(e){throw new Error('La liste des fenêtres Windows est illisible : '+e.message)}
 if(!Array.isArray(data))data=data?[data]:[];
 const rows=[];
 const handles=new Set();
 for(const item of data){
  const hwnd=String(item?.hwnd??'').trim();
  const title=String(item?.title??'').trim().replace(/[\r\n\t]+/g,' ').slice(0,250);
  const pid=Number(item?.pid);
  if(!HWND_RE.test(hwnd)||!title||handles.has(hwnd)||!Number.isSafeInteger(Number(hwnd)))continue;
  handles.add(hwnd);
  rows.push({hwnd,title,pid:Number.isSafeInteger(pid)&&pid>=0?pid:null,minimized:!!item.minimized});
 }
 const count=new Map;
 for(const row of rows)count.set(row.title,(count.get(row.title)||0)+1);
 for(const row of rows)row.ambiguous=count.get(row.title)>1;
 return rows.sort((a,b)=>a.title.localeCompare(b.title,'fr',{sensitivity:'base'})).slice(0,200);
}

function listCapturableWindows({
 platform=process.platform,run=execFile,
 script=path.join(__dirname,'list-capture-windows.ps1')
}={}){
 if(platform!=='win32')return Promise.resolve([]);
 return new Promise((resolve,reject)=>{
  run('powershell.exe',[
   '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script
  ],{windowsHide:true,timeout:7500,maxBuffer:1024*1024,encoding:'utf8'},(err,stdout,stderr)=>{
   if(err)return reject(new Error('Impossible de lister les fenêtres Windows : '+String(stderr||err.message).slice(-300)));
   try{resolve(parseWindows(stdout))}catch(e){reject(e)}
  });
 });
}

async function resolveSelectedWindow(hwnd,{listWindows=listCapturableWindows}={}){
 const value=String(hwnd??'').trim();
 if(!HWND_RE.test(value)||!Number.isSafeInteger(Number(value)))
  throw new Error('Sélectionne une fenêtre dans la liste Windows.');
 const windows=await listWindows();
 const row=windows.find(x=>x.hwnd===value);
 if(!row)throw new Error('Cette fenêtre a été fermée ou a changé. Actualise la liste puis sélectionne-la de nouveau.');
 if(row.minimized)throw new Error('La fenêtre est réduite. Restaure-la pour capturer son image.');
 if(row.ambiguous)throw new Error('Plusieurs fenêtres portent le même titre. Cette version de FFmpeg ne permet pas de les distinguer sans risque : renomme ou ferme l’une d’elles.');
 return row;
}

module.exports={HWND_RE,parseWindows,listCapturableWindows,resolveSelectedWindow};
