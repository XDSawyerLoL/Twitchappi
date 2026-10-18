'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNextRouter}=require('../modules/swapp-social-next');

function makeHarness(){
 const routes=[],writes=[],queries=[];
 const express={Router:()=>({
  get:(path,...middleware)=>routes.push({method:'GET',path,middleware}),
  put:(path,...middleware)=>routes.push({method:'PUT',path,middleware}),
  post:(path,...middleware)=>routes.push({method:'POST',path,middleware}),
  delete:(path,...middleware)=>routes.push({method:'DELETE',path,middleware})
 })};
 const pool={execute:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.startsWith('INSERT INTO swapp_social_passports')){writes.push(args);return [[],[]]}
  if(sql.includes('FROM swapp_social_passports'))return [[],[]];
  if(sql.includes('FROM swapp_social_matches WHERE user_id=?'))
   return [[{game:'PUBG',platform:'PC',style:'Coopération',availability:'Ce soir'}],[]];
  if(sql.includes('FROM swapp_social_matches WHERE user_id<>?'))
   return [[{user_id:'u2',handle:'alice',game:'PUBG',platform:'PC',style:'Coopération',availability:'Ce soir',created_at:1781500000000},
    {user_id:'u3',handle:'bob',game:'Minecraft',platform:'Xbox',style:'Compétitif',availability:'Demain',created_at:1781500001000}],[]];
  if(sql.includes('FROM swapp_social_rooms WHERE LOWER(game)'))
   return [[{id:'r1',name:'Salon PUBG',game:'PUBG',created_at:1781500002000}],[]];
  if(sql.includes('FROM swapp_social_matches WHERE LOWER(game)'))
   return [[{handle:'alice',game:'PUBG',platform:'PC',availability:'Ce soir',style:'Coopération',created_at:1781500000000}],[]];
  throw new Error('Unhandled test query');
 }};
 createSocialNextRouter({express,pool,restoreSession:async()=>({id:'u1',login:'player1'}),clock:()=>1781600000000});
 async function send(method,path,{body={},params={},query={},origin='https://swapp.tv'}={}){
  const route=routes.find(r=>r.method===method&&r.path===path);
  assert.ok(route,'Route exists');
  let status=200,data;
  const res={headersSent:false,set(){return this},status(code){status=code;return this},json(body){data=body;return this}};
  const req={method,params,query,body,session:{},get:()=>origin};
  for(const middleware of route.middleware.slice(0,-1)){
   let proceeded=false;
   await middleware(req,res,()=>{proceeded=true});
   if(!proceeded)return {status,data};
  }
  await route.middleware.at(-1)(req,res);
  return {status,data};
 }
 return {send,writes,queries};
}

test('passport is private by default and persists under SWAPP identity',async()=>{
 const h=makeHarness();
 const initial=await h.send('GET','/passport/me');
 assert.equal(initial.data.passport.public,false);
 const saved=await h.send('PUT','/passport/me',{body:{
  games:['PUBG','Minecraft'],platform:'PC',style:'Coopération',
  displayName:'Player',bio:'Joueur',availability:'Ce soir',public:false
 }});
 assert.equal(saved.status,200);
 assert.equal(saved.data.passport.public,false);
 assert.equal(h.writes.length,1);
 assert.equal(h.writes[0][0],'u1');
 assert.equal(h.writes[0][8],0);
 const lookup=await h.send('GET','/passport/:handle',{params:{handle:'player1'}});
 assert.equal(lookup.status,404);
});

test('match2 scores actual compatible players without inventing records',async()=>{
 const h=makeHarness();
 const result=await h.send('GET','/match2/compatible');
 assert.equal(result.status,200);
 assert.deepEqual(result.data.matches.map(m=>m.handle),['alice']);
 assert.equal(result.data.matches[0].score,100);
 assert.equal('userId' in result.data.matches[0],false);
});

test('game universe contains only real rooms and matching player ads',async()=>{
 const h=makeHarness();
 const result=await h.send('GET','/game/context',{query:{game:'PUBG'}});
 assert.equal(result.status,200);
 assert.equal(result.data.rooms[0].name,'Salon PUBG');
 assert.equal(result.data.matches[0].handle,'alice');
});

test('cross-site profile writes are forbidden',async()=>{
 const h=makeHarness();
 const result=await h.send('PUT','/passport/me',{origin:'https://malicious.example'});
 assert.equal(result.status,403);
 assert.equal(h.writes.length,0);
});


test('SOCIAL rooms search verified game aliases without confusing sequels',async()=>{
 const h=makeHarness();
 await h.send('GET','/game/context',{query:{game:'Grand Theft Auto VI'}});
 const gameQueries=h.queries.filter(x=>x.sql.includes('LOWER(game) IN ('));
 assert.equal(gameQueries.length,2);
 assert.ok(gameQueries[0].args.includes('grand theft auto vi'));
 assert.ok(gameQueries[0].args.includes('gta vi'));
 assert.equal(gameQueries[0].sql.split('?').length-1,gameQueries[0].args.length);
 await h.send('GET','/game/context',{query:{game:'Hades II'}});
 const last=h.queries.at(-1);
 assert.deepEqual(last.args.slice(0,-1),['hades ii']);
 assert.equal(last.sql.split('?').length-1,last.args.length);
});
