'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('SWAPP SPA and native pages opt in to iPhone display cutout safe areas',()=>{
 const spa=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 for(const html of [spa,native]){
  assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.match(html,/swapp-presentation-polish\.css\?v=20261016-ios-layer-v5/);
 }
});

test('mobile navigation respects Home indicator and side notches',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/safe-area-inset-left/);
 assert.match(css,/safe-area-inset-right/);
 assert.match(css,/#mobileNav\.mobileNav/);
 assert.match(css,/\.swapp-mobile-more\[open\]/);
 assert.match(css,/-webkit-overflow-scrolling:auto/);
 assert.match(css,/body\{padding-bottom:/);
});

test('iPhone form inputs avoid Safari auto zoom and touch layouts support landscape',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 assert.match(css,/input:not\(\[type="range"\]\),select,textarea/);
 assert.match(css,/font-size:16px!important/);
 assert.match(css,/max-height:550px/);
 assert.match(css,/orientation:landscape/);
 assert.match(css,/pointer:coarse/);
 assert.match(css,/\.v4Stage/);
 assert.match(css,/\.swapp-actus-grid/);
});

test('article trailers remain click-to-play and request inline video on iOS',()=>{
 const js=read('assets/swapp-article-extras.js');
 assert.match(js,/youtube-nocookie\.com\/embed/);
 assert.match(js,/autoplay=1&rel=0&playsinline=1/);
 assert.match(js,/function activate\(button\)/);
 assert.match(js,/button\.replaceWith\(iframe\)/);
 assert.doesNotMatch(js,/autoplay=1&rel=0';/);
});

test('Hostinger smoke test expects iPhone CSS release, no added cost or tracking',()=>{
 const smoke=read('tools/swapp-deploy-smoke.js'),css=read('assets/swapp-presentation-polish.css');
 assert.match(smoke,/swapp-presentation-polish\.css\?v=20261016-ios-layer-v5/);
 assert.match(read('tools/swapp-release.js'),/'assets\/swapp-presentation-polish\.css'/);
 assert.doesNotMatch(css,/navigator\.userAgent|localStorage|fetch\(|@import/i);
 let depth=0;
 for(const ch of css.replace(/\/\*[\s\S]*?\*\//g,'')){
  if(ch==='{')depth++;
  if(ch==='}')depth--;
  assert.ok(depth>=0,'unmatched CSS closing brace');
 }
 assert.equal(depth,0,'unmatched CSS opening brace');
});


test('iPhone 14 keeps the account popup clear of the mobile bar',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 const correction=css.slice(css.indexOf('iPhone 14: keep account actions'));
 assert.match(correction,/header\.top:has\(#userMenu\.open\)\{z-index:230!important\}/);
 assert.match(correction,/max-height:calc\(100dvh - 175px - env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(correction,/#mobileNav\.mobileNav\{[\s\S]*?-webkit-backdrop-filter:none!important/);
});
