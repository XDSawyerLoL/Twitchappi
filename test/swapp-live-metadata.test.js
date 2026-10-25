'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {installLiveMetadata,cleanTitle,cleanCategory}=require('../modules/swapp-live-metadata');
function fixture(){
 const users={users:[{id:'owner-id',login:'creator',display_name:'Streamer',current_live_title:'Ancien titre',current_live_category:'Jeux',live_status:'live'}]};
 const room={title:'Ancien titre',category:'Jeux',host:'host',hostUserId:'owner-id'};
 let shouldFail=false;
 const events=[];
 const app={routes:{},get(path,handler){this.routes['GET '+path]=handler},post(path,...handlers){this.routes['POST '+path]=handlers[handlers.length-1]}};
 const io={to(channel){return{emit:(name,value)=>events.push({channel,name,value})}},emit:(name,value)=>events.push({name,value})};
 installLiveMetadata({app,io,getUsers:()=>users,findUser:login=>users.users.find(u=>u.login===login),
   saveUsers:async()=>{if(shouldFail)throw Error('storage_down')},getRoom:login=>login==='creator'?room:null});
 function request(method,identity,body={},origin='https://swapp.tv'){
  const fn=app.routes[method+' /api/swapp/live/metadata'];
  const req={session:identity?{oryonUser:identity}:{},body,
   headers:{origin,host:'swapp.tv','content-type':'application/json'},get(field){return this.headers[field.toLowerCase()]}};
  const res={code:200,set(){return this},status(v){this.code=v;return this},json(v){this.body=v;return this}};
  return Promise.resolve(fn(req,res)).then(()=>res);
 }
 return {request,room,users,events,setFailed:b=>shouldFail=b};
}
test('metadata form rejects invalid titles and categories',()=>{
 assert.equal(cleanTitle(' x '),null);
 assert.equal(cleanTitle('  Titre   valide '),'Titre valide');
 assert.equal(cleanCategory('x'.repeat(61)),null);
 assert.equal(cleanCategory('  Jeu  RP '),'Jeu RP');
});
test('anonymous and other user cannot change a creator live',async()=>{
 const f=fixture();
 assert.equal((await f.request('POST',null,{title:'Titre valide',category:'RP'})).code,401);
 assert.equal((await f.request('POST',{id:'intruder',login:'creator'},{title:'Titre valide',category:'RP'})).code,401);
 assert.equal((await f.request('POST',{id:'owner-id',login:'creator'},{title:'Titre valide',category:'RP'},'https://evil.test')).code,403);
 assert.equal(f.room.title,'Ancien titre');
});
test('live metadata changes reach public socket and persist',async()=>{
 const f=fixture();
 const owner={id:'owner-id',login:'creator'};
 const res=await f.request('POST',owner,{title:'Cyberpunk — session RP',category:'Cyberpunk 2077'});
 assert.equal(res.code,200);
 assert.equal(f.room.title,'Cyberpunk — session RP');
 assert.equal(f.room.category,'Cyberpunk 2077');
 assert.equal(f.users.users[0].current_live_title,'Cyberpunk — session RP');
 assert.ok(f.events.some(e=>e.name==='native:metadata:updated'&&e.channel==='native:creator'));
 assert.ok(f.events.some(e=>e.name==='native:lives:update'));
 const check=await f.request('GET',owner);
 assert.equal(check.body.title,'Cyberpunk — session RP');
});
test('failed persistence never publishes a phantom title',async()=>{
 const f=fixture(),owner={id:'owner-id',login:'creator'};
 f.setFailed(true);
 const res=await f.request('POST',owner,{title:'Titre temporaire',category:'Jeu'});
 assert.equal(res.code,503);
 assert.equal(f.room.title,'Ancien titre');
 assert.equal(f.users.users[0].current_live_title,'Ancien titre');
 assert.equal(f.events.length,0);
});
