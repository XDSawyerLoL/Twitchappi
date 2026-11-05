'use strict';
// ON AIR Studio: authenticated direct publication on existing SWAPP hosting.
// A release is visible only after the real MP3 and reviewed manifest are both durable.
// Audio is outside the public static web root and served only through a validated route.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {SLUG}=require('./swapp-on-air');
const MAX_UPLOAD=24*1024*1024,MIN_UPLOAD=30000,MAX_EPISODES=200;
const UPLOAD_ID=/^[a-f0-9]{24}$/;
function publicationError(code,status=400){const e=Error(code);e.status=status;return e}
function storageRoot(root=path.resolve(__dirname,'..')){
 const configured=String(process.env.SWAPP_ON_AIR_STORAGE_DIR||'').trim();
 if(configured&&!path.isAbsolute(configured))throw publicationError('storage_dir_absolute_required',503);
 return configured||path.join(root,'data','swapp-on-air','uploads');
}
function readIndex(dir){
 try{
  const data=JSON.parse(fs.readFileSync(path.join(dir,'episodes.json'),'utf8'));
  if(data?.schema!==1||!Array.isArray(data.episodes))throw Error('schema');
  return data;
 }catch(e){
  if(e.code==='ENOENT')return {schema:1,episodes:[]};
  throw publicationError('index_corrupt',503);
 }
}
function parseMp3(file,{requireCli=false}={}){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size<MIN_UPLOAD||stat.size>MAX_UPLOAD)
  throw publicationError('audio_size_invalid',422);
 // Require a true MPEG Layer III stream rather than trusting an ID3 file header.
 const fd=fs.openSync(file,'r'),buf=Buffer.alloc(Math.min(stat.size,512*1024));
 try{fs.readSync(fd,buf,0,buf.length,0)}finally{fs.closeSync(fd)}
 let start=0;
 if(buf.subarray(0,3).toString('ascii')==='ID3'){
  if(buf.length<10||[buf[6],buf[7],buf[8],buf[9]].some(x=>x>=128))
   throw publicationError('audio_invalid_id3',422);
  start=10+((buf[6]&127)<<21)+((buf[7]&127)<<14)+((buf[8]&127)<<7)+(buf[9]&127);
  if(buf[5]&0x10)start+=10;
 }
 if(start+1000>=buf.length)throw publicationError('audio_invalid_frames',422);
 const rates={3:[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],
  2:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
  0:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]};
 const hz={3:[44100,48000,32000],2:[22050,24000,16000],0:[11025,12000,8000]};
 function frame(at){
  if(at+4>buf.length||buf[at]!==0xff||(buf[at+1]&0xe0)!==0xe0)return null;
  const version=(buf[at+1]>>3)&3,layer=(buf[at+1]>>1)&3,
   rateIndex=buf[at+2]>>4,frequency=(buf[at+2]>>2)&3,
   padding=(buf[at+2]>>1)&1;
  if(version===1||layer!==1||rateIndex===0||rateIndex===15||frequency===3)return null;
  const kbps=rates[version][rateIndex],sampleRate=hz[version][frequency];
  if(!kbps||!sampleRate)return null;
  const length=Math.floor((version===3?144000:72000)*kbps/sampleRate+padding);
  return {length,kbps,sampleRate,version,channels:((buf[at+3]>>6)&3)===3?1:2};
 }
 let first=null,at=start;
 // ID3 may be followed by a short padding region, never scan arbitrary payloads.
 for(let i=0;i<512&&at+i<buf.length-4;i++){
  const f=frame(at+i);
  if(f&&frame(at+i+f.length)&&frame(at+i+f.length+frame(at+i+f.length).length)){
   first=f;at+=i;break;
  }
 }
 if(!first)throw publicationError('audio_not_mp3',422);
 let duration=Math.round((stat.size-at)*8/(first.kbps*1000));
 if(!Number.isFinite(duration)||duration<20||duration>7200)throw publicationError('audio_duration_invalid',422);
 // Strong duration check where ffprobe exists; no dependency on ffprobe
 // for shared Hostinger Node hosting without shell multimedia packages.
 const probed=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name',
  '-of','json',file],{encoding:'utf8',timeout:6500,maxBuffer:128*1024});
 if(probed.status===0){
  try{
   const metadata=JSON.parse(probed.stdout||'{}');
   const actual=Number(metadata.format?.duration);
   if(!metadata.streams?.some(x=>x.codec_name==='mp3')||actual<20||actual>7200)
    throw publicationError('audio_codec_or_duration_invalid',422);
   duration=Math.round(actual);
  }catch(e){if(e.status)throw e}
 }else if(requireCli)throw publicationError('ffprobe_unavailable',503);
 return duration;
}
function validateMetadata(body,slug){
 if(!SLUG.test(slug)||slug.length<7||slug.length>85)throw publicationError('invalid_slug');
 const title=String(body?.title||'').trim(),description=String(body?.description||'').trim();
 if(title.length<12||title.length>180||description.length<30||description.length>700)
  throw publicationError('invalid_editorial_metadata');
 if(body.audioReviewed!==true||body.editorialApproved!==true||body.licenseConfirmed!==true)
  throw publicationError('approval_required');
 const sources=Array.isArray(body.sources)?body.sources:[],
  articles=Array.isArray(body.articles)?body.articles:[];
 if(!sources.length||sources.length>10||articles.length>10)throw publicationError('sources_required');
 const safeSources=sources.map(s=>{
  const label=String(s.label||'').trim(),value=String(s.url||'');
  let url;try{url=new URL(value)}catch{throw publicationError('invalid_source')}
  if(label.length<1||label.length>120||url.protocol!=='https:'||!url.hostname||
    url.username||url.password||url.hash||/\s/.test(value))
   throw publicationError('invalid_source');
  return {label,url:url.href};
 });
 const safeArticles=articles.map(a=>{
  if(typeof a!=='string'||!/^\/actus\/[a-z0-9-]{4,115}$/.test(a))
   throw publicationError('invalid_article');
  return a;
 });
 return {title,description,sources:safeSources,articles:[...new Set(safeArticles)]};
}
function makeStudio({dir=storageRoot(),now=()=>new Date(),random=crypto.randomBytes}={}){
 const directory=path.resolve(dir);
 function ensure(){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(!fs.lstatSync(directory).isDirectory())throw publicationError('invalid_storage',503);
  return directory;
 }
 function stagedPath(slug,id){return path.join(directory,'.'+slug+'.'+id+'.upload')}
 function mp3Path(slug){return path.join(directory,slug+'.mp3')}
 function stagePath(slug,id){
  if(!SLUG.test(slug)||slug.length<7||slug.length>85||!UPLOAD_ID.test(id))
   throw publicationError('invalid_upload');
  return stagedPath(slug,id);
 }
 async function upload(slug,input,{length}={}){
  ensure();
  if(!SLUG.test(slug)||slug.length<7||slug.length>85)throw publicationError('invalid_slug');
  if(fs.existsSync(mp3Path(slug))||readIndex(directory).episodes.some(e=>e.slug===slug))
   throw publicationError('episode_exists',409);
  if(length!==undefined&&(!Number.isFinite(length)||length>MAX_UPLOAD||length<MIN_UPLOAD))
   throw publicationError('audio_size_invalid',413);
  const id=random(12).toString('hex'),destination=stagePath(slug,id);
  const file=await fs.promises.open(destination,'wx',0o600);
  let size=0;
  try{
   for await(const chunk of input){
    size+=chunk.length;
    if(size>MAX_UPLOAD)throw publicationError('audio_size_invalid',413);
    await file.writeFile(chunk);
   }
  }catch(e){await file.close();await fs.promises.rm(destination,{force:true});throw e}
  await file.close();
  if(size<MIN_UPLOAD){await fs.promises.rm(destination,{force:true});throw publicationError('audio_size_invalid',422)}
  try{
   const duration=parseMp3(destination);
   return {success:true,upload_id:id,bytes:size,durationSec:duration};
  }catch(e){await fs.promises.rm(destination,{force:true});throw e}
 }
 async function publish(data){
  ensure();
  const slug=String(data?.slug||''),file=stagePath(slug,String(data?.upload_id||''));
  const meta=validateMetadata(data,slug);
  if(!fs.existsSync(file))throw publicationError('upload_missing',404);
  const durationSec=parseMp3(file);
  const stamp=now().toISOString(),entry={
   slug,title:meta.title,description:meta.description,
   audio:slug+'.mp3',durationSec,status:'published',
   audioReviewed:true,editorialApproved:true,reviewedAt:stamp,publishedAt:stamp,
   sources:meta.sources,articles:meta.articles
  };
  const lock=path.join(directory,'.publish.lock');
  let guard;try{guard=await fs.promises.open(lock,'wx',0o600)}
  catch(e){if(e.code==='EEXIST')throw publicationError('publication_busy',409);throw e}
  let dest=null,manifestTmp=null;
  try{
   const index=readIndex(directory);
   if(index.episodes.length>=MAX_EPISODES||index.episodes.some(e=>e.slug===slug)||
     fs.existsSync(mp3Path(slug)))throw publicationError('episode_exists',409);
   dest=mp3Path(slug);
   await fs.promises.rename(file,dest);
   index.episodes.push(entry);
   manifestTmp=path.join(directory,'.episodes.'+random(8).toString('hex')+'.tmp');
   await fs.promises.writeFile(manifestTmp,JSON.stringify(index,null,2)+'\n',{mode:0o600,flag:'wx'});
   await fs.promises.rename(manifestTmp,path.join(directory,'episodes.json'));
   return {success:true,episode:{slug,title:meta.title,url:'/on-air/'+slug,
    audioUrl:'/api/on-air/audio/'+slug+'.mp3',durationSec}};
  }catch(e){
   if(manifestTmp)await fs.promises.rm(manifestTmp,{force:true}).catch(()=>{});
   // A failed manifest write must never leave an unreviewed orphan file public.
   if(dest&&fs.existsSync(dest))await fs.promises.rename(dest,file).catch(()=>{});
   throw e;
  }finally{
   await guard.close();
   await fs.promises.rm(lock,{force:true});
  }
 }
 return {dir:directory,ensure,stagePath,mp3Path,upload,publish,read:()=>readIndex(directory)};
}
module.exports={makeStudio,storageRoot,parseMp3,validateMetadata,publicationError,MAX_UPLOAD};
