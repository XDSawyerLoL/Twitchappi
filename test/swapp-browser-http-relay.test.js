'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const load=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const server=load('server.js'),client=load('index_script.js');
const relay=load('assets/swapp-browser-http-live.js');
test('browser live prioritizes active native media over persisted OBS iframe URLs',()=>{
 const start=client.indexOf('async function renderChannel()');
 const stop=client.indexOf('function channelBadgesFor(',start);
 const section=client.slice(start,stop);
 assert.match(section,/const nativeBrowserLive=/);
 assert.match(section,/!liveRoom\.local_agent/);
 assert.match(section,/const publicLocalPlayerUrl=/);
 assert.match(section,/publicLocalPlayerUrl \? `<iframe/);
 assert.match(section,/if\(!publicLocalPlayerUrl\)/);
});
test('Hostinger live signaling uses HTTP polling and does not declare media playing from a socket ack',()=>{
 assert.match(client,/transports:\['polling'\],upgrade:false/);
 assert.match(client,/swappVerifyRemoteFrames/);
 assert.match(client,/globalThis\.SwappBrowserRelay\?\.startPublisher/);
 assert.match(client,/swappTryHttpPlayback\(\)/);
});
test('video HTTP fallback is bounded, authenticated, and has no VOD persistence',()=>{
 assert.match(server,/const nativeBrowserRelays = new Map\(\)/);
 assert.match(server,/SWAPP_RELAY_MAX_BYTES = 10 \* 1024 \* 1024/);
 assert.match(server,/getSessionIdentity\(req\)\.local/);
 assert.match(server,/String\(user\.id\)!==String\(live\.hostUserId\)/);
 assert.match(server,/app\.post\('\/api\/native\/browser-relay\/:room\/chunk'/);
 assert.match(server,/express\.raw\(\{type:'application\/octet-stream',limit:'2mb'\}\)/);
 assert.match(server,/app\.get\('\/api\/native\/browser-relay\/:room\/state'/);
 assert.match(server,/app\.get\('\/api\/native\/browser-relay\/:room\/segment\/:seq'/);
 assert.match(server,/nativeBrowserRelays\.delete\(room\)/);
 assert.doesNotMatch(relay,/Livepeer|Cloudflare|apiKey/);
});
test('HTTP publisher sends ordered media fragments and stops on command',async()=>{
 const calls=[];
 let current;
 class FakeMediaRecorder{
  constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';this.handlers={};current=this}
  static isTypeSupported(type){return type.includes('webm')}
  addEventListener(name,fn){this.handlers[name]=fn}
  start(){this.state='recording'}
  stop(){this.state='inactive'}
  push(){this.handlers.dataavailable({data:{size:3}})}
 }
 const context={
  window:{},
  MediaRecorder:FakeMediaRecorder,
  fetch:async(url,opts)=>{calls.push({url,seq:opts.headers['X-Swapp-Relay-Seq']});return{ok:true}},
  URL,Promise,console,setTimeout,clearTimeout
 };
 vm.runInNewContext(relay,context);
 context.window.SwappBrowserRelay.startPublisher('vnhz',{});
 current.push();
 await new Promise(resolve=>setImmediate(resolve));
 current.push();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls.map(x=>x.seq),['0','1']);
 assert.ok(calls.every(x=>x.url.endsWith('/vnhz/chunk')));
 context.window.SwappBrowserRelay.stopPublisher();
 assert.equal(current.state,'inactive');
});
test('desktop builds a native .exe without an end-user console and writes HLS outside asar',()=>{
 const pkg=JSON.parse(load('local-agent/package.json'));
 assert.match(pkg.scripts['dist:win'],/electron-builder/);
 assert.ok(pkg.build.win.target.some(x=>x.target==='nsis'));
 assert.ok(pkg.build.win.target.some(x=>x.target==='portable'));
 assert.match(load('local-agent/main.js'),/BrowserWindow/);
 assert.match(load('local-agent/main.js'),/waitForLocalServer/);
 assert.match(load('local-agent/server.js'),/SwappLocal', 'media'/);
});
