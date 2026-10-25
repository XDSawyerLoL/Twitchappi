'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {installChannelModeration,actorRole,postAllowed,cleanLogin}=require('../modules/swapp-channel-moderation');

function setup(){
 const app={handlers:{},
  get(path,handler){this.handlers['GET '+path]=handler},
  post(path,handler){this.handlers['POST '+path]=handler}};
 const emits=[];
 const io={connections:[],
  on(name,handler){if(name==='connection')this.connections.push(handler)},
  to(room){return {emit:(name,payload)=>emits.push({room,name,payload})}},
  emit:(name,payload)=>emits.push({name,payload})};
 const people={
  owner:{id:'account-1',login:'owner'},
  helper:{id:'account-2',login:'helper'},
  viewer:{id:'account-3',login:'viewer'}
 };
 const data={rooms:{owner:{banned:[],muted:[],blocked_words:[]}}};
 const history=[{id:'msg1',room:'owner',user:'viewer',text:'Bonjour',ts:100}];
 installChannelModeration({
  app,io,getModState:room=>({data,state:data.rooms[room]}),
  saveModState:()=>{},getNativeChat:()=>history,
  getAnySocketDisplay:s=>s.user,
  getOryonUserByLogin:login=>people[login]
 });
 function request(method,who,body,origin='https://swapp.tv'){
  const fn=app.handlers[method+' /api/swapp/channel-moderation/:room'];
  const req={params:{room:'owner'},session:who?{oryonUser:people[who]}:{},body,
   headers:{host:'swapp.tv',origin,'content-type':'application/json'}};
  const res={statusCode:200,set(){return this},
   status(code){this.statusCode=code;return this},
   json(value){this.data=value;return this}};
  fn(req,res);return res;
 }
 return {request,io,emits,history,data,people};
}

test('only a live SWAPP session with a matching persisted account can moderate',()=>{
 const p={helper:{login:'helper',id:'active'}};
 const find=login=>p[login];
 assert.equal(actorRole({oryonUser:{id:'stale',login:'helper'}},'owner',{moderators:['helper']},find),'viewer');
 assert.equal(actorRole({oryonUser:{id:'active',login:'helper'}},'owner',{moderators:['helper']},find),'moderator');
 assert.equal(actorRole({oryonUser:{id:'active',login:'helper'}},'helper',{moderators:[]},find),'owner');
 assert.equal(cleanLogin('../owner'),'');
 assert.equal(postAllowed({headers:{host:'swapp.tv',origin:'https://attacker.invalid','content-type':'application/json'}}),false);
});

test('creator may delegate; moderator may remove posts but cannot edit privileges',()=>{
 const f=setup();
 assert.equal(f.request('GET','viewer').data.role,'viewer');
 assert.equal(f.request('POST','viewer',{action:'ban',target:'helper'}).statusCode,403);
 assert.equal(f.request('POST','owner',{action:'add_mod',target:'helper'}).statusCode,200);
 assert.equal(f.request('GET','helper').data.role,'moderator');
 assert.equal(f.request('POST','helper',{action:'add_mod',target:'viewer'}).statusCode,403);
 assert.equal(f.request('POST','helper',{action:'ban',target:'owner'}).statusCode,403);
 assert.equal(f.request('POST','helper',{action:'delete',id:'msg1'}).statusCode,200);
 assert.equal(f.history.length,0);
 assert.ok(f.emits.some(e=>e.name==='native:chat:deleted'&&e.payload.id==='msg1'));
 assert.equal(f.request('POST','owner',{action:'remove_mod',target:'helper'}).statusCode,200);
 assert.equal(f.request('POST','helper',{action:'ban',target:'viewer'}).statusCode,403);
});

test('timeouts and slow mode are enforced before original native chat handler',()=>{
 const f=setup();
 const socket={data:{nativeRoom:'owner'},user:{id:'account-3',type:'oryon',login:'viewer'},
  emit(name,payload){f.emits.push({name,payload})},
  use(handler){this.middleware=handler}};
 f.io.connections.forEach(handler=>handler(socket));
 assert.equal(f.request('POST','owner',{action:'timeout',target:'viewer',minutes:0}).statusCode,400);
 assert.equal(f.request('POST','owner',{action:'timeout',target:'viewer',minutes:10}).statusCode,200);
 let forwards=0;
 socket.middleware(['native:chat',{room:'owner',text:'Bonjour'}],()=>forwards++);
 assert.equal(forwards,0);
 assert.equal(f.request('POST','owner',{action:'untimeout',target:'viewer'}).statusCode,200);
 assert.equal(f.request('POST','owner',{action:'slow',seconds:30}).statusCode,200);
 socket.middleware(['native:chat',{room:'owner',text:'Premier'}],()=>forwards++);
 socket.middleware(['native:chat',{room:'owner',text:'Deuxième'}],()=>forwards++);
 assert.equal(forwards,1);
});
