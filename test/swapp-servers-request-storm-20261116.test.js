'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {register}=require('../modules/swapp-servers');
const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers-alerts.js'),'utf8');
const serverSource=fs.readFileSync(path.join(__dirname,'../modules/swapp-servers.js'),'utf8');
async function settle(){for(let i=0;i<12;i++)await Promise.resolve()}
function browser({admin=false,waf=false}={}){
 const calls=[],intervals=[],windowEvents={},window={addEventListener(k,fn){windowEvents[k]=fn},MutationObserver:null};
 const document={visibilityState:'visible',head:{append(){}},createElement:()=>({}),
  querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,addEventListener(){}};
 let now=10000;
 const fetch=async url=>{
  calls.push(url);
  if(waf)return {status:403,ok:false,headers:{get:()=> 'text/html'},json:async()=>({})};
  return {status:200,ok:true,headers:{get:()=> 'application/json'},
   json:async()=>url.endsWith('/access')?{canModerate:admin}:{pending:3}};
 };
 const context={window,document,fetch,Date:{now:()=>now},
  setInterval(fn){intervals.push(fn);return{unref(){}}},
  queueMicrotask(fn){Promise.resolve().then(fn)}};
 const run=()=>vm.runInNewContext(source,context);run();
 return {calls,intervals,windowEvents,run,advance(ms){now+=ms}};
}
test('non-admin does not poll private moderation count, even across 30 ticks or SPA double load',async()=>{
 const b=browser();await settle();
 for(let i=0;i<30;i++){await b.intervals[0]();await settle()}
 assert.deepEqual(b.calls,['/api/swapp/serveurs/moderation/access']);
 b.run();await settle();assert.equal(b.calls.length,1);
 b.windowEvents['swapp:session-changed']();await settle();
 assert.equal(b.calls.length,2,'changed session allows a new capability check');
});
test('moderator checks access once, then periodically checks only count',async()=>{
 const b=browser({admin:true});await settle();await b.intervals[0]();await settle();
 assert.deepEqual(b.calls,[
  '/api/swapp/serveurs/moderation/access',
  '/api/swapp/serveurs/moderation/count',
  '/api/swapp/serveurs/moderation/count'
 ]);
});
test('HTML WAF challenge never becomes authorization proof and is rate-limited',async()=>{
 const b=browser({waf:true});await settle();await b.intervals[0]();await settle();
 assert.equal(b.calls.length,1);b.advance(600001);
 await b.intervals[0]();await settle();assert.equal(b.calls.length,2);
 assert.ok(b.calls.every(url=>url.endsWith('/access')));
});
function server({admin=false,getDatabase=async()=>{throw Object.assign(Error('down'),{code:'ECONNREFUSED'})}}={}){
 const routes={},app={get(route,...fn){routes[route]=fn.at(-1)},post(){},put(){},delete(){}};
 register(app,{isAdmin:()=>admin,getDatabase,enableAutoReview:false});
 const res=()=>({code:200,headers:{},data:null,set(k,v){this.headers[k]=v;return this},
  status(n){this.code=n;return this},json(v){this.data=v;return this}});
 return {routes,res,req:{params:{},query:{},session:{},get:()=>''}};
}
test('public capability is cheap, does not read MySQL and does not weaken the admin 403',async()=>{
 let queries=0;
 for(const [admin,allowed] of [[false,false],[true,true]]){
  const s=server({admin,getDatabase:async()=>{queries++;throw Error('must not touch DB')}});
  const r=s.res();await s.routes['/api/swapp/serveurs/moderation/access'](s.req,r);
  assert.equal(r.code,200);assert.deepEqual(r.data,{canModerate:allowed});
  assert.equal(r.headers['Cache-Control'],'private,no-store');
  if(!admin){
   const denied=s.res();await s.routes['/api/swapp/serveurs/moderation/count'](s.req,denied);
   assert.equal(denied.code,403);assert.equal(denied.data.error,'acces_refuse');
  }
 }
 assert.equal(queries,0);
});
test('a real database outage remains an explicit 503, not a fabricated empty directory',async()=>{
 const s=server(),r=s.res();await s.routes['/api/swapp/serveurs'](s.req,r);
 assert.equal(r.code,503);assert.equal(r.data.reason,'mysql_connection_failed');
 assert.equal(r.data.error,'annuaire_temporairement_indisponible');
 assert.equal(r.data.total,undefined);assert.equal(r.headers['Retry-After'],'20');
});
test('a broken optional SQL expression falls back to authentic records, without invented votes',async()=>{
 const seen=[],id='a'.repeat(32);
 const db={execute:async(sql,args)=>{
  seen.push(sql);
  if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers s WHERE'))return [[{n:1}]];
  if(sql.startsWith('SELECT s.id,s.owner_id,s.slug')){
   if(sql.includes('LEFT JOIN'))throw Object.assign(Error('optional parse'),{code:'ER_PARSE_ERROR'});
   return [[{id,owner_id:'unknown',slug:'community-123',name:'Community',game:'Minecraft',
    description:'Real listing',website:'https://swapp.tv',joinAddress:'',region:'France',
    tags:'gaming',bannerUrl:'',createdAt:'2026-11-16T10:00:00Z',votes_month:null}]];
  }
  if(sql.startsWith('SELECT server_id'))return [[]];
  throw Error('unexpected '+sql);
 },query:async sql=>{
  seen.push(sql);
  if(sql.startsWith('SELECT game,COUNT(*)'))return [[{game:'Minecraft',count:1}]];
  throw Error('unexpected '+sql);
 }};
 const s=server({getDatabase:async()=>db}),r=s.res();
 await s.routes['/api/swapp/serveurs'](s.req,r);
 assert.equal(r.code,200);assert.equal(r.data.total,1);
 assert.equal(r.data.servers[0].name,'Community');
 assert.equal(r.data.servers[0].votes_month,null);
 assert.equal(r.data.ranking,'temporarily_unavailable');
 assert.match(serverSource,/NULLIF\(b\.banner_url,\\'\\'\)/);
 assert.doesNotMatch(serverSource,/NULLIF\(b\.banner_url,""\)/);
 assert.match(serverSource,/readSchemaPromise/);
 assert.ok(seen.some(sql=>sql.includes('NULL AS votes_month')));
});
