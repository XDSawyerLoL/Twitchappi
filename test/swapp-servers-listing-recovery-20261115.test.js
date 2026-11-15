'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register}=require('../modules/swapp-servers');
const id='a'.repeat(32);
const community={id,owner_id:'owner-1',slug:'swapp-aaaaaaa',name:'SWAPP',game:'Discord / Multigaming',
 description:'Une communauté française autour du jeu et du streaming.',website:'https://discord.gg/swapp',
 joinAddress:'',region:'France',tags:'Jeux',bannerUrl:'',logoUrl:'',accentColor:'#8ceaf0',votes_month:4};
function setup({counterFails=false,databaseFails=false,sort='votes'}={}){
 const seen=[],handlers={};
 const db={
  execute:async(sql,args)=>{
   seen.push({sql,args,kind:'execute'});
   if(databaseFails)throw Object.assign(Error('DB unavailable'),{code:'ECONNREFUSED'});
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers s WHERE'))return [[{n:1}]];
   if(sql.startsWith('SELECT s.id,s.owner_id,s.slug'))return [[{...community}]];
   throw Error('Unexpected SQL '+sql);
  },
  query:async(sql)=>{
   seen.push({sql,kind:'query'});
   if(counterFails)throw Object.assign(Error('category counter unavailable'),{code:'ER_UNKNOWN_ERROR'});
   return [[{game:community.game,count:1}]];
  }
 };
 const app={get:(route,...f)=>handlers[route]=f.at(-1),post(){},put(){},delete(){}};
 register(app,{getDatabase:async()=>db,enableAutoReview:false});
 const req={query:{game:community.game,sort,page:'1'},session:{oryonUser:{id:'owner-1'}}};
 const res={code:200,headers:{},data:null,set(k,v){this.headers[k]=v;return this},
  status(n){this.code=n;return this},json(v){this.data=v;return this}};
 return {seen,route:handlers['/api/swapp/serveurs'],req,res};
}
test('real server ranking no longer uses GROUP BY over server columns',async()=>{
 const h=setup();await h.route(h.req,h.res);
 assert.equal(h.res.code,200);
 assert.equal(h.res.data.total,1);
 assert.equal(h.res.data.servers[0].votes_month,4);
 assert.equal(h.res.data.servers[0].canEdit,true);
 assert.equal(h.res.data.servers[0].rank,1);
 const statement=h.seen.find(x=>x.sql.startsWith('SELECT s.id,s.owner_id,s.slug'));
 assert.ok(statement,'listing query missing');
 assert.match(statement.sql,/SELECT COUNT\(\*\) FROM swapp_game_server_vote_events/);
 assert.match(statement.sql,/v\.server_id=s\.id AND v\.voted_at>=\?/);
 assert.doesNotMatch(statement.sql,/GROUP BY s\.id/);
 assert.match(statement.sql,/ORDER BY votes_month DESC/);
 assert.deepEqual(statement.args.slice(-2),[24,0]);
 assert.deepEqual(h.res.data.gameCounts,{'Discord / Multigaming':1});
});
test('optional category counters may fail without hiding published listings',async()=>{
 const h=setup({counterFails:true});await h.route(h.req,h.res);
 assert.equal(h.res.code,200);
 assert.equal(h.res.data.total,1);
 assert.equal(h.res.data.servers.length,1);
 assert.equal(h.res.data.gameCounts,null);
});
test('a real database failure is still an error and not a fabricated zero',async()=>{
 const h=setup({databaseFails:true});await h.route(h.req,h.res);
 assert.equal(h.res.code,503);
 assert.equal(h.res.data.error,'annuaire_temporairement_indisponible');
 assert.equal(h.res.data.total,undefined);
});
test('client preserves SSR listings and discriminates HTML challenges from JSON errors',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers.js'),'utf8');
 assert.match(script,/keepServerRendered/);
 assert.match(script,/\.ss-category-preloaded/);
 assert.match(script,/state\.status==='error'&&keepServerRendered/);
 assert.match(script,/async function apiFailure\(response\)/);
 assert.match(script,/mime\.includes\('text\/html'\)/);
 assert.match(script,/recaptcha\|captcha/);
 assert.match(script,/kind:challenge\?'challenge':'upstream'/);
 assert.match(script,/feedback\.textContent='';/);
 assert.doesNotMatch(script,/Actualisation indisponible : les fiches déjà chargées restent visibles/);
 assert.match(script,/Array\.isArray\(data\.servers\)/);
});
