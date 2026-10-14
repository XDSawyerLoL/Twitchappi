'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const {serverHeader}=require('../assets/swapp-navigation');

test('same SWAPP. wordmark in SPA and public media header',()=>{
 const main=read('index.html'),header=serverHeader();
 const wordmark=/class="brand"[^>]*>\s*<span class="swapp-wordmark-text">SWAPP<span class="swapp-wordmark-dot"/;
 assert.match(main,wordmark);
 assert.match(header,wordmark);
 assert.doesNotMatch(main,/<a class="brand"[^>]*>\s*<span class="brandMark"/);
 assert.doesNotMatch(header,/<a class="brand"[^>]*>\s*<span class="brandMark"/);
});

test('branding CSS loaded after navigation styles in both page types',()=>{
 const main=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const doc of [main,shell]){
  const nav=doc.indexOf('/assets/swapp-unified-nav.css');
  const visual=doc.indexOf('/assets/swapp-visual-polish.css?v=');
  assert.ok(nav>=0&&visual>nav,'final branding style follows navigation CSS');
 }
 assert.match(read('assets/swapp-visual-polish.css'),/\.swapp-wordmark-dot/);
});

test('homepage discovery links preserve ACTUS and LIVE routes',()=>{
 const script=read('assets/swapp-home-news.js');
 assert.match(script,/all\.href='\/actus'/);
 assert.match(script,/browseLive\.href='\/decouvrir'/);
 assert.match(script,/window\.setView\('discover'\)/);
 assert.match(script,/\/api\/actus/);
 assert.match(script,/const modern=home\.querySelector\('\.swappHome1014'\)/);
});
