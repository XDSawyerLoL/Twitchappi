'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {correctWoWForever,SLUG}=require('../modules/swapp-news/editorial-corrections');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
test('only the specifically outdated published WoW article receives editorial correction',()=>{
 const old={slug:SLUG,title:'World of Warcraft Forever: Le trailer!',summary:'On a testé World of Warcraft Forever',body:'World of Warcraft: Forever a été testé par des joueurs',publishedAt:'2026-10-15T00:00:00Z',game:'World of Warcraft',image:{url:'https://cdn.arstechnica.net/unverified.jpg'},commercialLinks:[{kind:'affiliate',url:'https://example.com'}]};
 const revised=correctWoWForever(old);
 assert.match(revised.title,/bande-annonce/);
 assert.ok(revised.body.length>2000);
 assert.match(revised.body,/ne dispose pas d’un test de première main/);
 assert.match(revised.body,/5 novembre 2026/);
 assert.match(revised.body,/système d’héritage/);
 assert.equal(revised.image,null);
 assert.equal(revised.commercialLinks.length,0);
 assert.equal(revised.sources.length,4);
 assert.equal(revised.trailerUrl,'https://www.youtube.com/watch?v=uQuKE0KDgiM');
 assert.equal(old.body,'World of Warcraft: Forever a été testé par des joueurs');
 assert.equal(correctWoWForever({...old,slug:'another-article'}).title,old.title);
 assert.equal(correctWoWForever({...old,body:'Nouvelle publication vérifiée',summary:'Bande-annonce officielle'}).title,old.title);
 const html=renderNewsStory(old);
 assert.match(html,/bande-annonce, sortie et nouveautés/);
 assert.match(html,/Sources et références/);
 assert.match(html,/système d’héritage/);
 assert.doesNotMatch(html,/On a testé World of Warcraft Forever/);
 assert.doesNotMatch(html,/cdn\.arstechnica/);
});
test('public API responses and list previews apply the same correction',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const router=fs.readFileSync(path.join(__dirname,'../modules/swapp-news/router.js'),'utf8');
 assert.match(router,/\.map\(correctWoWForever\)\.sort/);
 assert.match(router,/res\.json\(correctWoWForever\(publicArticle\(exact\.data\(\)\)\)\)/);
 assert.match(router,/res\.json\(correctWoWForever\(publicArticle\(snap\.data\(\)\)\)\)/);
});

test('WoW trailer uses one immersive scene on native and SPA article views',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const native=read('modules/swapp-news/native-pages.js');
 const spa=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-article-immersive.css');
 const script=read('assets/swapp-article-trailer-bg.js');
 assert.match(native,/data-swapp-trailer-id/);
 assert.match(native,/swapp-article-trailer-poster/);
 assert.match(spa,/scene\.dataset\.swappTrailerId=trailerId/);
 assert.match(spa,/SwappTrailerHero\?\.mount\?\.\(scene\)/);
 assert.match(css,/\.swapp-article-scene\.has-trailer/);
 assert.match(css,/\.swapp-article-trailer-frame/);
 assert.match(script,/www\.youtube-nocookie\.com\/embed/);
 assert.match(script,/CONSENT_API_READY/);
 assert.match(script,/prefers-reduced-motion/);
 assert.match(script,/saveData/);
 assert.match(script,/if\(cmp===false\)/);
 assert.match(script,/stop\(\)/);
 assert.match(script,/mute=1/);
 for(const shell of ['index.html','modules/swapp-news/site-shell.js'])
  assert.match(read(shell),/swapp-article-trailer-bg\.js\?v=20261019-trailer-autoplay-cover-v3/);
});
