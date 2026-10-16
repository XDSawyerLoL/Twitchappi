'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {gameSlug,gameHubUrl,gameHubs,renderGamePage,renderGameIndex}=require('../modules/swapp-game-pages');
const {sitemapXml,sitemapHtml,registerSeoRoutes}=require('../modules/swapp-seo');
const published=[
 {slug:'article-gta-first',title:'GTA 6 : premières informations',summary:'Une présentation des annonces.',game:'Grand Theft Auto VI',status:'published',publishedAt:'2026-10-15T10:00:00Z'},
 {slug:'article-gta-second',title:'GTA 6 : analyse & contexte',summary:'Une analyse indépendante.',game:'Grand Theft Auto VI',status:'published',publishedAt:'2026-10-16T10:00:00Z'},
 {slug:'article-hades-only',title:'Une annonce Hades',summary:'Une seule publication.',game:'Hades II',status:'published'},
 {slug:'article-hidden',title:'Secret',summary:'Non publié.',game:'Hades II',status:'draft'},
 {slug:'article-gta-second',title:'Copie',summary:'Doublon',game:'Grand Theft Auto VI',status:'published'}
];
test('only games supported by multiple distinct published stories get an indexable hub',()=>{
 const groups=gameHubs(published);
 assert.equal(groups.length,1);
 assert.equal(groups[0].game,'Grand Theft Auto VI');
 assert.equal(groups[0].count,2);
 assert.equal(gameHubUrl('Grand Theft Auto VI'),'/jeux/grand-theft-auto-vi');
 assert.equal(gameSlug(''),'', 'no empty topic');
 assert.equal(gameSlug('<script>'), 'script', 'slug does not carry HTML');
 assert.equal(gameSlug('Pókemon GO'),'pokemon-go');
 assert.doesNotMatch(JSON.stringify(groups),/Secret|Non publié/);
});
test('game hub HTML contains real editorial links, canonical, shared live shelf and no invented content',()=>{
 const page=renderGamePage(gameHubs(published)[0]);
 assert.match(page,/<h1>Grand Theft Auto VI : actualités et lives<\/h1>/);
 assert.match(page,/<link rel="canonical" href="https:\/\/swapp.tv\/jeux\/grand-theft-auto-vi">/);
 assert.match(page, /href="\/actus\/article-gta-first"/);
 assert.match(page, /href="\/actus\/article-gta-second"/);
 assert.match(page, /data-swapp-live-shelf data-game="Grand Theft Auto VI"/);
 assert.doesNotMatch(page, /article-hades-only|article-hidden/);
 assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
 const landing=renderGameIndex(gameHubs(published));
 assert.match(landing, /href="\/jeux\/grand-theft-auto-vi"/);
 assert.match(landing, /<h1>Jeux vidéo : actualités et créateurs<\/h1>/);
});
test('XML and HTML sitemaps include only eligible game pages',()=>{
 const xml=sitemapXml(published),html=sitemapHtml(published);
 assert.match(xml,/https:\/\/swapp.tv\/jeux\/grand-theft-auto-vi/);
 assert.match(xml,/https:\/\/swapp.tv\/jeux<\/loc>/);
 assert.doesNotMatch(xml,/\/jeux\/hades-ii/);
 assert.match(html,/href="\/jeux\/grand-theft-auto-vi"/);
 assert.doesNotMatch(html,/href="\/jeux\/hades-ii"/);
});
test('unpublished, empty, duplicate, invalid and malicious stories do not create a game hub',()=>{
 const input=[
  {slug:'valid-one',title:'Original <script>test</script>',summary:'First',game:'Cyberpunk 2077',status:'published'},
  {slug:'valid-two',title:'Other',summary:'Also & useful',game:'Cyberpunk 2077',status:'published'},
  {slug:'valid-two',title:'duplicate',summary:'Copy',game:'Cyberpunk 2077',status:'published'},
  {slug:'bad/slug',title:'bad',summary:'Copy',game:'Cyberpunk 2077',status:'published'}
 ];
 assert.equal(gameHubs(input)[0].count,2);
 const html=renderGamePage(gameHubs(input)[0]);
 assert.doesNotMatch(html,/<script>test<\/script>/);
 assert.match(html,/&lt;script&gt;test&lt;\/script&gt;/);
 assert.match(html,/Also &amp; useful/);
 assert.equal(gameHubs(input.slice(0,1)).length,0);
});
test('game HTTP routes reuse SEO cache, return real 404 for thin or missing topics',async()=>{
 const handlers=new Map();
 let reads=0;
 registerSeoRoutes({get:(route,handler)=>handlers.set(route,handler)},{getPublished:async()=>{reads++;return published}});
 const res=()=>({statusCode:200,body:'',set(){return this},type(){return this},status(v){this.statusCode=v;return this},send(v){this.body=v;return this}});
 const visible=res(),missing=res(),index=res(),xml=res();
 await handlers.get('/jeux/:slug')({params:{slug:'grand-theft-auto-vi'}},visible);
 await handlers.get('/jeux/:slug')({params:{slug:'hades-ii'}},missing);
 await handlers.get('/jeux')({},index);
 await handlers.get('/sitemap.xml')({},xml);
 assert.equal(visible.statusCode,200);
 assert.match(visible.body,/grand-theft-auto-vi/);
 assert.equal(missing.statusCode,404);
 assert.equal(index.statusCode,200);
 assert.match(xml.body,/grand-theft-auto-vi/);
 assert.equal(reads,1);
});
test('topic hubs do not add features to homepage or launch paid providers',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/registerSeoRoutes\(app/);
 const module=fs.readFileSync(path.join(__dirname,'../modules/swapp-game-pages.js'),'utf8');
 assert.doesNotMatch(module,/gemini|openrouter|adsbygoogle|setInterval|setTimeout|fetch\(/i);
});
