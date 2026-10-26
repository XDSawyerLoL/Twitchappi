'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {installChannelModeration,actorRole}=require('../modules/swapp-channel-moderation');
const USERS={creator:{id:'owner-id',login:'creator'},alice:{id:'alice-id',login:'alice'},zed:{id:'zed-id',login:'zed'}};
function fixture(){
 const data={rooms:{creator:{banned:[],muted:[],moderators:['alice'],audit:[]}}};
 const appRoutes={};
 const app={get:(url,fn)=>appRoutes['GET '+url]=fn,post:(url,fn)=>appRoutes['POST '+url]=fn};
 const io={on:()=>{},emit:()=>{},to:()=>({emit:()=>{}})};
 let saves=0;
 installChannelModeration({app,io,getModState:room=>({data,state:data.rooms[room]}),saveModState:()=>{saves++},
  getNativeChat:()=>[],getAnySocketDisplay:()=>null,getOryonUserByLogin:login=>USERS[login]||null});
 const req=(actor,action,target)=>({params:{room:'creator'},body:{action,target},headers:{
  'content-type':'application/json',origin:'https://swapp.tv',host:'swapp.tv'},session:{oryonUser:USERS[actor]}});
 const post=async(actor,action,target)=>{
  const res={code:200,status(value){this.code=value;return this},set(){return this},json(value){this.body=value;return this}};
  await appRoutes['POST /api/swapp/channel-moderation/:room'](req(actor,action,target),res);return res;
 };
 return {post,state:data.rooms.creator,role:actor=>actorRole({oryonUser:USERS[actor]},'creator',data.rooms.creator,login=>USERS[login]||null),get saves(){return saves}};
}
test('A ban removes a moderator and their server-side permissions instantly',async()=>{
 const f=fixture();
 assert.equal(f.role('alice'),'moderator');
 const result=await f.post('creator','ban','alice');
 assert.equal(result.code,200);
 assert.deepEqual(f.state.moderators,[]);
 assert.deepEqual(f.state.banned,['alice']);
 assert.equal(f.role('alice'),'viewer');
 assert.equal(f.saves,1);
});
test('Banned account cannot be promoted again until unbanned',async()=>{
 const f=fixture();
 assert.equal((await f.post('creator','ban','alice')).code,200);
 assert.equal((await f.post('creator','add_mod','alice')).code,409);
 assert.equal(f.role('alice'),'viewer');
 assert.equal((await f.post('creator','unban','alice')).code,200);
 assert.equal((await f.post('creator','add_mod','alice')).code,200);
 assert.equal(f.role('alice'),'moderator');
});
test('Only owner promotes or demotes moderators; followers cannot ban owner',async()=>{
 const f=fixture();
 assert.equal((await f.post('alice','remove_mod','alice')).code,403);
 assert.equal((await f.post('alice','add_mod','zed')).code,403);
 assert.equal((await f.post('creator','ban','creator')).code,403);
 assert.deepEqual(f.state.moderators,['alice']);
});
