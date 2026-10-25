'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
function route(marker){
 const at=source.indexOf(marker);
 assert.ok(at>=0,'route absent '+marker);
 const end=source.indexOf('\n});',at);
 assert.ok(end>at,'route terminator missing '+marker);
 return source.slice(at,end+4);
}
function output(){
 return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
  status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
}
function sandbox(){
 const callbacks={};
 const creator={id:'creator-account',login:'vnhz',display_name:'Streamer',
  current_live_title:'Gaming avec OBS',current_live_category:'Gaming',
  channel_public:true,oryon_local_provider:'obs-hls',local_agent_live:false};
 const media=[{login:'vnhz',player_url:'/api/oryon/local-relay/vnhz/player',last_segment_at:Date.now()}];
 const dependencies={
  app:{get(path,fn){callbacks[path]=fn}},
  nativeLiveRooms:new Map(),swappDirectRelay:{activeStreams:()=>media},
  readOryonUsers:()=>({users:[creator]}),
  isOryonLiveSignalFresh:()=>false,computeNativeOryonScore:()=>0,
  swappChannelPathForLogin:login=>'/'+login,process:{env:{}},Date,
  ORYON_USERS_READY:Promise.resolve(),sweepStaleOryonLiveSignals:async()=>{},
  normalizeOryonLogin:x=>x,ensureOryonUserShape:()=>{},
  publicOryonChannelUser:x=>({...x}),
  swappPublicBase:()=> 'https://swapp.tv'
 };
 for(const marker of ["app.get('/api/native/lives'","app.get('/api/oryon/profile/:login'",
  "app.get('/api/oryon/channel/:login/live-ping'"]){
  new Function(...Object.keys(dependencies),route(marker))(...Object.values(dependencies));
 }
 return {callbacks,creator,media};
}
test('verified OBS HLS appears in the channel feed before persisted account heartbeat',()=>{
 const t=sandbox(),res=output();
 t.callbacks['/api/native/lives']({},res);
 assert.equal(res.body.success,true);
 assert.equal(res.body.items.length,1);
 assert.equal(res.body.items[0].transport,'obs-hls');
 assert.equal(res.body.items[0].local_agent,true);
 assert.equal(res.body.items[0].media_verified,true);
 assert.equal(res.body.items[0].player_url,'/api/oryon/local-relay/vnhz/player');
});
test('public profile gives vnhz a real HLS player URL without waiting for an agent heartbeat',async()=>{
 const t=sandbox(),res=output();
 await t.callbacks['/api/oryon/profile/:login']({params:{login:'vnhz'}},res);
 assert.equal(res.body.success,true);
 assert.equal(res.body.user.is_live,true);
 assert.equal(res.body.user.oryon_local_player_url,'/api/oryon/local-relay/vnhz/player');
 assert.equal(res.body.user.oryon_local_status_url,'/api/oryon/local-relay/vnhz/state');
});
test('once HLS media stops, stale OBS agent status does not invent a working stream',async()=>{
 const t=sandbox();
 t.media.length=0;
 t.creator.local_agent_live=true;
 const prof=output();
 await t.callbacks['/api/oryon/profile/:login']({params:{login:'vnhz'}},prof);
 assert.equal(prof.body.user.oryon_local_player_url,'');
 assert.equal(prof.body.user.is_live,false);
 const status=output();
 await t.callbacks['/api/oryon/channel/:login/live-ping']({params:{login:'vnhz'}},status);
 assert.equal(status.body.source,'offline');
});
