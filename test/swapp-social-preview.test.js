'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SOCIAL_ORIGIN,normalizePublicPosts,createPreviewHandler}=require('../modules/swapp-social-preview');

function response(){
 const state={status:200,headers:{},payload:null};
 return {state,set(name,value){state.headers[name]=value;return this},
 status(code){state.status=code;return this},
 json(payload){state.payload=payload;return this}};
}
test('SOCIAL pilot is pinned to the existing Quantic Sillage backend, not an arbitrary URL',()=>{
 assert.equal(SOCIAL_ORIGIN,'https://quanticminds.onrender.com');
 const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
 assert.match(server,/app\.get\('\/api\/swapp\/social-preview',createPreviewHandler\(fetchWithTimeout\)\)/);
});
test('only genuine nonprivate public posts are returned',()=>{
 const data={posts:[
  {id:'p_good',body:'Un direct ce soir',circleId:null,author:{displayName:'Joueur'},createdAt:'2026-10-14T18:00:00Z'},
  {id:'p_private',body:'Privé',circleId:'circle_secret',author:{displayName:'Test'}},
  {id:'p_good',body:'Doublon'},
  {id:'',body:'Sans identifiant'},
  {id:'p_blank',body:'   '}
 ]};
 const posts=normalizePublicPosts(data);
 assert.equal(posts.length,1);
 assert.equal(posts[0].body,'Un direct ce soir');
 assert.equal(posts[0].author,'Joueur');
 assert.equal(posts[0].createdAt,'2026-10-14T18:00:00.000Z');
 assert.equal(posts[0].circleId,undefined);
 assert.equal(posts[0].authorId,undefined);
 assert.equal(posts[0].linkUrl,undefined);
});
test('read-only endpoint never forwards cookies or user auth to SOCIAL',async()=>{
 let request;
 const handler=createPreviewHandler(async(url,options,timeout)=>{
  request={url,options,timeout};
  return {ok:true,json:async()=>({posts:[{id:'post-1',body:'Message public',author:{handle:'joueur'}}]})};
 });
 const res=response();
 await handler({headers:{authorization:'Bearer private',cookie:'session=secret'}},res);
 assert.equal(res.state.status,200);
 assert.equal(res.state.payload.success,true);
 assert.equal(res.state.payload.readonly,true);
 assert.deepEqual(Object.keys(request.options.headers),['Accept']);
 assert.equal(request.options.redirect,'error');
 assert.equal(request.options.size,160000);
 assert.equal(request.timeout,4500);
 assert.ok(request.url.startsWith(SOCIAL_ORIGIN+'/api/pulse/feed?'));
});
test('SOCIAL service failure returns an honest non-fatal 503 without fabricated posts',async()=>{
 const handler=createPreviewHandler(async()=>{throw Error('offline')});
 const res=response();
 await handler({},res);
 assert.equal(res.state.status,503);
 assert.deepEqual(res.state.payload.posts,[]);
 assert.equal(res.state.payload.error,'social_preview_unavailable');
 assert.equal(res.state.headers['Cache-Control'],'no-store');
});
