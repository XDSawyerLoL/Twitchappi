'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('one current home renderer, ten obsolete renderers delegate and do not recreate hidden banners',()=>{
 const bundle=read('index_script.js');
 assert.equal((bundle.match(/window\.renderHome\s*=\s*async function/g)||[]).length,1);
 assert.match(bundle,/window\.renderHome = async function renderHome1014/);
 assert.equal((bundle.match(/function renderHome\(\)\s*\{/g)||[]).length,10);
 assert.equal((bundle.match(/current!==renderHome\)return current\(\)/g)||[]).length,10);
 assert.doesNotMatch(bundle,/function renderHome\(\)\s*\{[^}]{0,400}?el\.innerHTML/);
 assert.doesNotMatch(bundle,/window\.renderHome = async function renderHome(?:Final|Restored|1013)/);
 assert.doesNotMatch(bundle,/Des lives à taille humaine\./);
 assert.match(bundle,/homeHeroInner1014 swapp-hero-pending/);
});

test('legacy first-paint hiding rule is gone rather than layering on more masking CSS',()=>{
 const html=read('index.html');
 const tag=html.indexOf('<style id="swapp-boot-css">');
 const boot=html.slice(tag,html.indexOf('</style>',tag));
 assert.ok(tag>0);
 assert.doesNotMatch(boot,/#home\.view\.active > :not\(\.swappHome1014\)/);
 assert.doesNotMatch(boot,/\.homeHeroCopy1014\{display:none!important\}/);
 assert.doesNotMatch(boot,/\.homeHeroInner1014:not\(\.swapp-feature-ready\)/);
 assert.match(boot,/\.swappBoot\{/);
});

test('trailers start at 0:10 seconds and replay from 0:10',()=>{
 const player=read('assets/swapp-home-motion.js');
 assert.match(player,/const TRAILER_START_SECONDS=10/);
 assert.match(player,/start:TRAILER_START_SECONDS/);
 assert.match(player,/seekTo\(TRAILER_START_SECONDS,true\)/);
 assert.doesNotMatch(player,/seekTo\(0\)/);
 assert.match(player,/const mount=document\.createElement\('span'\)/);
 assert.match(player,/host\.append\(mount\)/);
 assert.match(player,/new YT\.Player\(mount,/);
});

test('video iframe uses a stable parent and covers 16:9 with no 118% guess',()=>{
 const css=read('assets/swapp-game-journey.css');
 const video=css.slice(css.indexOf('SWAPP V22 — cinematic trailer overlay'));
 assert.match(video,/container-type:size/);
 assert.match(video,/width:max\(100cqw,177\.778cqh\)!important/);
 assert.match(video,/height:max\(100cqh,56\.25cqw\)!important/);
 assert.match(video,/transform:translate\(-50%,-50%\)!important/);
 assert.doesNotMatch(video,/width:118%!important|height:118%!important/);
 assert.match(video,/\.swapp-home-motion-playing/);
 assert.match(video,/visibility:hidden!important/);
 assert.match(video,/opacity:1!important/);
 assert.match(video,/mask-image:none!important/);
 assert.doesNotMatch(video,/opacity:\.88!important/);
 assert.match(video,/\(prefers-reduced-motion:reduce\)/);
});

test('fresh V23 assets are loaded in SPA, native shells and production smoke',()=>{
 const html=read('index.html');
 for(const asset of ['index_script.js','swapp-home-news.js','swapp-game-journey.css','swapp-home-motion.js']){
  assert.match(html,new RegExp(asset.replace(/\./g,'\\.')+'\\?v=20261018-hero-single-v24'));
 }
 for(const path of ['modules/swapp-news/site-shell.js','modules/swapp-news/article-core.js'])
  assert.ok(read(path).includes('swapp-game-journey.css?v=20261018-hero-single-v24'),path);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/Obsolete home renderer still shipped to production/);
 assert.match(smoke,/start:TRAILER_START_SECONDS/);
 assert.match(smoke,/width:max\(100cqw,177\.778cqh\)/);
 assert.match(read('tools/swapp-release.js'),/'assets\/swapp-home-motion\.js'/);
});
