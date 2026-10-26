'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','index_script.js'),'utf8');
const slice=(start,end)=>{
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source boundary missing: '+start);
 return src.slice(a,b);
};
test('native WebRTC player overrides stale OBS local player address',()=>{
 const factory=new Function('swappSafeLocalPlayerUrl','esc','state','normalizePeerTubeEmbed',
  slice('function fwLiveMediaHtml(','async function renderChannel(){')+'return fwLiveMediaHtml;');
 const media=factory(x=>x,x=>String(x),{stream:null},()=>null);
 const channel={oryon_local_player_url:'https://old-obs.example/stream',login:'vnhz'};
 const browser=media(channel,false,true,'','browser-webrtc');
 assert.match(browser,/id="remoteVideo"/);
 assert.doesNotMatch(browser,/<iframe/);
 const obs=media(channel,false,true,'','local-agent');
 assert.match(obs,/<iframe/);
 assert.doesNotMatch(obs,/id="remoteVideo"/);
});
test('actual public channel renderer uses server-confirmed transport and requests browser offers',()=>{
 const start=src.lastIndexOf('async function renderChannel(){');
 const end=src.indexOf('\n}\n',start);
 const channel=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(channel,/livePing\?\.source==='browser-webrtc'/);
 assert.match(channel,/const browserLive=/);
 assert.match(channel,/const relayState=await api/);
 assert.match(channel,/const verifiedHls=/);
 assert.match(channel,/const agentLive=!!verifiedHls \|\| \(!browserLive/);
 assert.match(channel,/!livePing\?\.success/);
 assert.match(channel,/fwLiveMediaHtml\(\{\.\.\.p,oryon_local_player_url:livePlayerUrl\}/);
 assert.match(channel,/transport==='browser-webrtc' \|\| !livePlayerUrl/);
 assert.match(channel,/state\.remoteConnectionWatchdog=setTimeout/);
});
test('viewer reports success only after a real decoded video frame',()=>{
 let nextFrame;
 const events=[];
 const state={stream:null,watchRoom:'vnhz',room:'vnhz',peers:{},
  socket:{connected:true,emit:(n,p)=>events.push({n,p})}};
 const pc={};state.peers['host']=pc;
 const fn=new Function('state','$','setTimeout','clearTimeout','swappVideoNotice',
  slice('function swappSetVideoPlayback(','function swappStartRemotePlayback(){')+
  'return swappVerifyRemoteFrames;');
 const verify=fn(state,()=>({style:{}}),()=>1,()=>{},()=>{});
 const video={videoWidth:1920,isConnected:true,
  requestVideoFrameCallback:(callback)=>nextFrame=callback};
 verify(pc,video,'host');
 assert.equal(events.length,0,'no video confirmation merely for attached remote track');
 nextFrame(0,{presentedFrames:1});
 assert.equal(state.remotePlaying,true);
 assert.equal(events.filter(e=>e.n==='native:viewer:media'&&e.p.playing).length,1);
});
test('new live code is cache-busted',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.match(html,/index_script\.js\?v=20261026-hls-direct-channel-v8/);
});
