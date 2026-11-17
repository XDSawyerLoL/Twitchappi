'use strict';
/* SWAPP DevGames — independent playable projects, with lazy-loaded game binaries. */
const fs=require('node:fs');
const path=require('node:path');
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const ROOT='/devgames';
const GAME='/devgames/civitas';
const PLAY='/devgames/civitas/jeu';
const V40PARTS=Object.freeze(Array.from({length:11},(_,i)=>
 path.join(__dirname,'..','assets','devgames','civitas-v40.part'+String(i+1).padStart(2,'0'))));
const heroArt='<svg class="dg-rome" viewBox="0 0 920 580" role="img" aria-label="Illustration artistique d’une ville romaine antique au bord de la mer" xmlns="http://www.w3.org/2000/svg">'+
 '<defs><linearGradient id="dg-sky" x2="0" y2="1"><stop stop-color="#192a34"/><stop offset=".6" stop-color="#696758"/><stop offset="1" stop-color="#b69262"/></linearGradient><linearGradient id="dg-stone" x2="0" y2="1"><stop stop-color="#dfc8a1"/><stop offset="1" stop-color="#a47a50"/></linearGradient><linearGradient id="dg-sea" x2="0" y2="1"><stop stop-color="#577a80"/><stop offset="1" stop-color="#203f48"/></linearGradient></defs>'+
 '<rect width="920" height="580" fill="url(#dg-sky)"/><circle cx="690" cy="158" r="89" fill="#e6c181" opacity=".8"/>'+
 '<path d="M0 355L126 227 203 277 315 175 431 316 539 235 638 327 770 196 920 312V580H0Z" fill="#4d5b4e"/>'+
 '<path d="M0 403C198 370 392 383 566 398S775 420 920 370V580H0Z" fill="url(#dg-sea)"/>'+
 '<path d="M0 445L169 371 298 413 447 345 535 406 920 433V580H0Z" fill="#b59b6e"/>'+
 '<path d="M0 487 174 412 316 461 440 402 599 464 920 482V580H0Z" fill="#897b54"/>'+
 '<g fill="url(#dg-stone)" stroke="#6c4e36" stroke-width="5">'+
 '<path d="M132 373V281H382V373Z"/><path d="M114 281 254 213 401 281Z" fill="#b77d52"/>'+
 '<path d="M478 387V247H725V387Z"/><path d="M458 247 599 173 745 247Z" fill="#d4b183"/>'+
 '<path d="M770 410V310H886V410Z"/><path d="M758 310 821 273 898 310Z" fill="#b47a51"/>'+
 '</g><g fill="#4a493e">'+
 '<rect x="153" y="319" width="32" height="54"/><rect x="212" y="319" width="32" height="54"/><rect x="272" y="319" width="32" height="54"/><rect x="332" y="319" width="32" height="54"/>'+
 '<rect x="501" y="286" width="20" height="100"/><rect x="550" y="286" width="20" height="100"/><rect x="598" y="286" width="20" height="100"/><rect x="647" y="286" width="20" height="100"/><rect x="693" y="286" width="20" height="100"/>'+
 '</g><g fill="#e2cdaa" stroke="#684e35" stroke-width="3"><rect x="489" y="268" width="240" height="17"/><rect x="485" y="381" width="245" height="18"/></g>'+
 '<path d="M0 525c210-39 385-49 572-28s265 43 348 23v60H0Z" fill="#4f6046"/>'+
 '<path d="M38 548 319 467 453 503 592 456" stroke="#d3b68b" stroke-width="22" fill="none" opacity=".68"/>'+
 '<g fill="#25392e"><circle cx="94" cy="412" r="41"/><circle cx="118" cy="394" r="39"/><circle cx="801" cy="448" r="39"/><circle cx="842" cy="427" r="44"/></g>'+
 '</svg>';
