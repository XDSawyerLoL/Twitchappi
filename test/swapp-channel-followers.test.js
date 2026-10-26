'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {installChannelAudience}=require('../modules/swapp-channel-audience');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-followers-'));
 const storageFile=path.join(dir,'points.json');
 fs.writeFileSync(storageFile,JSON.stringify({version:1,rooms:{creator:{
  'alice-id':{login:'alice',display_name:'Alice',points:280,minutes:56},
  'zed-id':{login:'zed',display_name:'Zed',points:50,minutes:10}
 }}}));
 const users=[
  {id:'owner-id',login:'creator',display_name:'Creator',following:[]},
  {id:'alice-id',login:'alice',display_name:'Alice',following:['creator']},
  {id:'bob-id',login:'bob',display_name:'Bob',following:['other']},
  {id:'zed-id',login:'zed',display_name:'Zed',following:['creator']}
 ];
 const routes={};
 const app={get(name,fn){routes[name]=fn},post(name,fn){routes['POST '+name]=fn}};
 const io={on(){},sockets:{sockets:new Map()}};
 installChannelAudience({app,io,storageFile,getUser:login=>users.find(u=>u.login===login),
  getUsers:()=>({users}),getModState:()=>({state:{moderators:['alice'],banned:['zed']}}),
  getNativeRoom:()=>null,isLocalLive:()=>false});
 const invoke=async(name,{login='creator',id='owner-id',q,page}={})=>{
  const req={params:{room:name},query:{...(q===undefined?{}:{q}),...(page===undefined?{}:{page})},
   session:{oryonUser:{login,id}}};
  const res={headers:{},statusCode:200,set(key,value){this.headers[key]=value;return this},
   status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
  await routes['/api/swapp/channel-followers/:room'](req,res);return res;
 };
 return {invoke,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('Owner sees only real followers, channel points, moderator and chat bans',async()=>{
 const f=fixture();
 try{
  const response=await f.invoke('creator');
  assert.equal(response.statusCode,200);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
  assert.equal(response.body.total,2);
  assert.equal(response.body.ban_scope,'native_swapp_chat_only');
  assert.deepEqual(response.body.followers.map(x=>x.login),['alice','zed']);
  assert.equal(response.body.followers[0].points,280);
  assert.equal(response.body.followers[0].minutes,56);
  assert.equal(response.body.followers[0].moderator,true);
  assert.equal(response.body.followers[1].banned,true);
  assert.ok(!JSON.stringify(response.body).includes('bob'));
  assert.ok(!JSON.stringify(response.body).includes('owner-id'));
 }finally{f.clean()}
});
test('Unauthorized viewer and forged owner ID cannot query follower list',async()=>{
 const f=fixture();
 try{
  assert.equal((await f.invoke('creator',{login:'alice',id:'alice-id'})).statusCode,403);
  assert.equal((await f.invoke('creator',{login:'creator',id:'forged-id'})).statusCode,403);
  assert.equal((await f.invoke('unknown')).statusCode,403);
 }finally{f.clean()}
});
test('Follower search and strict page bounds',async()=>{
 const f=fixture();
 try{
  const response=await f.invoke('creator',{q:'zeD',page:'1'});
  assert.equal(response.body.total,1);
  assert.equal(response.body.followers[0].login,'zed');
  assert.equal((await f.invoke('creator',{page:'-1'})).statusCode,400);
  assert.equal((await f.invoke('creator',{page:'10000'})).statusCode,400);
  assert.equal((await f.invoke('creator',{q:'x'.repeat(61)})).statusCode,400);
  const empty=await f.invoke('creator',{page:'2'});
  assert.equal(empty.body.total,2);assert.equal(empty.body.followers.length,0);
 }finally{f.clean()}
});
test('UI reuses authoritative moderation API with confirmation and no direct role mutation',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../assets/swapp-channel-followers.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(ui,/window\.confirm\(prompts\[action\]\)/);
 assert.match(ui,/\/api\/swapp\/channel-moderation\//);
 for(const action of ['add_mod','remove_mod','ban','unban'])assert.ok(ui.includes(action));
 assert.equal((html.match(/swapp-channel-followers\.js\?v=/g)||[]).length,1);
 assert.equal((html.match(/swapp-channel-followers\.css\?v=/g)||[]).length,1);
});
