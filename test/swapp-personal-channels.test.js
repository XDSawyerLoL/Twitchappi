'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {inviteFor,verifyInvite,newNonce,accessRoom}=require('../modules/swapp-social-room-access');
const {createSocialMysqlInteractions}=require('../modules/swapp-social-mysql');
const ROOM='11111111-1111-4111-8111-111111111111',SECRET='a-random-development-fixture-secret-of-sufficient-length';
test('invite links use an unguessable keyed signature and rotate without changing membership',()=>{
 const nonce=newNonce(),next=newNonce();
 assert.notEqual(nonce,next);
 const invite=inviteFor(ROOM,nonce,SECRET);
 assert.equal(verifyInvite(invite,nonce,SECRET),ROOM);
 assert.equal(verifyInvite(invite,next,SECRET),null);
 assert.equal(verifyInvite(invite,nonce,'different-secret-of-sufficient-length'),null);
 assert.equal(verifyInvite('../bad',nonce,SECRET),null);
});
test('room access distinguishes a public channel from private memberships',async()=>{
 const lookup=(roomId,userId)=>({execute:async()=>{
  if(roomId==='none')return [[]];
  if(roomId==='public')return [[{id:roomId,private_room:null,private_member:null}]];
  return [[{id:roomId,private_room:'personal',private_member:userId==='member'?'member':null}]];
 }});
 assert.equal(await accessRoom(lookup('private','guest'),'11111111-1111-4111-8111-111111111111','guest'),false);
 assert.equal(await accessRoom(lookup('private','member'),ROOM,'member'),true);
 assert.equal(await accessRoom(lookup('private','member'),'/etc/passwd','member'),false);
});
function harness(){
 const routes=new Map(),middlewares=[],rooms=new Map(),privateRooms=new Map(),members=new Set();
 const router={use(fn){middlewares.push(fn)}};
 for(const method of ['get','post','put','delete'])router[method]=(path,handler)=>routes.set(method.toUpperCase()+' '+path,handler);
 const express={Router:()=>router};
 const pool={
  async execute(sql,args=[]){
   if(sql.startsWith('SELECT room_id FROM swapp_social_private_rooms WHERE owner_id='))return [[...privateRooms.values()].filter(x=>x.owner_id===args[0]).map(x=>({room_id:x.room_id}))];
   if(sql.startsWith('SELECT id FROM swapp_social_rooms WHERE owner_id='))return [[]];
   if(sql.startsWith('INSERT INTO swapp_social_rooms ')){
    const [id,owner_id,name,game,created_at]=args;rooms.set(id,{id,owner_id,name,game,created_at});return [[],[]];
   }
   if(sql.startsWith('INSERT INTO swapp_social_private_rooms ')){
    const [room_id,owner_id,invite_nonce,created_at]=args;privateRooms.set(room_id,{room_id,owner_id,invite_nonce,created_at});return [[],[]];
   }
   if(sql.startsWith('INSERT INTO swapp_social_private_members ')||sql.startsWith('INSERT IGNORE INTO swapp_social_private_members ')){
    members.add(args[0]+'|'+args[1]);return [[],[]];
   }
   if(sql.startsWith('SELECT p.room_id,p.owner_id,p.invite_nonce,r.name')){
    const p=privateRooms.get(args[0]),r=rooms.get(args[0]);
    return [[p&&r&&p.owner_id===args[1]?{...p,...r}:undefined].filter(Boolean)];
   }
   if(sql.startsWith('UPDATE swapp_social_private_rooms ')){
    const p=privateRooms.get(args[1]);if(p&&p.owner_id===args[2])p.invite_nonce=args[0];return [[],[]];
   }
   if(sql.startsWith('SELECT p.invite_nonce,r.id,r.name')){
    const p=privateRooms.get(args[0]),r=rooms.get(args[0]);
    return [[p&&r?{...p,...r}:undefined].filter(Boolean)];
   }
   if(sql.startsWith('SELECT COUNT(*) AS total FROM swapp_social_private_members WHERE room_id=')){
    return [[{total:[...members].filter(x=>x.startsWith(args[0]+'|')).length}]];
   }
   if(sql.startsWith('SELECT user_id FROM swapp_social_private_members WHERE room_id=')){
    return [[members.has(args[0]+'|'+args[1])?{user_id:args[1]}:undefined].filter(Boolean)];
   }
   if(sql.startsWith('SELECT r.id, p.room_id AS private_room')){
    const r=rooms.get(args[1]),p=privateRooms.get(args[1]);
    return [[r?{id:r.id,private_room:p?.room_id||null,private_member:members.has(r.id+'|'+args[0])?args[0]:null}:undefined].filter(Boolean)];
   }
   if(sql.startsWith('SELECT r.id,r.name,r.game,r.created_at,p.room_id AS personal_room')){
    return [[...rooms.values()].filter(r=>!privateRooms.has(r.id)||members.has(r.id+'|'+args[0])).map(r=>({
     ...r,personal_room:privateRooms.has(r.id)?r.id:null,
     personal_owner:privateRooms.get(r.id)?.owner_id||null,message_count:0
    }))];
   }
   if(sql.startsWith('SELECT id,handle,body,created_at FROM swapp_social_room_messages'))return [[]];
   throw Error('Unhandled SQL: '+sql.slice(0,110));
  },
  async getConnection(){
   return {execute:this.execute.bind(this),async beginTransaction(){},async commit(){},async rollback(){},release(){}};
  }
 };
 createSocialMysqlInteractions({express,restoreSession:async req=>req.actor,pool,clock:()=>1781800000000,inviteSecret:SECRET});
 async function send(method,path,actor,{body={},params={},origin='https://swapp.tv'}={}){
  let code=200,payload=null,headers={};
  const res={headersSent:false,set(k,v){headers[k]=v;return this},
   status(v){code=v;return this},json(v){payload=v;return this}};
  const req={method,actor,body,params,query:{},session:{},get:key=>key==='origin'?origin:''};
  for(const mw of middlewares){
   let advanced=false;
   await mw(req,res,()=>{advanced=true});
   if(!advanced)return {code,payload,headers};
  }
  const handler=routes.get(method+' '+path);
  assert.ok(handler,'Missing route '+method+' '+path);
  await handler(req,res);
  return {code,payload,headers};
 }
 return {send,rooms,privateRooms,members};
}
const alice={id:'u-alice',login:'alice'},bob={id:'u-bob',login:'bob'},eve={id:'u-eve',login:'eve'};
test('private link grants SWAPP account access to chat only after a valid invitation',async()=>{
 const h=harness();
 const created=await h.send('POST','/rooms/personal',alice,{body:{name:'Mes potes',game:'Minecraft'}});
 assert.equal(created.code,201);
 assert.equal(created.payload.room.private,true);
 assert.match(created.payload.invite,/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
 const id=created.payload.room.id;
 assert.equal((await h.send('GET','/rooms',bob)).payload.rooms.length,0,'not advertised to strangers');
 assert.equal((await h.send('GET','/rooms/:id/messages',bob,{params:{id}})).code,404);
 assert.equal((await h.send('POST','/rooms/:id/messages',bob,{params:{id},body:{body:'intrusion'}})).code,404);
 assert.equal((await h.send('GET','/rooms/:id/invite',bob,{params:{id}})).code,404);
 assert.equal((await h.send('POST','/rooms/join',bob,{body:{invite:created.payload.invite+'.tampered'}})).code,403);
 const joined=await h.send('POST','/rooms/join',bob,{body:{invite:created.payload.invite}});
 assert.equal(joined.code,200);
 assert.equal(joined.payload.room.id,id);
 assert.equal((await h.send('GET','/rooms',bob)).payload.rooms[0].private,true);
 assert.equal((await h.send('GET','/rooms/:id/messages',bob,{params:{id}})).code,200);
 assert.equal((await h.send('GET','/rooms',eve)).payload.rooms.length,0);
 const fresh=await h.send('POST','/rooms/:id/invite/rotate',alice,{params:{id}});
 assert.equal(fresh.code,200);
 assert.notEqual(fresh.payload.invite,created.payload.invite);
 assert.equal((await h.send('POST','/rooms/join',eve,{body:{invite:created.payload.invite}})).code,403);
 assert.equal((await h.send('POST','/rooms/join',eve,{body:{invite:fresh.payload.invite}})).code,200);
 assert.equal((await h.send('GET','/rooms/:id/messages',bob,{params:{id}})).code,200,'rotation keeps admitted friends');
 assert.equal((await h.send('POST','/rooms/personal',eve,{body:{name:'X',game:'Minecraft'},origin:'https://evil.example'})).code,403);
});
