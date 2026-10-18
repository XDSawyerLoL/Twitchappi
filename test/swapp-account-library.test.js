'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNextRouter}=require('../modules/swapp-social-next');

function harness(){
 const routes=[],data=new Map(),operations=[];
 const express={Router:()=>{
  const r={};for(const method of ['get','post','put','delete'])
   r[method]=(path,...middleware)=>routes.push({method:method.toUpperCase(),path,middleware});
  return r;
 }};
 let actor={id:'memberA',login:'alice'};
 const rows=id=>data.get(id)||new Map();
 const execute=async(sql,args=[])=>{
  operations.push({sql,args});
  if(sql.startsWith('SELECT game_slug,game_name,followed_at,seen_at')){
   return [[...rows(args[0]).values()].map(x=>({...x})).sort((a,b)=>a.followed_at-b.followed_at),[]];
  }
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_reward_accounts')){
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT points,discovery_count FROM swapp_social_reward_accounts')){
   return [[{points:0,discovery_count:0}],[]];
  }
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_reward_ledger')){
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('UPDATE swapp_social_reward_accounts')){
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT game_slug FROM swapp_social_game_follows')){
   return [[...rows(args[0]).keys()].map(game_slug=>({game_slug})),[]];
  }
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_game_follows')){
   const [user_id,game_slug,game_name,followed_at,seen_at]=args;
   if(!data.has(user_id))data.set(user_id,new Map());
   if(!rows(user_id).has(game_slug))rows(user_id).set(game_slug,{game_slug,game_name,followed_at,seen_at});
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('DELETE FROM swapp_social_game_follows')){
   if(args.length===1){data.delete(args[0]);return [{affectedRows:1},[]]}
   const hit=rows(args[0]).delete(args[1]);return [{affectedRows:hit?1:0},[]];
  }
  if(sql.startsWith('UPDATE swapp_social_game_follows')){
   const [seen,updated,uid,slug]=args;void updated;
   const hit=rows(uid).get(slug);if(hit)hit.seen_at=seen;
   return [{affectedRows:hit?1:0},[]];
  }
  throw Error('unexpected SQL '+sql);
 };
 const pool={execute,getConnection:async()=>({
  execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}
 })};
 createSocialNextRouter({express,pool,restoreSession:async()=>actor,clock:()=>1792350000000});
 async function request(method,path,{body={},params={},origin='https://swapp.tv',loggedIn=true}={}){
  const route=routes.find(r=>r.method===method&&r.path===path);
  assert.ok(route,'Route available: '+method+' '+path);
  let status=200,payload=null;
  const res={headersSent:false,set(){return this},status(code){status=code;return this},json(value){payload=value;return this}};
  const req={method,params,body,query:{},session:{},get:()=>origin};
  if(!loggedIn)actor=null;else if(!actor)actor={id:'memberA',login:'alice'};
  for(const middleware of route.middleware.slice(0,-1)){
   let advanced=false;await middleware(req,res,()=>{advanced=true});
   if(!advanced)return {status,payload};
  }
  await route.middleware.at(-1)(req,res);
  return {status,payload};
 }
 return {request,data,rows,operations,setActor:v=>{actor=v}};
}
const game=(slug='grand-theft-auto-vi',name='Grand Theft Auto VI')=>({slug,game:name});

test('library requires SWAPP account and is never publicly accessible',async()=>{
 const h=harness();
 const guest=await h.request('GET','/library/games',{loggedIn:false});
 assert.equal(guest.status,401);
 const alice=await h.request('GET','/library/games');
 assert.equal(alice.status,200);
 assert.deepEqual(alice.payload.games,[]);
 assert.equal(alice.payload.userId,'memberA');
});

test('account A can follow, mark seen, delete; account B cannot observe A',async()=>{
 const h=harness();
 const create=await h.request('PUT','/library/games/:slug',{params:{slug:game().slug},body:{game:game().game}});
 assert.equal(create.status,200);assert.equal(create.payload.games.length,1);
 const seen=await h.request('PUT','/library/games/:slug/seen',{params:{slug:game().slug}});
 assert.ok(seen.payload.games[0].seenAt);
 h.setActor({id:'memberB',login:'bob'});
 const other=await h.request('GET','/library/games');
 assert.equal(other.payload.userId,'memberB');
 assert.deepEqual(other.payload.games,[]);
 const cannotMark=await h.request('PUT','/library/games/:slug/seen',{params:{slug:game().slug}});
 assert.equal(cannotMark.status,404);
 const cannotRemove=await h.request('DELETE','/library/games/:slug',{params:{slug:game().slug}});
 assert.deepEqual(cannotRemove.payload.games,[]);
 h.setActor({id:'memberA',login:'alice'});
 assert.equal((await h.request('GET','/library/games')).payload.games.length,1);
});

test('first sync explicitly merges without overwriting existing followed games',async()=>{
 const h=harness();
 await h.request('PUT','/library/games/:slug',{params:{slug:'minecraft'},body:{game:'Minecraft'}});
 const imported=await h.request('POST','/library/import',{body:{games:[game(),game()]}});
 assert.equal(imported.status,200);
 assert.equal(imported.payload.games.length,2);
 const second=await h.request('POST','/library/import',{body:{games:[game()]}});
 assert.equal(second.payload.games.length,2);
});

test('invalid slugs and malformed values are rejected without database modifications',async()=>{
 const h=harness();
 const invalid=await h.request('PUT','/library/games/:slug',{params:{slug:'../../admin'},body:{game:'No'}});
 assert.equal(invalid.status,400);
 const html=await h.request('POST','/library/import',{body:{games:[game('minecraft','<script>alert(1)</script>')]}});
 assert.equal(html.status,400);
 const oversized=await h.request('POST','/library/import',{body:{games:Array.from({length:31},(_,i)=>game('valid-'+i,'game '+i))}});
 assert.equal(oversized.status,400);
 assert.equal(h.operations.length,0);
});

test('cross-origin writes are rejected before database access',async()=>{
 const h=harness();
 const rejected=await h.request('POST','/library/import',{origin:'https://attacker.invalid',body:{games:[game()]}});
 assert.equal(rejected.status,403);
 assert.equal(h.operations.length,0);
});

test('30-game cap and no phantom ownership or purchase data',async()=>{
 const h=harness();
 const items=Array.from({length:30},(_,i)=>game('game-'+i,'Game '+i));
 const first=await h.request('POST','/library/import',{body:{games:items}});
 assert.equal(first.status,200);
 const blocked=await h.request('PUT','/library/games/:slug',{params:{slug:'extra-game'},body:{game:'Extra Game'}});
 assert.equal(blocked.status,409);
 assert.equal((await h.request('GET','/library/games')).payload.games.length,30);
 assert.deepEqual(Object.keys(first.payload.games[0]).sort(),['followedAt','game','seenAt','slug']);
});

test('delete-all removes account data, leaves no automatic re-import',async()=>{
 const h=harness();
 await h.request('PUT','/library/games/:slug',{params:{slug:game().slug},body:{game:game().game}});
 const removed=await h.request('DELETE','/library/games');
 assert.equal(removed.status,200);
 assert.deepEqual((await h.request('GET','/library/games')).payload.games,[]);
});
