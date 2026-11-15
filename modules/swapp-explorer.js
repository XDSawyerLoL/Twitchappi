'use strict';
/* SWAPP Explorer: authentic Twitch/SWAPP catalogue and live-to-game graph. */
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const ROOT='/explorer';
const GENRE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function page({mode='collections',genre=''}={}){
 const valid=GENRE.test(genre)&&genre.length<=40?genre:'';
 const chart=mode==='carte';
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<meta name="theme-color" content="#050607"><title>Explorer les univers et les directs | SWAPP</title>'+
 '<meta name="description" content="Explorez les collections de jeux et la carte interactive des créateurs réellement en direct sur SWAPP.">'+
 '<link rel="canonical" href="https://swapp.tv'+(chart?'/explorer/carte':valid?'/explorer/collections/'+valid:ROOT)+'">'+
 SHARED_HEAD_SLOT+
 '<link rel="stylesheet" href="/assets/swapp-explorer.css?v=20261115-explorer-v1">';
 const content='<main id="swapp-explorer" class="sx" data-view="'+(chart?'carte':valid?'detail':'collections')+'" data-genre="'+valid+'">'+
 '<div class="sx-lead"><p class="sx-eyebrow">SWAPP / EXPLORER</p><h1>Des univers à découvrir.<br><em>Des créateurs à rencontrer.</em></h1>'+
 '<p class="sx-intro">Parcourez les jeux et leurs communautés. Découvrez qui joue réellement en direct, et comment les univers se rejoignent.</p>'+
 '<div class="sx-switch" role="navigation" aria-label="Explorer">'+
 '<a href="/explorer" class="'+(!chart?'is-active':'')+'" '+(!chart?'aria-current="page"':'')+'>Collections</a>'+
 '<a href="/explorer/carte" class="'+(chart?'is-active':'')+'" '+(chart?'aria-current="page"':'')+'>Carte des lives</a>'+
 '</div></div>'+
 '<div class="sx-body">'+
 '<div class="sx-toolbar"><label class="sx-search"><span class="sx-visually-hidden">Rechercher dans Explorer</span><input id="sx-query" type="search" autocomplete="off" placeholder="Rechercher un jeu, un genre ou un créateur"></label>'+
 '<span id="sx-count" class="sx-count" aria-live="polite">Recherche des directs…</span></div>'+
 '<div id="sx-feedback" class="sx-feedback" role="status" aria-live="polite">Chargement du catalogue vérifié…</div>'+
 '<section id="sx-collections-view" class="sx-panel" aria-label="Collections de jeux"'+(chart?' hidden':'')+'>'+
 '<div class="sx-section-title"><p>COLLECTIONS</p><h2 id="sx-collections-heading">Choisissez un univers</h2><span>Des catégories réelles, sans jeux ni audiences inventés</span></div>'+
 '<div id="sx-collection-grid" class="sx-collection-grid"></div>'+
 '<section id="sx-collection-detail" class="sx-detail" hidden><div class="sx-detail-heading"><a href="/explorer">← Toutes les collections</a><h2 id="sx-detail-title"></h2><p id="sx-detail-subtitle"></p></div><div id="sx-detail-games" class="sx-game-grid"></div><h3>Créateurs en direct</h3><div id="sx-detail-lives" class="sx-live-grid"></div></section>'+
 '</section>'+
 '<section id="sx-graph-view" class="sx-panel" aria-label="Carte interactive des lives"'+(!chart?' hidden':'')+'>'+
 '<div class="sx-section-title"><p>LIVEGRAPH</p><h2>Les connexions du direct</h2><span>Relations constatées : créateur → jeu → genre. Aucune relation sociale présumée.</span></div>'+
 '<div class="sx-graph-toolbar"><label for="sx-focus">Univers central</label><select id="sx-focus" aria-label="Choisir le jeu au centre de la carte"></select>'+
 '<span id="sx-graph-count">Aucun direct vérifié chargé</span></div>'+
 '<div class="sx-graph-layout"><div id="sx-canvas" class="sx-canvas" role="group" aria-label="Carte des jeux et créateurs en direct">'+
 '<svg id="sx-lines" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg><div id="sx-nodes" class="sx-nodes"></div></div>'+
 '<aside class="sx-inspector" id="sx-inspector"><p class="sx-eyebrow">DÉTAIL DU RÉSEAU</p><h3>Sélectionnez une connexion</h3><p>Chaque lien correspond à une catégorie ou un direct effectivement retrouvé.</p></aside></div>'+
 '<p class="sx-graph-legend"><span>● Jeu</span><span>● Créateur en direct</span><span>● Genre</span></p>'+
 '</section></div></main>';
 return renderPage({head,content,active:'explorer',bodyClass:'swapp-editorial-route swapp-explorer-page',
 scripts:'<script src="/assets/swapp-genre-discovery.js?v=20261115-hidpi-genre-v8" defer></script>'+
 '<script src="/assets/swapp-explorer.js?v=20261115-explorer-v1" defer></script>'+
 '<script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}
function register(app){
 const send=(req,res,mode,genre='')=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  return res.type('html').send(page({mode,genre}));
 };
 app.get(ROOT,(req,res)=>send(req,res,'collections'));
 app.get(ROOT+'/carte',(req,res)=>send(req,res,'carte'));
 app.get(ROOT+'/collections/:genre',(req,res)=>{
  const genre=String(req.params?.genre||'');
  if(!GENRE.test(genre)||genre.length>40)return res.status(404).type('text').send('Collection introuvable');
  return send(req,res,'collections',genre);
 });
}
module.exports={ROOT,page,register};