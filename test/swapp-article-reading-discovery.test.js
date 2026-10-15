'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
const article={slug:'un-grand-jeu-swapp',title:'Un grand jeu vidéo à découvrir sur SWAPP',
  summary:'Une aventure pleine de surprises.',body:'## Introduction\n\nNotre analyse complète du jeu.\n\n## Verdict\n\nNotre conclusion.',
  publishedAt:'2026-10-16T09:00:00Z',author:'Rédaction SWAPP',category:'Actualités JV',game:'Jeu A',
  sources:[{url:'https://example.com/game',label:'Site officiel'}]};
test('article directly opened by URL has a small editorial next-reads rail',()=>{
 const html=renderNewsStory(article,{relatedArticles:[
  {slug:'jeu-a-en-direct',title:'Les créateurs découvrent le Jeu A',game:'Jeu A',
   image:{url:'https://example.com/picture.jpg',credit:'Éditeur',rights:'Autorisé'}},
  {slug:'autre-aventure',title:'Une autre aventure',category:'Actualités JV'}
 ]});
 assert.match(html,/class="swapp-article-reading"/);
 assert.match(html,/<details class="swapp-reader-next" open><summary>À découvrir ensuite<\/summary>/);
 assert.match(html,/class="swapp-reader-next-item" href="\/actus\/jeu-a-en-direct"/);
 assert.match(html,/class="swapp-reader-next-thumb"/);
 assert.match(html,/href="\/actus\/autre-aventure"/);
 assert.match(html,/Dans cet article/);
 assert.doesNotMatch(html,/swapp-actus-recommend-grid/);
});
test('a standalone article without recommendations still links back to SWAPP Actualité',()=>{
 const html=renderNewsStory(article);
 assert.match(html,/class="swapp-reader-next-all" href="\/actus"/);
});
test('side recommendations never include the article itself or an unsafe slug',()=>{
 const html=renderNewsStory(article,{relatedArticles:[
   {slug:article.slug,title:'Repeated'},
   {slug:'..',title:'Bad URL'},
   {slug:'safe-article',title:'Safe news'}
 ]});
 assert.match(html,/href="\/actus\/safe-article"/);
 assert.doesNotMatch(html,/href="\/actus\/\.\."/);
 assert.doesNotMatch(html,/class="swapp-reader-next-item" href="\/actus\/un-grand-jeu-swapp"/);
});
test('SPA recommends in the reader column, not as three big cards beneath it',()=>{
 const js=read('assets/swapp-actus-app.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/el\('details','swapp-reader-next'\)/);
 assert.match(js,/reading\.append\(recommend\)/);
 assert.match(js,/el\('a','swapp-reader-next-item'\)/);
 assert.doesNotMatch(js,/article\.append\(recommend\)/);
 assert.doesNotMatch(js,/recommendations\.append\(card\)/);
});
test('desktop reading is three columns and smaller screens collapse the discoveries',()=>{
 const css=read('assets/swapp-article-immersive.css');
 assert.match(css,/@media\(min-width:1200px\)/);
 assert.match(css,/grid-template-columns:minmax\(165px,195px\) minmax\(0,1fr\) minmax\(200px,235px\)/);
 assert.match(css,/grid-column:3!important;grid-row:1!important;position:sticky!important/);
 assert.match(css,/@media\(max-width:1199px\)/);
 assert.match(css,/@media\(max-width:880px\)/);
 assert.match(css,/swapp-reader-type-tools/);
});
test('reading preferences, headings, and progress work without tracking or animations',()=>{
 const js=read('assets/swapp-reader-experience.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/sessionStorage\.setItem\('swapp-reader-font-v1'/);
 assert.match(js,/aria-current','location'/);
 assert.match(js,/swapp-reader-percent/);
 assert.match(js,/Math.round\(100\*travelled\/distance\)/);
 assert.doesNotMatch(js,/className='swapp-reading-progress/);
 assert.match(js,/prefers-reduced-motion/);
 assert.doesNotMatch(js,/localStorage|sendBeacon|analytics|setInterval/);
});
test('SPA and native page load the same reader and versioned new styling',()=>{
 const spa=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 for(const text of [spa,native]){
  assert.match(text,/swapp-article-immersive\.css\?v=20261016-ig-offers-11/);
  assert.match(text,/swapp-reader-experience\.js\?v=20261016-reader-2/);
 }
 assert.match(spa,/swapp-actus-app\.js\?v=20261016-ig-offers-10/);
 assert.match(spa,/swapp-instant-gaming\.js\?v=20261016-ig-offers-1/);
});

test('article starts without old horizontal rails and keeps navigation intact',()=>{
 const spa=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-article-immersive.css');
 assert.doesNotMatch(spa,/const progress=el\('div','swapp-reading-progress'\)/);
 assert.doesNotMatch(spa,/window\.addEventListener\('scroll',updateProgress/);
 assert.match(css,/SWAPP article header cleanup/);
 assert.match(css,/\.swapp-actus-reader-nav::before/);
 assert.match(css,/\.swapp-actus-reader-nav::after/);
 assert.match(css,/\.swapp-actus-reading > \.swapp-reading-progress/);
 assert.match(css,/display:none!important/);
 assert.match(css,/\.swapp-reader-percent/);
 assert.match(spa,/const back=el\('button','swapp-actus-go-back'/);
});
