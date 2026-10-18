'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sniff,createDirectAudioRouter,MAX_BYTES,MAX_DURATION,RETENTION_DAYS}=
 require('../modules/swapp-social-direct-audio');
const {installPrivateCalls}=require('../modules/swapp-social-private-calls');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const UUID='123e4567-e89b-42d3-a456-426614174000';
const webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(30)]);
const ogg=Buffer.from('OggS'+'.'.repeat(30));
const mp4=Buffer.from('....ftyp'+'.'.repeat(30));
const accounts=[
 {id:'user1',login:'playerone'},
 {id:'user2',login:'playertwo'},
 {id:'user3',login:'intruder'}
];
function fakeResponse(){
 return {statusCode:200,headers:{},jsonBody:null,bytes:null,
  set(name,value){this.headers[name]=value;return this},
  status(status){this.statusCode=status;return this},
  json(payload){this.jsonBody=payload;return this},
  end(bytes){this.bytes=bytes;return this}
 };
}
function routerFixture(){
 const routes=new Map(),middleware=[];
 const router={
  use(fn){middleware.push(fn)},
  get(name,fn){routes.set('GET '+name,fn)},
  post(name,...handlers){routes.set('POST '+name,handlers[handlers.length-1])},
  delete(name,fn){routes.set('DELETE '+name,fn)}
 };
 const express={Router:()=>router,raw:()=>()=>{}};
 const sql=[];
 const db={async execute(statement,args){
  sql.push({statement,args});
  if(statement.startsWith('SELECT mime,audio_data')){
   return [[args[2]==='user1'||args[2]==='user2'?{
    mime:'audio/webm',audio_data:webm,byte_length:webm.length
   }:null].filter(Boolean)];
  }
  if(statement.startsWith('DELETE FROM swapp_social_voice_notes WHERE id=')){
   return [{affectedRows:args[1]==='user1'?1:0}];
  }
  if(statement.includes('COUNT(*)'))return [[{total:0}]];
  return [[]];
 }};
 createDirectAudioRouter({
  express,restoreSession:async request=>request.user,getPool:()=>db,
  lookupLocalUser:handle=>accounts.find(u=>u.login===handle)
 });
 async function invoke(method,route,{user=accounts[0],origin='https://swapp.tv',params={},query={},body=webm,headers={}}={}){
  const req={
   method,params,query,body,user,session:{},get(key){
    return key==='origin'?origin:key==='content-type'?'audio/webm':
     key==='x-swapp-audio-duration'?'4':headers[key];
   }
  };
  const res=fakeResponse();
  let proceed=false;
  await middleware[0](req,res,()=>{proceed=true});
  if(proceed)await routes.get(method+' '+route)(req,res);
  return res;
 }
 return {invoke,sql};
}
test('media verification accepts WebM/Opus, Ogg and MP4 headers only',()=>{
 assert.equal(sniff(webm,'audio/webm'),true);
 assert.equal(sniff(ogg,'audio/ogg'),true);
 assert.equal(sniff(mp4,'audio/mp4'),true);
 assert.equal(sniff(Buffer.alloc(30),'audio/webm'),false);
 assert.equal(sniff(Buffer.from('<script>alert(1)</script>'),'audio/mp4'),false);
 assert.equal(MAX_BYTES,768*1024);
 assert.equal(MAX_DURATION,30);
 assert.equal(RETENTION_DAYS,30);
});
test('audio streaming is never publicly available and checks both participants',async()=>{
 const {invoke}=routerFixture();
 const route='/media/:id';
 const anon=await invoke('GET',route,{user:null,params:{id:UUID}});
 assert.equal(anon.statusCode,401);
 const outsider=await invoke('GET',route,{user:accounts[2],params:{id:UUID}});
 assert.equal(outsider.statusCode,404);
 const owner=await invoke('GET',route,{user:accounts[0],params:{id:UUID}});
 assert.equal(owner.statusCode,200);
 assert.deepEqual(owner.bytes,webm);
 assert.equal(owner.headers['X-Content-Type-Options'],'nosniff');
 assert.match(owner.headers['Cache-Control'],/no-store/);
});
test('cross-origin voice upload is rejected, and only sender can delete',async()=>{
 const {invoke}=routerFixture();
 const reject=await invoke('POST','/notes/:handle',{
  origin:'https://evil.example',params:{handle:'playertwo'}
 });
 assert.equal(reject.statusCode,403);
 const outsider=await invoke('DELETE','/notes/:id',{user:accounts[2],params:{id:UUID}});
 assert.equal(outsider.statusCode,404);
 const sender=await invoke('DELETE','/notes/:id',{user:accounts[0],params:{id:UUID}});
 assert.equal(sender.statusCode,200);
});
test('outbound audio notes store only the identified recipient and capped clip',async()=>{
 const {invoke,sql}=routerFixture();
 const res=await invoke('POST','/notes/:handle',{params:{handle:'playertwo'}});
 assert.equal(res.statusCode,201);
 const insert=sql.find(entry=>entry.statement.startsWith('INSERT INTO swapp_social_voice_notes'));
 assert.equal(insert.args[1],'user1');
 assert.equal(insert.args[2],'user2');
 assert.equal(insert.args[8],webm);
 const self=await invoke('POST','/notes/:handle',{params:{handle:'playerone'}});
 assert.equal(self.statusCode,400);
});

