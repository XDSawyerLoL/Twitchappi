'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../modules/swapp-direct-hls-relay.js'),'utf8');
function worker(dir){
 const routes={get:new Map(),put:new Map(),post:new Map()},mod={exports:{}};
 vm.runInNewContext(source,{
  require(name){
   if(name==='express')return {raw:()=>()=>{},json:()=>()=>{}};
   if(name.startsWith('./'))return require('../modules/'+name.slice(2));
   return require(name);
  },module:mod,__dirname:path.join(__dirname,'..','modules'),
  Buffer,Date,process:{env:{SWAPP_DIRECT_RELAY_SHARED_DIR:dir},pid:process.pid},
  setInterval(){return {unref(){}}}
 });
 const app={get:(route,fn)=>routes.get.set(route,fn),
  put:(route,...fns)=>routes.put.set(route,fns.at(-1)),
  post:(route,...fns)=>routes.post.set(route,fns.at(-1))};
 const relay=mod.exports.attachSwappDirectRelay(app,{
  lookupOwner:async()=>({login:'vnhz'}),
  lookupObsOwner:async key=>key==='a'.repeat(48)?{login:'vnhz'}:null,
  lookupDashboardOwner:async()=>({login:'vnhz'})
 });
 async function call(method,route,{file,segment,body}={}){
  const fn=routes[method].get(route);assert.ok(fn,method+' '+route);
  const req={params:{login:'vnhz',segment},query:{cid:'a'.repeat(48),file},
   body,headers:{},get(k){
    if(k==='authorization')return 'Bearer TEST';
    if(k==='x-swapp-media-name')return file||'';
    return '';
   }};
  const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},
   status(n){this.code=n;return this},type(){return this},
   send(v){this.body=v;return this},json(v){this.body=v;return this},
   sendStatus(n){this.code=n;return this}};
  await fn(req,res);return res;
 }
 return {call,relay};
}
test('OBS writer and public HLS viewer on separate workers share verified video',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-obs-workers-'));
 try{
  const writer=worker(dir),viewer=worker(dir);
  const bytes=Buffer.alloc(188*1100);bytes[0]=0x47;
  const upload='/api/swapp/obs-hls/put';
  assert.equal((await writer.call('put',upload,{file:'index0.ts',body:bytes})).code,200);
  const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.0,\nindex0.ts\n';
  assert.equal((await writer.call('put',upload,{file:'index.m3u8',body:Buffer.from(playlist)})).code,200);
  const manifest='/api/oryon/local-relay/:login/index.m3u8';
  const segment='/api/oryon/local-relay/:login/:segment';
  const view=await viewer.call('get',manifest);
  assert.equal(view.code,200);
  assert.match(String(view.body),/seg_0\.ts/);
  const chunk=await viewer.call('get',segment,{segment:'seg_0.ts'});
  assert.equal(chunk.code,200);
  assert.deepEqual(Buffer.from(chunk.body),bytes);
  const state=await viewer.call('get','/api/oryon/local-relay/:login/state');
  assert.equal(state.body.media_fresh,true);
  assert.equal(viewer.relay.activeStreams().length,1);
  assert.equal(viewer.relay.activeStreams()[0].login,'vnhz');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('metadata mismatch or absence fails closed without serving alien segments',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-obs-identity-'));
 try{
  const writer=worker(dir),viewer=worker(dir),bytes=Buffer.alloc(188*1100);
  bytes[0]=0x47;
  const upload='/api/swapp/obs-hls/put';
  await writer.call('put',upload,{file:'index0.ts',body:bytes});
  await writer.call('put',upload,{file:'index.m3u8',
   body:Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nindex0.ts\n')});
  const manifest='/api/oryon/local-relay/:login/index.m3u8';
  const segment='/api/oryon/local-relay/:login/:segment';
  const metadata=path.join(dir,'vnhz','broadcast.json');
  const original=fs.readFileSync(metadata);
  assert.equal((await viewer.call('get',manifest)).code,200);
  fs.writeFileSync(metadata,JSON.stringify({id:'f'.repeat(24),manifest_sha256:'bad'}));
  assert.equal((await viewer.call('get',manifest)).code,404);
  assert.equal((await viewer.call('get',segment,{segment:'seg_0.ts'})).code,404);
  assert.equal(viewer.relay.activeStreams().length,0);
  fs.writeFileSync(metadata,original);
  assert.equal((await viewer.call('get',manifest)).code,200);
  fs.unlinkSync(metadata);
  assert.equal((await viewer.call('get',manifest)).code,404);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
