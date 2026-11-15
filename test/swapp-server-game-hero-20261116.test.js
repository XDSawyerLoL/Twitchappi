'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {page,register}=require('../modules/swapp-servers');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('7 Days to Die category uses the real large Steam library hero rather than a small right thumbnail',()=>{
 const html=page({game:'7 Days to Die'});
 assert.match(html,/class="ss-hero ss-directory-intro ss-directory-game-hero"/);
 assert.match(html,/class="ss-directory-game-backdrop"/);
 assert.match(html,/\/steam\/apps\/251570\/library_hero\.jpg/);
 assert.match(html,/data-ss-fallback="https:\/\/cdn\.cloudflare\.steamstatic\.com\/steam\/apps\/251570\/header\.jpg"/);
 assert.match(html,/<h1>Serveurs <em>7 Days to Die<\/em><\/h1>/);
 assert.match(html,/href="\/serveurs\/creer\?jeu=7%20Days%20to%20Die"/);
 assert.match(html,/href="#ss-results">Explorer les fiches/);
 assert.match(html,/id="ss-game-hero-count"/);
 assert.doesNotMatch(html,/class="ss-directory-intro-art"/);
});
test('game banners use the correct artwork and do not bleed into the main server directory',()=>{
 const rust=page({game:'Rust'});
 assert.match(rust,/\/steam\/apps\/252490\/library_hero\.jpg/);
 const generic=page();
 assert.doesNotMatch(generic,/ss-directory-game-backdrop/);
 assert.doesNotMatch(generic,/ss-game-hero-count/);
 assert.match(generic,/Votre serveur mérite <em>le devant de la scène/);
 const discord=page({game:'Discord / Multigaming'});
 assert.match(discord,/ss-directory-game-hero/);
 assert.doesNotMatch(discord,/class="ss-directory-game-backdrop"/);
});
test('SSR category count is real and retains an unavailable state on database failure',async()=>{
 const routes={};
 const app={get:(route,...handlers)=>routes[route]=handlers.at(-1),post(){},put(){},delete(){}};
 const row={id:'a'.repeat(32),slug:'sept-jours-abcdef',name:'7DTD FR',game:'7 Days to Die',
  website:'',tags:'',description:'Un serveur de jeu de survie francophone.',banner_url:''};
 const good={execute:async sql=>{
  if(sql.startsWith('SELECT s.id,s.name,s.slug,s.game,s.description'))return [[row]];
  if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE game='))return [[{n:1}]];
  return [[]];
 }};
 register(app,{enableAutoReview:false,getDatabase:async()=>good});
 const response={code:200,set(){return this},type(){return this},status(n){this.code=n;return this},send(v){this.html=v;return this}};
 await routes['/serveurs/:jeu']({params:{jeu:'7-days-to-die'},session:{}},response);
 assert.equal(response.code,200);
 assert.match(response.html,/id="ss-game-hero-count" aria-live="polite">1 serveur référencé/);
 assert.match(response.html,/id="ss-results" class="ss-results"><article/);
 const routesFail={};
 register({get:(route,...h)=>routesFail[route]=h.at(-1),post(){},put(){},delete(){}},{
  enableAutoReview:false,getDatabase:async()=>{throw Error('database outage')}
 });
 const failed={code:200,set(){return this},type(){return this},status(n){this.code=n;return this},send(v){this.html=v;return this}};
 await routesFail['/serveurs/:jeu']({params:{jeu:'7-days-to-die'},session:{}},failed);
 assert.match(failed.html,/id="ss-game-hero-count" aria-live="polite">Nombre de serveurs indisponible/);
 assert.doesNotMatch(failed.html,/id="ss-game-hero-count"[^>]*>0 serveur/);
});
test('landscape background has article-like overlay, priority rendering and mobile safeguards',()=>{
 const css=read('assets/swapp-servers.css');
 assert.match(css,/CATEGORY HERO V24/);
 assert.match(css,/\.ss-directory-game-backdrop img\s*\{[\s\S]*?object-fit:cover/);
 assert.match(css,/\.ss-directory-game-hero::after\s*\{[\s\S]*?linear-gradient/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/scroll-margin-top:105px/);
 const js=read('assets/swapp-servers.js');
 assert.match(js,/gameHeroImage\.addEventListener\('error',onArtworkError\)/);
 assert.match(js,/gameHeroImage\.complete&&gameHeroImage\.naturalWidth===0/);
 assert.match(js,/gameHeroCount\.textContent=count\.textContent/);
});
