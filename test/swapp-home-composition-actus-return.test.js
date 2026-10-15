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
 assert.match(home,/if\(liveShelf\)modern\.append\(section\)/);
 assert.match(home,/const featuredSlug=decorateHero\(modern,valid/);
 assert.match(home,/visible=featuredSlug\?valid\.filter\(item=>item\.slug!==featuredSlug\):valid/);
 assert.doesNotMatch(home,/browseLive\.href='\/decouvrir'/);
 assert.match(runtime,/id="homeLiveGrid1014"/);
 assert.match(css,/#home \.swappHome1014 \.homeHeroInner1014/);
 assert.match(css,/#home \.swappHome1014>\.homeLiveSection1014/);
});

test('home live grid shows eight cards on desktop and four on mobile and safely expands or collapses the rest',()=>{
 const runtime=read('index_script.js'),css=read('assets/swapp-art-direction.css');
 assert.ok(runtime.includes("const initiallyVisible=window.matchMedia('(max-width:900px)').matches?4:8;"));
 assert.match(runtime,/cards\.forEach\(\(el,i\)=>\{el\.hidden=!wasExpanded&&i>=initiallyVisible\}\)/);
 assert.match(runtime,/more\.setAttribute\('aria-expanded',String\(wasExpanded&&extras>0\)\)/);
 assert.match(runtime,/more\.setAttribute\('aria-expanded',String\(!expanded\)\)/);
 assert.match(runtime,/cards\.forEach\(\(el,i\)=>\{el\.hidden=expanded&&i>=initiallyVisible\}\)/);
 assert.match(runtime,/id="homeLiveMore1014"/);
 assert.match(css,/#home \.homeLiveCard1014\[hidden\]\{display:none!important\}/);
 assert.match(css,/#home \.homeLiveGrid1014>\.homeLiveCard1014\s*\{/);
 assert.match(css,/grid-column:auto!important/);
 assert.match(css,/grid-row:auto!important/);
 assert.doesNotMatch(css,/grid-column:span 2;grid-row:span 2/);
 assert.match(css,/#home \.homeLiveMore1014\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(runtime,/Fallback Twitch/);
});

test('fresh assets are referenced by both the SPA and editorial shell',()=>{
 const main=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const asset of ['swapp-actus-app.js']){
  assert.match(main,new RegExp(asset.replace(/\./g,'\\.')+'\\?v=20261015-livegrid-32'));
 }
 assert.match(main,/swapp-art-direction\.css\?v=20261015-discovery-34/);
 assert.match(main,/index_script\.js\?v=20261015-discovery-34/);
 assert.match(shell,/swapp-art-direction\.css\?v=20261015-discovery-34/);
});
