'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const spa=read('index.html');
const layout=read('modules/swapp-news/site-shell.js');
const enhancer=read('assets/swapp-article-immersive-compat.js');
const css=read('assets/swapp-article-immersive.css');
const server=read('server.js');

test('legacy article upgrade is valid JS, guarded and does not change article listing',()=>{
 assert.doesNotThrow(()=>new Function(enhancer));
 assert.match(enhancer,/__swappImmersiveCompatInstalled/);
 assert.match(enhancer,/function enhanceSPA\(\)/);
 assert.match(enhancer,/\.swapp-actus-native\.swapp-actus-reading/);
 assert.match(enhancer,/\.swapp-reader-hero-figure/);
 assert.match(enhancer,/function enhanceNative\(\)/);
 assert.match(enhancer,/body\.swapp-editorial-route/);
 assert.match(enhancer,/if\(!cover\)return false/);
 assert.match(enhancer,/if\(!image\|\|!title/);
});
test('old cover is moved, rather than repeated, and becomes decorative',()=>{
 assert.match(enhancer,/backdrop\.appendChild\(picture\)/);
 assert.match(enhancer,/picture\.alt=''/);
 assert.match(enhancer,/picture\.onerror=/);
 assert.match(enhancer,/cover\.remove\(\)/);
 assert.match(enhancer,/figure\.remove\(\)/);
 assert.match(enhancer,/hero\.classList\.add\('swapp-immersive-hero','has-cover'\)/);
});
test('atmospheric lighting uses the same verified cover and avoids infinite insertion',()=>{
 assert.match(enhancer,/function decorateAtmosphere\(\)/);
 assert.match(enhancer,/if\(!root\|\|root\.querySelector\(':scope > \.swapp-immersive-atmosphere'\)\)return/);
 assert.match(enhancer,/atmosphericImage\.src=image\.currentSrc\|\|image\.src/);
 assert.match(css,/\.swapp-immersive-atmosphere img/);
 assert.match(css,/mask-image:linear-gradient/);
 assert.match(css,/prefers-contrast:more/);
});
test('both page renderers load the cache-recovery code and a fresh ACTUS bundle',()=>{
 assert.match(spa,/swapp-actus-app\.js\?v=20261015-immersive-cachefix-2/);
 assert.match(spa,/swapp-article-immersive\.css\?v=20261015-immersive-cachefix-2/);
 assert.match(spa,/swapp-article-immersive-compat\.js\?v=20261015-immersive-cachefix-2/);
 assert.match(layout,/swapp-article-immersive\.css\?v=20261015-immersive-cachefix-2/);
 assert.match(layout,/swapp-article-immersive-compat\.js\?v=20261015-immersive-cachefix-2/);
});
test('server disables stale-cache for small ACTUS assets only',()=>{
 const expression=server.match(/if\((\/\(\?:\^\|\[.*?\]\).+?\$\/)\.test\(staticPath\)\)/);
 assert.ok(expression,'ACTUS cache-control regexp was not found');
 const accepted=new Function('staticPath','return '+expression[1]+'.test(staticPath)');
 for(const p of ['swapp-actus-app.js','swapp-actus-app.css','swapp-article-immersive.css','swapp-article-immersive-compat.js'])
   assert.ok(accepted('/srv/assets/'+p),p);
 assert.equal(accepted('/srv/assets/home.jpg'),false);
 assert.equal(accepted('/srv/assets/swapp-play.js'),false);
 assert.match(server,/res\.setHeader\('Cache-Control','no-store, no-cache, must-revalidate'\)/);
});
