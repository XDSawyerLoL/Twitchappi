'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNextRouter}=require('../modules/swapp-social-next');
function harness(){
 const routes=[],follows=new Map(),wishes=new Map(),accounts=new Map(),ledgers=new Map(),queries=[];
 let user={id:'alice',login:'alice'};
 const box=(map,uid)=>{if(!map.has(uid))map.set(uid,new Map());return map.get(uid)};
 const db=async(sql,args=[])=>{
  queries.push({sql,args});
  const uid=args[0];
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_reward_accounts')){
   if(!accounts.has(uid))accounts.set(uid,{points:0,discovery_count:0});
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT points,discovery_count FROM swapp_social_reward_accounts'))
   return [accounts.has(uid)?[accounts.get(uid)]:[],[]];
  if(sql.startsWith('SELECT user_id FROM swapp_social_reward_accounts'))
   return [[{user_id:uid}],[]];
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_reward_ledger')){
   const [id,key,,points,when]=args,ledger=box(ledgers,id);
   if(ledger.has(key))return [{affectedRows:0},[]];
   ledger.set(key,{event_key:key,points,created_at:when});return [{affectedRows:1},[]];
  }
  if(sql.startsWith('UPDATE swapp_social_reward_accounts')){
   const [stamp,id]=args;void stamp;accounts.get(id).points+=10;accounts.get(id).discovery_count++;return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT event_key,points,created_at FROM swapp_social_reward_ledger'))
   return [[...box(ledgers,uid).values()].reverse(),[]];
  if(sql.startsWith('SELECT game_slug FROM swapp_social_game_follows'))
   return [[...box(follows,uid).keys()].map(game_slug=>({game_slug})),[]];
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_game_follows')){
   const [id,slug,name,when]=args,set=box(follows,id);
   if(set.has(slug))return [{affectedRows:0},[]];
   set.set(slug,{game_slug:slug,game_name:name,followed_at:when,seen_at:0});
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT game_slug,game_name,followed_at,seen_at FROM swapp_social_game_follows'))
   return [[...box(follows,uid).values()],[]];
  if(sql.startsWith('DELETE FROM swapp_social_game_follows')){
   if(args.length===1)box(follows,uid).clear();else box(follows,uid).delete(args[1]);
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('SELECT game_slug FROM swapp_social_game_wishlist'))
   return [[...box(wishes,uid).keys()].map(game_slug=>({game_slug})),[]];
  if(sql.startsWith('SELECT game_slug,game_name,created_at FROM swapp_social_game_wishlist'))
   return [[...box(wishes,uid).values()].reverse(),[]];
  if(sql.startsWith('INSERT IGNORE INTO swapp_social_game_wishlist')){
   const [id,slug,name,when]=args;
   const list=box(wishes,id);if(list.has(slug))return [{affectedRows:0},[]];
   list.set(slug,{game_slug:slug,game_name:name,created_at:when});
   return [{affectedRows:1},[]];
  }
  if(sql.startsWith('DELETE FROM swapp_social_game_wishlist')){
   if(args.length===1)box(wishes,uid).clear();else box(wishes,uid).delete(args[1]);
   return [{affectedRows:1},[]];
  }
  throw Error('Unhandled SQL: '+sql);
 };
 const pool={execute:db,getConnection:async()=>({
  execute:db,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}
 })};
 const express={Router:()=>{
  const r={};
  for(const method of ['get','put','post','delete'])
   r[method]=(path,...middleware)=>routes.push({method:method.toUpperCase(),path,middleware});
  return r;
 }};
 createSocialNextRouter({express,pool,restoreSession:async()=>user,clock:()=>1792350000000});
 async function request(method,path,{body={},params={},origin='https://swapp.tv'}={}){
  const matched=routes.find(x=>x.method===method&&x.path===path);
  assert.ok(matched,'route exists '+method+' '+path);
  let code=200,payload;
  const req={method,body,params,query:{},session:{},get:()=>origin};
  const res={headersSent:false,status(value){code=value;return this},
   json(x){payload=x;return this},set(){return this}};
  for(const fn of matched.middleware.slice(0,-1)){
   let next=false;await fn(req,res,()=>{next=true});if(!next)return {code,payload};
  }
  await matched.middleware.at(-1)(req,res);
  return {code,payload};
 }
 return {request,account:id=>{user=id?{id,login:id}:null},queries,ledgers,wishes,accounts,follows};
}
const follow=(h,slug)=>h.request('PUT','/library/games/:slug',{params:{slug},body:{game:slug}});
const wish=(h,slug)=>h.request('PUT','/library/wishlist/:slug',{params:{slug},body:{game:slug}});

