'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Discord-style fixed workspace keeps sidebar, main and right rail for every view',()=>{
 const product=read('assets/swapp-social-product-v3.css');
 const timeline=read('assets/swapp-social-timeline.css');
 assert.doesNotMatch(product,/data-social-view="messages"\] \.pulse-right\s*,/);
 assert.doesNotMatch(product,/grid-template-columns:220px minmax\(0,1fr\)/);
 assert.match(timeline,/grid-template-columns:218px minmax\(0,1fr\) 270px!important/);
 assert.match(timeline,/\.pulse-right\{\s*display:block!important/);
 assert.match(timeline,/grid-template-columns:75px minmax\(0,1fr\) 230px!important/);
 assert.match(timeline,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});
test('vocal is accessed from the bottom of the persistent sidebar, never over the feed header',()=>{
 const ui=read('assets/swapp-social-native/social-body.html');
 const header=ui.split('<header class="pulse-topbar">')[1]?.split('</header>')[0]||'';
 const side=ui.split('<aside class="pulse-sidebar">')[1]?.split('</aside>')[0]||'';
 assert.doesNotMatch(header,/swapp-social-voice-shortcut/);
 assert.match(side,/class="swapp-social-voice-dock"/);
 assert.match(side,/data-view="rooms"/);
 for(const menu of ['pulse-nav','pulse-mobile-nav']){
  const m=ui.split('<nav class="'+menu+'"')[1]?.split('</nav>')[0]||'';
  assert.match(m,/data-view="rooms"/);
 }
});
test('RSS-style SWAPP editorial news appears in a 3rd tab AND inside discovery even with existing posts',()=>{
 const ui=read('assets/swapp-social-native/social-body.html');
 const views=read('assets/swapp-social-native/views.js');
 assert.match(ui,/data-feed="news"/);
 assert.match(ui,/data-feed="discover"/);
 assert.match(ui,/data-feed="following"/);
 assert.match(views,/const NEWS_FEEDS=\['\/api\/actus'\]/);
 assert.match(views,/if\(state\.feed==='discover'\)void appendRealNewsToDiscovery\(revision,posts\.length>0\)/);
 assert.match(views,/posts\[Math\.min\(1,posts\.length-1\)\]/);
 assert.match(views,/if\(anchor\)anchor\.after\(section\)/);
 assert.doesNotMatch(views,/showRealNewsWhenEmpty/);
 assert.match(views,/if\(!isCurrent\(revision,'home'\)\|\|state\.feed!=='discover'/);
});
test('only published SWAPP API articles power the editorial cards, with read/repost/share actions',()=>{
 const views=read('assets/swapp-social-native/views.js');
 const app=read('assets/swapp-social-native/app.js');
 assert.match(views,/data-news-repost/);
 assert.match(views,/data-news-share/);
 assert.match(views,/data-feed-switch="news"/);
 assert.match(views,/safeNewsUrl\(item\.url\|\|item\.articleUrl\)/);
 assert.match(app,/newsShare\.dataset\.newsUrl/);
 assert.match(app,/navigator\.share\(/);
 assert.match(app,/navigator\.clipboard\?\.writeText/);
 assert.match(app,/await api\('\/api\/pulse\/posts',\{method:'POST'/);
 assert.match(app,/const newsSwitch=event\.target\.closest\('\[data-feed-switch="news"\]'\)/);
});
test('CSS and module versions are refreshed to avoid stale Hostinger/browser assets',()=>{
 const hub=read('modules/swapp-hubs.js');
 const app=read('assets/swapp-social-native/app.js');
 for(const name of ['swapp-social-timeline.css?v=20261021-discord-news-v1',
  'swapp-social-native/app.js?v=20261021-rss-media-community-v2',
  'swapp-social-product-v3.css?v=20261021-fixed-shell-v1'])assert.ok(hub.includes(name),name);
 assert.match(app,/views\.js\?v=20261021-rss-media-community-v2/);
});
