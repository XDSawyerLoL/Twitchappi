'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../modules/swapp-direct-hls-relay.js'),'utf8');
test('offline OBS never advertises stale posters, previews, playlist or probe frames',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-offline-'));
 const routes=new Map(),mod={exports:{}};
 try{
  vm.runInNewContext(source,{
   require(name){
    if(name==='express')return {raw:()=>()=>{},json:()=>()=>{}};
    if(name.startsWith('./'))return require('../modules/'+name.slice(2));
    return require(name)
   },module:mod,__dirname:path.join(__dirname,'..','modules'),Buffer,Date,
   process:{env:{SWAPP_DIRECT_RELAY_SHARED_DIR:dir},pid:1234},
   setInterval(){return {unref(){}}}
  });
  const app={get:(route,fn)=>routes.set(route,fn),post(){},put(){}};
  const relay=mod.exports.attachSwappDirectRelay(app,{lookupOwner:async()=>({login:'teststream'})});
  const room={
   manifest:Buffer.from('#EXTM3U\n#EXTINF:2.0,\nseg_1.ts\n'),
   lastManifestAt:Date.now(),lastSegmentAt:Date.now()-61000,
   playlistNames:['seg_1.ts'],segments:new Map([['seg_1.ts',Buffer.from([0x47,0x01])]]),
   segmentTimeline:[],segmentDurations:new Map(),bytes:188,
   poster:Buffer.from([0xff,0xd8,0xff,0xd9]),posterAt:Date.now(),
   clip:Buffer.from('00test-mp4'),clipAt:Date.now()
  };
  relay.rooms.set('teststream',room);
  async function call(route){
   const fn=routes.get('/api/oryon/local-relay/:login/'+route);
   assert.ok(fn,route);
   const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},
    get(){return ''},type(){return this},send(v){this.body=v;return this},
    json(v){this.body=v;return this},status(n){this.code=n;return this},
    sendStatus(n){this.code=n;return this}};
   await fn({params:{login:'teststream'},get:()=>'',headers:{}},res);
   return res;
  }
  for(const route of ['preview.mp4','poster.jpg','index.m3u8'])
   assert.equal((await call(route)).code,404,route+' must expire');
  const state=await call('state'),probe=await call('probe');
  assert.equal(state.body.media_fresh,false);
  assert.equal(state.body.poster_ready,false);
  assert.equal(state.body.preview_ready,false);
  assert.equal(probe.body.playlist_ready,false);
  assert.equal(probe.body.segment_ready,false);
  assert.equal(probe.body.latest_segment,null);
  assert.equal(relay.posterForLogin('teststream'),null);
  assert.equal(relay.clipForLogin('teststream'),null);
  room.lastSegmentAt=Date.now();
  assert.equal((await call('index.m3u8')).code,200);
  assert.equal((await call('poster.jpg')).code,200);
  assert.equal((await call('preview.mp4')).code,200);
  assert.equal((await call('state')).body.media_fresh,true);
  assert.ok(relay.posterForLogin('teststream'));
  assert.ok(relay.clipForLogin('teststream'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
