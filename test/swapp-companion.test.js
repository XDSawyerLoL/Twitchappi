'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const core=require('../assets/swapp-companion-core');
const {layout}=require('../modules/swapp-news/site-shell');

test('Mairy and events exist in SPA and editorial pages without another top menu',()=>{
 const home=read('index.html');
 const article=layout({content:'<main>Article</main>'});
 for(const html of [home,article]){
  assert.match(html,/swapp-mairy\.css\?v=20261015-companion-4/);
  assert.match(html,/swapp-companion-core\.js\?v=20261015-companion-4/);
  assert.match(html,/swapp-mairy\.js\?v=20261015-companion-4/);
  assert.ok(html.indexOf('swapp-companion-core.js')<html.indexOf('swapp-mairy.js'));
 }
 assert.doesNotMatch(article,/class="swapp-companion-panel"/);
});

test('real public live data creates only safe SWAPP links',()=>{
 const data={success:true,items:[
  {login:'Streamer_1',display_name:'Alice',game_name:'Elden Ring',platform:'twitch'},
  {login:'bob42',display_name:'Bob',game_name:'Minecraft',platform:'swapp'},
  {login:'bad/url',platform:'twitch'},
  {login:'Streamer_1',platform:'twitch'}
 ]};
 assert.deepEqual(core.lives(data).map(x=>x.href),
  ['/live/twitch/streamer_1','/bob42']);
 assert.equal(core.lives(data)[0].title,'Alice est en direct');
 assert.equal(core.lives({success:false,items:data.items}).length,0);
 assert.equal(core.lives({items:[{login:' '},{login:'<script>'}]}).length,0);
});

test('only published article slugs enter recommendations; invalid URLs are excluded',()=>{
 const found=core.news({articles:[
  {slug:'jeu-video-2026',title:'Un article',game:'Elden Ring'},
  {slug:'../../x',title:'Injection'},
  {slug:'jeu-video-2026',title:'Duplicate'}
 ]});
 assert.deepEqual(found.map(x=>x.href),['/actus/jeu-video-2026']);
 assert.deepEqual(core.suggest('Quoi de neuf sur elden ring ?',found).map(x=>x.id),['news:jeu-video-2026']);
});

test('a first poll never creates invented freshly started events',()=>{
 const initial=core.lives({success:true,items:[{login:'alice',platform:'twitch'}]});
 assert.deepEqual(core.newlySeen(null,initial),[]);
 assert.deepEqual(core.newlySeen(initial,initial),[]);
 const next=core.lives({success:true,items:[{login:'alice',platform:'twitch'},{login:'bob',platform:'swapp'}]});
 assert.deepEqual(core.newlySeen(initial,next).map(x=>x.id),['swapp:bob']);
});

test('events require explicit opt in, prompt data is not sent to external services',()=>{
 const app=read('assets/swapp-mairy.js');
 assert.match(app,/state\.live=saved\.live===true/);
 assert.match(app,/state\.news=saved\.news===true/);
 assert.match(app,/if\(!state\.live&&!state\.news\)return/);
 assert.match(app,/document\.visibilityState!==['"]visible['"]/);
 assert.match(app,/core\.newlySeen\(before,current\)/);
 assert.match(app,/state\.snapshots\[kind\]=null/);
 assert.match(app,/Pas de voix ni d'IA conversationnelle simulées/);
 assert.doesNotMatch(app,/Notification\.requestPermission|speechSynthesis|SpeechRecognition/);
 assert.doesNotMatch(app,/fetch\(['"]https?:\/\//);
 assert.match(app,/La rubrique Social donne accès aux publications/);
 assert.match(app,/\/api\/swapp\/social-preview/);
});

test('Mairy floats clear of the bottom mobile navigation and respects reduced motion',()=>{
 const css=read('assets/swapp-mairy.css');
 assert.match(css,/@media\(max-width:1080px\)/);
 assert.match(css,/@media\(max-width:389px\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/var\(--brand,#7c85ef\)/);
});

test('Mairy knows when to avoid interruptions during video playback',()=>{
 assert.equal(core.isWatching('/live/twitch/alice'),true);
 assert.equal(core.isWatching('/', 'watch'),true);
 assert.equal(core.isWatching('/actus', 'actus'),false);
 assert.deepEqual(core.suggest('Qui joue sur Starfield ?',core.lives({items:[{login:'s1',game_name:'Hades',platform:'twitch'}]})),[]);
});


test('living polish and social community ship in both SWAPP shells',()=>{
 const home=read('index.html');
 const article=layout({content:'<main>Article</main>'});
 for(const html of [home,article])assert.match(html,/swapp-living\.css\?v=20261015-living-1/);
 const living=read('assets/swapp-living.css');
 assert.match(living,/@media\s*\(hover:hover\) and \(pointer:fine\)/);
 assert.match(living,/@media\(prefers-reduced-motion:reduce\)/);
});
