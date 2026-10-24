'use strict';
// SWAPP Local outbound-only HLS uplink. No inbound ports, tunnel or VPS.
// Files are produced by OBS -> local FFmpeg and sent to the existing swapp.tv.
const fs=require('node:fs');
const path=require('node:path');

function startSwappHlsUplink({key,login,siteUrl,token,mediaDir,maxSegmentBytes=8*1024*1024,fetchFn=fetch,onLog=()=>{},isLive=()=>true}){
 if(!/^[a-z0-9_-]{2,48}$/i.test(String(login||'')))throw Error('Identifiant de chaîne SWAPP manquant');
 if(!token)throw Error('Compte SWAPP non connecté');
 const base=new URL(siteUrl);
 if(base.protocol!=='https:')throw Error('SWAPP HTTPS requis pour un direct sécurisé');
 let running=true,timer=null,activeRequest=null;
 let lastPlaylistSig='',lastManifestSent=0,uploaded=new Map(),error=null,published=false;
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
 async function upload(name,bytes){
  if(!running)return;
  const ctl=new AbortController();activeRequest=ctl;
  const deadline=setTimeout(()=>ctl.abort(),22000);
  try{
   const r=await fetchFn(new URL('/api/oryon/local-relay/upload',base),{
    method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream',
     'X-Swapp-Media-Name':name},
    body:bytes,signal:ctl.signal
   });
   if(!r.ok){
    const j=await r.json().catch(()=>({}));
    throw Error('SWAPP HTTPS '+r.status+': '+(j.error||'envoi du fragment refusé'));
   }
  }finally{clearTimeout(deadline);if(activeRequest===ctl)activeRequest=null}
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
  }catch(e){fail(e)}
  finally{
   if(running)timer=setTimeout(tick,1100);
  }
 }
 // Avoid Promise unhandled-rejection if caller is about to await ready.
 void tick();
 return {ready,stop,getStatus(){return {running,published,error:error?.message||null,transport:'swapp-direct-hls'}}};
}
module.exports={startSwappHlsUplink};
