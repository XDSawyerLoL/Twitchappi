'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V16 last-loaded visual layer is shared by SPA and native SWAPP pages',()=>{
 const reference='/assets/swapp-presentation-polish.css?v=20261017-visual-audit-v16';
 for(const path of ['index.html','modules/swapp-news/site-shell.js']){
  const html=read(path);
  assert.equal(html.split(reference).length-1,1);
  assert.ok(html.indexOf(reference)>html.indexOf('swapp-mobile-comfort.css'));
 }
});

test('iPhone store departments keep their full text instead of three 100px cards',()=>{
 const shop=read('assets/swapp-shop.css');
 const css=read('assets/swapp-presentation-polish.css');
 assert.match(shop,/\.swapp-store-departments-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 const fix=css.slice(css.indexOf('iPhone: three photographed departments'));
 assert.ok(fix.length>0);
 assert.match(fix,/\.swapp-store-departments-grid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(fix,/\.swapp-store-department-content strong\{[\s\S]*?font-size:clamp\(21px,6vw,27px\)/);
 assert.match(fix,/\.swapp-store-department-content>span\{[\s\S]*?font-size:12px/);
});

test('iPhone SE navigation displays five destinations and the full community label',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 const nav=require('../assets/swapp-navigation').serverMobile('community');
 assert.equal((nav.slice(0,nav.indexOf('<details')).match(/<a /g)||[]).length,4);
 assert.match(nav,/>Communauté<\/a>/);
 assert.match(nav,/<details class="swapp-mobile-more">/);
 const mobile=css.slice(css.indexOf('Compact five-destination mobile bar'));
 assert.match(mobile,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
 assert.match(mobile,/@media\(max-width:360px\)/);
 assert.match(mobile,/#mobileNav\.mobileNav > a\[href="\/communaute"\]\{\s*letter-spacing:-\.11em!important/);
 assert.match(mobile,/width:min\(270px,calc\(100vw - 22px\)\)/);
});

test('portrait tablets retain a balanced two-column editorial grid',()=>{
 const css=read('assets/swapp-presentation-polish.css');
 const tablet=css.slice(css.indexOf('Portrait tablets are not small phones'));
 assert.match(tablet,/@media\(min-width:701px\) and \(max-width:920px\) and \(orientation:portrait\)/);
 for(const cls of ['.swapp-actus-grid','.swapp-actus-recommend-grid','.swapp-discover-live-grid','.swapp-reader-live-grid'])
  assert.ok(tablet.includes(cls),cls);
 assert.match(tablet,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test('V16 preserves motion safety, footer space, cache busting and zero extra routes',()=>{
 const finish=read('assets/swapp-presentation-polish.css'),base=read('assets/swapp-unified-nav.css');
 const release=read('tools/swapp-release.js'),smoke=read('tools/swapp-deploy-smoke.js');
 assert.ok(finish.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(finish.includes('safe-area-inset-bottom'));
 assert.match(base,/body\{padding-bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
 assert.ok(release.includes("'assets/swapp-presentation-polish.css'"));
 assert.ok(smoke.includes('20261017-visual-audit-v16'));
 assert.ok(smoke.includes('Portrait tablets are not small phones'));
 assert.doesNotMatch(finish.slice(finish.indexOf('SWAPP EDITORIAL FINISH V15')),/@import|@keyframes|url\(https?:/i);
 let braces=0;
 for(const c of finish.replace(/\/\*[\s\S]*?\*\//g,'')){if(c==='{')braces++;if(c==='}')braces--;assert.ok(braces>=0)}
 assert.equal(braces,0);
});

test('legacy article fallback never reintroduces a second ACTUS navigation or clipped iPhone menu',()=>{
 const {renderArticle}=require('../modules/swapp-news/article-core');
 const html=renderArticle({
  slug:'article-test-navigation',title:'SWAPP vérifie sa navigation',
  summary:'Le parcours reste sur SWAPP',body:'Contenu de vérification éditoriale.',
  category:'Actualité',game:'Elden Ring',author:'Rédaction SWAPP',sources:[]
 });
 assert.match(html,/class="swapp-editorial-route swapp-legacy-news-route"/);
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/aria-label="Navigation principale"/);
 assert.match(html,/id="mobileNav" class="mobileNav"/);
 assert.match(html,/href="\/communaute"/);
 assert.match(html,/href="\/boutique"/);
 assert.match(html,/swapp-presentation-polish\.css\?v=20261017-visual-audit-v16/);
 assert.doesNotMatch(html,/>ACTUS × LIVE<\/a>/);
});
