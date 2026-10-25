'use strict';
// SWAPP self-hosted OBS relay. The streamer PUSHES HLS over HTTPS to the
// existing SWAPP Node backend: no publicly reachable PC, TURN, tunnel or VPS.
// This is a bounded single-process relay, NOT a scalable CDN/SFU.
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const {inspectTsMedia}=require('./swapp-ts-inspect');

function attachSwappDirectRelay(app, opts={}){
 const lookupOwner=opts.lookupOwner;
 if(typeof lookupOwner!=='function')throw Error('Direct HLS relay owner resolver required');
 const rooms=new Map();
 const MAX_ROOMS=Math.max(1,Math.min(2,Number(process.env.SWAPP_DIRECT_RELAY_MAX_ROOMS||2)));
 const MAX_ROOM_BYTES=Math.min(64*1024*1024,Math.max(12*1024*1024,Number(process.env.SWAPP_DIRECT_RELAY_ROOM_BYTES||48*1024*1024)));
 const MAX_POSTER_BYTES=600*1024;
 const MAX_CLIP_BYTES=4*1024*1024; // eight-to-ten-second 480p MP4, not a VOD library
 const MAX_DVR_SEGMENTS=40; // at most ~80s when OBS keyframes are set to 2 seconds
 const MAX_DVR_SECONDS=80;
 const MAX_UPLOAD_BYTES=Math.min(10*1024*1024,Math.max(512*1024,Number(process.env.SWAPP_DIRECT_RELAY_UPLOAD_BYTES||8*1024*1024)));
 const MAX_MINUTE_BYTES=Math.max(10*1024*1024,Math.min(160*1024*1024,Number(process.env.SWAPP_DIRECT_RELAY_MINUTE_BYTES||120*1024*1024)));
 const TTL_MS=55000;
 const VIDEO_STALE_MS=30000; // No new TS segment for 30s = no fresh live video.
 const hasFreshVideo=room=>Boolean(room?.manifest && room?.lastSegmentAt &&
  Date.now()-room.lastSegmentAt<VIDEO_STALE_MS && room.playlistNames.some(name=>room.segments.has(name)));
 const maxPlaylistBytes=65536;
 const notCached=res=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Access-Control-Allow-Origin','*');
 };
 const cleanLogin=v=>/^[a-z0-9_-]{2,48}$/i.test(String(v||''))?String(v).toLowerCase():'';
 const cleanName=v=>/^(?:seg_[0-9]{1,14}\.ts|index\.m3u8|poster\.jpg|preview\.mp4)$/.test(String(v||''))?String(v):'';
 function liveRoom(login){
  const room=rooms.get(login);
  if(!room)return null;
  if(Date.now()-room.lastManifestAt>TTL_MS){rooms.delete(login);return null}
  return room;
 }
 function reclaim(){
  const now=Date.now();
  for(const [login,r] of rooms){
   if(now-r.lastManifestAt>TTL_MS){rooms.delete(login);continue}
   for(const [id,seen] of (r.viewers||new Map()))if(now-seen>45000)r.viewers.delete(id);
  }
 }
 const interval=setInterval(reclaim,12000);
 interval.unref?.();
 function sequence(name){return Number((String(name).match(/^seg_(\d+)\.ts$/)||[])[1])}
 function historySeconds(room){
  return room.segmentTimeline.reduce((sum,n)=>sum+(room.segmentDurations.get(n)||2),0);
 }
 function pruneHistory(room){
  const pinned=new Set(room.playlistNames);
  // Preserve the live window while trimming only older DVR segments.
  while(room.segmentTimeline.length>MAX_DVR_SEGMENTS||room.bytes>MAX_ROOM_BYTES||historySeconds(room)>MAX_DVR_SECONDS){
   const index=room.segmentTimeline.findIndex(n=>!pinned.has(n));
   if(index<0)break;
   const [gone]=room.segmentTimeline.splice(index,1);
   const bytes=room.segments.get(gone);
   if(bytes){room.bytes-=bytes.length;room.segments.delete(gone)}
   room.segmentDurations.delete(gone);
  }
 }
 function dvrManifest(room){
  // The last contiguous suffix avoids advertising gaps after budget eviction
  // or a broadcaster restarting FFmpeg and resetting segment numbers.
  const numbers=room.segmentTimeline.filter(n=>room.segments.has(n))
   .sort((a,b)=>sequence(a)-sequence(b));
  const contiguous=[];
  for(let i=numbers.length-1;i>=0;i--){
   const candidate=numbers[i];
   if(contiguous.length&&sequence(contiguous[0])!==sequence(candidate)+1)break;
   contiguous.unshift(candidate);
  }
  if(!contiguous.length)return '';
  const maxDuration=Math.ceil(Math.max(2,...contiguous.map(n=>room.segmentDurations.get(n)||2)));
  return '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:'+maxDuration+'\n#EXT-X-INDEPENDENT-SEGMENTS\n'+
   '#EXT-X-MEDIA-SEQUENCE:'+sequence(contiguous[0])+'\n'+
   contiguous.map(n=>'#EXTINF:'+(room.segmentDurations.get(n)||2).toFixed(3)+',\n'+n+'\n').join('');
 }
 function validatePlaylist(body){
  if(!Buffer.isBuffer(body)||body.length<15||body.length>maxPlaylistBytes)return [];
  const s=body.toString('utf8');
  if(!s.startsWith('#EXTM3U')||!s.includes('#EXTINF'))return [];
  const lines=s.split(/\r?\n/);
  const names=lines.map(v=>v.trim()).filter(v=>v&&!v.startsWith('#'));
  if(!names.length||names.length>18||names.some(v=>!/^seg_[0-9]{1,14}\.ts$/.test(v)))return [];
  return names;
 }
 app.get('/api/oryon/local-relay/capabilities',(_req,res)=>{
  notCached(res);
  res.json({success:true,transport:'swapp-direct-hls',version:3,max_rooms:MAX_ROOMS,max_room_bytes:MAX_ROOM_BYTES,max_segment_bytes:MAX_UPLOAD_BYTES,max_minute_bytes:MAX_MINUTE_BYTES,native_passthrough:true,
   recommended_video_kbps:8000,recommended_audio_kbps:160,warning:'Qualité OBS source H.264/AAC préservée ; flux unique sans qualité adaptative. Hébergement limité en bande passante : petites audiences uniquement.'});
 });
 app.post('/api/oryon/local-relay/upload',
  express.raw({type:'application/octet-stream',limit:MAX_UPLOAD_BYTES}),async(req,res)=>{
   notCached(res);
   const auth=String(req.get('authorization')||'');
   const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
   if(!token)return res.status(401).json({success:false,error:'Connexion SWAPP nécessaire.'});
   let user;
   try{user=await lookupOwner(token)}catch(_){return res.status(503).json({success:false,error:'Authentification SWAPP temporairement indisponible.'})}
   const login=cleanLogin(user?.login);
   if(!login)return res.status(403).json({success:false,error:'Compte SWAPP non autorisé.'});
   const name=cleanName(req.get('x-swapp-media-name'));
   const body=req.body;
   if(!name||!Buffer.isBuffer(body)||!body.length)
    return res.status(400).json({success:false,error:'Fragment HLS invalide.'});
   if(body.length>MAX_UPLOAD_BYTES)
    return res.status(413).json({success:false,error:'Segment HLS dépassant '+Math.round(MAX_UPLOAD_BYTES/1048576)+' Mo : vérifie la conversion 720p automatique dans SWAPP Local.'});
   const now=Date.now();
   reclaim();
   let room=rooms.get(login);
   if(!room){
    if(rooms.size>=MAX_ROOMS)return res.status(429).json({success:false,error:'Capacité du relais SWAPP atteinte.'});
    room={segments:new Map(),viewers:new Map(),segmentTimeline:[],segmentDurations:new Map(),manifest:null,playlistNames:[],poster:null,posterAt:0,clip:null,clipAt:0,audioTrack:'unknown',bytes:0,lastManifestAt:now,lastSegmentAt:0,minuteStarted:now,minuteBytes:0};
    rooms.set(login,room);
   }
   if(now-room.minuteStarted>60000){room.minuteStarted=now;room.minuteBytes=0}
   if(room.minuteBytes+body.length>MAX_MINUTE_BYTES)return res.status(429).json({success:false,error:'Débit du direct trop élevé pour ce relais SWAPP (limite '+Math.round(MAX_MINUTE_BYTES/1048576)+' Mo/min). La qualité OBS ne sera pas réduite automatiquement : ajuste le débit OBS ou augmente la capacité du relais.'});
   if(name==='preview.mp4'){
    // Validate an MP4 file signature; client supplies a short video excerpt.
    if(body.length>MAX_CLIP_BYTES||body.length<5000||body.toString('ascii',4,8)!=='ftyp')
     return res.status(422).json({success:false,error:'Extrait MP4 invalide (4 Mo maximum).'});
    room.clip=Buffer.from(body);
    room.clipAt=now;
   }else if(name==='poster.jpg'){
    // Small public poster only, not arbitrary image uploads or user-supplied paths.
    if(body.length>MAX_POSTER_BYTES||body[0]!==0xff||body[1]!==0xd8||body[body.length-2]!==0xff||body[body.length-1]!==0xd9)
     return res.status(422).json({success:false,error:'Vignette JPEG invalide (600 Ko maximum).'});
    room.poster=Buffer.from(body);
    room.posterAt=now;
    const audio=String(req.get('x-swapp-audio-track')||'');
    if(audio==='present'||audio==='missing')room.audioTrack=audio;
   }else if(name==='index.m3u8'){
    const names=validatePlaylist(body);
    if(!names.length)return res.status(422).json({success:false,error:'Playlist HLS non valide.'});
    if(names.some(n=>!room.segments.has(n)))return res.status(409).json({success:false,error:'Un segment HLS de cette playlist manque.'});
    // Keep the incoming H.264/AAC bytes untouched, but normalize an invalid
    // TARGETDURATION (some OBS remux streams advertise 4 for 4.167s GOPs).
    // HLS requires each EXTINF duration rounded to nearest integer not to
    // exceed TARGETDURATION; ceil(max) is always a conservative valid choice.
    const sourceManifest=body.toString('utf8');
    const observedDurations=[...sourceManifest.matchAll(/^#EXTINF:(\d+(?:\.\d+)?),/gm)].map(m=>Number(m[1]));
    const targetDuration=Math.max(1,Math.ceil(Math.max(...observedDurations)));
    const correctedManifest=/^#EXT-X-TARGETDURATION:\d+[ \t]*$/m.test(sourceManifest)
     ?sourceManifest.replace(/^#EXT-X-TARGETDURATION:\d+[ \t]*$/m,'#EXT-X-TARGETDURATION:'+targetDuration)
     :sourceManifest.replace(/^#EXTM3U[ \t]*$/m,'#EXTM3U\n#EXT-X-TARGETDURATION:'+targetDuration);
    room.manifest=Buffer.from(correctedManifest);
    room.playlistNames=names;
    // OBS keyframe interval determines HLS segment length in remux mode.
    // Keep the exact #EXTINF durations, not a fabricated fixed 2 seconds.
    const lines=body.toString('utf8').split(/\r?\n/);
    let pendingDuration=null;
    for(const line of lines){
     const value=line.trim();
     const extinf=value.match(/^#EXTINF:(\d+(?:\.\d+)?),/);
     if(extinf){pendingDuration=Math.max(0.1,Math.min(20,Number(extinf[1])));continue}
     if(names.includes(value)){
      room.segmentDurations.set(value,pendingDuration||2);
      pendingDuration=null;
     }
    }
    room.lastManifestAt=now;
    pruneHistory(room);
   }else{
    if(body[0]!==0x47)return res.status(422).json({success:false,error:'Segment MPEG-TS invalide.'});
    let previous=room.segments.get(name);
    let genuinelyNew=!previous||previous.length!==body.length||!previous.equals(body);
    // On a restart from seg_000.ts, don't mix two disconnected HLS timelines.
    const newest=room.segmentTimeline.at(-1);
    if(newest&&sequence(name)<sequence(newest)-MAX_DVR_SEGMENTS){
     room.segments.clear();room.segmentTimeline=[];room.segmentDurations.clear();room.bytes=0;
     room.playlistNames=[];room.manifest=null;
     previous=null;genuinelyNew=true;
    }
    if(!room.segments.has(name))room.segmentTimeline.push(name);
    room.segments.set(name,Buffer.from(body));
    room.bytes+=body.length-(previous?.length||0);
    pruneHistory(room);
    if(room.bytes>MAX_ROOM_BYTES||!room.segments.has(name)){
     if(room.segments.has(name)){
      room.bytes-=room.segments.get(name).length;
      room.segments.delete(name);
      room.segmentTimeline=room.segmentTimeline.filter(n=>n!==name);
     }
     return res.status(413).json({success:false,error:'Mémoire vidéo SWAPP saturée : réduis le bitrate OBS.'});
    }
    // A repeated identical TS upload is not evidence of progressing video.
    if(genuinelyNew)room.lastSegmentAt=now;
   }
   room.minuteBytes+=body.length;
   res.json({success:true,room:login,received:name,segment_count:room.segments.size});
  });
 // Presence counts active playback sessions, not page visits or fabricated viewers.
 // Only the player sends a heartbeat after video frames are decoded.
 function activeSwappers(room){
  if(!room)return 0;
  if(!room.viewers)room.viewers=new Map();
  const now=Date.now();
  for(const [session,seen] of room.viewers)if(now-seen>45000)room.viewers.delete(session);
  return room.viewers.size;
 }
 app.get('/api/oryon/local-relay/:login/audience',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),room=login&&liveRoom(login);
  const live=hasFreshVideo(room);
  res.json({success:true,live,swappers:live?activeSwappers(room):0});
 });
 app.post('/api/oryon/local-relay/:login/audience/heartbeat',
  express.json({limit:'1kb'}),(req,res)=>{
   notCached(res);
   // Do not accept cross-site form posts as fake audience.
   const origin=String(req.get('origin')||'');
   if(origin){let sameOrigin=false;try{sameOrigin=new URL(origin).host===req.get('host')}catch(_){}if(!sameOrigin)return res.sendStatus(403)}
   const login=cleanLogin(req.params.login),session=String(req.body?.session||'');
   if(!/^[a-f0-9]{32}$/.test(session))return res.status(400).json({success:false,error:'Session invalide.'});
   const room=login&&liveRoom(login);
   if(!hasFreshVideo(room))
    return res.json({success:true,live:false,swappers:0});
   activeSwappers(room);
   if(!room.viewers.has(session)&&room.viewers.size>=2000)return res.sendStatus(429);
   room.viewers.set(session,Date.now());
   res.json({success:true,live:true,swappers:activeSwappers(room)});
  });
 app.post('/api/oryon/local-relay/:login/audience/leave',
  express.json({limit:'1kb'}),(req,res)=>{
   notCached(res);
   const origin=String(req.get('origin')||'');
   if(origin){let sameOrigin=false;try{sameOrigin=new URL(origin).host===req.get('host')}catch(_){}if(!sameOrigin)return res.sendStatus(403)}
   const login=cleanLogin(req.params.login),session=String(req.body?.session||'');
   if(!/^[a-f0-9]{32}$/.test(session))return res.sendStatus(400);
   const room=login&&liveRoom(login);
   room?.viewers?.delete(session);
   res.json({success:true,swappers:activeSwappers(room)});
  });
 app.get('/api/oryon/local-relay/:login/state',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  res.json({success:true,active:hasFreshVideo(r),segment_count:r?.segments?.size||0,
   last_manifest_at:r?.lastManifestAt||null,last_segment_at:r?.lastSegmentAt||null,
   segment_age_ms:r?.lastSegmentAt?Math.max(0,Date.now()-r.lastSegmentAt):null,
   media_fresh:hasFreshVideo(r),audio_track:r?.audioTrack||'unknown',dvr_seconds:r?Math.round(Math.min(80,historySeconds(r))):0,preview_ready:!!r?.clip});
 });
 app.get('/api/oryon/local-relay/:login/probe',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  const latest=r?.playlistNames?.at(-1)||null;
  const chunk=latest&&r.segments.get(latest);
  res.json({success:true,active:hasFreshVideo(r),instance:process.pid,
   playlist_ready:!!r?.manifest,segment_ready:!!chunk,media_fresh:hasFreshVideo(r),
   segment_age_ms:r?.lastSegmentAt?Math.max(0,Date.now()-r.lastSegmentAt):null,
   latest_segment:latest,
   latest_bytes:chunk?.length||0,ts_sync_byte:chunk?.[0]===0x47,
   manifest_age_ms:r?.lastManifestAt?Date.now()-r.lastManifestAt:null,
   media:chunk?inspectTsMedia(chunk):null});
 });
 app.get('/api/oryon/local-relay/:login/index.m3u8',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  if(!r?.manifest)return res.sendStatus(404);
  res.type('application/vnd.apple.mpegurl').send(r.manifest);
 });
 app.get('/api/oryon/local-relay/:login/dvr.m3u8',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  const manifest=r&&r.manifest?dvrManifest(r):'';
  if(!manifest)return res.sendStatus(404);
  res.type('application/vnd.apple.mpegurl').send(manifest);
 });
 app.get('/api/oryon/local-relay/:login/preview.mp4',(req,res)=>{
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  if(!r?.clip)return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=45, s-maxage=45');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Accept-Ranges','bytes');
  // Discord may request a small byte range to parse MP4 metadata.
  const size=r.clip.length,range=String(req.get('range')||'');
  const match=/^bytes=(\d+)-(\d*)$/.exec(range);
  if(range&&!match){res.set('Content-Range','bytes */'+size);return res.sendStatus(416)}
  if(match){
   const first=Number(match[1]),last=match[2]?Number(match[2]):size-1;
   if(first>=size||last<first){res.set('Content-Range','bytes */'+size);return res.sendStatus(416)}
   const final=Math.min(last,size-1);
   res.set('Content-Range','bytes '+first+'-'+final+'/'+size);
   res.set('Content-Length',String(final-first+1));
   return res.status(206).type('video/mp4').send(r.clip.subarray(first,final+1));
  }
  res.type('video/mp4').send(r.clip);
 });
 app.get('/api/oryon/local-relay/:login/poster.jpg',(req,res)=>{
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  if(!r?.poster)return res.sendStatus(404);
  // Dynamic live frame: do not serve stale posters when OBS is offline.
  res.set('Cache-Control','public, max-age=25, s-maxage=25');
  res.set('X-Content-Type-Options','nosniff');
  res.type('image/jpeg').send(r.poster);
 });
 app.get('/api/oryon/local-relay/:login/player',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login);
  if(!login)return res.sendStatus(404);
  // Uses the existing OBS video player with sound, fullscreen and fit controls.
  const html=fs.readFileSync(path.join(__dirname,'..','local-agent','player.html'),'utf8')
   .replace('__SWAPP_HLS_SRC__',JSON.stringify('/api/oryon/local-relay/'+login+'/index.m3u8'))
   .replace('/assets/hls.min.js','https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js');
  res.type('html').send(html);
 }); app.get('/api/oryon/local-relay/:login/:segment',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),name=cleanName(req.params.segment),r=login&&liveRoom(login);
  if(!r||!name.endsWith('.ts')||!r.segments.has(name))return res.sendStatus(404);
  const bytes=r.segments.get(name);
  if(!bytes)return res.sendStatus(404);
  res.type('video/mp2t').send(bytes);
 });

 return {rooms,reclaim,validatePlaylist,MAX_ROOMS,MAX_ROOM_BYTES,
  posterForLogin(login){
   const r=liveRoom(cleanLogin(login));
   return r?.poster&&r?.manifest?{url:'/api/oryon/local-relay/'+encodeURIComponent(login)+'/poster.jpg',updatedAt:r.posterAt,bytes:r.poster.length}:null;
  },
  clipForLogin(login){
   const r=liveRoom(cleanLogin(login));
   return r?.clip&&r?.manifest?{url:'/api/oryon/local-relay/'+encodeURIComponent(login)+'/preview.mp4',updatedAt:r.clipAt,bytes:r.clip.length}:null;
  }
 };
}
module.exports={attachSwappDirectRelay};
