'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

test('ACTUS return sits in its own semantic navigation with reliable top spacing',()=>{
 const article=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-art-direction.css');
 assert.match(article,/node\.classList\.add\('swapp-actus-reading'\)/);
 assert.match(article,/const nav=el\('nav','swapp-actus-reader-nav'\)/);
 assert.match(article,/nav\.setAttribute\('aria-label','Retour à la rubrique Actualités'\)/);
 assert.match(article,/back\.onclick=home/);
 assert.match(css,/#actus \.swapp-actus-native\.swapp-actus-reading\{/);
 assert.match(css,/padding-top:clamp\(40px,4\.5vw,64px\)!important/);
 assert.match(css,/\.swapp-actus-go-back\{/);
 assert.match(css,/background:transparent!important/);
});

test('above-the-fold layout shows featured article, then live channels, then the remaining news',()=>{
 const home=read('assets/swapp-home-news.js'),runtime=read('index_script.js'),css=read('assets/swapp-art-direction.css');
 assert.match(home,/const liveShelf=modern\?\.querySelector\('\.homeLiveSection1014'\)/);
 assert.match(home,/if\(liveShelf\)modern\.insertBefore\(section,liveShelf\)/);
 assert.match(home,/const featuredSlug=decorateHero\(modern,valid/);
 assert.match(home,/visible=featuredSlug\?valid\.filter\(item=>item\.slug!==featuredSlug\):valid/);
 assert.doesNotMatch(home,/browseLive\.href='\/decouvrir'/);
 assert.match(runtime,/id="homeLiveGrid1014"/);
 assert.match(css,/#home \.swappHome1014 \.homeHeroInner1014/);
 assert.match(css,/#home \.swappHome1014>\.homeLiveSection1014/);
});

test('homepage public lives and Twitch follows occupy separate horizontal rows',()=>{
 const runtime=read('index_script.js'),css=read('assets/swapp-game-journey.css');
 assert.match(runtime,/items\.slice\(0,8\)\.map\(card\)/);
 assert.match(runtime,/id="homeFollowedRail1014"/);
 assert.match(runtime,/class="homeFollowedSection1014" hidden/);
 assert.match(runtime,/section\.hidden=false/);
 assert.doesNotMatch(runtime,/Connecte Twitch pour retrouver tes chaînes suivies\./);
 assert.match(css,/#home \.homeFollowedSection1014\[hidden\]\{display:none!important\}/);
 assert.match(runtime,/loadHomeFollowed\(\)/);
 assert.match(runtime,/\/api\/twitch\/followed\/live/);
 assert.doesNotMatch(runtime,/id="homeLiveMore1014"/);
 assert.match(css,/grid-auto-flow:column!important/);
 assert.match(css,/\.homeFollowedRail1014\{/);
 assert.match(css,/scroll-snap-type:x proximity/);
});

test('fresh assets are referenced by both the SPA and editorial shell',()=>{
 const main=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const asset of ['swapp-actus-app.js']){
  assert.match(main,new RegExp(asset.replace(/\./g,'\\.')+'\\?v=20261015-player-41'));
 }
 assert.match(main,/swapp-art-direction\.css\?v=20261015-player-39/);
 assert.match(main,/index_script\.js\?v=20261018-followed-session-v27/);
 assert.match(shell,/swapp-art-direction\.css\?v=20261015-player-39/);
});
