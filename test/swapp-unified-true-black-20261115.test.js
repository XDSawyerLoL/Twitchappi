'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const stylesheet=read('assets/swapp-obsidian-ice.css');
const version='swapp-obsidian-ice.css?v=20261116-unified-black-v23';

test('homepage and native pages use one cache-busted black contract',()=>{
 const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
 const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
 const spa=renderIntoSpa(read('index.html'));
 const native=renderPage({head:'<meta charset="utf-8">'+SHARED_HEAD_SLOT,content:'<main>Test</main>'});
 for(const output of [spa,native]){
  assert.equal(output.split(version).length-1,1);
  assert.ok(output.indexOf(version)<output.indexOf('</head>'));
 }
 assert.match(read('index.html'),/:root\{--bg:#030405;--surface:#101214/);
 assert.match(read('index.html'),/html,body\{margin:0;background:#030405;/);
 assert.match(read('modules/swapp-news/site-shell.js'),/--bg:#030405;--layer:#101214/);
});

test('background of every content route uses black instead of a blue page-wide gradient',()=>{
 for(const selector of [
  'html body.swapp-editorial-route','html body.swapp-catalogue-lab-page','html body.swapp-explorer-page',
  'html body main.app > .view','html body .swapp-store','html body .swapp-my-games',
  'html body .game-portal','html body .oa-page','html body .oas',
  'html body .sco','html body #swapp-portail','html body .swapp-independence'
 ])assert.ok(stylesheet.includes(selector),selector);
 assert.match(stylesheet,/--swapp-site-black:#030405/);
 assert.match(stylesheet,/--bg:#030405!important/);
 assert.match(stylesheet,/background:#030405!important;\s*background-image:none!important/);
 assert.match(stylesheet,/html\.swapp-editorial-theme body\.swapp-editorial-route \.article-wrap\s*\{\s*background:#030405!important/);
});

test('TV, programme, social, podcast, portal and games use graphite content surfaces',()=>{
 for(const name of [
  '.stv .stv-screen-inner','.stv :is(.stv-nowbar','.scal :is(.scal-head',
  '.scal :is(.scal-day','.swapp-social-viewport .pulse-shell',
  '.swapp-social-viewport .pulse-main','.pulse-sidebar',
  '.oa-page :is(.oa-hero','.sco :is(.sco-panel',
  '#swapp-portail :is(.sp-hero','.game-portal .cards.index > .game-index-card',
  '.swapp-store :is(.swapp-store-card'
 ])assert.ok(stylesheet.includes(name),name);
 assert.match(stylesheet,/--swapp-site-raised:#101214/);
 assert.match(stylesheet,/background:#101214!important/);
});

test('theme preserves real photos, video and buttons: no universal filter or repaint',()=>{
 const added=stylesheet.slice(stylesheet.indexOf('/* V22 / THE SAME BLACK ON EVERY SWAPP ROUTE.'));
 assert.ok(added.length>3000);
 assert.doesNotMatch(added,/\bimg\s*\{|\bvideo\s*\{|filter:blur\(|opacity:\s*0/);
 assert.match(added,/\.game-portal \.hero:not\(:has\(\.hero-cover\)\)/);
 assert.doesNotMatch(added,/\.scl-game-poster-image img\s*\{/);
 assert.match(added,/Do not recolor[\s\S]*video, game art, user uploads/);
});

test('major actual routes render through the same shared black-theme HTML shell',()=>{
 const {page:tv}=require('../modules/swapp-program');
 const {page:explorer}=require('../modules/swapp-explorer');
 const {renderNewsHome}=require('../modules/swapp-news/native-pages');
 const {home:podcast}=require('../modules/swapp-on-air');
 const {community,shop}=require('../modules/swapp-hubs');
 const outputs=[
  ['TV',tv('tv')],['programme',tv('agenda')],['Explorer',explorer()],
  ['ACTUS',renderNewsHome([])],['PODCAST',podcast()],
  ['SOCIAL',community()],['Boutique',shop()]
 ];
 for(const [page,html] of outputs){
  assert.ok(html.includes(version),page+' has no global black CSS');
  assert.equal(html.split(version).length-1,1,page+' has a duplicated theme');
  assert.ok(html.includes('data-swapp-shell="shared-native-v2"'),page+' has divergent shell');
 }
});
