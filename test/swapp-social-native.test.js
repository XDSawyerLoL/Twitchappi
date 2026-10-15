'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {community}=require('../modules/swapp-hubs');
const {permitted,safeQuery,createSocialNativeProxy,SOCIAL_ORIGIN}=require('../modules/swapp-social-native-proxy');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mockResponse=()=>({
 statusCode:200,headers:{},value:null,
 set(k,v){this.headers[k]=v;return this},
 status(s){this.statusCode=s;return this},
 json(v){this.value=v;return this}
});
test('the entire original SOCIAL UI is embedded without iframe or another site menu',()=>{
 const html=community();
 assert.match(html,/class="top"/);
 assert.match(html,/id="swappSocialNative"/);
 assert.match(html,/id="pulse-feed"/);
 assert.match(html,/data-view="profile"/);
 assert.match(html,/data-view="circles"/);
 assert.match(html,/data-view="messages"/);
 assert.match(html,/data-view="notifications"/);
 assert.match(html,/data-view="saved"/);
 assert.match(html,/id="pulse-text"/);
 assert.match(html,/id="auth-modal"/);
 assert.match(html,/type="module" src="\/assets\/swapp-social-native\/app\.js/);
 assert.match(html,/href="\/communaute"[^>]*aria-current="page"/);
 assert.doesNotMatch(html,/<iframe/);
 assert.doesNotMatch(html,/id="swappCommunityFeed"/);
});
test('the native client uses SWAPP routes and imports, with no cross-origin browser API',()=>{
 const core=read('assets/swapp-social-native/core.js');
 const app=read('assets/swapp-social-native/app.js');
 const views=read('assets/swapp-social-native/views.js');
 assert.match(core,/API_BASE=''/);
 assert.match(core,/sessionStorage\.getItem/);
 assert.match(core,/feed:'discover'/);
 assert.match(views,/NEWS_FEEDS=\['\/api\/actus'\]/);
 assert.match(app,/loadMessages/);
 assert.match(app,/loadCircles/);
 assert.match(app,/loadConversation/);
 for(const file of ['core','app','render','session','views']){
  const src=read('assets/swapp-social-native/'+file+'.js');
  assert.doesNotMatch(src,/from\s+['"]\.\/[^'"]+\?v=/);
 }
});
test('only actual Quantic SOCIAL routes are reachable through the SWAPP bridge',()=>{
 for(const [method,url] of [
  ['GET','/feed'],['GET','/health'],['GET','/conversations'],['GET','/messages/sansa'],
  ['GET','/users/sansa'],['GET','/posts/p_abcdef'],['POST','/posts'],
  ['POST','/messages'],['POST','/circles'],['POST','/auth/register'],
  ['POST','/users/sansa/follow'],['POST','/posts/p_abcdef/like'],
  ['PATCH','/me']
 ])assert.equal(permitted(method,url),true,method+' '+url);
 for(const [method,url] of [
  ['DELETE','/me'],['GET','/admin/export'],['GET','/auth/quantic/challenge'],
  ['POST','/users/sansa/delete'],['POST','/posts/p_abcdef/../../../admin'],['GET','//evil.example']
 ])assert.equal(permitted(method,url),false,method+' '+url);
});
test('feed query gets a bounded set of parameters',()=>{
 assert.equal(safeQuery('/feed','mode=discover&limit=100000&url=http://evil'),'?mode=discover&limit=40');
 assert.equal(safeQuery('/feed','mode=admin&limit=-3'),'?mode=discover&limit=1');
});
test('an authenticated message is proxied to the pinned server, not a user supplied endpoint',async()=>{
 const forwarded=[];
 const handler=createSocialNativeProxy(async(url,opts,timeout)=>{
  forwarded.push({url,opts,timeout});
  return {status:201,text:async()=>JSON.stringify({message:{id:'m_test'}})};
 },{production:true});
 const token='a'.repeat(43),res=mockResponse();
 await handler({method:'POST',path:'/messages',headers:{
   origin:'https://swapp.tv',referer:'https://swapp.tv/communaute',
   cookie:'SWAPP_SECRET=hidden',authorization:'Bearer '+token
 },body:{handle:'sansa',body:'Salut'},originalUrl:'/api/pulse/messages'},res);
 assert.equal(res.statusCode,201);
 assert.equal(forwarded.length,1);
 assert.equal(forwarded[0].url,SOCIAL_ORIGIN+'/api/pulse/messages');
 assert.deepEqual(JSON.parse(forwarded[0].opts.body),{handle:'sansa',body:'Salut'});
 assert.deepEqual(Object.keys(forwarded[0].opts.headers).sort(),['Accept','Authorization','Content-Type'].sort());
 assert.equal(forwarded[0].timeout,8000);
});
test('SOCIAL writes require the correct origin and independent bearer credentials',async()=>{
 const handler=createSocialNativeProxy(async()=>{throw Error('Must not call upstream')},{production:true});
 const denied=mockResponse();
 await handler({method:'POST',path:'/messages',headers:{origin:'https://evil.example'},body:{body:'x'},originalUrl:'/api/pulse/messages'},denied);
 assert.equal(denied.statusCode,403);
 const noToken=mockResponse();
 await handler({method:'POST',path:'/messages',headers:{origin:'https://swapp.tv'},body:{body:'x'},originalUrl:'/api/pulse/messages'},noToken);
 assert.equal(noToken.statusCode,401);
});
test('duplicate menu links are actively removed after a racing SPA render',()=>{
 const src=read('assets/swapp-hub-nav.js');
 assert.match(src,/nav\.querySelectorAll\('a,button'\)/);
 assert.match(src,/if\(seen\.has\(href\)\)/);
 assert.match(src,/el\.remove\(\)/);
 assert.doesNotMatch(src,/group\.append\(mk\(/);
 assert.match(src,/MutationObserver\(queue\)/);
 const spa=read('index.html');
 assert.match(spa,/swapp-hub-nav\.js/);
 const native=read('modules/swapp-news/site-shell.js');
 assert.match(native,/swapp-hub-nav\.js/);
});
