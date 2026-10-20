'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('SOCIAL uses /social as its canonical public URL and redirects the legacy route',()=>{
 const server=read('server.js');
 const seo=read('modules/swapp-seo.js');
 const shell=read('modules/swapp-news/site-shell.js');
 const navigation=require('../assets/swapp-navigation');
 assert.match(server,/app\.get\('\/communaute',\(req,res\)=>\{[^\n]*res\.redirect\(308,'\/social'/);
 assert.match(server,/app\.get\('\/social',/);
 assert.ok(seo.includes("'/social'"));
 assert.ok(!seo.includes("'/communaute', '/bandes-annonces'"));
 assert.match(shell,/community:'\/social'/);
 assert.equal(navigation.items.find(x=>x.id==='community').href,'/social');
 assert.equal(navigation.items.find(x=>x.id==='community').label,'Social');
 assert.match(navigation.serverMobile('community'),/href="\/social"/);
});
test('SOCIAL shared links, articles and status use the new route',()=>{
 for(const p of ['assets/swapp-hub-nav.js','assets/swapp-footer.js','assets/swapp-social-access.js',
   'assets/swapp-social-native/views.js','assets/swapp-actus-app.js','modules/swapp-game-pages.js',
   'assets/swapp-home-news.js','assets/swapp-my-games-live.js']){
  assert.ok(read(p).includes('/social'),p+' did not migrate to /social');
  assert.ok(!read(p).includes('/communaute'),p+' contains a legacy link');
 }
 const page=require('../modules/swapp-hubs').community();
 assert.match(page,/href="\/social"[^>]*aria-current="page"/);
 assert.match(page,/swapp-social-timeline\.css\?v=/);
 assert.doesNotMatch(page,/href="\/communaute"/);
});
function coreApi(fetchImpl){
 const core=read('assets/swapp-social-native/core.js')
   .replace(/^export /gm,'')+'\nmodule.exports={api};';
 const ctx={module:{exports:{}},document:{getElementById(){return null}},fetch:fetchImpl,
   setTimeout(callback){callback();return 1},AbortSignal:{timeout(){return undefined}},
   URL,Date,Error,Promise,console};
 vm.runInNewContext(core,ctx,{timeout:2000});
 return ctx.module.exports.api;
}
test('SOCIAL retries a failed GET read, but NEVER retries a POST write',async()=>{
 let reads=0;
 const reader=coreApi(async()=>{
  reads++;
  return {ok:reads===2,status:reads===1?503:200,
    json:async()=>reads===1?{error:'social_upstream_unavailable'}:{posts:[{id:'ok'}]}};
 });
 const result=await reader('/api/pulse/feed?mode=discover');
 assert.equal(reads,2);
 assert.equal(result.posts.length,1);
 let writes=0;
 const writer=coreApi(async()=>{
  writes++;return{ok:false,status:503,json:async()=>({error:'social_upstream_unavailable'})};
 });
 await assert.rejects(()=>writer('/api/pulse/posts',{method:'POST',body:'{}'}),/social_upstream_unavailable/);
 assert.equal(writes,1);
});
test('malformed posts and dangerous media URLs cannot crash or inject unsafe previews',()=>{
 const src=read('assets/swapp-social-native/render.js');
 assert.match(src,/secureMediaUrl/);
 assert.match(src,/u\.protocol==='https:'\|\|u\.protocol==='http:'/);
 assert.match(src,/post\.quote\.author\?\.handle/);
 assert.match(src,/posts\.filter\(post=>post&&typeof post==='object'&&post\.id\)/);
 assert.match(src,/aria-pressed/);
});
test('failed feeds and messages expose an actual retry instead of a dead error banner',()=>{
 const view=read('assets/swapp-social-native/views.js'),app=read('assets/swapp-social-native/app.js');
 assert.match(view,/data\.socialRetry=retry/);
 assert.match(view,/showRecoverableError\('Fil momentanément indisponible'/);
 assert.match(view,/showRecoverableError\('Messages indisponibles'/);
 assert.match(view,/showRecoverableError\('Conversation indisponible'/);
 assert.match(app,/\[data-social-retry\]/);
 assert.match(app,/retry\.dataset\.socialRetry==='conversation'/);
});
