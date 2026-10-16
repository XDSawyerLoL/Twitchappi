'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const style='/assets/swapp-presentation-polish.css?v=20261016-iphone-v2';

test('one final presentation stylesheet is loaded after mobile layout in SPA and native pages',()=>{
 const home=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const html of [home,shell]){
  assert.equal(html.split(style).length-1,1,'must load shared finish exactly once');
  assert.ok(html.indexOf(style)>html.indexOf('swapp-mobile-comfort.css'),
   'final polish must follow the existing mobile layout');
 }
 assert.ok(shell.indexOf(style)>shell.indexOf('${scripts}'),
  'SOCIAL page-specific stylesheet must precede shared finishing touches');
});

test('shared visual finishing layer only styles existing SWAPP screens',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 for(const selector of ['header.top .mainNav','#mobileNav.mobileNav','#home .swappHome1014',
  '#actus .swapp-actus-tools','#discover .v4Search','.swapp-social-viewport .pulse-post-main',
  '.swapp-editorial-route .article-body','.swapp-editorial-route .story-card']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/focus-visible/);
 assert.match(css,/env\(safe-area-inset-bottom\)|max-width:650px/);
 assert.doesNotMatch(css,/display:none!important|@import|url\(https?:|@keyframes/i);
 let braces=0;
 for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){
  if(c==='{')braces++;
  if(c==='}')braces--;
  assert.ok(braces>=0,'unmatched closing brace');
 }
 assert.equal(braces,0,'unmatched opening brace');
});

test('Hostinger release hash includes finishing asset and smoke check verifies its delivery',()=>{
 const release=read('tools/swapp-release.js'),verify=read('tools/swapp-deploy-smoke.js');
 assert.match(release,/'assets\/swapp-presentation-polish\.css'/);
 assert.match(verify,/Home uses an outdated presentation stylesheet/);
 assert.match(verify,/Actualité uses an outdated presentation stylesheet/);
 assert.match(verify,/Shared presentation finish is stale or incomplete/);
});
