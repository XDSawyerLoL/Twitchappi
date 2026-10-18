'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createAudioPrivacy}=require('../modules/swapp-social-audio-privacy');
const {createDirectAudioRouter}=require('../modules/swapp-social-direct-audio');
const {installPrivateCalls}=require('../modules/swapp-social-private-calls');
const users=[
 {id:'ua',login:'alice'},
 {id:'ub',login:'bob'},
 {id:'uc',login:'charlie'}
];
function fixture(){
 const blocks=new Set(),operations=[];
 const pool={async execute(sql,args){
  operations.push({sql,args});
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_audio_blocks')){
   blocks.add(args[0]+':'+args[1]);return [{affectedRows:1}];
  }
  if(sql.startsWith('SELECT blocker_id FROM swapp_social_audio_blocks')){
   const denied=blocks.has(args[0]+':'+args[1])||blocks.has(args[2]+':'+args[3]);
   return [denied?[{blocker_id:'ua'}]:[]];
  }
  if(sql.startsWith('SELECT mime,audio_data,byte_length,sender_id,recipient_id')){
   return [[{mime:'audio/webm',audio_data:Buffer.from([0x1a,0x45,0xdf,0xa3,...new Array(20).fill(0)]),
    sender_id:'ua',recipient_id:'ub'}]];
  }
  return [[]];
 }};
 const privacy=createAudioPrivacy({getPool:()=>pool,lookupLocalUser:h=>users.find(u=>u.login===h)});
 return {privacy,pool,operations,blocks};
}
test('block written once and enforced in either direction across two accounts',async()=>{
 const {privacy,operations}=fixture();
 assert.equal(await privacy.allowed('ua','ub'),true);
 await privacy.block(users[0],users[1]);
 assert.equal(await privacy.allowed('ua','ub'),false);
 assert.equal(await privacy.allowed('ub','ua'),false);
 assert.equal(await privacy.allowed('ua','uc'),true);
 assert.equal(operations.filter(x=>x.sql.startsWith('INSERT IGNORE')).length,1);
});
test('audio permissions fail closed when storage is unavailable',async()=>{
 const policy=createAudioPrivacy({getPool:()=>null,lookupLocalUser:()=>null});
 await assert.rejects(policy.allowed('ua','ub'),/audio_privacy_unavailable/);
 assert.equal(await policy.block(users[0],users[1]),true);
});
test('blocked pairs cannot send or browse direct voice notes',async()=>{
 const {privacy,pool}=fixture();
 await privacy.block(users[0],users[1]);
 const routes={};
 const express={Router:()=>({
  use(fn){routes.guard=fn},
  get(name,fn){routes['GET '+name]=fn},
  post(name,...middleware){routes['POST '+name]=middleware.at(-1)},
  delete(name,fn){routes['DELETE '+name]=fn}
 }),raw:()=>()=>{}};
 createDirectAudioRouter({
  express,restoreSession:async req=>req.user,getPool:()=>pool,
  lookupLocalUser:h=>users.find(u=>u.login===h),isAllowedPair:privacy.allowed
 });
 async function invoke(method,route,options={}){
  const user=options.user||users[0],req={
   method,params:options.params||{},query:options.query||{},user,session:{},
   get(name){if(name==='origin')return'https://swapp.tv';return name==='content-type'?'audio/webm':'4'},
   body:Buffer.from([0x1a,0x45,0xdf,0xa3,...new Array(30).fill(0)])
  };
  const res={statusCode:200,status(code){this.statusCode=code;return this},
   json(data){this.payload=data;return this},
   set(){return this},end(data){this.bytes=data}};
  let permitted=false;await routes.guard(req,res,()=>{permitted=true});
  if(permitted)await routes[method+' '+route](req,res);
  return res;
 }
 const list=await invoke('GET','/notes',{query:{peer:'bob'}});
 assert.equal(list.statusCode,403);
 assert.equal(list.payload.error,'blocked');
 const upload=await invoke('POST','/notes/:handle',{params:{handle:'bob'}});
 assert.equal(upload.statusCode,403);
 const media=await invoke('GET','/media/:id',{params:{id:'123e4567-e89b-42d3-a456-426614174000'}});
 assert.equal(media.statusCode,404);
});
test('private calls do not ring blocked users and can terminate on block',async()=>{
 const {privacy}=fixture();
 const events={},sockets=new Map();
 const voice={sockets,on(name,fn){events[name]=fn}};
 const calls=installPrivateCalls(voice,{
  lookupLocalUser:h=>users.find(u=>u.login===h),
  isAllowedPair:privacy.allowed,clock:()=>100000
 });
 function socket(id,user){
  const callbacks={},sent=[];
  const target={id,connected:true,data:{voiceUser:{id:user.id,handle:user.login}},
   on(name,fn){callbacks[name]=fn},
   emit(name,data){sent.push({name,data})},callbacks,sent
  };
  sockets.set(id,target);events.connection(target);return target;
 }
 const alice=socket('s1',users[0]),bob=socket('s2',users[1]);
 await privacy.block(users[1],users[0]);
 let denied;
 await alice.callbacks['call:invite']({handle:'bob'},result=>{denied=result});
 assert.equal(denied.error,'blocked');
 assert.equal(bob.sent.filter(x=>x.name==='call:incoming').length,0);
 assert.equal(calls.size,0);
});
test('proxy wires block registration before the upstream request',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','modules/swapp-social-native-proxy.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(source,/await recordAudioBlock\(swappUser,target\)/);
 assert.ok(source.indexOf('await recordAudioBlock(swappUser,target)')<
  source.lastIndexOf('const endpoint=SOCIAL_ORIGIN+'));
 assert.match(server,/endCallsBetween\?\.\(actor\.id,target\.id\)/);
});
