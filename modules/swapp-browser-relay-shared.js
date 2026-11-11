'use strict';
/**
 * Bounded on-disk bridge for the existing browser MediaRecorder fallback.
 * The HTTP upload and viewers may land on different Node workers. A shared
 * filesystem is necessary; this code does not pretend to bridge independent
 * filesystems or Socket.IO signaling across distinct hosts.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const NAME=/^[a-z0-9_-]{2,40}$/;
const MIME=/^video\/(webm|mp4)(;[a-zA-Z0-9.,\-" ]+)?$/;
const MAX_BYTES=10*1024*1024;
const MAX_AGE_MS=18000;
function createBrowserRelayShared({root='',maxRooms=2,now=()=>Date.now()}={}){
 const base=String(root||'').trim();
 if(base&&!path.isAbsolute(base))throw Error('browser_relay_shared_root_must_be_absolute');
 let enabled=Boolean(base);
 if(enabled){
  try{fs.mkdirSync(base,{recursive:true,mode:0o700})}
  catch(error){enabled=false;console.warn('[SWAPP LIVE] media partagée indisponible',String(error.code||error.message))}
 }
 const place=(room,name)=>path.join(base,room,name);
 const valid=(room)=>NAME.test(String(room||''));
 function atomic(dest,bytes){
  const temp=dest+'.'+process.pid+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,dest)}
  finally{try{fs.unlinkSync(temp)}catch(_){}}
 }
 function state(room){
  if(!enabled||!valid(room))return null;
  try{
   const j=JSON.parse(fs.readFileSync(place(room,'state.json'),'utf8'));
   if(!MIME.test(j.mime)||!Number.isSafeInteger(j.firstSeq)||
      !Number.isSafeInteger(j.lastSeq)||j.firstSeq<1||j.lastSeq<0||
      !Number.isFinite(j.updatedAt)||now()-j.updatedAt>MAX_AGE_MS||
      j.updatedAt>now()+5000||!fs.existsSync(place(room,'0.bin')))return null;
   return j;
  }catch(_){return null}
 }
 function count(){
  if(!enabled)return 0;
  try{return fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&state(e.name)).length}
  catch(_){return 0}
 }
 function remove(room){
  if(!enabled||!valid(room))return;
  try{fs.rmSync(path.join(base,room),{recursive:true,force:true})}
  catch(_){}
 }
 function put(room,seq,mime,data,ownerId){
  if(!enabled)return null;
  if(!valid(room)||!MIME.test(mime)||!Buffer.isBuffer(data)||!data.length||
      data.length>2*1024*1024||!Number.isSafeInteger(seq)||seq<0)
   return {status:400,error:'fragment_invalide'};
  if(!/^[a-zA-Z0-9_-]{3,80}$/.test(String(ownerId||'')))return {status:403,error:'diffuseur_invalide'};
  let j=state(room);
  if(seq===0){
   if(!j&&count()>=maxRooms)return {status:429,error:'relay_sature'};
   // A fresh init cannot be mixed with chunks from a prior broadcast.
   remove(room);
   fs.mkdirSync(path.join(base,room),{recursive:true,mode:0o700});
   atomic(place(room,'0.bin'),data);
   j={mime,ownerId,firstSeq:1,lastSeq:0,bytes:data.length,updatedAt:now()};
   atomic(place(room,'state.json'),Buffer.from(JSON.stringify(j)));
   return {success:true,seq,shared:true};
  }
  if(!j||j.mime!==mime||j.ownerId!==ownerId||j.lastSeq!==seq-1)
   return {status:409,error:'sequence_desynchronisee'};
  atomic(place(room,seq+'.bin'),data);
  j.lastSeq=seq;j.bytes+=data.length;j.updatedAt=now();
  // Drop old fragments but always retain the initialization segment.
  while(j.bytes>MAX_BYTES&&j.firstSeq<j.lastSeq-1){
   const oldest=place(room,j.firstSeq+'.bin');
   try{j.bytes-=fs.statSync(oldest).size;fs.unlinkSync(oldest)}
   catch(_){}
   j.firstSeq++;
  }
  atomic(place(room,'state.json'),Buffer.from(JSON.stringify(j)));
  return {success:true,seq,shared:true};
 }
 function segment(room,seq){
  const j=state(room);
  if(!j||!Number.isSafeInteger(seq)||seq<0||
     (seq>0&&(seq<j.firstSeq||seq>j.lastSeq)))return null;
  try{return fs.readFileSync(place(room,seq+'.bin'))}
  catch(_){return null}
 }
 function sweep(){
  if(!enabled)return;
  try{
   for(const e of fs.readdirSync(base,{withFileTypes:true})){
    if(!e.isDirectory()||!valid(e.name))continue;
    const j=state(e.name);
    if(j)continue;
    let timestamp=0;
    try{timestamp=fs.statSync(place(e.name,'state.json')).mtimeMs}
    catch(_){try{timestamp=fs.statSync(path.join(base,e.name)).mtimeMs}catch(_){}}
    if(now()-timestamp>60000)remove(e.name);
   }
  }catch(_){}
 }
 return {get enabled(){return enabled},state,put,segment,sweep,remove,MAX_AGE_MS};
}
module.exports={createBrowserRelayShared,MAX_BYTES,MAX_AGE_MS};
