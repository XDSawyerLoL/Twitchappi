'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register}=require('../modules/swapp-servers');
function harness({isAdmin=true,missingBranding=false,offline=false}={}){
 const routes={},calls=[];
 const db={
  query:async(sql)=>{
   calls.push(sql);
   if(offline)throw Object.assign(Error('down'),{code:'ECONNREFUSED'});
   if(sql.startsWith('SELECT 1 FROM')){
    if(missingBranding&&sql.includes('swapp_game_server_branding'))throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
    return [[]];
   }
   if(sql.startsWith('SELECT status,COUNT(*)'))return [[{status:'published',n:2},{status:'pending',n:1}]];
   if(sql.startsWith('SELECT id FROM swapp_game_servers WHERE'))return [[]];
   throw Error('unexpected query '+sql);
  },
  execute:async(sql,args)=>{
   calls.push(sql);
   if(offline)throw Object.assign(Error('down'),{code:'ECONNREFUSED'});
   if(sql.includes('LEFT JOIN swapp_game_server_branding')){
    if(missingBranding)throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
    assert.equal(args.length,1);
    return [[]];
   }
   throw Error('unexpected execute '+sql);
  }
 };
 const app={get:(route,...fn)=>routes[route]=fn.at(-1),post(){},put(){},delete(){}};
 register(app,{enableAutoReview:false,isAdmin:()=>isAdmin,getDatabase:async()=>db});
 const request={session:{oryonUser:{id:'owner'}},query:{},get:()=> 'https://swapp.tv'};
 const response=()=>({code:200,data:null,headers:{},status(n){this.code=n;return this},
  set(name,value){this.headers[name]=value;return this},json(value){this.data=value;return this}});
 return {route:routes['/api/swapp/serveurs/diagnostic'],request,response,calls};
}
test('diagnostic checks the actual ranking SQL and reports populated statuses',async()=>{
 const a=harness(),r=a.response();
 await a.route(a.request,r);
 assert.equal(r.code,200);
 assert.deepEqual(r.data.counts,{published:2,pending:1});
 assert.equal(r.data.listing.status,'ready');
 assert.equal(r.data.listing.mode,'ranking_with_branding');
 assert.ok(a.calls.some(q=>q.includes('LEFT JOIN swapp_game_server_branding')));
 assert.equal(r.headers['Cache-Control'],'private,no-store');
 assert.doesNotMatch(JSON.stringify(r.data),/mysql:\/\/|password|user@host/);
});
test('missing optional branding is isolated and reports a minimal listing still available',async()=>{
 const a=harness({missingBranding:true}),r=a.response();
 await a.route(a.request,r);
 assert.equal(r.code,200);
 assert.equal(r.data.listing.status,'fallback_ready');
 assert.equal(r.data.listing.reason,'missing_or_denied_optional_table');
 assert.equal(r.data.tables.swapp_game_server_branding,'unavailable');
});
test('a MySQL connection failure yields genuine 503 without a false count',async()=>{
 const a=harness({offline:true}),r=a.response();
 await a.route(a.request,r);
 assert.equal(r.code,503);
 assert.equal(r.data.status,'unavailable');
 assert.equal(r.data.counts,undefined);
});
test('public users cannot retrieve internal schema/diagnostic state',async()=>{
 const a=harness({isAdmin:false}),r=a.response();
 await a.route(a.request,r);
 assert.equal(r.code,403);
 assert.deepEqual(r.data,{error:'acces_refuse'});
 assert.equal(a.calls.length,0);
});
test('client uses a single accessible failure state and preserves existing category cards',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers.js'),'utf8');
 assert.match(code,/async function apiFailure/);
 assert.match(code,/text\/html/);
 assert.match(code,/recaptcha\|captcha/);
 assert.match(code,/kind:challenge\?'challenge':'upstream'/);
 assert.match(code,/feedback\.textContent='';/);
 assert.doesNotMatch(code,/Actualisation indisponible : les fiches déjà chargées restent visibles/);
 assert.match(code,/if\(state\.status==='error'&&keepServerRendered/);
 assert.match(code,/more\.hidden=true;more\.disabled=false;return;/);
});
