'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const client=read('index_script.js');
const server=read('server.js');
function extract(begin,end){
 const start=client.indexOf(begin),stop=client.indexOf(end,start+begin.length);
 assert.ok(start>=0&&stop>start,'cannot extract '+begin);
 return client.slice(start,stop);
}
test('server does not let a disconnected stale socket delete a newer room',()=>{
 assert.match(server,/existing\.hostUserId === user\.id/);
 assert.match(server,/prior\.data\.nativeRole = null/);
 assert.match(server,/role === 'host' && r\.host === socket\.id/g);
 assert.match(server,/socket\.emit\('native:viewer', \{ room, viewerId, viewers: existing\.viewers\.size \}\)/);
 assert.match(server,/native:reconnecting/);
});
test('public live polling is lightweight and never cached',()=>{
 assert.match(server,/app\.get\('\/api\/oryon\/channel\/:login\/live-ping'/);
 const ping=server.split("app.get('/api/oryon/channel/:login/live-ping'")[1]
   .split("app.get('/api/oryon/channel/:login/status'")[0];
 assert.match(ping,/Cache-Control','no-store'/);
 assert.doesNotMatch(ping,/publicOryonChannelUser|avatar_url|channel_panels|channel_vignettes/);
 assert.match(ping,/is_live:!!room\|\|localLiveFresh/);
 assert.match(client,/setInterval\(\(\)=>\{if\(state\?\.view==='channel'\)refreshChannelStatus\(\)\},10000\)/);
 assert.match(client,/await renderChannel\(\)/);
 assert.match(client,/const livePing=await api\('\/api\/oryon\/channel\/'/);
});
test('browser publishes only after ack and republishes when its socket reconnects',async()=>{
 const listeners=new Map(),outgoing=[],ui=[];
 const socket={
  connected:true,
  on(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
  emit(name,data){outgoing.push({name,data})},
  connect(){this.connected=true},
  disconnect(){this.connected=false}
 };
 const $=sel=>({
  '#liveQuality':{value:'720'},
  '#liveSource':{value:'screen'},
  '#liveTitle':{value:'Test stream'},
  '#liveCategory':{value:'Gaming'},
  '#liveTags':{value:''},
  '#startLiveBtn':{classList:{add(){},remove(){}}},
  '#stopLiveBtn':{classList:{add(){},remove(){}}},
  '#streamStateBadge':{textContent:''},
  '#localVideo':{play(){return Promise.resolve()},srcObject:null}
 })[sel]||null;
 const stream={getTracks:()=>[{stop(){},onended:null}]};
 const state={session:{local:{login:'vnhz'}},view:'manager',socket:null,socketLogin:null,
  stream:null,watchRoom:null,peers:{},nativeLiveConfirmed:false};
 const context={state,io:()=>socket,$,toast(){},attachCurrentStream(){},
  updateLiveUi(live){ui.push(live)},
  navigator:{mediaDevices:{getDisplayMedia:async()=>stream}},
  setTimeout,clearTimeout,requestOffer(){},peer(){},sendOfferToViewer(){},
  retryWatch(){},addMsg(){},msgHtml(){},scrollChat(){},
  stopLive(){clearTimeout(state.nativeLiveAckTimer);state.stream=null;state.nativeLiveInfo=null;state.nativeLiveConfirmed=false;}
 };
 // Only the small transport routines are run; no DOM or server boot required.
 vm.runInNewContext(extract('function setupSocket(){','async function sendOfferToViewer(')+
  extract('async function startLive(){','function stopLive(stopTracks=true){'),context);
 try{
  await context.startLive();
  assert.equal(state.nativeLiveConfirmed,false);
  assert.equal(ui.at(-1),false,'preview must not announce public live');
  assert.equal(outgoing.filter(x=>x.name==='native:create').length,1);
  assert.equal(state.nativeLiveInfo.title,'Test stream');
  for(const fn of listeners.get('native:created')||[])fn({room:'vnhz'});
  assert.equal(state.nativeLiveConfirmed,true,'ack confirms public publication');
  socket.connected=false;
  for(const fn of listeners.get('disconnect')||[])fn();
  assert.equal(state.nativeLiveConfirmed,false,'connection loss must clear public confirmation');
  socket.connected=true;
  for(const fn of listeners.get('connect')||[])fn();
  assert.equal(outgoing.filter(x=>x.name==='native:create').length,2,'reconnect must republish');
  assert.equal(state.nativeLiveConfirmed,false);
  for(const fn of listeners.get('native:created')||[])fn({room:'vnhz'});
  assert.equal(state.nativeLiveConfirmed,true);
 }finally{clearTimeout(state.nativeLiveAckTimer)}
});

test('public SSH tunnel hostnames play on SWAPP without exposing loopback players',()=>{
 const source=extract('function swappSafeLocalPlayerUrl(url){','function swappChannelPath(login){');
 const ctx={URL,swappIsBlockedTunnelUrl:()=>false};
 vm.runInNewContext(source,ctx);
 const sanitize=ctx.swappSafeLocalPlayerUrl;
 assert.equal(sanitize('https://stream-abc.localhost.run/player/vnhz'),
  'https://stream-abc.localhost.run/player/vnhz');
 assert.equal(sanitize('https://stream-abc.lhr.life/player/vnhz'),
  'https://stream-abc.lhr.life/player/vnhz');
 assert.equal(sanitize('http://127.0.0.1:8082/player/vnhz'),'');
 assert.equal(sanitize('https://localhost/player/vnhz'),'');
 assert.equal(sanitize('https://user:password@stream-abc.lhr.life/player/vnhz'),'');
 assert.equal(sanitize('javascript:alert(1)'),'');
});
