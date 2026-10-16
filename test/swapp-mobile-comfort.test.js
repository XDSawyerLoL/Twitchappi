'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('mobile comfort is loaded in both SPA and server-rendered pages',()=>{
 const a=read('index.html'),b=read('modules/swapp-news/site-shell.js');
 const stylesheet='/assets/swapp-mobile-comfort.css?v=20261016-mobile-readability-1';
 assert.ok(a.includes(stylesheet));
 assert.ok(b.includes(stylesheet));
 assert.ok(a.indexOf(stylesheet)>a.indexOf('swapp-art-direction.css'));
 assert.ok(b.indexOf(stylesheet)>b.indexOf('swapp-art-direction.css'));
});

test('mobile editorial and live layouts change to one column at phone widths',()=>{
 const css=read('assets/swapp-mobile-comfort.css');
 assert.match(css,/max-width:920px/);
 assert.match(css,/orientation:portrait/);
 for(const selector of ['#actus .swapp-actus-grid','#actus .swapp-actus-info h2',
  '#home .homeLiveGrid1014','#home .swapp-home-editorial .swapp-home-story-grid',
  '.swapp-live-grid','.swapp-footer-top']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/min-height:46px/);
});

test('global mobile navigation remains a horizontally scrolling touch control',()=>{
 const css=read('assets/swapp-mobile-comfort.css');
 assert.match(css,/#mobileNav\.mobileNav\{/);
 assert.match(css,/overflow-x:auto!important/);
 assert.match(css,/flex-wrap:nowrap!important/);
 assert.match(css,/min-height:46px!important/);
 assert.match(css,/safe-area-inset-bottom/);
});

test('SOCIAL hides desktop rail and uses one readable feed column on phones',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(css,/Mobile community: remove the 80px desktop rail/);
 assert.match(css,/\.swapp-social-viewport \.pulse-sidebar,\s*\.swapp-social-viewport \.pulse-right\{display:none!important\}/);
 assert.match(css,/\.swapp-social-viewport \.pulse-shell\{\s*display:block!important/);
 assert.match(css,/\.swapp-social-viewport \.pulse-mobile-nav\{/);
 assert.match(css,/\.swapp-social-viewport \.pulse-post p,/);
 assert.match(hubs,/social-swapp\.css\?v=20261016-mobile-readable-4/);
});

test('mobile stylesheets have balanced blocks',()=>{
 for(const name of ['assets/swapp-mobile-comfort.css','assets/swapp-social-native/social-swapp.css']){
  const css=read(name).replace(/\/\*[\s\S]*?\*\//g,'');
  let depth=0;
  for(const char of css){
   if(char==='{')depth++;
   if(char==='}')depth--;
   assert.ok(depth>=0,name+' has unmatched closing brace');
  }
  assert.equal(depth,0,name+' has unmatched opening brace');
 }
});
