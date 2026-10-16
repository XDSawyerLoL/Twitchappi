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
 assert.equal(gameHubs([{...input[0],slug:'article-a'}, {...input[0],slug:'article-b'}]).length,0, 'same title across different slugs is not independent coverage');
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

test('known editorial aliases share one game URL without fragmenting search results',()=>{
 const {canonicalGame}=require('../modules/swapp-game-pages');
 assert.equal(canonicalGame('GTA 6'),'Grand Theft Auto VI');
 assert.equal(gameSlug('GTA VI'),'grand-theft-auto-vi');
 assert.equal(gameSlug('Grand Theft Auto 6'),'grand-theft-auto-vi');
 assert.equal(gameSlug('FF7'),'final-fantasy-vii');
 assert.equal(gameSlug('un jeu inconnu'),'un-jeu-inconnu');
 const mixed=[
  {slug:'gta-6-update',title:'GTA 6 : mise à jour',summary:'Des détails officiels',game:'GTA 6',status:'published'},
  {slug:'gta-vi-preview',title:'GTA VI : présentation',summary:'Les éléments importants',game:'Grand Theft Auto VI',status:'published'},
  {slug:'gta-not-published',title:'Contenu non publié',summary:'Privé',game:'GTA 6',status:'draft'}
 ];
 const hubs=gameHubs(mixed);
 assert.equal(hubs.length,1);
 assert.equal(hubs[0].slug,'grand-theft-auto-vi');
 assert.equal(hubs[0].count,2);
 assert.equal(hubs[0].game,'Grand Theft Auto VI');
});

test('article game links only appear for real indexed hubs already cached, with no extra reads',async()=>{
 const {cachedGameHubForArticle,invalidateSeoCache}=require('../modules/swapp-seo');
 const articles=[
  {slug:'gta-first',title:'GTA 6 first',summary:'Preview coverage',game:'GTA 6',status:'published'},
  {slug:'gta-second',title:'GTA VI next',summary:'More coverage',game:'Grand Theft Auto VI',status:'published'},
  {slug:'only-hades',title:'Hades II only',summary:'Single publication',game:'Hades II',status:'published'}
 ];
 const routes=new Map();
 let reads=0;
 registerSeoRoutes({get:(route,handler)=>routes.set(route,handler)},{getPublished:async()=>{reads++;return articles}});
 assert.equal(cachedGameHubForArticle(articles[0]),null);
 const response={set(){return this},type(){return this},status(){return this},send(v){this.body=v;return this}};
 await routes.get('/sitemap.xml')({},response);
 assert.equal(cachedGameHubForArticle(articles[0]),'/jeux/grand-theft-auto-vi');
 assert.equal(cachedGameHubForArticle(articles[1]),'/jeux/grand-theft-auto-vi');
 assert.equal(cachedGameHubForArticle(articles[2]),null);
 assert.equal(reads,1);
 const eligibleHtml=require('../modules/swapp-news/native-pages').renderNewsStory(
  {...articles[0],author:'Rédaction SWAPP',body:'Des détails disponibles auprès des sources officielles.',publishedAt:'2026-10-16T10:00:00Z'},
  {gameHubUrl:cachedGameHubForArticle(articles[0])});
 assert.match(eligibleHtml,/href="\/jeux\/grand-theft-auto-vi"/);
 const thinHtml=require('../modules/swapp-news/native-pages').renderNewsStory(
  {...articles[2],author:'Rédaction SWAPP',body:'Quelques informations.',publishedAt:'2026-10-16T10:00:00Z'},
  {gameHubUrl:cachedGameHubForArticle(articles[2])});
 assert.doesNotMatch(thinHtml,/href="\/jeux\/hades-ii"/);
 invalidateSeoCache();
 assert.equal(cachedGameHubForArticle(articles[0]),null);
 assert.equal(reads,1);
});

test('game hubs expose true JSON-LD lists and an editorial sharing image where provided',()=>{
 const rows=[
  {slug:'news-one',title:'GTA VI : <nouvelles> annonces',summary:'Couverture originale',status:'published',game:'GTA VI',
   image:{url:'https://example.org/official.jpg',credit:'Éditeur',rights:'Autorisé'}},
  {slug:'news-two',title:'GTA 6 : notre analyse',summary:'Une autre analyse',status:'published',game:'Grand Theft Auto VI'}
 ];
 const hubs=gameHubs(rows);
 const page=renderGamePage(hubs[0]);
 const list=renderGameIndex(hubs);
 const extract=html=>{
  const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(match,'Schema JSON-LD missing');
  return JSON.parse(match[1]);
 };
 const schema=extract(page);
 assert.equal(schema['@type'],'CollectionPage');
 assert.equal(schema.mainEntity['@type'],'ItemList');
 assert.equal(schema.mainEntity.itemListElement.length,2);
 assert.equal(schema.mainEntity.itemListElement[0].url,'https://swapp.tv/actus/news-one');
 assert.equal(extract(list).mainEntity.itemListElement[0].url,'https://swapp.tv/jeux/grand-theft-auto-vi');
 assert.match(page,/property="og:image" content="https:\/\/example\.org\/official\.jpg"/);
 assert.match(page,/name="twitter:card" content="summary_large_image"/);
 assert.doesNotMatch(page,/<nouvelles>|<script>.+<nouvelles>/);
 assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
});
