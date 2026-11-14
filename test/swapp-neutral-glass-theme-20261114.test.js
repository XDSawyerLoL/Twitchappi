'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const css=read('assets/swapp-obsidian-ice.css');

test('black glass is the permanent base, not a blue gradient',()=>{
 for(const token of [
  '--swapp-ice-bg:#030405','--swapp-ice-top:#050607',
  '--swapp-glass-base:#030405','--swapp-glass-clear:rgba(10,12,14,.90)',
  '--swapp-glass-raised:rgba(16,18,21,.92)',
  '--swapp-glass-outline:rgba(255,255,255,.10)',
  'linear-gradient(180deg,#050607 0%,#030405 48%,#050607 100%)',
  'backdrop-filter:blur(14px) saturate(92%)'
 ])assert.ok(css.includes(token),token);
 assert.match(css,/--swapp-ice-glow:color-mix\(in srgb,var\(--swapp-ice-choice\) 4%,transparent\)/);
 assert.match(css,/--swapp-ice-type:color-mix\(in srgb,var\(--swapp-ice-choice\) 52%,#edf1f4\)/);
});

test('frontpage editorial cards and image fallbacks are neutral smoked glass',()=>{
 for(const name of ['.scl-story-card','.scl-story-media','.scl-story-no-art','.scl-card','.scl-story-actions','.scl-story-category']){
  assert.ok(css.includes('html body #home')&&css.includes(name),name);
 }
 assert.match(css,/rgba\(17,19,22,\.94\) 0%,rgba\(8,9,11,\.97\) 100%/);
 assert.match(css,/background:linear-gradient\(150deg,#15181b 0%,#090a0c 80%,#101215 100%\)!important/);
 assert.match(css,/\.scl-story-no-art::before/);
 assert.match(css,/\.scl-story-category\{/);
 assert.match(css,/border-top-color:rgba\(255,255,255,\.09\)/);
 assert.doesNotMatch(css,/img\s*\{[^}]*filter:|video\s*\{[^}]*filter:/i);
});

test('home and native pages load one cache-busted theme, no extra navigation',()=>{
 const home=renderIntoSpa(read('index.html'));
 const page=renderPage({head:SHARED_HEAD_SLOT,content:'<main>Actualités</main>'});
 const version='swapp-obsidian-ice.css?v=20261114-smoked-glass-v20';
 for(const html of [home,page]){
  assert.equal(html.split(version).length-1,1);
  assert.ok(html.indexOf(version)<html.indexOf('</head>'));
 }
 assert.equal((home.match(/<header class="top">/g)||[]).length,1);
});

test('reader, store and social stay neutral while custom hue remains saved',()=>{
 for(const s of [
  '.swapp-actus-card','.swapp-actus-cover','.swapp-actus-sources',
  '.swapp-reader-toc','.pulse-post','.pulse-panel','.pulse-card',
  'prefers-reduced-transparency'
 ])assert.ok(css.includes(s),s);
 for(const target of ['assets/swapp-editorial-color.js','assets/swapp-nav-session.js']){
  assert.ok(read(target).includes('oryon_viewer_accent'));
 }
});