function callFixture(){
 const callbacks={},sockets=new Map(),broadcast=[];
 const voice={
  sockets,
  on(type,fn){callbacks[type]=fn}
 };
 const fakeSocket=(id,user)=>{
  const events={},out=[];
  const socket={
   id,connected:true,data:{voiceUser:user},
   on(type,fn){events[type]=fn},
   emit(type,data){out.push({type,data})},
   events,out
  };
  sockets.set(id,socket);
  callbacks.connection(socket);
  return socket;
 };
 installPrivateCalls(voice,{lookupLocalUser:handle=>accounts.find(u=>u.login===handle),
  clock:()=>100000});
 return {fakeSocket,broadcast};
}
test('calls are offered only to online SWAPP members and need consent',()=>{
 const {fakeSocket}=callFixture();
 const caller=fakeSocket('sid1',{id:'user1',handle:'playerone'});
 let offline;
 caller.events['call:invite']({handle:'playertwo'},value=>{offline=value});
 assert.equal(offline.error,'offline');
 const receiver=fakeSocket('sid2',{id:'user2',handle:'playertwo'});
 let invited;
 caller.events['call:invite']({handle:'playertwo'},value=>{invited=value});
 assert.equal(invited.ok,true);
 assert.equal(receiver.out.find(e=>e.type==='call:incoming').data.callId,invited.callId);
 let declined;
 receiver.events['call:answer']({callId:invited.callId,accept:false},result=>{declined=result});
 assert.equal(declined.ok,true);
 assert.equal(caller.out.find(e=>e.type==='call:ended').data.reason,'declined');
});
test('ICE and SDP only reach the accepted call partner',()=>{
 const {fakeSocket}=callFixture();
 const caller=fakeSocket('sid1',{id:'user1',handle:'playerone'});
 const receiver=fakeSocket('sid2',{id:'user2',handle:'playertwo'});
 const stranger=fakeSocket('sid3',{id:'user3',handle:'intruder'});
 let id;
 caller.events['call:invite']({handle:'playertwo'},result=>{id=result.callId});
 let accepted;
 receiver.events['call:answer']({callId:id,accept:true},result=>{accepted=result});
 assert.equal(accepted.ok,true);
 stranger.events['call:signal']({callId:id,kind:'offer',data:{type:'offer'}});
 assert.equal(receiver.out.filter(e=>e.type==='call:signal').length,0);
 caller.events['call:signal']({callId:id,kind:'offer',data:{type:'offer',sdp:'audio'}});
 assert.equal(receiver.out.filter(e=>e.type==='call:signal').length,1);
 caller.events['call:end']({callId:id});
 assert.equal(receiver.out.find(e=>e.type==='call:ended').data.reason,'ended');
});
test('private audio controls are integrated into the conversation and do not auto-record',()=>{
 const ui=read('assets/swapp-social-native/dm-audio.js');
 const calls=read('assets/swapp-social-native/dm-calls.js');
 const views=read('assets/swapp-social-native/views.js');
 const app=read('assets/swapp-social-native/app.js');
 const hubs=read('modules/swapp-hubs.js');
 const schema=read('modules/swapp-social-mysql-schema.js');
 assert.match(ui,/\[data-voice-start\]/);
 assert.match(ui,/getUserMedia/);
 assert.match(ui,/\[data-voice-send\]/);
 assert.match(ui,/URL\.revokeObjectURL/);
 assert.match(calls,/\[data-call-accept\]/);
 assert.match(calls,/call:answer/);
 assert.match(calls,/getUserMedia/);
 assert.match(views,/renderVoiceNote/);
 assert.match(views,/data-call-handle/);
 assert.match(app,/setupVoiceNotes/);
 assert.match(app,/setupDirectCalls/);
 assert.match(hubs,/20261018-direct-audio-v1/);
 assert.match(schema,/004_swapp_social_voice_notes\.sql/);
});
