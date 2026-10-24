'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const client=fs.readFileSync(path.join(root,'index_script.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
function extract(start,end){
 const i=client.indexOf(start),j=client.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'transport section missing: '+start);
 return client.slice(i,j);
}
function harness(){
 const listeners=new Map(),events=[],peers=[];
 class FakePeer{
  constructor(configuration){this.configuration=configuration;this.signalingState='stable';this.connectionState='new';this.added=[];peers.push(this)}
  async setRemoteDescription(d){this.remoteDescription=d;this.signalingState='stable'}
  async createAnswer(){return{type:'answer',sdp:'mock'}}
  async createOffer(){return{type:'offer',sdp:'mock'}}
  async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable'}
  async addIceCandidate(c){this.added.push(c)}
  addTrack(track){(this.tracks??=[]).push(track)}
  close(){this.connectionState='closed'}
 }
 const sock={connected:true,on(name,fn){listeners.set(name,[...(listeners.get(name)||[]),fn])},
  emit(name,payload){events.push({name,payload})},connect(){this.connected=true}};
 const state={session:{local:null},socket:null,room:'vnhz',watchRoom:'vnhz',view:'channel',stream:null,peers:{}};
 const context={state,io:()=>sock,
  $:()=>null,api:async()=>({success:true,turnConfigured:false,iceServers:[{urls:'stun:stun.l.google.com:19302'}]}),
  RTCPeerConnection:FakePeer,setTimeout,clearTimeout,
  document:{createElement:()=>({dataset:{},style:{}}),querySelector:()=>null},
  toast(){},updateLiveUi(){},console};
 vm.runInNewContext(extract('function swappVideoNotice(','async function createScreenCameraStream('),context);
 context.setupSocket();
 async function send(name,payload){for(const fn of listeners.get(name)||[])await fn(payload)}
 return {context,state,sock,events,peers,send};
}
test('ICE trickle received before offer is buffered and applied after remote SDP',async()=>{
 const h=harness();
 await h.send('native:ice',{from:'host-1',room:'vnhz',candidate:{candidate:'test-ice'}});
 assert.equal(h.state.peerPendingIce['host-1'].length,1);
 await h.send('native:offer',{from:'host-1',room:'vnhz',offer:{type:'offer',sdp:'mock'}});
 assert.equal(h.state.peers['host-1'].added.length,1);
 assert.equal(h.events.filter(e=>e.name==='native:answer').length,1);
});
test('simultaneous viewer join and repeated request do not create competing SDP offers',async()=>{
 const h=harness();
 h.state.stream={getTracks:()=>[{kind:'video'}]};
 h.state.watchRoom=null;h.state.nativeLiveConfirmed=true;
 const data={room:'vnhz',viewerId:'guest-1'};
 // Event handlers intentionally schedule offers without awaiting them.
 await h.send('native:viewer',data);
 await h.send('native:request-offer',data);
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.equal(h.events.filter(e=>e.name==='native:offer').length,1);
});
test('viewers report playing video, not mere socket connection; TURN readiness exposed safely',()=>{
 assert.match(client,/native:viewer:media/);
 assert.match(client,/v\.onplaying=\(\)=>/);
 assert.match(client,/swapp-unmute-stream/);
 assert.match(client,/peerPendingIce/);
 assert.match(client,/peerOfferBusy/);
 assert.match(client,/remoteRetryCount>3/);
 assert.match(client,/id="streamViewerReadiness"/);
 assert.match(server,/playing_viewers: r\?\.mediaViewers/);
 assert.match(server,/socket\.data\.nativeRole!=='viewer'/);
 assert.match(server,/socket\.data\.nativeRoom!==room/);
 assert.match(server,/turnConfigured:/);
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(index,/index_script\.js\?v=20261024-browser-http-fallback-v5/);
});
