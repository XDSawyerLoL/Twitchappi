'use strict';
/* SWAPP catalogue lab — an unindexed opt-in prototype, not a new public menu. */
const {serverHeader,serverMobile}=require('../assets/swapp-navigation');
const html=source=>String(source||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ROUTE='/catalogue-test';
function page(){
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
  '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#0b0d12">'+
  '<title>Catalogue immersif · Laboratoire SWAPP</title>'+
  '<meta name="description" content="Page de démonstration privée : explorer les lives et les jeux SWAPP par affiches, prévisualisations et favoris.">'+
  '<link rel="stylesheet" href="/assets/swapp-unified-nav.css?v=20261113-nav-uniform-v1">'+
  '<link rel="stylesheet" href="/assets/swapp-catalogue-lab.css?v=20261113-actus-rail-v3">';
 const content='<div class="scl-shell" id="swapp-catalogue-lab">'+
  '<aside class="scl-side" aria-label="Rubriques du catalogue">'+
   '<div class="scl-side-brand">SWAPP<span>.</span><small>CATALOGUE / LAB</small></div>'+
   '<a href="#scl-feature" class="scl-side-link is-current">À la une</a>'+
   '<a href="#scl-articles" class="scl-side-link">Articles</a><a href="#scl-live" class="scl-side-link">Directs</a>'+
   '<a href="#scl-games" class="scl-side-link">Jeux</a>'+
   '<a href="#scl-small" class="scl-side-link">Petites communautés</a>'+
   '<a href="#scl-favorites" class="scl-side-link">Ma liste <span data-scl-favorites-count>0</span></a>'+
   '<a href="/categories" class="scl-side-back">Catalogue classique</a>'+
  '</aside>'+
  '<main class="scl-main" id="scl-main">'+
   '<div class="scl-topline"><div><span class="scl-kicker">SWAPP ORIGINAL · EXPÉRIENCE TEST</span><p>Des histoires à regarder en direct.</p></div>'+
    '<label class="scl-search"><span class="scl-visually-hidden">Rechercher un jeu ou un créateur</span>'+
     '<input id="scl-search" type="search" placeholder="Rechercher un jeu ou un créateur" autocomplete="off" aria-label="Rechercher un jeu ou un créateur"></label></div>'+
   '<div class="scl-tabs" role="group" aria-label="Afficher"><button type="button" data-scl-filter="all" aria-pressed="true">Tout</button>'+
    '<button type="button" data-scl-filter="live" aria-pressed="false">Directs</button><button type="button" data-scl-filter="article" aria-pressed="false">Articles</button>'+
    '<button type="button" data-scl-filter="game" aria-pressed="false">Jeux</button>'+
    '<button type="button" data-scl-filter="fav" aria-pressed="false">Favoris</button></div>'+
   '<section class="scl-feature" id="scl-feature" aria-label="Sélection du jour">'+
    '<div class="scl-feature-visual" id="scl-feature-visual" aria-hidden="true"></div><div class="scl-feature-vignette" aria-hidden="true"></div>'+
    '<div class="scl-feature-copy"><span class="scl-feature-kicker" id="scl-feature-kicker">SÉLECTION EN DIRECT</span>'+
     '<h1 id="scl-feature-title">À toi de choisir la suite.</h1>'+
     '<p id="scl-feature-desc">Le catalogue présente uniquement des émissions et des jeux réellement disponibles. Aucune session fictive.</p>'+
     '<p id="scl-feature-meta" class="scl-feature-meta" aria-live="polite"></p>'+
     '<div class="scl-actions"><button class="scl-btn scl-btn-primary" id="scl-feature-watch" type="button" disabled>Regarder</button>'+
      '<button class="scl-btn scl-btn-neutral" id="scl-feature-preview" type="button" disabled>Prévisualiser</button>'+
      '<button class="scl-btn scl-btn-outline" id="scl-feature-details" type="button" disabled>Plus d’informations</button></div>'+
    '</div><div class="scl-feature-switch" role="group" aria-label="Sélection à la une"><button type="button" id="scl-feature-prev" aria-label="Sélection précédente">‹</button><div class="scl-feature-dots" id="scl-feature-dots" aria-label="Sélections disponibles"></div><button type="button" id="scl-feature-next" aria-label="Sélection suivante">›</button></div></section>'+
   '<div id="scl-status" class="scl-status" role="status" aria-live="polite">Chargement des directs et des jeux…</div>'+
   '<section class="scl-rail scl-article-rail" id="scl-articles" data-scl-section="article" aria-labelledby="scl-articles-title"><div class="scl-rail-head"><div><span class="scl-rail-eyebrow">LE MAGAZINE SWAPP</span><h2 id="scl-articles-title">À la une sur SWAPP</h2></div><div class="scl-rail-head-actions"><a class="scl-all-news" href="/actus">Toutes les actualités</a><div class="scl-rail-nav"><button type="button" data-scroll-left="scl-article-cards" aria-label="Défiler les articles vers la gauche">‹</button><button type="button" data-scroll-right="scl-article-cards" aria-label="Défiler les articles vers la droite">›</button></div></div></div><div class="scl-cards scl-article-cards" id="scl-article-cards" aria-live="polite"></div></section>'+ 
   '<section class="scl-rail" id="scl-live" data-scl-section="live" aria-labelledby="scl-live-title"><div class="scl-rail-head"><div><span class="scl-rail-eyebrow">À REGARDER MAINTENANT</span><h2 id="scl-live-title">En direct sur SWAPP</h2></div><div class="scl-rail-nav"><button type="button" data-scroll-left="scl-live-cards" aria-label="Défiler les directs vers la gauche">‹</button><button type="button" data-scroll-right="scl-live-cards" aria-label="Défiler les directs vers la droite">›</button></div></div><div class="scl-cards" id="scl-live-cards"></div></section>'+
   '<section class="scl-rail" id="scl-games" data-scl-section="game" aria-labelledby="scl-games-title"><div class="scl-rail-head"><div><span class="scl-rail-eyebrow">AFFICHES & UNIVERS</span><h2 id="scl-games-title">Explore les jeux</h2></div><div class="scl-rail-nav"><button type="button" data-scroll-left="scl-game-cards" aria-label="Défiler les jeux vers la gauche">‹</button><button type="button" data-scroll-right="scl-game-cards" aria-label="Défiler les jeux vers la droite">›</button></div></div><div class="scl-cards scl-cards-games" id="scl-game-cards"></div></section>'+
   '<section class="scl-rail" id="scl-small" data-scl-section="live" aria-labelledby="scl-small-title"><div class="scl-rail-head"><div><span class="scl-rail-eyebrow">MOINS DE 50 SPECTATEURS</span><h2 id="scl-small-title">Petites communautés à découvrir</h2></div><div class="scl-rail-nav"><button type="button" data-scroll-left="scl-small-cards" aria-label="Défiler les petits streams vers la gauche">‹</button><button type="button" data-scroll-right="scl-small-cards" aria-label="Défiler les petits streams vers la droite">›</button></div></div><div class="scl-cards" id="scl-small-cards"></div></section>'+
   '<section class="scl-rail" id="scl-favorites" data-scl-section="fav" aria-labelledby="scl-favorites-title"><div class="scl-rail-head"><div><span class="scl-rail-eyebrow">TA SÉLECTION</span><h2 id="scl-favorites-title">Ma liste</h2></div><a href="/mes-jeux" class="scl-library-link">Ma bibliothèque</a></div><div class="scl-cards scl-cards-favorites" id="scl-favorite-cards"></div></section>'+
   '<footer class="scl-footer">Prototype expérimental SWAPP. Les images, articles et flux proviennent des sources publiques disponibles. Aucun contenu fictif ni vidéo lancée sans interaction. <a href="/categories">Retour au catalogue</a>.</footer>'+
  '</main></div>'+
  '<dialog class="scl-dialog" id="scl-dialog" aria-labelledby="scl-dialog-title"><button class="scl-dialog-close" type="button" id="scl-dialog-close" aria-label="Fermer">×</button><div id="scl-dialog-content"></div></dialog>';
 return '<!doctype html><html lang="fr"><head>'+head+'</head><body class="swapp-editorial-route swapp-catalogue-lab-page">'+
  serverHeader('categories')+content+serverMobile('categories')+
  '<script src="/assets/swapp-article-extras.js?v=20261113-actus-rail-v3" defer></script>'+
  '<script src="/assets/swapp-catalogue-lab.js?v=20261113-actus-rail-v3" defer></script>'+
  '<script src="/assets/swapp-my-games.js?v=20261021-account-hub-v1" defer></script>'+
  '<script src="/assets/swapp-navigation.js?v=20261113-swaper-decouvrir-v1" defer></script>'+
  '<script src="/assets/swapp-nav-session.js" defer></script>'+
  '</body></html>';
}
function register(app){
 app.get(ROUTE,(_req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Robots-Tag','noindex, nofollow, noarchive');
  res.set('X-Content-Type-Options','nosniff');
  return res.type('html').send(page());
 });
}
module.exports={ROUTE,page,register,html};
