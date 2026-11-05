'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createInterestStore,publicCount,checkOrigin,registerPremiereInterest,PUBLIC_MIN,DDL}=
 require('../modules/swapp-premiere-interest');

function fakeDB(){
 const records=new Map(),calls=[];
 return {
  calls,records,
  async query(sql){calls.push(['ddl',sql]);return [{}]},
  async execute(sql,args){
   calls.push([sql,args]);
   if(sql.startsWith('SELECT COUNT(*) AS total')){
    return [[{total:[...records.values()].filter(x=>x.slug===args[0]).length}]];
   }
   if(sql.startsWith('SELECT user_id')){
    return [[...records.values()].filter(x=>x.user===args[0]&&x.slug===args[1]).map(x=>({user_id:x.user}))];
   }
   if(sql.startsWith('DELETE')){
    records.delete(args[0]+':'+args[1]);return [{affectedRows:1}];
   }
   if(sql.startsWith('INSERT')){
    const [user,slug,name]=args;
    records.set(user+':'+slug,{user,slug,name});
    return [{affectedRows:1}];
   }
   throw Error('Unexpected SQL: '+sql);
  }
 };
}
function request({method='GET',game='Hades II',active=true,loggedIn=false,origin='https://swapp.tv',header='interest'}={}){
 const headers={host:'swapp.tv',origin,'x-swapp-premiere-action':header};
 return {method,query:{game},body:{game,active},session:{oryonUser:loggedIn?{id:'account_123',login:'streamer'}:null},
  get:name=>headers[name.toLowerCase()]||''};
}
function response(){
 return {statusCode:200,payload:null,headers:{},
  set(k,v){this.headers[k]=v;return this},
  status(code){this.statusCode=code;return this},
  json(payload){this.payload=payload;return this}};
}

test('SQL stores only a user/game association, unique by user/game and no IP or tracking',()=>{
 assert.match(DDL,/PRIMARY KEY\(user_id,game_slug\)/);
 assert.doesNotMatch(DDL,/ip_address|user_agent|cookie|fingerprint|session_id/i);
});

test('Each user counts once per game and can withdraw their opt-in',async()=>{
 const db=fakeDB(),store=createInterestStore({getPool:()=>db});
 await store.set('Hades II','account_123',true);
 await store.set('Hades II','account_123',true);
 assert.equal(await store.count('Hades II'),1);
 assert.equal(await store.has('Hades II','account_123'),true);
 await store.set('Hades II','account_456',true);
 assert.equal(await store.count('Hades II'),2);
 await store.set('Hades II','account_123',false);
 assert.equal(await store.has('Hades II','account_123'),false);
 assert.equal(await store.count('Hades II'),1);
});

test('Public displays counts only after privacy threshold; never fakes momentum',()=>{
 assert.equal(PUBLIC_MIN,5);
 for(let i=0;i<5;i++)assert.equal(publicCount(i),null);
 assert.equal(publicCount(5),5);
 assert.equal(publicCount(18),18);
});

test('Only same-origin browser requests can write',()=>{
 assert.equal(checkOrigin(request()),true);
 assert.equal(checkOrigin(request({origin:'https://evil.example'})),false);
 assert.equal(checkOrigin(request({origin:'https://swapp.tv.evil.example'})),false);
 assert.equal(checkOrigin(request({origin:'http://swapp.tv'})),false);
 assert.equal(checkOrigin(request({origin:'http://localhost:3000'}),{isProd:false}),false);
});

test('No request can run when the capability is disabled',async()=>{
 const db=fakeDB(),store=createInterestStore({getPool:()=>db}),handlers={};
 registerPremiereInterest({get:(p,h)=>handlers['GET '+p]=h,post:(p,h)=>handlers['POST '+p]=h},{
  store,enabled:()=>false,verifyGame:async()=>{},restoreSession:async()=>{},
  findUser:async()=>({id:'account_123'})});
 const getRes=response(),postRes=response();
 await handlers['GET /api/swapp/premiere/interest'](request(),getRes);
 await handlers['POST /api/swapp/premiere/interest'](request({method:'POST',loggedIn:true}),postRes);
 assert.equal(getRes.statusCode,503);assert.equal(postRes.statusCode,503);
 assert.equal(db.calls.length,0);
});

test('Writes require SWAPP login, exact published-game check and deliberate header',async()=>{
 const db=fakeDB(),store=createInterestStore({getPool:()=>db}),handlers={},verified=new Set(['Hades II']);
 registerPremiereInterest({get:(p,h)=>handlers['GET '+p]=h,post:(p,h)=>handlers['POST '+p]=h},{
  store,enabled:()=>true,
  verifyGame:async game=>{if(!verified.has(game)){const e=Error('spotlight_game_not_covered');e.status=422;throw e;}},
  restoreSession:async()=>{},findUser:async id=>id==='account_123'?{id}:null,
  logger:{warn:()=>{}}});
 const call=async req=>{const res=response();await handlers[req.method+' /api/swapp/premiere/interest'](req,res);return res};
 let res=await call(request({method:'POST'}));
 assert.equal(res.statusCode,401);
 res=await call(request({method:'POST',loggedIn:true,header:''}));
 assert.equal(res.statusCode,403);
 res=await call(request({method:'POST',loggedIn:true,game:'Unpublished Game'}));
 assert.equal(res.statusCode,422);
 res=await call(request({method:'POST',loggedIn:true}));
 assert.equal(res.statusCode,200);
 assert.equal(res.payload.active,true);
 assert.equal(res.payload.eventScheduled,false);
 res=await call(request({loggedIn:true}));
 assert.equal(res.payload.active,true);
 assert.equal(res.payload.publicCount,null);
 res=await call(request({method:'POST',loggedIn:true,active:false}));
 assert.equal(res.payload.active,false);
 assert.equal(db.records.size,0);
});

test('Frontend honors feature flag and cannot claim an event or offer purchase',()=>{
 const client=fs.readFileSync(path.join(__dirname,'..','assets','swapp-premiere-interest.js'),'utf8');
 assert.match(client,/premiere_interest_not_enabled/);
 assert.match(client,/event/i);
 assert.doesNotMatch(client,/stripe|checkout|document\.cookie|localStorage|sendBeacon/i);
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(server,/SWAPP_PREMIERE_INTEREST_ENABLED==='1'/);
 assert.match(server,/registerPremiereInterest\(app/);
 const env=fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8');
 assert.match(env,/SWAPP_PREMIERE_INTEREST_ENABLED=0/);
});
