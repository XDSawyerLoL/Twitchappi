'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBrowserRelayShared,MAX_BYTES}=require('../modules/swapp-browser-relay-shared');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const mime='video/webm;codecs="vp8,opus"';
function room(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-browser-relay-'));
 let time=Date.now();
 const a=createBrowserRelayShared({root:dir,now:()=>time,maxRooms:2});
 const b=createBrowserRelayShared({root:dir,now:()=>time,maxRooms:2});
 return {a,b,dir,advance:n=>time+=n,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('browser fallback: uploader and viewer on separate Node workers see same init and chunks',()=>{
 const t=room();
 try{
  const init=Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]);
  const segment=Buffer.from([10,20,30,40]);
  assert.equal(t.a.put('vnhz',0,mime,init,'owner-123').success,true);
  assert.equal(t.b.state('vnhz').active,undefined);
  assert.equal(t.b.state('vnhz').lastSeq,0);
  assert.equal(t.b.put('vnhz',1,mime,segment,'owner-123').success,true);
  assert.equal(t.a.state('vnhz').lastSeq,1);
  assert.deepEqual(t.a.segment('vnhz',0),init);
  assert.deepEqual(t.b.segment('vnhz',1),segment);
  assert.equal(t.b.put('vnhz',2,mime,segment,'different-owner').status,409);
  assert.equal(t.a.put('vnhz',3,mime,segment,'owner-123').status,409);
 }finally{t.cleanup()}
});
test('browser fallback: fragments expire without creating a permanent video library',()=>{
 const t=room();
 try{
  t.a.put('vnhz',0,mime,Buffer.from('init'),'owner-123');
  t.a.put('vnhz',1,mime,Buffer.from('media'),'owner-123');
  t.advance(20000);
  assert.equal(t.b.state('vnhz'),null);
  assert.equal(t.b.segment('vnhz',0),null);
  t.advance(60000);
  t.b.sweep();
  assert.equal(fs.existsSync(path.join(t.dir,'vnhz')),false);
 }finally{t.cleanup()}
});
test('browser fallback: enforces 10MB bound, trims oldest chunks and retains init',()=>{
 const t=room();
 try{
  t.a.put('vnhz',0,mime,Buffer.from('header'),'owner-123');
  const chunk=Buffer.alloc(1600000,0x42);
  for(let i=1;i<=10;i++){
   const result=t.b.put('vnhz',i,mime,chunk,'owner-123');
   assert.equal(result.success,true);
  }
  const state=t.a.state('vnhz');
  assert.ok(state.bytes<=MAX_BYTES,'disk remains capped');
  assert.ok(state.firstSeq>1,'oldest fragments were discarded');
  assert.ok(t.a.segment('vnhz',0),'initialization retained');
  assert.equal(t.a.segment('vnhz',1),null);
  assert.equal(t.b.segment('vnhz',10).length,chunk.length);
 }finally{t.cleanup()}
});
test('browser fallback: invalid path, MIME and missing valid publisher are rejected',()=>{
 const t=room();
 try{
  assert.equal(t.a.put('../admin',0,mime,Buffer.from('x'),'owner-123').status,400);
  assert.equal(t.a.put('vnhz',0,'text/html',Buffer.from('x'),'owner-123').status,400);
  assert.equal(t.a.put('vnhz',0,mime,Buffer.from('x'),'').status,403);
  assert.equal(t.a.state('../admin'),null);
 }finally{t.cleanup()}
});
test('OBS and browser live paths consult shared video rather than process-only socket rooms',()=>{
 const server=source('server.js'),hls=source('modules/swapp-direct-hls-relay.js');
 assert.match(server,/const nativeBrowserShared=createBrowserRelayShared/);
 assert.match(server,/nativeBrowserShared\.put\(room,seq,mime,data,String\(user\.id\)\)/);
 assert.match(server,/nativeBrowserShared\.segment\(room,seq\)/);
 assert.match(server,/const browserMedia=nativeBrowserShared\.state\(login\)/);
 assert.match(server,/const verifiedObs=swappDirectRelay\.activeStreams\(\)\.find\(stream=>stream\.login===login\)/);
 assert.match(server,/source:verifiedObs\?'local-agent'/);
 assert.match(server,/verifyOryonRememberToken\(stored,remembered\.remember_token\)/);
 assert.doesNotMatch(server,/await restoreOryonSessionFromRememberCookie\(req,res,\{allowUserRecovery:false\}\);\s*const live=nativeLiveRooms\.get\(room\)/);
 assert.match(hls,/SWAPP_DIRECT_RELAY_SHARED_DIR/);
 assert.match(hls,/'.swapp-live-relay'/);
 assert.match(hls,/fs\.unlinkSync\(target\)/);
});
