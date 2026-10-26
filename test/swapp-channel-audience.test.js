'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installChannelAudience}=require('../modules/swapp-channel-audience');
function setup(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-channel-points-'));
 const storageFile=path.join(folder,'wallet.json'),now={value:Date.UTC(2026,9,25,12)};
 const sessions={
  creator:{oryonUser:{id:'c1',login:'creator'}},
  visitor:{oryonUser:{id:'v1',login:'visitor'}},
  unrelated:{oryonUser:{id:'v2',login:'other'}}
 };
 const users={creator:{id:'c1',login:'creator',display_name:'Streamer'},
  visitor:{id:'v1',login:'visitor',display_name:'Spectateur'},
  other:{id:'v2',login:'other',display_name:'Autre'}};
 const live={host:'socket-host',viewers:new Set(['sock-1']),mediaViewers:new Set(['sock-1'])};
 const handlers={},connections=[],emitted=[],sockets=new Map();
 const app={get(path,fn){handlers[path]=fn},post(path,fn){handlers['POST '+path]=fn}};
 const io={sockets:{sockets},
  on(name,fn){if(name==='connection')connections.push(fn)}};
 const model=installChannelAudience({app,io,getUser:name=>users[name],
  getNativeRoom:name=>name==='creator'?live:null,
  isLocalLive:()=>false,storageFile,clock:{now:()=>now.value}});
 function viewer(which='visitor',id='sock-1'){
  const events={},signals=[],sock={id,request:{session:sessions[which]},
   data:{nativeRoom:'creator',nativeRole:'viewer'},
   on(name,fn){events[name]=fn},emit(name,data){signals.push({name,data})}};
  sockets.set(id,sock);connections.forEach(fn=>fn(sock));
  return {sock,events,signals};
 }
 function read(url,who){
  const response={code:200,set(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
  handlers[url]({params:{room:'creator'},session:sessions[who]||{}},response);
  return response;
 }
 return {now,model,viewer,read,sessions,sockets,live,storageFile,folder};
}
test('only channel owner can view authenticated channel roster',t=>{
 const s=setup();t.after(()=>fs.rmSync(s.folder,{recursive:true,force:true}));
 const v=s.viewer();
 assert.equal(s.read('/api/swapp/channel-audience/:room','visitor').code,403);
 const owner=s.read('/api/swapp/channel-audience/:room','creator');
 assert.equal(owner.code,200);
 assert.equal(owner.data.users.length,1);
 assert.equal(owner.data.users[0].login,'visitor');
 assert.equal(owner.data.users[0].watching,false);
});
test('points accrue only after minute of active heartbeats and persist',t=>{
 const s=setup();t.after(()=>fs.rmSync(s.folder,{recursive:true,force:true}));
 const v=s.viewer(),data={room:'creator',playing:true,visible:true,player:'html5'};
 for(let i=0;i<4;i++){v.events['swapp:channel:watch'](data);s.now.value+=20000}
 assert.equal(s.model.lookup('creator','v1').points,5);
 assert.equal(JSON.parse(fs.readFileSync(s.storageFile,'utf8')).rooms.creator.v1.points,5);
 assert.equal(v.signals.filter(e=>e.name==='swapp:channel:points').length,1);
 assert.equal(s.read('/api/swapp/channel-points/:room','visitor').data.points,5);
});
test('tab hidden, missing playback and wrong room cannot earn points',t=>{
 const s=setup();t.after(()=>fs.rmSync(s.folder,{recursive:true,force:true}));
 const v=s.viewer(),ok={room:'creator',playing:true,visible:true,player:'html5'};
 v.events['swapp:channel:watch'](ok);s.now.value+=20000;
 v.events['swapp:channel:watch']({...ok,visible:false});s.now.value+=20000;
 for(let i=0;i<3;i++){v.events['swapp:channel:watch']({...ok,room:'another'});s.now.value+=20000}
 v.events['swapp:channel:watch'](ok);
 assert.equal(s.model.lookup('creator','v1'),null);
});
test('5 points per minute capped at 300 per account and channel per UTC day',t=>{
 const s=setup();t.after(()=>fs.rmSync(s.folder,{recursive:true,force:true}));
 const v=s.viewer(),signal={room:'creator',playing:true,visible:true,player:'html5'};
 for(let i=0;i<400;i++){v.events['swapp:channel:watch'](signal);s.now.value+=20000}
 assert.equal(s.model.lookup('creator','v1').points,300);
 assert.equal(s.model.lookup('creator','v1').earnedToday,300);
});
test('room is authenticated against session and decoder signal for WebRTC',t=>{
 const s=setup();t.after(()=>fs.rmSync(s.folder,{recursive:true,force:true}));
 const v=s.viewer();
 s.live.mediaViewers.clear();
 for(let i=0;i<7;i++){v.events['swapp:channel:watch']({room:'creator',playing:true,visible:true,player:'html5'});s.now.value+=20000}
 assert.equal(s.model.lookup('creator','v1'),null);
});