function commonHead({title,description,canonical}){
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 return '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<meta name="theme-color" content="#050607"><title>'+esc(title)+'</title>'+
 '<meta name="description" content="'+esc(description)+'">'+
 '<link rel="canonical" href="https://swapp.tv'+esc(canonical)+'">'+
 '<meta property="og:type" content="website"><meta property="og:site_name" content="SWAPP">'+
 '<meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'">'+
 '<meta property="og:image" content="https://swapp.tv/swapp-share-card.png">'+
 SHARED_HEAD_SLOT+
 '<link rel="stylesheet" href="/assets/swapp-devgames.css?v=20261117-v1">';
}
function hubPage(){
 const title='DevGames — Jeux originaux en développement | SWAPP';
 const description='Découvrez les jeux indépendants développés par SWAPP. CIVITAS, stratégie et construction de cités romaines, est jouable directement dans votre navigateur.';
 const content='<main class="dg" id="swapp-devgames">'+
 '<section class="dg-hero dg-wrap"><div class="dg-eyebrow">SWAPP / DEVGAMES <span>JEUX EN DÉVELOPPEMENT</span></div>'+
 '<div class="dg-hero-grid"><div class="dg-hero-copy"><p class="dg-overline">LE LABORATOIRE DE JEUX SWAPP</p><h1>Des mondes à construire.<br><em>Des histoires à jouer.</em></h1>'+
 '<p class="dg-lead">Des expériences créées en indépendant, ouvertes aux joueurs au fil de leur évolution. Une première civilisation attend ses bâtisseurs.</p>'+
 '<div class="dg-actions"><a class="dg-button dg-primary" href="/devgames/civitas">Découvrir CIVITAS</a><a class="dg-button dg-secondary" href="/devgames/civitas#jouer">Jouer maintenant</a></div></div>'+
 '<div class="dg-hero-art">'+heroArt+'<span class="dg-art-caption">Illustration d’ambiance · CIVITAS</span></div></div></section>'+
 '<section class="dg-wrap dg-section"><div class="dg-section-head"><div><p class="dg-overline">PREMIER UNIVERS</p><h2>Notre collection</h2></div><p>Des jeux authentiques, pas un catalogue fictif.</p></div>'+
 '<a class="dg-card" href="/devgames/civitas"><div class="dg-card-image">'+heroArt+'<span class="dg-card-category">STRATÉGIE / GESTION</span></div>'+
 '<div class="dg-card-content"><span class="dg-version">VERSION DE DÉVELOPPEMENT · V40</span><h3>CIVITAS</h3><p>Élevez votre cité dans la Rome antique. Gérez vos ressources, bâtissez vos quartiers et faites grandir votre colonie.</p>'+
 '<span class="dg-card-cta">Découvrir le jeu <span aria-hidden="true">→</span></span></div></a>'+
 '</section><section class="dg-wrap dg-bottom"><h2>DevGames, c’est quoi ?</h2><p>Un espace SWAPP pour découvrir et essayer nos jeux originaux. Les versions jouables peuvent évoluer et certaines fonctions restent en développement.</p></section></main>';
 return renderPage({head:commonHead({title,description,canonical:ROOT}),content,active:'devgames',bodyClass:'swapp-editorial-route swapp-devgames-page'});
}
function civitasPage(){
 const title='CIVITAS — Construis ta cité romaine | SWAPP DevGames';
 const description='Joue à CIVITAS sur SWAPP DevGames : stratégie, construction et gestion d’une colonie romaine. Version V40 accessible directement depuis le navigateur.';
 const content='<main class="dg dg-detail" id="swapp-devgames">'+
 '<div class="dg-wrap dg-breadcrumb"><a href="/devgames">DevGames</a><span aria-hidden="true">/</span><span>CIVITAS</span></div>'+
 '<section class="dg-wrap dg-game-hero"><div class="dg-game-art">'+heroArt+'<span class="dg-art-caption">Illustration d’ambiance, non représentative d’une capture du jeu</span></div>'+
 '<div class="dg-game-copy"><p class="dg-overline">SWAPP DEVGAMES / STRATÉGIE ROMAINE</p><h1>CIVITAS</h1><p class="dg-tagline">Votre cité. Vos décisions. Votre empire.</p>'+
 '<p>Établissez une colonie, construisez progressivement vos bâtiments, affectez vos habitants et développez votre territoire. Une expérience de stratégie inspirée des grands jeux de gestion par navigateur, dans la Rome antique.</p>'+
 '<div class="dg-metadata"><span>Rome antique</span><span>Construction</span><span>Gestion</span><span>V40 · En développement</span></div>'+
 '<div class="dg-actions"><a class="dg-button dg-primary" href="#jouer">Jouer dans SWAPP</a><a class="dg-button dg-secondary" href="'+PLAY+'" target="_blank" rel="noopener">Ouvrir le jeu seul</a></div></div></section>'+
 '<section class="dg-wrap dg-play-section" id="jouer"><div class="dg-section-head"><div><p class="dg-overline">LANCEMENT DIRECT</p><h2>Entrez dans la cité</h2></div><p>Le jeu se charge uniquement quand vous cliquez sur « Lancer ».</p></div>'+
 '<div class="dg-game-window" id="dg-game-window"><div class="dg-start-screen" id="dg-start-screen">'+
 '<div><span class="dg-version">CIVITAS · V40</span><h3>Prêt à fonder votre colonie ?</h3><p>La version complète pèse environ 19 Mo. Pour de meilleures performances, utilisez un ordinateur.</p>'+
 '<button type="button" class="dg-button dg-primary" id="dg-start-button">Lancer CIVITAS</button><p class="dg-help" id="dg-load-state" role="status" aria-live="polite"></p></div></div></div>'+
 '<div class="dg-play-links"><a href="'+PLAY+'" target="_blank" rel="noopener">Jouer en plein écran dans un nouvel onglet</a><span>Votre progression est enregistrée localement par le jeu dans ce navigateur, si le stockage est autorisé.</span></div></section>'+
 '<section class="dg-wrap dg-bottom"><h2>Un jeu qui évolue</h2><p>CIVITAS est présenté dans sa version de développement V40. L’interface, les animations, les bâtiments et les mécaniques évoluent encore. Aucune fonctionnalité multijoueur n’est annoncée comme disponible à ce stade.</p></section></main>';
 return renderPage({head:commonHead({title,description,canonical:GAME}),content,active:'devgames',bodyClass:'swapp-editorial-route swapp-devgames-page',scripts:'<script src="/assets/swapp-devgames.js?v=20261117-v1" defer></script>'});
}
function serveGame(req,res){
 let size=0;
 try{for(const file of V40PARTS)size+=fs.statSync(file).size;}catch(_){
  return res.status(503).type('text').send('Le jeu est temporairement indisponible.');
 }
 res.set('Content-Type','text/html; charset=utf-8');
 res.set('X-Content-Type-Options','nosniff');
 res.set('Cache-Control','public, max-age=3600');
 res.set('Content-Length',String(size));
 if(req.method==='HEAD')return res.end();
 let index=0;
 const streamNext=()=>{
  if(index>=V40PARTS.length){res.end();return;}
  const part=fs.createReadStream(V40PARTS[index++]);
  part.once('error',(error)=>{if(!res.headersSent)res.status(500);res.destroy(error);});
  part.once('end',streamNext);
  part.pipe(res,{end:false});
 };
 streamNext();
}
function register(app){
 app.get(ROOT,(_req,res)=>res.set('Cache-Control','no-store').type('html').send(hubPage()));
 app.get(GAME,(_req,res)=>res.set('Cache-Control','no-store').type('html').send(civitasPage()));
 app.get(PLAY,serveGame);
 app.get(PLAY+'.html',serveGame);
}
module.exports={ROOT,GAME,PLAY,V40PARTS,hubPage,civitasPage,serveGame,register};
