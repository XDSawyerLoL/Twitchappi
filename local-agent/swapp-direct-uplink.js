'use strict';
// SWAPP Local outbound-only HLS uplink. No inbound ports, tunnel or VPS.
// Files are produced by OBS -> local FFmpeg and sent to the existing swapp.tv.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');

async function createLivePoster(segment,ffmpegPath,{spawnFn=spawn,timeoutMs=6500}={}){
 if(!ffmpegPath)return null;
 return await new Promise((resolve)=>{
  const args=['-hide_banner','-nostdin','-loglevel','info','-threads','2','-i',segment,
   '-map','0:v:0','-frames:v','1','-vf',"scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630",
   '-q:v','7','-f','mjpeg','pipe:1'];
  let proc,done=false,timer,output=[],length=0,info='';
  function finish(result){
   if(done)return;done=true;clearTimeout(timer);
   resolve(result);
  }
  try{proc=spawnFn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']})}
  catch(_){return finish(null)}
  timer=setTimeout(()=>{try{proc.kill()}catch(_){}finish(null)},timeoutMs);
  proc.stdout.on('data',chunk=>{
   length+=chunk.length;
   if(length>600*1024){try{proc.kill()}catch(_){}finish(null)}
   else output.push(chunk);
  });
  proc.stderr.on('data',chunk=>{info=(info+String(chunk)).slice(-12000)});
  proc.on('error',()=>finish(null));
  proc.on('close',code=>{
   if(done)return;
   const hasAudio=/Stream\s+#\d+:\d+[^\n]{0,160}Audio:/i.test(info);
   const videoLine=info.split(/\r?\n/).find(line=>/Stream\s+#\d+:\d+[^\n]{0,160}Video:/i.test(line))||'';
   const dimension=videoLine.match(/\b(\d{3,5})x(\d{3,5})\b/);
   const rate=videoLine.match(/\b(\d+(?:\.\d+)?)\s+fps\b/);
   const codec=videoLine.match(/Video:\s*([a-z0-9_]+)/i);
   const videoInfo=dimension?{
    width:Number(dimension[1]),height:Number(dimension[2]),
    fps:rate?Number(rate[1]):null,codec:codec?.[1]||null
   }:null;
   const poster=code===0&&length>1000&&length<=600*1024?Buffer.concat(output):null;
   if(!poster||poster[0]!==0xff||poster[1]!==0xd8||poster[poster.length-2]!==0xff||poster[poster.length-1]!==0xd9)
    return finish({poster:null,audioTrack:hasAudio?'present':'missing',videoInfo});
   finish({poster,audioTrack:hasAudio?'present':'missing',videoInfo});
  });
 });
}
// Short MP4 teaser for Discord Media Gallery's native Play button.
// Uses completed MPEG-TS HLS segments, remuxes video without re-encoding;
// the full live remains hosted exclusively in the SWAPP HLS player.
async function createDiscordClip(segmentPaths,ffmpegPath,{spawnFn=spawn,timeoutMs=18000}={}){
 if(!ffmpegPath||!Array.isArray(segmentPaths)||segmentPaths.length<4)return null;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-live-clip-'));
 const input=path.join(dir,'preview.ts'),output=path.join(dir,'preview.mp4');
 try{
  let total=0,parts=[];
  for(const file of segmentPaths.slice(-5)){
   const part=fs.readFileSync(file);total+=part.length;
   if(total>18*1024*1024)return null;
   parts.push(part);
  }
  fs.writeFileSync(input,Buffer.concat(parts));
  const args=['-hide_banner','-nostdin','-loglevel','error','-y','-i',input,
   '-t','10','-map','0:v:0','-map','0:a:0?','-c:v','copy','-c:a','aac','-b:a','64k',
   '-movflags','+faststart','-f','mp4',output];
  const success=await new Promise(resolve=>{
   let child,done=false,timer;
   const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok)};
   try{child=spawnFn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','ignore','pipe']})}
   catch(_){return finish(false)}
   timer=setTimeout(()=>{try{child.kill()}catch(_){}finish(false)},timeoutMs);
   child.on('error',()=>finish(false));
   child.on('close',code=>finish(code===0));
  });
  if(!success||!fs.existsSync(output))return null;
  const st=fs.statSync(output);
  if(st.size<5000||st.size>4*1024*1024)return null;
  const data=fs.readFileSync(output);
  return data.toString('ascii',4,8)==='ftyp'?data:null;
 }catch(_){return null}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
}
function startSwappHlsUplink({key,login,siteUrl,token,mediaDir,ffmpegPath='',posterGenerator=createLivePoster,clipGenerator=createDiscordClip,
 maxSegmentBytes=8*1024*1024,fetchFn=fetch,onLog=()=>{},isLive=()=>true}){
 if(!/^[a-z0-9_-]{2,48}$/i.test(String(login||'')))throw Error('Identifiant de chaîne SWAPP manquant');
 if(!token)throw Error('Compte SWAPP non connecté');
 const base=new URL(siteUrl);
 if(base.protocol!=='https:')throw Error('SWAPP HTTPS requis pour un direct sécurisé');
 let running=true,timer=null,activeRequest=null;
 let lastPlaylistSig='',lastManifestSent=0,uploaded=new Map(),error=null,published=false;
 let posterLastAttempt=0,posterBusy=false,audioTrack='unknown',lastPosterAt=0,videoInfo=null;
 let clipLastAttempt=0,clipBusy=false,lastClipAt=0;
 let readyResolve,readyReject,readySettled=false;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
 const readyDeadline=setTimeout(()=>{
  if(!readySettled){readySettled=true;readyReject(new Error('Le site SWAPP ne reçoit pas le flux HLS. '+(error?.message||'Vérifie le déploiement Hostinger et ton débit OBS.')))}
 },50000);
 function settle(){if(!readySettled){readySettled=true;clearTimeout(readyDeadline);readyResolve(true)}}
 function fail(e){error=e;if(running)onLog('warn','Envoi HLS SWAPP en attente',{error:String(e?.message||e).slice(0,220)})}
 function stop(){
  running=false;
  if(timer){clearTimeout(timer);timer=null}
  if(activeRequest)try{activeRequest.abort()}catch(_){}
  clearTimeout(readyDeadline);
  if(!readySettled){readySettled=true;readyReject(new Error('Relais direct arrêté'))}
 }
 async function upload(name,bytes,extras={}){
  if(!running)return;
  const ctl=new AbortController();activeRequest=ctl;
  const deadline=setTimeout(()=>ctl.abort(),22000);
  try{
   const r=await fetchFn(new URL('/api/oryon/local-relay/upload',base),{
    method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream',
     'X-Swapp-Media-Name':name,...extras},
    body:bytes,signal:ctl.signal
   });
   if(!r.ok){
    const j=await r.json().catch(()=>({}));
    throw Error('SWAPP HTTPS '+r.status+': '+(j.error||'envoi du fragment refusé'));
   }
  }finally{clearTimeout(deadline);if(activeRequest===ctl)activeRequest=null}
 }
 async function sendPoster(segmentPath){
  if(posterBusy||!running||!ffmpegPath||!posterGenerator)return;
  if(Date.now()-posterLastAttempt<25000)return;
  posterLastAttempt=Date.now();
  posterBusy=true;
  try{
   const result=await posterGenerator(segmentPath,ffmpegPath);
   if(!running||!result)return;
   if(result.audioTrack==='present'||result.audioTrack==='missing')audioTrack=result.audioTrack;
   if(result.videoInfo&&result.videoInfo.width>0&&result.videoInfo.height>0)videoInfo=result.videoInfo;
   if(result.poster&&result.poster.length<600*1024){
    await upload('poster.jpg',result.poster,{'X-Swapp-Audio-Track':audioTrack});
    lastPosterAt=Date.now();
    onLog('poster','Vignette du direct disponible pour les partages Discord',{bytes:result.poster.length,audioTrack});
   }
  }catch(e){onLog('warn','Aperçu Discord indisponible, diffusion vidéo préservée',{error:String(e.message||e).slice(0,170)})}
  finally{posterBusy=false}
 }
 async function sendClip(names){
  if(clipBusy||!running||!ffmpegPath||!clipGenerator||names.length<4)return;
  if(Date.now()-clipLastAttempt<90000)return; // 10-second teaser at most every 90 seconds
  clipLastAttempt=Date.now();clipBusy=true;
  try{
   const segments=names.slice(-5).map(n=>path.join(mediaDir,n));
   const bytes=await clipGenerator(segments,ffmpegPath);
   if(!running||!bytes||bytes.length>4*1024*1024)return;
   await upload('preview.mp4',bytes);
   lastClipAt=Date.now();
   onLog('preview','Extrait vidéo de 10 secondes disponible dans les liens Discord',{bytes:bytes.length});
  }catch(e){onLog('warn','Extrait vidéo Discord indisponible : live HLS non affecté',{error:String(e.message||e).slice(0,170)})}
  finally{clipBusy=false}
 }
 async function tick(){
  if(!running)return;
  try{
   if(!isLive()){
    if(published){onLog('system','Fin du flux OBS : arrêt du relais direct SWAPP')}
    stop();return;
   }
   const file=path.join(mediaDir,'index.m3u8');
   if(!fs.existsSync(file))return;
   const playlist=fs.readFileSync(file);
   if(playlist.length>65536)throw Error('Playlist OBS trop volumineuse');
   const lines=playlist.toString('utf8').split(/\r?\n/);
   if(!lines[0]?.startsWith('#EXTM3U'))return;
   const names=lines.map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
   if(!names.length||names.length>18||names.some(n=>!/^seg_[0-9]{1,14}\.ts$/.test(n)))return;
   const current=new Map();
   // Upload the segments FIRST. A manifest is published only after every
   // referenced segment has been received and validated by the SWAPP site.
   for(const name of names){
    if(!running)return;
    const filePath=path.join(mediaDir,name);
    if(!fs.existsSync(filePath))return;
    const st=fs.statSync(filePath);
    if(st.size<188)return; // FFmpeg is still writing this HLS file.
    if(st.size>maxSegmentBytes)throw Error('Segment '+name+' trop volumineux : '+(st.size/1048576).toFixed(1)+' Mo (limite '+(maxSegmentBytes/1048576).toFixed(1)+' Mo). Vérifie la conversion 720p automatique.');
    const signature=st.size+':'+st.mtimeMs;
    current.set(name,signature);
    if(uploaded.get(name)!==signature){
     const bytes=fs.readFileSync(filePath);
     if(bytes.length!==st.size) return; // Segment being written; retry.
     await upload(name,bytes);
     uploaded.set(name,signature);
    }
   }
   const manifestSig=playlist.toString('base64');
   if(manifestSig!==lastPlaylistSig||Date.now()-lastManifestSent>8000){
    await upload('index.m3u8',playlist);
    lastManifestSent=Date.now();
    lastPlaylistSig=manifestSig;
    published=true;
    error=null;
    if(!readySettled){
     const r=await fetchFn(new URL('/api/oryon/local-relay/'+encodeURIComponent(login)+'/state',base),{cache:'no-store'});
     const j=await r.json().catch(()=>({}));
     if(r.ok&&j.active&&j.segment_count>0){
      onLog('publish','SWAPP reçoit maintenant la vidéo via HTTPS',{login,segments:j.segment_count});
      settle();
     }
    }
   }
   uploaded=current;
   if(readySettled&&names.length){
    void sendPoster(path.join(mediaDir,names[names.length-1]));
    void sendClip(names);
   }
  }catch(e){fail(e)}
  finally{
   if(running)timer=setTimeout(tick,1100);
  }
 }
 // Avoid Promise unhandled-rejection if caller is about to await ready.
 void tick();
 return {ready,stop,getStatus(){return {running,published,error:error?.message||null,transport:'swapp-direct-hls',audioTrack,videoInfo,lastPosterAt,lastClipAt}}};
}
module.exports={startSwappHlsUplink,createLivePoster,createDiscordClip};
