'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {register,page,GAMES,slug}=require('../modules/swapp-servers');
const {renderExternalDiscovery,CATEGORY_LINKS}=require('../modules/swapp-servers-external-discovery');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('marketing hero is first, community intro follows, and ranking remains below',()=>{
 const html=page();
 const hero=html.indexOf('id="ss-grow-title"'),intro=html.indexOf('ss-directory-intro'),rank=html.indexOf('id="ss-results"'),external=html.indexOf('ss-partner-discovery');
 assert.ok(hero>0&&hero<intro&&intro<rank&&rank<external,'expected order: marketing -> community -> listings -> partner rankings');
 assert.equal((html.match(/id="ss-add"/g)||[]).length,1);
 assert.match(html,/Votre serveur mérite <em>le devant de la scène/);
 assert.match(html,/href="\/serveurs\/creer"/);
 assert.doesNotMatch(html,/SWAPP \/ EXPLORER \/ SERVEURS/);
});
test('every game tile is a server-side link even when its category contains no servers',async()=>{
 const html=page();
 const routes={};
 register({get:(p,...h)=>routes[p]=h.at(-1),post(){},put(){}},{enableAutoReview:false,getDatabase:async()=>({execute:async(sql)=>sql.startsWith('SELECT COUNT(*)')?[[{n:0}]]:[[]]})});
 const res=()=>({code:200,status(v){this.code=v;return this},type(){return this},set(){return this},send(v){this.html=v;return this}});
 for(const game of GAMES){
  const href='/serveurs/'+slug(game);
  assert.ok(html.includes('href="'+href+'" data-ss-game="'+game.replace(/&/g,'&amp;')+'"'),'missing category '+game);
  const r=res();await routes['/serveurs/:jeu']({params:{jeu:slug(game)}},r);
  assert.equal(r.code,200,game);
  assert.match(r.html,/ss-directory-intro/);
  assert.ok(r.html.includes('href="/serveurs/creer?jeu='+encodeURIComponent(game)+'"'),game+' create link');
 }
});
test('native category navigation is not hijacked by a client-only filter',()=>{
 const source=read('assets/swapp-servers.js');
 assert.doesNotMatch(source,/history\.pushState/);
 assert.doesNotMatch(source,/event\.preventDefault\(\);setGame\(b\.dataset/);
 assert.match(source,/location\.assign\(next\)/);
 assert.match(source,/Aucun serveur inscrit sur SWAPP pour/);
 assert.match(source,/Ajouter le premier serveur/);
 assert.match(source,/Voir le classement externe/);
});
test('failure is not mislabeled as zero servers and success counts include zero',()=>{
 const source=read('assets/swapp-servers.js');
 assert.doesNotMatch(source,/Comptage indisponible/);
 assert.match(source,/value===1\?'':'s'\)\+' inscrit/);
 assert.match(source,/Impossible de charger les serveurs pour le moment/);
 assert.match(source,/state\.status==='error'/);
 assert.match(source,/Voir les serveurs/);
 assert.match(source,/Object\.values\(n\)\.reduce/);
});
test('external categories use each game own art, with Discord identified separately',()=>{
 const source=read('modules/swapp-servers-external-discovery.js');
 const html=renderExternalDiscovery();
 assert.equal(CATEGORY_LINKS.length,6);
 for(const category of CATEGORY_LINKS){
  assert.ok(category.cover.startsWith('https://'),category.label);
  assert.ok(html.includes('alt="Visuel de '+category.label.replace(/&/g,'&amp;')+'"'),category.label);
  assert.ok(!category.cover.includes('top-serveurs.net'),category.label);
 }
 assert.match(source,/Steam store or Twitch category/);
 assert.doesNotMatch(html,/>01<\/span>|>02<\/span>|>03<\/span>/);
 assert.match(html,/Source externe · Top-Serveurs/);
});
test('responsive styles keep images visible and the promotional hero beneath the navbar',()=>{
 const css=read('assets/swapp-servers.css');
 assert.match(css,/\.ss-directory>.ss-grow:first-child\{padding-top:/);
 assert.match(css,/\.ss-partner-card-art img\{position:absolute/);
 assert.match(css,/\.ss-directory-intro-art img\{display:block/);
 assert.match(css,/@media\(max-width:650px\)/);
});