test('guest cannot access wishlist or points; cross-site writes fail',async()=>{
 const h=harness();h.account(null);
 assert.equal((await h.request('GET','/library/wishlist')).code,401);
 assert.equal((await h.request('GET','/rewards/me')).code,401);
 h.account('alice');
 assert.equal((await h.request('PUT','/library/wishlist/:slug',{
  params:{slug:'minecraft'},body:{game:'Minecraft'},origin:'https://attack.invalid'})).code,403);
 assert.equal(h.queries.length,0);
});
test('wishlist is private, only a wish, not a fake ownership or price',async()=>{
 const h=harness();const x=await wish(h,'minecraft');
 assert.equal(x.code,200);assert.equal(x.payload.wishlist.length,1);
 assert.deepEqual(Object.keys(x.payload.wishlist[0]).sort(),['addedAt','game','slug']);
 const twice=await wish(h,'minecraft');assert.equal(twice.payload.wishlist.length,1);
 h.account('bob');
 assert.deepEqual((await h.request('GET','/library/wishlist')).payload.wishlist,[]);
 h.account('alice');
 await h.request('DELETE','/library/wishlist/:slug',{params:{slug:'minecraft'}});
 assert.equal((await h.request('GET','/library/wishlist')).payload.wishlist.length,0);
});
test('first deliberate follow grants 10 points, repeated follow never grants twice',async()=>{
 const h=harness();
 assert.equal((await h.request('GET','/rewards/me')).payload.rewards.points,0);
 await follow(h,'minecraft');
 await follow(h,'minecraft');
 assert.equal((await h.request('GET','/rewards/me')).payload.rewards.points,10);
 await h.request('DELETE','/library/games/:slug',{params:{slug:'minecraft'}});
 await follow(h,'minecraft');
 const stats=(await h.request('GET','/rewards/me')).payload;
 assert.equal(stats.rewards.points,10);
 assert.equal(stats.history.length,1);
 assert.equal(stats.history[0].gameSlug,'minecraft');
 assert.ok(h.queries.some(x=>x.sql.includes('FOR UPDATE')));
});
test('10 games max are rewarded; buying and wishlisting never grant points',async()=>{
 const h=harness();
 for(let i=0;i<12;i++){
  const slug='game-'+i;
  await wish(h,slug);await follow(h,slug);
 }
 const stats=(await h.request('GET','/rewards/me')).payload.rewards;
 assert.equal(stats.points,100);
 assert.equal(stats.discovered,10);
 assert.equal(stats.level,'Explorateur confirmé');
 assert.equal(stats.pointsToNext,0);
 assert.equal(h.ledgers.get('alice').size,10);
});
test('deleting wishes or following invalid games cannot generate rewards',async()=>{
 const h=harness();
 assert.equal((await h.request('PUT','/library/games/:slug',{params:{slug:'../../secret'},body:{game:'foo'}})).code,400);
 assert.equal((await h.request('PUT','/library/wishlist/:slug',{params:{slug:'hack<>user'},body:{game:'foo'}})).code,400);
 await wish(h,'minecraft');
 await h.request('DELETE','/library/wishlist');
 assert.equal((await h.request('GET','/rewards/me')).payload.rewards.points,0);
 assert.equal(h.ledgers.get('alice')?.size||0,0);
});
test('50 wishes cap is deterministic; no daily streak rewards',async()=>{
 const h=harness();
 for(let i=0;i<50;i++)await wish(h,'game-'+i);
 assert.equal((await wish(h,'game-50')).code,409);
 assert.equal((await h.request('GET','/library/wishlist')).payload.wishlist.length,50);
 assert.equal((await h.request('GET','/rewards/me')).payload.rewards.points,0);
});
