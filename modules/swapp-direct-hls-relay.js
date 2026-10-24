'use strict';
// SWAPP self-hosted OBS relay. The streamer PUSHES HLS over HTTPS to the
// existing SWAPP Node backend: no publicly reachable PC, TURN, tunnel or VPS.
// This is a bounded single-process relay, NOT a scalable CDN/SFU.
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');

function attachSwappDirectRelay(app, opts={}){
 const lookupOwner=opts.lookupOwner;
 if(typeof lookupOwner!=='function')throw Error('Direct HLS relay owner resolver required');
 const rooms=new Map();
 const MAX_ROOMS=Math.max(1,Math.min(2,Number(process.env.SWAPP_DIRECT_RELAY_MAX_ROOMS||2)));
 const MAX_ROOM_BYTES=Math.min(32*1024*1024,Math.max(8*1024*1024,Number(process.env.SWAPP_DIRECT_RELAY_ROOM_BYTES||24*1024*1024)));
 const MAX_POSTER_BYTES=600*1024;
 const MAX_UPLOAD_BYTES=Math.min(10*1024*1024,Math.max(512*1024,Number(process.env.SWAPP_DIRECT_RELAY_UPLOAD_BYTES||8*1024*1024)));
 const MAX_MINUTE_BYTES=Math.max(4*1024*1024,Math.min(60*1024*1024,Number(process.env.SWAPP_DIRECT_RELAY_MINUTE_BYTES||36*1024*1024)));
 const TTL_MS=55000;
 const maxPlaylistBytes=65536;
 const notCached=res=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Access-Control-Allow-Origin','*');
 };
 const cleanLogin=v=>/^[a-z0-9_-]{2,48}$/i.test(String(v||''))?String(v).toLowerCase():'';
 const cleanName=v=>/^(?:seg_[0-9]{1,14}\.ts|index\.m3u8|poster\.jpg)$/.test(String(v||''))?String(v):'';
 function liveRoom(login){
  const room=rooms.get(login);
  if(!room)return null;
  if(Date.now()-room.lastManifestAt>TTL_MS){rooms.delete(login);return null}
  return room;
 }
 function reclaim(){
  const now=Date.now();
  for(const [login,r] of rooms)if(now-r.lastManifestAt>TTL_MS)rooms.delete(login);
 }
 const interval=setInterval(reclaim,12000);
 interval.unref?.();
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
  res.json({success:true,transport:'swapp-direct-hls',version:2,max_rooms:MAX_ROOMS,max_room_bytes:MAX_ROOM_BYTES,max_segment_bytes:MAX_UPLOAD_BYTES,max_minute_bytes:MAX_MINUTE_BYTES,
   recommended_video_kbps:1500,recommended_audio_kbps:96,warning:'Usage limité aux tests et petites audiences sur hébergement SWAPP existant.'});
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
    room={segments:new Map(),manifest:null,playlistNames:[],poster:null,posterAt:0,audioTrack:'unknown',bytes:0,lastManifestAt:now,minuteStarted:now,minuteBytes:0};
    rooms.set(login,room);
   }
   if(now-room.minuteStarted>60000){room.minuteStarted=now;room.minuteBytes=0}
   if(room.minuteBytes+body.length>MAX_MINUTE_BYTES)return res.status(429).json({success:false,error:'Débit du direct trop élevé pour l’hébergement SWAPP. Baisse le bitrate OBS.'});
   if(name==='poster.jpg'){
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
    room.manifest=Buffer.from(body);
    room.playlistNames=names;
    room.lastManifestAt=now;
    for(const [n,b] of room.segments)if(!names.includes(n)){room.bytes-=b.length;room.segments.delete(n)}
   }else{
    if(body[0]!==0x47)return res.status(422).json({success:false,error:'Segment MPEG-TS invalide.'});
    const previous=room.segments.get(name);
    const nextSize=room.bytes+body.length-(previous?.length||0);
    if(nextSize>MAX_ROOM_BYTES)return res.status(413).json({success:false,error:'Mémoire vidéo SWAPP saturée : réduis le bitrate OBS.'});
    room.segments.set(name,Buffer.from(body));
    room.bytes=nextSize;
   }
   room.minuteBytes+=body.length;
   res.json({success:true,room:login,received:name,segment_count:room.segments.size});
  });
 app.get('/api/oryon/local-relay/:login/state',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  res.json({success:true,active:!!r?.manifest&&r.playlistNames.some(n=>r.segments.has(n)),segment_count:r?.segments?.size||0,
   last_manifest_at:r?.lastManifestAt||null,audio_track:r?.audioTrack||'unknown'});
 });
 app.get('/api/oryon/local-relay/:login/index.m3u8',(req,res)=>{
  notCached(res);
  const login=cleanLogin(req.params.login),r=login&&liveRoom(login);
  if(!r?.manifest)return res.sendStatus(404);
  res.type('application/vnd.apple.mpegurl').send(r.manifest);
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
  if(!r||!name.endsWith('.ts')||!r.playlistNames.includes(name))return res.sendStatus(404);
  const bytes=r.segments.get(name);
  if(!bytes)return res.sendStatus(404);
  res.type('video/mp2t').send(bytes);
 });

 return {rooms,reclaim,validatePlaylist,MAX_ROOMS,MAX_ROOM_BYTES,
  posterForLogin(login){
   const r=liveRoom(cleanLogin(login));
   return r?.poster&&r?.manifest?{url:'/api/oryon/local-relay/'+encodeURIComponent(login)+'/poster.jpg',updatedAt:r.posterAt,bytes:r.poster.length}:null;
  }
 };
}
module.exports={attachSwappDirectRelay};
