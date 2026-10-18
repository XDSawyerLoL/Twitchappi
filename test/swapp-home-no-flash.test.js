'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');

function homeRenderer(){
 const bundle=read('index_script.js');
 const begin=bundle.indexOf('  window.renderHome = async function renderHome1014(){');
 const end=bundle.indexOf('  window.swappRefreshHome1014 =',begin);
 assert.ok(begin>0&&end>begin,'home renderer must exist');
 return bundle.slice(begin,end);
}

test('the old live slogan never exists in the initial HTML, even while APIs remain pending',async()=>{
 const snippet=homeRenderer();
 const el={innerHTML:''},window={};
 let release;
 const wait=new Promise(resolve=>{release=resolve});
 const build=new Function('window','$id','addStyle1014','state','loadLives',
  'closeMini','loadHomeFollowed','safe','streamTargetView','streamTargetLabel',
  snippet+'\nreturn window.renderHome;');
 const render=build(window,id=>id==='home'?el:null,()=>{},
  {session:{local:false}},()=>wait,()=>{},()=>{},String,()=>null,()=>null);
 const pending=render();
 // assert before resolving a slow live or news request: first-paint HTML only.
 assert.doesNotMatch(el.innerHTML,/Les bons lives se trouvent ici|Les bons lives sont ici/);
 assert.match(el.innerHTML,/class="homeHeroInner1014 swapp-hero-pending" aria-busy="true"/);
 assert.match(el.innerHTML,/<div class="swapp-home-hero-placeholder" aria-hidden="true"><\/div>/);
 assert.match(el.innerHTML,/homeLiveSection1014/);
 release();await pending;
});

test('hero explicitly settles both success and failure states, without hiding actual live section',()=>{
 const app=read('assets/swapp-home-news.js');
 const css=read('assets/swapp-game-journey.css');
 assert.match(app,/hero\.classList\.add\('swapp-feature-ready'\)/);
 assert.match(app,/hero\.classList\.remove\('swapp-hero-pending','swapp-hero-unavailable'\)/);
 assert.match(app,/hero\.classList\.add\('swapp-hero-unavailable'\)/);
 assert.match(app,/hero\.setAttribute\('aria-busy','false'\)/);
 assert.match(css,/SWAPP HOME NO-FLASH V21/);
 assert.match(css,/#home \.swappHome1014 \.homeHeroCopy1014\{\s*display:none!important/);
 assert.match(css,/\.homeHero1014:has\(\.swapp-hero-unavailable\)\{\s*display:none!important/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css.slice(css.indexOf('SWAPP HOME NO-FLASH V21')),
  /#home [^{]*homeLiveSection1014[^{]*\{\s*display:none/i);
});

test('pending area reserves the final image footprint with no popup, border or rounded placeholder',()=>{
 const css=read('assets/swapp-game-journey.css');
 const pending=css.slice(css.indexOf('SWAPP HOME NO-FLASH V21'));
 assert.match(pending,/min-height:clamp\(490px,72svh,790px\)!important/);
 assert.match(pending,/width:100dvw!important/);
 assert.match(pending,/transform:translateX\(-50%\)!important/);
 assert.match(pending,/border:0!important/);
 assert.match(pending,/border-radius:0!important/);
 assert.match(pending,/@media\(max-width:650px\)/);
 assert.match(pending,/min-height:clamp\(520px,76svh,730px\)!important/);
});

test('HTML shell and smoke test require the same fresh V21 script and CSS files',()=>{
 const html=read('index.html');
 const cssVersion='swapp-game-journey.css?v=20261018-followed-session-v27';
 const newsVersion='swapp-home-news.js?v=20261019-witcher-twitch-v1';
 const scriptVersion='index_script.js?v=20261019-creator-workspace-v1';
 for(const x of [cssVersion,newsVersion,scriptVersion])assert.ok(html.includes(x),x);
 const shell=read('modules/swapp-news/site-shell.js');
 assert.ok(shell.includes(cssVersion));
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/SWAPP HOME NO-FLASH V21/);
 assert.match(smoke,/Les bons lives se trouvent ici/);
 assert.match(smoke,/homeHeroInner1014 swapp-hero-pending/);
 const release=read('tools/swapp-release.js');
 for(const source of ['index_script.js','assets/swapp-home-news.js','assets/swapp-game-journey.css'])
  assert.ok(release.includes("'"+source+"'"),source);
});

test('repeat render on F5 reuses existing homepage hero DOM',async()=>{
 const snippet=homeRenderer();
 const el={innerHTML:'',querySelector(sel){return sel===':scope > .swappHome1014'&&this.innerHTML.includes('swappHome1014')?{}:null}};
 let liveCalls=0;
 const build=new Function('window','$id','addStyle1014','state','loadLives',
  'closeMini','loadHomeFollowed','safe','streamTargetView','streamTargetLabel',
  snippet+'\nreturn window.renderHome;');
 const render=build({},id=>id==='home'?el:null,()=>{},
  {view:'home',session:{local:false}},()=>{liveCalls++;return Promise.resolve()},()=>{},()=>{},String,()=>null,()=>null);
 await render();
 const html=el.innerHTML;
 await render();await render();
 assert.equal(el.innerHTML,html,'never remount the video and poster');
 assert.equal(liveCalls,1);
 assert.doesNotMatch(read('index_script.js'),/setTimeout\(\(\) => window\.renderHome\?\.\(\)/);
});

test('desktop teaser hides static cover until playback succeeds or fails',()=>{
 const motion=read('assets/swapp-home-motion.js'),css=read('assets/swapp-game-journey.css');
 assert.match(motion,/swapp-home-motion-loading/);
 assert.match(motion,/delay=setTimeout\(begin,0\)/);
 assert.doesNotMatch(motion,/setTimeout\(begin,1100\)/);
 assert.match(css,/\.swapp-home-motion-loading > img\{/);
 assert.match(motion,/if\(!wasPlaying\)cleanup\(\)/);
});
