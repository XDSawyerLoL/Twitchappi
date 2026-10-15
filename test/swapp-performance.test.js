'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('large main SPA bundle is deferred and not main-thread parser blocking',()=>{
 const html=read('index.html');
 assert.match(html,/<script src="\/index_script\.js\?v=[^"]+" defer><\/script>/);
 assert.ok(html.indexOf('src="/assets/swapp-navigation.js?') < html.indexOf('src="/index_script.js?'));
});

test('large versioned SPA bundle is cacheable while old unversioned requests are not',()=>{
 const server=read('server.js');
 assert.match(server,/app\.get\('\/index_script\.js',\s*\(req,res\)/);
 assert.match(server,/req\.query\?\.v/);
 assert.match(server,/public, max-age=1800/);
 assert.match(server,/no-store, no-cache, must-revalidate/);
 assert.match(server,/cacheControl:false/);
 assert.match(server,/maxAge: '30m'/);
});

test('homepage news observer no longer traverses all live cards on each mutation',()=>{
 const source=read('assets/swapp-home-news.js');
 assert.match(source,/new MutationObserver\(queue\)\.observe\(home,\{/);
 assert.match(source,/childList:true,subtree:false/);
 assert.match(source,/attributeFilter:\['class'\]/);
 assert.match(source,/visibilityState==='hidden'/);
 assert.match(source,/home\.classList\.contains\('active'\)/);
 assert.doesNotMatch(source,/observe\(home,\{childList:true,subtree:true\}/);
});

test('navigation DOM reconciliation is frame-batched, never one costly pass per microtask',()=>{
 const source=read('assets/swapp-hub-nav.js');
 assert.match(source,/requestAnimationFrame/);
 assert.match(source,/if\(queued\)return/);
 assert.match(source,/nextFrame\(\(\)=>\{queued=false;reconcile\(\)\}\)/);
 assert.match(source,/el\.replaceWith\(link\)/);
});

test('both page shells use latest batched menu script with no stale assets',()=>{
 const spa=read('index.html'),ssr=read('modules/swapp-news/site-shell.js');
 for(const source of [spa,ssr]){
  assert.match(source,/swapp-hub-nav\.js\?v=20261015-perf-1/);
  assert.doesNotMatch(source,/swapp-hub-nav\.js\?v=20261015-community-restore-10/);
 }
 assert.match(spa,/swapp-home-news\.js\?v=20261015-perf-1/);
});

test('SOCIAL remains mounted on its full native page and uses an independent backend',()=>{
 const site=read('modules/swapp-hubs.js');
 const native=read('assets/swapp-social-native/social-body.html');
 const server=read('server.js');
 assert.match(site,/social-body\.html/);
 assert.match(site,/swapp-social-native\/app\.js/);
 assert.match(native,/id="pulse-feed"/);
 assert.match(native,/id="pulse-text"/);
 assert.match(native,/data-view="messages"/);
 assert.match(server,/app\.get\('\/communaute'/);
 assert.match(server,/app\.use\('\/api\/pulse'/);
});
