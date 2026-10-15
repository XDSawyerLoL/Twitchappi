'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const spa=read('index.html');
const layout=read('modules/swapp-news/site-shell.js');
const compat=read('assets/swapp-article-immersive-compat.js');
const css=read('assets/swapp-article-immersive.css');
const server=read('server.js');

test('the cached-reader adapter parses and only targets full articles',()=>{
 assert.doesNotThrow(()=>new Function(compat));
 assert.match(compat,/__swappImmersiveCompatInstalled/);
 assert.match(compat,/function upgradeSPA\(\)/);
 assert.match(compat,/\.swapp-actus-native\.swapp-actus-reading/);
 assert.match(compat,/function upgradeNative\(\)/);
 assert.match(compat,/body\.swapp-editorial-route/);
 assert.match(compat,/\.swapp-reader-hero-figure/);
});

test('old article cover moves into the global scene without duplicating media',()=>{
 assert.match(compat,/function scene\(root,picture\)/);
 assert.match(compat,/layer\.className='swapp-article-scene'/);
 assert.match(compat,/layer\.appendChild\(picture\)/);
 assert.match(compat,/picture\.alt=''/);
 assert.match(compat,/picture\.onerror=/);
 assert.match(compat,/if\(back\)back\.remove\(\)/);
 assert.match(compat,/oldFigure\.remove\(\)/);
 assert.match(compat,/figure\.remove\(\)/);
 assert.match(compat,/const existing=\$\(':scope > \.swapp-article-scene',root\)/);
});

test('single photo preserves proportions in a bounded scene instead of filling the screen',()=>{
 assert.match(css,/\.swapp-article-scene/);
 assert.match(css,/position:absolute;top:0/);
 assert.match(css,/height:clamp\(390px,35vw,570px\)/);
 assert.match(css,/height:100%;width:auto;max-width:none/);
 assert.match(css,/object-fit:contain/);
 assert.doesNotMatch(css,/position:fixed;inset:0;z-index:0/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/\.swapp-immersive-hero \.swapp-immersive-bg/);
 assert.match(css,/content:none!important;display:none!important/);
 assert.match(css,/\.swapp-immersive-hero::before,\.swapp-immersive-hero::after/);
});

test('page shells load versioned SPA, compat and CSS files',()=>{
 for(const text of [spa,layout]){
  assert.match(text,/swapp-article-immersive\.css\?v=20261015-editorial-reset-5/);
  assert.match(text,/swapp-article-immersive-compat\.js\?v=20261015-wallpaper-v1/);
 }
 assert.match(spa,/swapp-actus-app\.js\?v=20261015-wallpaper-v1/);
});

test('only targeted article assets bypass caching',()=>{
 const match=server.match(/if\((\/\(\?:\^\|\[.*?\]\).+?\$\/)\.test\(staticPath\)\)/);
 assert.ok(match,'missing cache regex');
 const accepted=new Function('staticPath','return '+match[1]+'.test(staticPath)');
 for(const p of ['swapp-actus-app.js','swapp-actus-app.css','swapp-article-immersive.css','swapp-article-immersive-compat.js'])
  assert.ok(accepted('/srv/assets/'+p));
 assert.equal(accepted('/srv/assets/home.jpg'),false);
});
