'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {registerEditorialRadar,READ_PUBLISHED} =
  require('../modules/swapp-autonomy/editorial-radar-router');
function trend() {
 return {state:'ready',comparable:true,source:'twitch-helix-fr-first100',
  coverage:'bounded-provider-sample-not-market-share',ageSeconds:100,
  sampledAt:'2026-11-20T09:40:00Z',previousSampledAt:'2026-11-20T09:35:00Z',
  games:[{game:'Grand Theft Auto VI',gameId:'1867279146',streams:25,
   observedViewers:21971,smallStreams:3,deltaStreams:-1,deltaObservedViewers:192,deltaSmallStreams:0}]};
}
function harness(opts={}) {
 const routes = new Map();
 const app={get(path,...handlers){routes.set(path,handlers.at(-1));}};
 const db={calls:[],async execute(sql,args){
  this.calls.push({sql,args});
  return [[{slug:'published-gta-vi-article',game:'GTA 6',title:'Dossier GTA VI',
   category:'Actualités JV',status:'published',publishedAt:'2026-11-19T08:00:00Z'}]];
 }};
 const state={status:200,headers:{},body:null};
 const response={set(k,v){state.headers[k]=v;return this;},
  status(code){state.status=code;return this;},
  json(data){state.body=data;return this;}};
 const limiter=(_req,_res,next)=>next();
 registerEditorialRadar(app,{getTrends:async()=>trend(),getPool:()=>db,limiter,...opts});
 return {db,state,handler:routes.get('/api/swapp/autonomy/editorial-opportunities'),response};
}
test('metadata SQL is read-only and bounded, with the actual published index filter',()=>{
 assert.match(READ_PUBLISHED,/^SELECT /);
 assert.match(READ_PUBLISHED,/collection_name=\?/);
 assert.match(READ_PUBLISHED,/status'\)\)='published'/);
 assert.match(READ_PUBLISHED,/LIMIT 200/);
 assert.doesNotMatch(READ_PUBLISHED,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
});
test('radar route returns a verified live observation and published editorial link',async()=>{
 const h=harness();
 await h.handler({},h.response);
 assert.equal(h.state.status,200);
 assert.equal(h.state.body.success,true);
 assert.equal(h.state.body.state,'ready');
 assert.equal(h.state.body.publicationAuthorized,false);
 assert.equal(h.state.body.opportunities[0].editorial.relatedArticle.url,'/actus/published-gta-vi-article');
 assert.equal(h.db.calls.length,1);
 assert.deepEqual(h.db.calls[0].args,['swapp_news_articles']);
 assert.equal(h.state.headers['Cache-Control'],'no-store');
});
test('disabled collector does not query MySQL at all',async()=>{
 const h=harness({getPool:()=>null});
 await h.handler({},h.response);
 assert.equal(h.state.status,503);
 assert.equal(h.state.body.state,'disabled');
 assert.equal(h.db.calls.length,0);
});
test('warming data never scans editorial catalogue',async()=>{
 const h=harness({getTrends:async()=>({...trend(),state:'warming',comparable:false})});
 await h.handler({},h.response);
 assert.equal(h.state.body.state,'awaiting-comparable-samples');
 assert.equal(h.db.calls.length,0);
});
test('database failure neither exposes SQL errors nor fails open to invented article links',async()=>{
 const h=harness({getPool:()=>({execute:async()=>{throw new Error('DB_PASSWORD_SECRET')}})});
 await h.handler({},h.response);
 assert.equal(h.state.status,200);
 assert.equal(h.state.body.catalogueStatus,'unavailable');
 assert.equal(h.state.body.opportunities[0].editorial.relatedArticle,null);
 assert.equal(JSON.stringify(h.state.body).includes('DB_PASSWORD_SECRET'),false);
});
