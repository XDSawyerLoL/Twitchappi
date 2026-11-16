'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../modules/swapp-direct-hls-relay.js'),'utf8');

test('stale HLS room cannot serve RAM playlist, DVR or TS after video stops',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-stale-hls-'));
 const routes=new Map(),mod={exports:{}};
 try{
  vm.runInNewContext(source,{
   require(name){if(name==='express')return {raw:()=>()=>{},json:()=>()=>{}};
     if(name.startsWith('./'))return require('../modules/'+name.slice(2));return require(name)},
   module:mod,__dirname:path.join(__dirname,'..','modules'),
   Buffer,Date,process:{env:{SWAPP_DIRECT_RELAY_SHARED_DIR:dir},pid:1234},
   setInterval(){return {unref(){}}}
  });
  const app={get:(p,f)=>routes.set(p,f),post(){},put(){}};
  const relay=mod.exports.attachSwappDirectRelay(app,{lookupOwner:async()=>({login:'teststream'})});
  const room={manifest:Buffer.from('#EXTM3U\n#EXTINF:2.0,\nseg_1.ts\n'),
   lastManifestAt:Date.now(),lastSegmentAt:Date.now()-61000,
   playlistNames:['seg_1.ts'],segments:new Map([['seg_1.ts',Buffer.from([0x47,0x01])]])};
  relay.rooms.set('teststream',room);
  async function call(route,segment){
   const fn=routes.get(route);assert.ok(fn,route);
   const r={code:200,headers:{},set(k,v){this.headers[k]=v;return this},
    type(){return this},send(body){this.body=body;return this},
    sendStatus(code){this.code=code;return this}};
   await fn({params:{login:'teststream',segment}},r);return r;
  }
  const playlist='/api/oryon/local-relay/:login/index.m3u8';
  const dvr='/api/oryon/local-relay/:login/dvr.m3u8';
  const segment='/api/oryon/local-relay/:login/:segment';
  assert.equal((await call(playlist)).code,404);
  assert.equal((await call(dvr)).code,404);
  const old=await call(segment,'seg_1.ts');
  assert.equal(old.code,404);
  assert.equal(old.headers['X-SWAPP-HLS-Window'],'expired');
  room.lastSegmentAt=Date.now();
  assert.equal((await call(playlist)).code,200);
  assert.equal((await call(segment,'seg_1.ts')).code,200);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
