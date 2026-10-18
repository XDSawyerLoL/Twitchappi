'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('assets/swapp-game-journey.css');
const v18=css.slice(css.indexOf('SWAPP FULL-BLEED HOME V18'));

test('published lead spans the viewport while SWAPP content remains in its readable column',()=>{
 assert.ok(v18.length>3200,'full-bleed rules must be present');
 assert.match(v18,/homeHeroInner1014\.swapp-feature-ready/);
 assert.match(v18,/width:100vw!important/);
 assert.match(v18,/width:100dvw!important/);
 assert.match(v18,/margin-left:calc\(50% - 50dvw\)!important/);
 assert.match(v18,/border:0!important/);
 assert.match(v18,/border-radius:0!important/);
 assert.match(v18,/box-shadow:none!important/);
 assert.match(read('assets/swapp-art-direction.css'),/swappHome1014\{width:min\(1460px/);
 assert.doesNotMatch(v18,/#home\s+\.swappHome1014\s*\{\s*width:100/);
});

test('inset artwork dissolves into SWAPP page instead of ending as a boxed image',()=>{
 assert.match(v18,/linear-gradient\(90deg/);
 assert.match(v18,/linear-gradient\(0deg/);
 assert.match(v18,/var\(--swapp-ink,#080d16\)/);
 assert.match(v18,/\.swapp-home-hero-feature::after/);
 assert.match(v18,/object-fit:cover!important/);
 assert.match(v18,/object-position:center 39%!important/);
 assert.match(v18,/max-width:min\(19ch,880px\)!important/);
});

test('reading, live and discussion actions overlay the bottom fade and remain real links',()=>{
 assert.match(v18,/> \.swapp-home-feature-bridge/);
 assert.match(v18,/margin:-156px 0 0 calc\(50% - 50vw\)!important/);
 assert.match(v18,/position:relative!important/);
 assert.match(v18,/z-index:3!important/);
 const js=read('assets/swapp-home-news.js');
 for(const label of ["action('Lire l’article'","action('Voir les lives'","action('En discuter'"])
  assert.ok(js.includes(label),label);
 assert.ok(js.includes('hero.classList.add(\'swapp-feature-ready\')'));
});

test('iPhone is full-width and respects safe area, short screens and reduced motion',()=>{
 assert.match(v18,/@media\(max-width:650px\)/);
 assert.match(v18,/height:clamp\(530px,76svh,760px\)!important/);
 assert.match(v18,/padding:5px 20px calc\(32px \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(v18,/@media\(max-width:365px\)/);
 assert.match(v18,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(v18,/transition:none!important/);
 assert.match(v18,/outline-offset:-3px/);
});

test('full-bleed version ships to the SPA and native shell with a deployment guard',()=>{
 const version='/assets/swapp-game-journey.css?v=20261018-followed-session-v27';
 for(const file of ['index.html','modules/swapp-news/site-shell.js','modules/swapp-news/article-core.js'])
  assert.ok(read(file).includes(version),file);
 assert.ok(read('tools/swapp-release.js').includes("'assets/swapp-game-journey.css'"));
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.ok(smoke.includes('SWAPP FULL-BLEED HOME V18'));
 assert.ok(smoke.includes('20261018-followed-session-v27'));
 let level=0;
 for(const char of css.replace(/\/\*[\s\S]*?\*\//g,'')){
  level+=char==='{'?1:char==='}'?-1:0;
  assert.ok(level>=0);
 }
 assert.equal(level,0);
});
