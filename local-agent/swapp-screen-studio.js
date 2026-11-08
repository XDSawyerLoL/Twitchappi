'use strict';
/*
 * SWAPP Live native Windows capture.
 * Keeps the existing OBS -> local RTMP -> HLS -> SWAPP publishing pipeline.
 * A screen source is ingested by FFmpeg, not Chromium getDisplayMedia.
 * Nothing is published until /api/go-live is explicitly called.
 */
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {URL}=require('node:url');

function captureArgs({method,display,fps,bitrate,audioDevice='',micDevice='',encoder='x264',rtmpUrl}){
 const args=['-hide_banner','-nostdin','-loglevel','warning','-y'];
 if(method==='ddagrab'){
  // FFmpeg's Direct3D desktop duplicator exposes native D3D11 frames.
  // NVENC can encode them directly; downloading GPU textures first breaks the fast path.
  const source='ddagrab=output_idx='+display+':framerate='+fps+':output_fmt=8bit';
  args.push('-f','lavfi','-i',encoder==='nvenc'?source:source+',hwdownload,format=bgra');
 }else if(method==='gdigrab'){
  // GDI is slower but survives display mode/texture changes that terminate ddagrab.
  // This captures the entire Windows virtual desktop, not a specific monitor.
  args.push('-f','gdigrab','-framerate',String(fps),'-draw_mouse','1','-i','desktop');
 }else throw new Error('Méthode de capture inconnue');
 const selected=[audioDevice,micDevice].map(x=>String(x||'').trim())
  .filter((x,i,a)=>x&&a.indexOf(x)===i);
 for(const device of selected)args.push('-thread_queue_size','1024','-f','dshow','-i','audio='+device);
 if(!selected.length)args.push('-re','-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
 args.push('-map','0:v:0');
 if(selected.length>1)args.push('-filter_complex',
   '[1:a][2:a]amix=inputs=2:duration=longest:dropout_transition=0,aresample=async=1:first_pts=0[a]',
   '-map','[a]');
 else args.push('-map','1:a:0');
 // NVENC + D3D11 keeps GPU frames; all other cases use CPU scaling/conversion.
 if(!(method==='ddagrab'&&encoder==='nvenc'))
  args.push('-vf',"scale=w='min(1920,iw)':h=-2:flags=fast_bilinear,format=yuv420p");
 if(encoder==='nvenc'){
  args.push('-c:v','h264_nvenc','-preset','p4','-rc','cbr','-bf','0');
 }else if(encoder==='x264'){
  args.push('-c:v','libx264','-preset','veryfast','-tune','zerolatency','-sc_threshold','0');
 }else throw new Error('Encodeur non pris en charge');
 args.push('-r',String(fps),'-b:v',String(bitrate)+'k','-maxrate',String(bitrate+1000)+'k',
  '-bufsize',String(bitrate*2)+'k','-g',String(fps*2),'-keyint_min',String(fps*2),
  '-c:a','aac','-b:a','160k','-ar','48000','-ac','2',
  '-f','flv','-flvflags','no_duration_filesize',rtmpUrl);
 return args;
}

function captureFailure(log){
 const text=String(log||'');
 if(/Output parameters changed|Error during demuxing:\s*Output changed|Error retrieving a packet from demuxer:\s*Output changed/i.test(text))
  return {code:'DISPLAY_MODE_CHANGED',message:'Le mode vidéo Windows a changé pendant la capture DirectX. Basculement vers le bureau complet (GDI).',retryCapture:true};
 if(/Unknown encoder.*h264_nvenc|Cannot load libcuda|No NVENC capable devices|OpenEncodeSessionEx failed|Cannot init CUDA|Error while opening encoder|Driver does not support/i.test(text))
  return {code:'ENCODER_UNAVAILABLE',message:'L’encodeur NVIDIA n’est pas disponible. Passage au logiciel x264.',retryEncoder:true};
 if(/Unknown input format.*gdigrab|No such filter:\s*ddagrab|Error opening input|Cannot find .*device/i.test(text))
  return {code:'CAPTURE_UNAVAILABLE',message:'La source vidéo choisie ne peut pas être ouverte.',retryCapture:true};
 return null;
}

function createScreenCapture({ffmpegPath,rtmpPort,currentConfiguredKey,streamStatus,platform=process.platform,spawnProcess=spawn,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let child=null,method=null,codec=null,startedAt=0,error='',stopping=false,attempt=0,recovery='';
 const safeStatus=()=>{
  const key=currentConfiguredKey();
  const source=streamStatus(key);
  return {key,capturing:!!child&&!stopping,method,encoder:codec,startedAt:startedAt?new Date(startedAt).toISOString():null,
   ready:!!child&&!stopping&&!!source.active&&!!source.hls_exists,error,recovery,
   screen:method==='gdigrab'?'Bureau virtuel complet':'Moniteur sélectionné',
   stream:{active:!!source.active,hls_exists:!!source.hls_exists,ffmpeg_running:!!source.ffmpeg_running}};
 };
 function stop(){
  stopping=true;attempt++;
  const old=child;child=null;method=null;codec=null;startedAt=0;
  if(old && old.exitCode===null){try{old.kill('SIGTERM')}catch(_){}}
  stopping=false;
  return {success:true,...safeStatus()};
 }
 async function trial(kind,encoder,display,fps,bitrate,audioDevice,micDevice,rtmpUrl){
  const id=++attempt;
  const args=captureArgs({method:kind,encoder,display,fps,bitrate,audioDevice,micDevice,rtmpUrl});
  let log='',exited=false,problem=null;
  const proc=spawnProcess(ffmpegPath,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
  child=proc;method=kind;codec=encoder;startedAt=now();
  proc.stderr?.on('data',chunk=>{
   log=(log+String(chunk)).slice(-3500);
   problem=captureFailure(log)||problem;
   // Fast fail for a DXGI display switch or an unsupported NVIDIA encoder.
   if(problem&&proc.exitCode===null){try{proc.kill('SIGTERM')}catch(_){}}
  });
  proc.on('error',e=>{error='FFmpeg : '+e.message;exited=true});
  proc.on('exit',(code,signal)=>{
   exited=true;
   if(child===proc){
    if(!stopping)error='Capture terminée ('+String(code??signal)+') : '+log.slice(-500);
    child=null;
   }
  });
  for(let i=0;i<30;i++){
   if(id!==attempt)throw new Error('Capture interrompue.');
   if(exited||problem||proc.exitCode!==null)break;
   const status=streamStatus(currentConfiguredKey());
   const seen=Date.parse(status.started_at||status.last_seen||'')||0;
   if(status.active&&status.ffmpeg_running&&status.hls_exists&&seen>=startedAt-2500){
    error='';
    return {success:true,method:kind,encoder,recovery,...safeStatus()};
   }
   await sleep(400);
  }
  if(child===proc)child=null;
  try{proc.kill('SIGTERM')}catch(_){}
  const failure=problem||{code:'CAPTURE_TIMEOUT',message:(log||error||'Aucun fragment HLS reçu.').slice(-800)};
  const e=new Error(failure.message);e.code=failure.code;
  throw e;
 }
 async function start(options={}){
  if(platform!=='win32')throw new Error('La capture native SWAPP Live est disponible sur Windows uniquement.');
  if(child)throw new Error('Une source est déjà active. Arrête-la avant de changer la capture.');
  const key=currentConfiguredKey();
  if(streamStatus(key).active)throw new Error('Un flux RTMP est déjà connecté. Arrête-le avant de lancer une capture interne.');
  const display=Math.max(0,Math.min(3,Number.parseInt(options.display,10)||0));
  const fps=[30,60].includes(Number(options.fps))?Number(options.fps):30;
  const bitrate=Math.max(2500,Math.min(10000,Number.parseInt(options.bitrate,10)||6000));
  const audioDevice=String(options.audioDevice||'').trim().slice(0,160);
  const micDevice=String(options.micDevice||'').trim().slice(0,160);
  const rtmpUrl='rtmp://127.0.0.1:'+rtmpPort+'/live/'+encodeURIComponent(key);
  error='';recovery='';
  const requested=String(options.method||'auto');
  if(!['auto','ddagrab','gdigrab'].includes(requested))throw new Error('Méthode de capture non autorisée.');
  const encoderOption=String(options.encoder||'auto');
  if(!['auto','nvenc','x264'].includes(encoderOption))throw new Error('Encodeur non autorisé.');
  const methods=requested==='auto'?['ddagrab','gdigrab']:[requested];
  // DXGI_OUTPUT_CHANGED should not retrigger with x264: it is a capture failure,
  // not an NVENC failure. Try GDI even for explicit DirectX, with honest UI notice.
  if(requested==='ddagrab')methods.push('gdigrab');
  const encoders=encoderOption==='auto'?['nvenc','x264']:[encoderOption];
  const errors=[];
  for(const kind of methods){
   let skipEncoder=false;
   for(const encoder of encoders){
    try{
     const result=await trial(kind,encoder,display,fps,bitrate,audioDevice,micDevice,rtmpUrl);
     return {...result,recovery};
    }catch(e){
     if(/interrompue/i.test(String(e.message)))throw e;
     errors.push(kind+'/'+encoder+' ['+(e.code||'FFMPEG')+']: '+e.message);
     // RTMP may remain marked active until NodeMediaServer emits donePublish.
     // Never start the next source against the same key before its teardown.
     for(let wait=0;wait<16&&streamStatus(key).active;wait++)await sleep(200);
     if(e.code==='DISPLAY_MODE_CHANGED'||e.code==='CAPTURE_UNAVAILABLE'){
      recovery='DirectX interrompu par un changement de mode d’affichage. Capture basculée automatiquement sur le bureau complet (GDI).';
      skipEncoder=true;break;
     }
     if(e.code==='ENCODER_UNAVAILABLE')recovery='NVIDIA NVENC indisponible : capture avec x264.';
     await sleep(150);
    }
   }
   if(skipEncoder)continue;
  }
  error=errors.join('\n').slice(-1500);
  stop();
  throw new Error('Aucune capture exploitable. '+error);
 }
 process.once('exit',()=>{try{child?.kill('SIGTERM')}catch(_){}});
 return {start,stop,status:safeStatus};
}

function localOriginOnly(req,res,next){
 const header=String(req.get('Origin')||'');
 let valid=false;
 try{
  const u=new URL(header);
  valid=u.protocol==='http:'&&(u.hostname==='127.0.0.1'||u.hostname==='localhost')
   &&u.host===req.get('Host');
 }catch(_){}
 if(!valid)return res.status(403).json({success:false,error:'Action réservée à la fenêtre SWAPP Live locale.'});
 next();
}

function mountScreenStudio(app,{express,ffmpegPath,rtmpPort,currentConfiguredKey,streamStatus}){
 const ffmpeg=createScreenCapture({ffmpegPath,rtmpPort,currentConfiguredKey,streamStatus});
 const {createLibobsCapture,createHybridCapture}=require('./swapp-libobs-bridge');
 const native=createLibobsCapture({rtmpPort,currentConfiguredKey,streamStatus});
 const capture=createHybridCapture({ffmpeg,native});
 const audioDevicePattern=/^\[[^\]]*dshow[^\]]*\]\s+"([^"]+)"/i;
 app.get('/studio',(_req,res)=>res.sendFile(path.join(__dirname,'studio.html')));
 app.get('/studio.css',(_req,res)=>res.type('text/css').sendFile(path.join(__dirname,'studio.css')));
 app.get('/studio.js',(_req,res)=>res.type('application/javascript').sendFile(path.join(__dirname,'studio.js')));
 app.get('/api/screen/status',(_req,res)=>res.json({success:true,...capture.status()}));
 app.get('/api/screen/audio-devices',async(_req,res)=>{
  if(process.platform!=='win32')return res.json({success:true,devices:[]});
  const proc=spawn(ffmpegPath,['-hide_banner','-list_devices','true','-f','dshow','-i','dummy'],
   {windowsHide:true,stdio:['ignore','ignore','pipe']});
  let output='';
  proc.stderr.on('data',d=>{output=(output+String(d)).slice(-15000)});
  const timeout=setTimeout(()=>{try{proc.kill()}catch(_){}},4500);
  let responded=false;
  proc.once('close',()=>{
   if(responded)return;responded=true;
   clearTimeout(timeout);
   let audio=false;
   const devices=[];
   for(const line of output.split(/\r?\n/)){
    if(/DirectShow audio devices/i.test(line)){audio=true;continue}
    if(/DirectShow video devices/i.test(line)){audio=false;continue}
    if(audio){
     const match=line.match(audioDevicePattern);
     if(match&&!devices.includes(match[1]))devices.push(match[1]);
    }
   }
   res.json({success:true,devices});
  });
  proc.once('error',()=>{if(responded)return;responded=true;clearTimeout(timeout);res.json({success:true,devices:[]})});
 });
 app.post('/api/screen/start',express.json({limit:'4kb'}),localOriginOnly,async(req,res)=>{
  try{
   const result=await capture.start(req.body||{});
   res.json(result);
  }catch(e){res.status(400).json({success:false,error:String(e.message||e),...capture.status()})}
 });
 app.post('/api/screen/stop',localOriginOnly,(_req,res)=>res.json(capture.stop()));
 return capture;
}
module.exports={captureArgs,captureFailure,createScreenCapture,mountScreenStudio,localOriginOnly};
