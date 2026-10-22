'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function harness(){
 const server=source('server.js');
 const begin=server.indexOf('const nativeLiveRooms = new Map();');
 const end=server.indexOf('const swappLiveSweepTimer =',begin);
 assert.ok(begin>0&&end>begin);
 const calls=[],timers=[],accounts=[];
 const io={to:id=>({emit:(type,data)=>calls.push({id,type,data})}),emit:(type)=>calls.push({id:'all',type})};
 const scope={module:{exports:{}},process:{env:{}},Date,setTimeout:(fn,ms)=>{const t={fn,ms,unref(){}};timers.push(t);return t;},clearTimeout:timer=>{timer.cleared=true;},io,persistOryonLiveStateByLogin:(...args)=>{accounts.push(args);return Promise.resolve();}};
 vm.runInNewContext(server.slice(begin,end)+'\nmodule.exports={nativeLiveRooms,nativeHostAway,holdNativeHost,expireNativeHost,relayNativeSignal}',scope);
 return {...scope.module.exports,calls,timers,accounts};
}
test('host loss preserves live room, audience and public status during grace',()=>{
 const h=harness(),r={host:'host-1',hostUserId:'owner',viewers:new Set(['viewer-1']),title:'direct'};
 h.nativeLiveRooms.set('vnhz',r);
 h.holdNativeHost('vnhz',r);
 assert.equal(h.nativeLiveRooms.get('vnhz'),r);
 assert.equal(r.host,null);
 assert.ok(h.nativeHostAway(r));
 assert.equal(h.timers[0].ms,120000);
 assert.equal(h.accounts.length,0);
 assert.ok(h.calls.some(c=>c.type==='native:reconnecting'&&c.id==='viewer-1'));
});
test('expired disconnected host ends live only after grace',()=>{
 const h=harness(),r={host:'host-1',viewers:new Set(['viewer-1'])};
 h.nativeLiveRooms.set('vnhz',r);h.holdNativeHost('vnhz',r);
 h.timers[0].fn();
 assert.equal(h.nativeLiveRooms.has('vnhz'),false);
 assert.equal(h.accounts.length,1);
 assert.ok(h.calls.some(c=>c.type==='native:stopped'));
});
test('restored host blocks expiration from stale disconnect timer',()=>{
 const h=harness(),r={host:'host-1',viewers:new Set(['viewer-1'])};
 h.nativeLiveRooms.set('vnhz',r);h.holdNativeHost('vnhz',r);
 r.host='host-2';h.timers[0].fn();
 assert.equal(h.nativeLiveRooms.get('vnhz'),r);
 assert.equal(h.accounts.length,0);
});
test('signaling cannot be relayed by outsider or into another room',()=>{
 const h=harness(),r={host:'host-1',viewers:new Set(['viewer-1'])};h.nativeLiveRooms.set('vnhz',r);
 h.relayNativeSignal({id:'outsider',data:{nativeRoom:'vnhz'}},{room:'vnhz',to:'viewer-1',offer:{type:'offer',sdp:'ok'}},'native:offer','offer');
 h.relayNativeSignal({id:'host-1',data:{nativeRoom:'other'}},{room:'vnhz',to:'viewer-1',offer:{type:'offer',sdp:'ok'}},'native:offer','offer');
 assert.equal(h.calls.length,0);
 h.relayNativeSignal({id:'host-1',data:{nativeRoom:'vnhz'}},{room:'vnhz',to:'viewer-1',offer:{type:'offer',sdp:'ok'}},'native:offer','offer');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].id,'viewer-1');
});
test('server permits authenticated host session restoration and protects request-offer membership',()=>{
 const s=source('server.js');
 assert.match(s,/socket\.on\('native:resume'/);
 assert.match(s,/r\.hostUserId!==user\.id/);
 assert.match(s,/socket\.data\.nativeRoom===room&&r\.viewers\.has\(socket\.id\)/);
 assert.match(s,/if\(!r\.host&&!nativeHostAway\(r\)\)nativeLiveRooms\.delete\(room\)/);
 assert.match(s,/if\(r\.host===socket\.id\)holdNativeHost\(room,r\)/);
});
test('browser uses bounded retries, queued ICE and reconnect acknowledgements',()=>{
 const client=source('index_script.js');
 assert.match(client,/reconnectionAttempts:Infinity/);
 assert.match(client,/swappNativePendingIce=new Map\(\)/);
 assert.match(client,/swappNativeRetryTimer\)return/);
 assert.match(client,/swappNativeSetRemote\(d\.from,pc,d\.offer\)/);
 assert.match(client,/state\.socket\.emit\('native:resume'/);
 assert.match(client,/state\.socket\.on\('native:resumed'/);
 assert.match(client,/if\(pending\.length<48\)/);
 assert.match(client,/getVideoTracks\(\)\.forEach\(t=>t\.onended/);
});

test('viewer recovery coalesces multiple faults into one retry timer',()=>{
 const client=source('index_script.js');
 const a=client.indexOf('function retryWatch(){'),b=client.indexOf('async function peer(',a);
 assert.ok(a>0&&b>a);
 const socket={connected:true,emit(...args){this.sent.push(args);},sent:[]};
 const state={watchRoom:'vnhz',stream:null,room:'vnhz',socket,peers:{}};
 const timers=[],scope={module:{exports:{}},state,swappNativeRetryTimer:null,swappNativeRetryCount:0,
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},
  setupSocket(){},swappNativeClosePeers(){},requestOffer(){}};
 vm.runInNewContext(client.slice(a,b)+'\nmodule.exports=retryWatch;',scope);
 const retry=scope.module.exports;
 retry();retry();retry();
 assert.equal(timers.length,1);
 assert.ok(timers[0].delay>=1200);
 timers[0].fn();
 assert.equal(socket.sent.length,1);
 assert.equal(socket.sent[0][0],'native:join');
});
test('readiness endpoint exposes TURN/SFU capability without credentials',()=>{
 const server=source('server.js');
 assert.match(server,/app\.get\('\/api\/swapp\/streaming\/readiness'/);
 const p=server.slice(server.indexOf("app.get('/api/swapp/streaming/readiness'"),server.indexOf("app.get('/api/oryon/session'"));
 assert.match(p,/hostReconnectGraceMs/);assert.match(p,/turnConfigured/);assert.match(p,/reconnectingRooms/);
 assert.doesNotMatch(p,/TURN_CREDENTIAL|TURN_PASSWORD/);
});
