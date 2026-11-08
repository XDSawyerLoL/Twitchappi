'use strict';
/*
 * Native libobs process bridge for SWAPP Live.
 * Never downloads or silently executes OBS binaries.
 * Only a packaged/local developer-built host is accepted.
 * Fallback to the existing FFmpeg Windows capture if unavailable or unhealthy.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

const REQUIRED_MODULES=['win-capture','win-wasapi','obs-outputs','obs-x264','obs-ffmpeg','rtmp-services'];
function completeLibobsRuntime(executable,exists=fs.existsSync){
 if(!executable||!exists(executable))return false;
 const root=path.dirname(executable);
 if(!exists(path.join(root,'obs.dll'))||!exists(path.join(root,'libobs-d3d11.dll')))return false;
 return REQUIRED_MODULES.every(name=>
  exists(path.join(root,'core',name,name+'.dll'))||
  exists(path.join(root,'obs-plugins','64bit',name+'.dll')));
}
function nativeHostPath({root=__dirname,resourcesPath=process.resourcesPath,exists=fs.existsSync}={}){
 const candidates=[
  resourcesPath&&path.join(resourcesPath,'swapp-libobs','swapp-libobs-host.exe'),
  path.join(root,'libobs-runtime','swapp-libobs-host.exe')
 ].filter(Boolean);
 // Incomplete staging must never make Game Capture appear ready.
 return candidates.find(candidate=>completeLibobsRuntime(candidate,exists))||null;
}

function createLibobsCapture({
 currentConfiguredKey,streamStatus,rtmpPort,
 platform=process.platform,
 executable=nativeHostPath(),
 spawnProcess=spawn,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))
}){
 let child=null,error='',startedAt=0,starting=false,exitSeen=false,activeKey=null;
 const available=()=>platform==='win32'&&!!executable;
 const status=()=>{
  const key=activeKey||currentConfiguredKey();
  const stream=streamStatus(key);
  return {engine:'libobs',method:'libobs',key,capturing:!!child&&!exitSeen,
   ready:!!child&&!exitSeen&&!!stream.active&&!!stream.hls_exists,
   startedAt:startedAt?new Date(startedAt).toISOString():null,
   error,available:available(),encoder:'libobs',
   stream:{active:!!stream.active,ffmpeg_running:!!stream.ffmpeg_running,hls_exists:!!stream.hls_exists}};
 };
 function stop(){
  starting=false;
  const old=child;child=null;exitSeen=true;activeKey=null;startedAt=0;
  if(old&&old.exitCode===null){
   try{old.stdin?.write('stop\n')}catch(_){}
   // Force disposal if the graceful libobs shutdown hangs; do not leave a live process.
   const deadline=setTimeout(()=>{try{if(old.exitCode===null)old.kill('SIGTERM')}catch(_){}},3500);
   deadline.unref?.();
   old.once?.('exit',()=>clearTimeout(deadline));
  }
  return {success:true,...status()};
 }
 async function start(options={}){
  if(platform!=='win32')throw new Error('Le moteur libobs est disponible uniquement sur Windows.');
  if(!executable)throw new Error('Moteur libobs non installé : compile le composant natif SWAPP.');
  if(child||starting)throw new Error('Un moteur libobs est déjà actif.');
  const key=currentConfiguredKey();
  if(streamStatus(key).active)throw new Error('Le port de diffusion reçoit déjà un flux (OBS ou FFmpeg). Arrête-le.');
  const source=String(options.source||'game');
  if(!['game','display'].includes(source))throw new Error('Source libobs non reconnue.');
  const fps=[30,60].includes(Number(options.fps))?Number(options.fps):30;
  const display=Math.min(3,Math.max(0,parseInt(options.display,10)||0));
  const bitrate=Math.min(10000,Math.max(2500,parseInt(options.bitrate,10)||6000));
  const encoder=String(options.encoder||'auto');
  if(!['auto','nvenc','x264'].includes(encoder))throw new Error('Encodeur libobs non reconnu.');
  const args=['--rtmp','rtmp://127.0.0.1:'+rtmpPort+'/live','--key',key,
   '--source',source,'--display',String(display),
   '--fps',String(fps),'--bitrate',String(bitrate),'--encoder',encoder];
  let output='';
  starting=true;exitSeen=false;activeKey=key;startedAt=now();error='';
  try{
   const proc=spawnProcess(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:path.dirname(executable)});
   child=proc;
   proc.stdout?.on('data',chunk=>{output=(output+String(chunk)).slice(-2500)});
   proc.stderr?.on('data',chunk=>{output=(output+String(chunk)).slice(-2500)});
   proc.on('error',e=>{error='Moteur libobs : '+e.message;exitSeen=true});
   proc.on('exit',(code,signal)=>{
    exitSeen=true;
    if(child===proc){
     error='Moteur libobs arrêté ('+String(code??signal)+') : '+output.slice(-600);
     child=null;
    }
   });
   for(let attempt=0;attempt<50;attempt++){
    if(child!==proc||exitSeen)break
    const s=streamStatus(key),seen=Date.parse(s.started_at||s.last_seen||'')||0;
    if(s.active&&s.ffmpeg_running&&s.hls_exists&&seen>=startedAt-2500){
     starting=false;
     error='';
     return {success:true,...status()};
    }
    await sleep(400);
   }
   throw new Error(error||'Le moteur OBS n’a produit aucun fragment HLS exploitable. '+output.slice(-600));
  }catch(e){
   error=String(e.message||e);
   stop();
   throw new Error(error);
  }finally{starting=false}
 }
 return {start,stop,status,available};
}

function createHybridCapture({ffmpeg,native}){
 let current=null;
 const status=()=>{
  const s=current==='libobs'?native.status():ffmpeg.status();
  // Both native and FFmpeg can exit after a DXGI device/display-mode switch.
  // Release the engine lock so Preview can be clicked again without restarting SWAPP.
  if(current&&!s.capturing)current=null;
  return {...s,engine:current||s.engine||'ffmpeg',libobsAvailable:native.available()};
 };
 async function start(options={}){
  if(current)throw new Error('Une capture est déjà en cours.');
  const requested=String(options.method||'auto');
  if(!['auto','libobs','ddagrab','gdigrab','window'].includes(requested))throw new Error('Méthode de capture non autorisée.');
  if(requested==='libobs'&&!native.available())throw new Error('Le composant libobs n’est pas installé.');
  if(requested==='libobs'||requested==='auto'&&native.available()){
   try{
    const result=await native.start(options);
    current='libobs';
    return {...result,engine:'libobs',libobsAvailable:true};
   }catch(e){
    if(requested==='libobs')throw e;
    // Only auto mode can fallback to FFmpeg. Explicit libobs never silently switches.
   }
  }
  if(requested==='libobs')throw new Error('Le composant libobs n’est pas installé.');
  const ffmpegMethod=requested==='auto'?'auto':requested;
  const result=await ffmpeg.start({...options,method:ffmpegMethod});
  current='ffmpeg';
  return {...result,engine:'ffmpeg',libobsAvailable:native.available()};
 }
 function stop(){
  const result=current==='libobs'?native.stop():ffmpeg.stop();
  current=null;
  return {...result,engine:null,libobsAvailable:native.available()};
 }
 return {start,stop,status,available:native.available};
}

module.exports={nativeHostPath,completeLibobsRuntime,createLibobsCapture,createHybridCapture};
