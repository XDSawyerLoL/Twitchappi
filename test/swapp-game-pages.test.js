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
test('all games with at least one verified published article get a GAME UNIVERSE hub',()=>{
 const groups=gameHubs(published);
 assert.equal(groups.length,2);
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
test('sitemaps index substantial multi-story universes without duplicating single-article pages',()=>{
 const xml=sitemapXml(published),html=sitemapHtml(published);
 assert.match(xml,/\/actus\/article-gta-first/);
 assert.match(xml,/\/actus\/article-hades-only/);
 assert.match(xml,/\/jeux\/grand-theft-auto-vi/);
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
 assert.equal(gameHubs(input.slice(0,1)).length,1);
 assert.equal(gameHubs([{...input[0],slug:'article-a'}, {...input[0],slug:'article-b'}])[0].count,1, 'duplicate headlines count only once');
});
test('native GAME UNIVERSE routes render real articles, private preferences and conservative indexing',async()=>{
 const handlers=new Map();let reads=0;
 registerSeoRoutes({get:(route,handler)=>handlers.set(route,handler)},{getPublished:async()=>{reads++;return published}});
 const res=()=>({statusCode:200,body:'',redirectLocation:'',headers:{},
  set(name,value){this.headers[name]=value;return this},type(){return this},
  status(v){this.statusCode=v;return this},send(v){this.body=v;return this},
  redirect(code,url){this.statusCode=code;this.redirectLocation=url;return this}});
 const index=res(),visible=res(),solo=res(),unknown=res(),privateHub=res(),xml=res();
 await handlers.get('/jeux')({},index);
 await handlers.get('/jeux/:slug')({params:{slug:'grand-theft-auto-vi'}},visible);
 await handlers.get('/jeux/:slug')({params:{slug:'hades-ii'}},solo);
 await handlers.get('/jeux/:slug')({params:{slug:'unknown-game'}},unknown);
 await handlers.get('/mes-jeux')({},privateHub);
 await handlers.get('/sitemap.xml')({},xml);
 assert.equal(index.statusCode,200);assert.match(index.body,/href="\/jeux\/grand-theft-auto-vi"/);
 assert.equal(visible.statusCode,200);assert.match(visible.body,/data-swapp-live-shelf data-game="Grand Theft Auto VI"/);
 assert.match(visible.body,/rel="canonical" href="https:\/\/swapp.tv\/jeux\/grand-theft-auto-vi"/);
 assert.doesNotMatch(visible.body,/name="robots" content="noindex,follow"/);
 assert.equal(solo.statusCode,200);assert.match(solo.body,/name="robots" content="noindex,follow"/);
 assert.equal(unknown.statusCode,404);
 assert.equal(privateHub.statusCode,200);assert.match(privateHub.body,/Mes jeux/);
 assert.match(xml.body,/\/jeux\/grand-theft-auto-vi/);
 assert.doesNotMatch(xml.body,/\/jeux\/hades-ii/);
 assert.equal(reads,1,'shared editorial cache');
});
test('missing published source does not claim a live game directory',async()=>{
 const handlers=new Map();
 registerSeoRoutes({get:(route,handler)=>handlers.set(route,handler)},{
  getPublished:async()=>{throw Error('editorial unavailable')}
 });
 const res=()=>({code:200,body:'',headers:{},set(k,v){this.headers[k]=v;return this},
  type(){return this},status(n){this.code=n;return this},send(v){this.body=v;return this}});
 const index=res(),detail=res();
 await handlers.get('/jeux')({},index);
 await handlers.get('/jeux/:slug')({params:{slug:'grand-theft-auto-vi'}},detail);
 assert.equal(index.code,503);
 assert.equal(detail.code,503);
 assert.equal(index.headers['Retry-After'],'60');
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

test('articles expose game actions without creating obsolete dossier links',async()=>{
 const {cachedGameHubForArticle,invalidateSeoCache}=require('../modules/swapp-seo');
 const rows=[
  {slug:'gta-first',title:'GTA 6 first',summary:'Preview coverage',game:'GTA 6',status:'published'},
  {slug:'gta-second',title:'GTA VI next',summary:'More coverage',game:'Grand Theft Auto VI',status:'published'}
 ];
 const routes=new Map();let reads=0;
 registerSeoRoutes({get:(route,handler)=>routes.set(route,handler)},{getPublished:async()=>{reads++;return rows}});
 const res={set(){return this},type(){return this},status(){return this},send(v){this.body=v;return this}};
 await routes.get('/sitemap.xml')({},res);
 assert.equal(reads,1);
 assert.equal(cachedGameHubForArticle(rows[0]),null);
 const html=require('../modules/swapp-news/native-pages').renderNewsStory(
  {...rows[0],author:'Rédaction SWAPP',body:'Des informations disponibles et vérifiées.',publishedAt:'2026-10-16T10:00:00Z'},
  {gameHubUrl:'/jeux/grand-theft-auto-vi'});
 assert.doesNotMatch(html,/Dossier du jeu|href="\/jeux\//);
 assert.match(html,/data-swapp-follow-game/);
 assert.match(html,/data-swapp-wishlist-game/);
 assert.match(html,/Discuter sur SWAPP SOCIAL/);
 invalidateSeoCache();
 assert.equal(cachedGameHubForArticle(rows[0]),null);
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

test('hub covers use verified trailer thumbnails when no licensed image is attached',()=>{
 const one={slug:'ordinary-oddness-news',title:'Ordinary Oddness',summary:'Gameplay confirmé',game:'Ordinary Oddness',status:'published',trailerUrl:'https://www.youtube.com/watch?v=mOMUnP5fAdo'};
 const hub=gameHubs([one])[0];
 assert.equal(hub.count,1);
 const page=renderGamePage(hub),index=renderGameIndex([hub]);
 assert.match(page,/i.ytimg.com\/vi\/mOMUnP5fAdo\/hqdefault.jpg/);
 assert.match(page,/SWAPP \/ GAME UNIVERSE/);
 assert.match(index,/i.ytimg.com\/vi\/mOMUnP5fAdo\/hqdefault.jpg/);
 assert.match(page,/data-swapp-live-shelf/);
});

test('game index uses full-width artwork, readable titles and responsive card actions',()=>{
 const html=renderGameIndex(gameHubs(published));
 assert.match(html,/class="game-index-card"/);
 assert.match(html,/class="game-index-link"/);
 assert.match(html,/class="game-index-media/);
 assert.match(html,/class="game-index-details"/);
 assert.match(html,/class="game-index-actions"/);
 assert.match(html,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:1000px\)/);
 assert.match(html,/@media\(max-width:620px\)/);
 assert.doesNotMatch(html,/\.game-portal \.index a\{display:flex/);
 assert.doesNotMatch(html,/aria-current="page">Jeux<\/a>/);
});

test('fresh /univers path bypasses historic browser-cached /jeux permanent redirects',async()=>{
 const routes=new Map();
 registerSeoRoutes({get:(path,handler)=>routes.set(path,handler)},{
  getPublished:async()=>published
 });
 const result=()=>({statusCode:200,body:'',set(){return this},type(){return this},
  status(code){this.statusCode=code;return this},send(value){this.body=value;return this}});
 const index=result(),legacy=result();
 await routes.get('/univers')({},index);
 await routes.get('/jeux')({},legacy);
 assert.equal(index.statusCode,200);
 assert.equal(legacy.statusCode,200);
 assert.match(index.body,/rel="canonical" href="https:\/\/swapp.tv\/univers"/);
 assert.match(index.body,/href="\/jeux\/grand-theft-auto-vi"/);
 const xml=sitemapXml(published);
 assert.match(xml,/https:\/\/swapp.tv\/univers/);
 assert.doesNotMatch(xml,/<loc>https:\/\/swapp.tv\/jeux<\/loc>/);
});
