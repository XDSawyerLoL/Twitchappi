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
  assert.match(html,/swapp-presentation-polish\.css\?v=20261016-ios-account-front-v7/);
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
 assert.match(smoke,/swapp-presentation-polish\.css\?v=20261016-ios-account-front-v7/);
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


test('iPhone S account menu is a solid foreground popover without changing Plus',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 const patch=css.slice(css.indexOf('Mobile account popover: the avatar'));
 assert.ok(patch.length>500,'foreground popover rules must be present');
 assert.match(patch,/header\.top:has\(\.userArea #userMenu\.open\)/);
 assert.match(patch,/z-index:8000!important/);
 assert.match(patch,/header\.top \.userArea #userMenu\.menu\.open/);
 assert.match(patch,/position:absolute!important/);
 assert.match(patch,/background:#111827!important/);
 assert.match(patch,/opacity:1!important/);
 assert.match(patch,/max-height:min\(72dvh/);
 assert.doesNotMatch(patch,/#mobileNav/,'the fix must not alter the bottom Plus navigation');
});
