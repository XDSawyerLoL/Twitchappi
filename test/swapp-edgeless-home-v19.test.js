'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const css=read('assets/swapp-game-journey.css');
const edgeless=css.slice(css.indexOf('SWAPP EDGELESS HERO V19'));
test('V19 actually overrides V18 max-width and shadowed-card positioning',()=>{
 assert.ok(edgeless.startsWith('SWAPP EDGELESS HERO V19'));
 assert.match(edgeless,/left:50%!important/);
 assert.match(edgeless,/width:100dvw!important/);
 assert.match(edgeless,/margin-left:0!important/);
 assert.match(edgeless,/transform:translateX\(-50%\)!important/);
 assert.match(edgeless,/border:0!important/);
 assert.match(edgeless,/border-radius:0!important/);
 assert.match(edgeless,/box-shadow:none!important/);
 assert.match(edgeless,/background:transparent!important/);
});
test('outer and inner homepage grids cannot expand to the hero intrinsic 100dvw width',()=>{
 const selector='#home.view.active .swappHome1014:has(.swapp-feature-ready)';
 assert.ok(edgeless.includes(selector));
 assert.match(edgeless,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(edgeless,/\.homeHeroInner1014\.swapp-feature-ready/);
 assert.match(edgeless,/min-width:0!important/);
 assert.match(edgeless,/overflow:visible!important/);
 assert.match(edgeless,/clip-path:none!important/);
 const base=read('assets/swapp-art-direction.css');
 assert.match(base,/swappHome1014\{width:min\(1460px/);
});
test('real image alpha mask blends into background rather than painting a black rectangle',()=>{
 assert.match(edgeless,/-webkit-mask-image:linear-gradient\(to bottom/);
 assert.match(edgeless,/mask-image:linear-gradient\(to bottom/);
 assert.match(edgeless,/rgba\(0,0,0,\.13\) 92%,transparent 100%/);
 assert.match(edgeless,/transparent 0%,rgba\(5,10,19,\.55\) 24%/);
 assert.match(edgeless,/object-fit:cover!important/);
});
test('real creators without profile art get readable names, not single-letter circles',()=>{
 const home=read('assets/swapp-home-news.js');
 assert.match(home,/const fallback=el\('span','swapp-home-creator-name',name\)/);
 assert.match(home,/name=String\(stream\.display_name\|\|login\)\.trim\(\)\.slice\(0,22\)/);
 assert.match(home,/img\.onerror=\(\)=>img\.remove\(\)/);
 assert.match(edgeless,/\.swapp-home-feature-face:not\(:has\(img\)\)/);
 assert.match(edgeless,/\.swapp-home-feature-face img \+ \.swapp-home-creator-name\{display:none!important\}/);
});
test('V19 loads exactly once and production smoke blocks an outdated Hostinger stylesheet',()=>{
 const version='swapp-game-journey.css?v=20261018-followed-session-v27';
 for(const name of ['index.html','modules/swapp-news/site-shell.js','modules/swapp-news/article-core.js']){
  const s=read(name);
  assert.equal(s.split(version).length-1,1,name);
 }
 assert.match(read('index.html'),/swapp-home-news\.js\?v=20261018-followed-session-v27/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/SWAPP EDGELESS HERO V19/);
 assert.match(smoke,/journeyStyles\.body\.includes\('grid-template-columns:minmax\(0,1fr\)!important'\)/);
 assert.match(smoke,/journeyStyles\.body\.includes\('-webkit-mask-image:linear-gradient\(to bottom'\)/);
 assert.ok(read('tools/swapp-release.js').includes("'assets/swapp-game-journey.css'"));
 let stack=0;
 for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){stack+=c==='{'?1:c==='}'?-1:0;assert.ok(stack>=0)}
 assert.equal(stack,0);
});
