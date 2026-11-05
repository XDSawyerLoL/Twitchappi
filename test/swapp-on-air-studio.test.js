'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream'),{spawnSync}=require('node:child_process');
const {makeStudio,validateMetadata,parseMp3,MAX_UPLOAD}=require('../modules/swapp-on-air-studio');
const {publicEpisodes,episodePage}=require('../modules/swapp-on-air');
const ROOT=path.resolve(__dirname,'..'),SLUG='on-air-test-generated-audio';
const valid={
 slug:SLUG,title:'SWAPP ON AIR — Essai audio vérifié',
 description:'Épisode de test de lecture et de publication contrôlée sur le stockage local SWAPP.',
 sources:[{label:'Site officiel Nintendo',url:'https://www.nintendo.com/'}],
 articles:[],audioReviewed:true,editorialApproved:true,licenseConfirmed:true
};
const HAS_FFMPEG=spawnSync('ffmpeg',['-version'],{timeout:4000}).status===0;
function createMp3(dir){
 const source=path.join(dir,'source.mp3');
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
  '-i','sine=frequency=440:duration=26','-c:a','libmp3lame','-b:a','64k',
  '-ar','44100','-y',source],{timeout:25000});
 if(result.status!==0)throw Error('Cannot build MP3 fixture');
 return source;
}
test('publisher rejects unsigned editorial approval and untrusted sources',()=>{
 for(const prop of ['audioReviewed','editorialApproved','licenseConfirmed']){
  assert.throws(()=>validateMetadata({...valid,[prop]:false},SLUG),/approval_required/);
 }
 assert.throws(()=>validateMetadata({...valid,sources:[{label:'Bad',url:'http://example.com'}]},SLUG),
  /invalid_source/);
 assert.throws(()=>validateMetadata({...valid,sources:[]},SLUG),/sources_required/);
 assert.throws(()=>validateMetadata(valid,'../unauthorized'),/invalid_slug/);
 assert.equal(MAX_UPLOAD,24*1024*1024);
});
test('generated test audio is genuine MP3 and releases atomically with approved catalogue',{
 skip:!HAS_FFMPEG
},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-on-air-studio-test-'));
 const audio=createMp3(dir),store=makeStudio({dir:path.join(dir,'store')});
 const old=process.env.SWAPP_ON_AIR_STORAGE_DIR;
 try{
  const file=fs.readFileSync(audio),upload=await store.upload(SLUG,Readable.from([file]),{length:file.length});
  assert.ok(upload.success);
  assert.ok(upload.durationSec>=20);
  assert.ok(/^[a-f0-9]{24}$/.test(upload.upload_id));
  assert.deepEqual(store.read().episodes,[],'unfinished upload must stay private');
  const released=await store.publish({...valid,upload_id:upload.upload_id});
  assert.ok(released.success);
  assert.equal(released.episode.url,'/on-air/'+SLUG);
  assert.equal(fs.existsSync(path.join(store.dir,SLUG+'.mp3')),true);
  assert.equal(store.read().episodes.length,1);
  process.env.SWAPP_ON_AIR_STORAGE_DIR=store.dir;
  const publicList=publicEpisodes();
  assert.ok(publicList.some(e=>e.slug===SLUG));
  const episode=publicList.find(e=>e.slug===SLUG);
  assert.equal(episode.audioUrl,'/api/on-air/audio/'+SLUG+'.mp3');
  const html=episodePage(SLUG,publicList);
  assert.match(html,/<audio controls preload="none"/);
  assert.match(html,/Sources vérifiées/);
  await assert.rejects(store.publish({...valid,upload_id:upload.upload_id}),/upload_missing|episode_exists/);
 }finally{
  if(old===undefined)delete process.env.SWAPP_ON_AIR_STORAGE_DIR;
  else process.env.SWAPP_ON_AIR_STORAGE_DIR=old;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('malformed MP3 never becomes a published audio player',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-onair-reject-'));
 try{
  const file=path.join(tmp,'fake.mp3');
  fs.writeFileSync(file,Buffer.concat([Buffer.from('ID3'),Buffer.alloc(40000,65)]));
  assert.throws(()=>parseMp3(file),/audio_invalid_frames|audio_not_mp3/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('private studio routes require admin, proper origin and explicit action header',()=>{
 const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
 assert.match(server,/app\.get\('\/on-air\/studio'/);
 assert.match(server,/app\.post\('\/api\/on-air\/studio\/upload\/:slug'/);
 assert.match(server,/app\.post\('\/api\/on-air\/studio\/publish'/);
 assert.match(server,/app\.get\('\/api\/on-air\/audio\/:slug\.mp3'/);
 assert.match(server,/if\(!isOryonAdmin\(req\)\)/);
 assert.match(server,/X-SWAPP-ON-AIR-ACTION/);
 assert.match(server,/!allowed\.includes\(origin\)/);
 assert.match(server,/acceptRanges:true/);
 const scripts=fs.readFileSync(path.join(ROOT,'assets/swapp-on-air-studio.js'),'utf8');
 assert.match(scripts,/oas-preview/);
 assert.match(scripts,/xhr\.upload\.onprogress/);
 assert.match(scripts,/\/api\/on-air\/studio\/publish/);
 assert.doesNotMatch(scripts,/speechSynthesis|new AudioContext|autoplay=true/);
});
