'use strict';
// One verified article suffices for a GAME UNIVERSE hub; never invent game data.
// The page only aggregates first-party editorial content and the existing live shelf.
const {layout}=require('./swapp-news/site-shell');
const {searchNames}=require('./swapp-news/game-identity');
const {cardImageSources}=require('../assets/swapp-article-extras');
const {publicCommunityLinks}=require('./swapp-public-community-links');
const ORIGIN='https://swapp.tv';
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
const GAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function canonicalGame(value){
 const raw=String(value||'').trim().slice(0,100);
 if(!raw)return '';
 // Reuse the editorial whitelist of established aliases; never infer a
 // different game from an article headline or a broad keyword match.
 const aliases=searchNames(raw);
 return aliases.length>1?aliases[0]:raw;
}
function gameSlug(value){
 const slug=canonicalGame(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'');
 return slug.length>=3&&GAME.test(slug)?slug:'';
}
function gameHubUrl(game){
 const slug=gameSlug(game);return slug?'/jeux/'+slug:'';
}
function gameHubs(articles=[],{minArticles=1,maxGames=90}={}){
 const groups=new Map();
 for(const a of Array.isArray(articles)?articles:[]){
  if(a?.status!=='published'||!SLUG.test(String(a.slug||'')))continue;
  if(!String(a.title||'').trim()||!String(a.summary||a.body||'').trim())continue;
  const game=canonicalGame(a.game),slug=gameSlug(game);
  if(!slug)continue;
  if(!groups.has(slug))groups.set(slug,{slug,game,articles:[],slugs:new Set(),titles:new Set()});
  const group=groups.get(slug),titleKey=String(a.title).trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
  if(group.slugs.has(a.slug)||group.titles.has(titleKey))continue;
  group.slugs.add(a.slug);group.titles.add(titleKey);group.articles.push(a);
 }
 const eligible=[];
 for(const g of groups.values()){
  if(g.articles.length<minArticles)continue;
  g.articles.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
  let lastmod='';
  for(const a of g.articles){const date=String(a.updatedAt||a.publishedAt||'');if(Number.isFinite(Date.parse(date))&&date>lastmod)lastmod=date}
  eligible.push({slug:g.slug,game:g.game,articles:g.articles.slice(0,40),count:g.articles.length,lastmod});
 }
 eligible.sort((a,b)=>b.count-a.count||a.game.localeCompare(b.game,'fr'));
 return eligible.slice(0,maxGames);
}
const CSS=[
 '.game-portal{max-width:1250px;margin:0 auto;padding:38px 24px 65px}',
 '.game-portal .hero{padding:clamp(24px,4vw,44px);background:linear-gradient(125deg,#1b2944,#241833);border:1px solid #ffffff25;border-radius:22px;overflow:hidden;position:relative}',
 '.game-portal h1{font-size:clamp(32px,5vw,60px);letter-spacing:-.06em;line-height:1.1;margin:10px 0}',
 '.game-portal h2{font-size:clamp(24px,3vw,32px);margin:34px 0 16px}',
 '.game-portal p{color:#c9d4e5}.game-portal a:hover{text-decoration:underline}',
 '.game-portal .breadcrumb{font-size:13px;margin-bottom:15px;color:#bac8dc}.game-portal .breadcrumb a{color:#9be7f3}',
 '.game-portal .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}',
 '.game-portal .card{display:block;border:1px solid #ffffff25;border-radius:19px;overflow:hidden;background:#17243b;text-decoration:none}',
 '.game-portal .card img{width:100%;height:177px;object-fit:cover}.game-portal .card div{padding:17px}',
 '.game-portal .card h3{font-size:21px;line-height:1.2;margin:8px 0}.game-portal .card p{font-size:14px}',
 '.game-portal .card small{color:#8ce5f0}.game-portal .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}',
 '.game-portal .actions a,.game-portal .actions button{padding:10px 15px;border-radius:9px;border:1px solid #ffffff38;background:#ffffff15;color:white;text-decoration:none;font-weight:700}',
 '.game-portal .hero-cover{float:right;width:min(38%,380px);aspect-ratio:16/9;object-fit:cover;border-radius:13px;margin:0 0 12px 22px;border:1px solid #ffffff2a}.game-portal .universe-kicker{font-size:11px;font-weight:900;letter-spacing:.16em;color:#d6b7ff;text-transform:uppercase}.game-portal .journey{display:flex;flex-wrap:wrap;gap:7px;color:#bdcbe0;font-size:12px;margin-top:14px}.game-portal .journey span+span:before{content:"→";margin-right:7px;color:#d4a9ff}.game-portal .index .game-index-details span{color:#acbdd2;font-size:13px}',
  '.game-portal .game-universe-share{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding:22px 24px;margin:24px 0;border:1px solid #ffffff22;border-radius:14px;background:linear-gradient(116deg,#121e35,#182039)}',
  '.game-portal .game-universe-share h2{margin:4px 0 6px;font-size:clamp(19px,2.3vw,27px)}.game-portal .game-universe-share p{margin:0;color:#b9c6dc;font-size:13px}.game-portal .game-universe-share .actions{margin:0}',
 '@media(max-width:640px){.game-portal{padding:20px 14px}.game-portal .hero{padding:23px 19px}.game-portal .hero-cover{float:none;width:100%;margin:0 0 16px}}',

 '.game-portal .cards.index{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}',
 '.game-portal .cards.index>.game-index-card{display:flex;flex-direction:column;min-width:0;overflow:hidden;isolation:isolate;background:#182337;border:1px solid #ffffff2c;border-radius:16px;transition:border-color .2s,transform .2s}',
 '.game-portal .cards.index>.game-index-card:hover{border-color:#a9dbdc;transform:translateY(-2px)}',
 '.game-portal .cards.index .game-index-link{display:block;flex:1;min-width:0;min-height:0;text-decoration:none!important;overflow:hidden}',
 '.game-portal .cards.index .game-index-media{width:100%;aspect-ratio:16/9;min-height:0;overflow:hidden;background:#101824;position:relative;padding:0}',
 '.game-portal .cards.index .game-index-media img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;background:#101824}',
 '.game-portal .cards.index .game-index-no-art{display:grid;place-items:center;background:linear-gradient(125deg,#1d3545,#101722)}',
 '.game-portal .cards.index .game-index-no-art span{font-size:11px;letter-spacing:.12em;color:#a1b8c4;font-weight:800;text-align:center;padding:16px}',
 '.game-portal .cards.index .game-index-details{min-width:0;padding:17px 17px 12px;display:flex;flex-direction:column;gap:7px}',
 '.game-portal .cards.index .game-index-details h3{margin:0;line-height:1.2;font-size:clamp(17px,1.6vw,22px);letter-spacing:-.035em;overflow-wrap:anywhere;color:#f4f7ff}',
 '.game-portal .cards.index .game-index-details span{font-size:12px;color:#b3c6d6}',
 '.game-portal .cards.index .game-index-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch;padding:5px 15px 16px;min-width:0}',
 '.game-portal .cards.index .game-index-actions button{min-width:0;min-height:41px;width:100%;margin:0;justify-content:center;align-self:stretch;padding:8px 7px;font-size:11px;line-height:1.3;text-align:center;white-space:normal}',
 '.game-portal .cards.index .game-index-link:focus-visible,.game-portal .cards.index .game-index-actions button:focus-visible{outline:2px solid #a8e9ff;outline-offset:-2px}',
 '@media(max-width:1000px){.game-portal .cards.index{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:620px){.game-portal .cards.index{grid-template-columns:minmax(0,1fr);gap:13px}.game-portal .cards.index .game-index-media{aspect-ratio:16/9}.game-portal .cards.index .game-index-details h3{font-size:20px}}',
 ".game-portal{max-width:1520px;padding:30px clamp(16px,3.4vw,54px) 72px;--universe-accent:var(--swapp-page-accent,var(--brand,#8ee2e0))}",
 ".game-portal .hero{min-height:clamp(345px,40vw,580px);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;isolation:isolate;padding:clamp(25px,4vw,60px);border:0;border-radius:clamp(11px,1.2vw,18px);background:linear-gradient(125deg,#101c2a,#111221);box-shadow:0 25px 75px rgba(0,0,0,.26)}",
 ".game-portal .hero:has(.hero-cover)::after{content:\"\";position:absolute;z-index:-1;inset:0;border-radius:inherit;background:linear-gradient(90deg,rgba(5,10,18,.95),rgba(5,10,18,.49) 75%),linear-gradient(0deg,rgba(5,10,18,.9),transparent 75%)}",
 ".game-portal .hero-cover{position:absolute;z-index:-2;inset:0;width:100%;height:100%;max-width:none;float:none;margin:0;border:0;border-radius:inherit;object-fit:cover;opacity:.82;filter:saturate(1.13) contrast(1.08)}",
 ".game-portal .hero h1{font-size:clamp(37px,5.1vw,76px);max-width:20ch;line-height:1.01;letter-spacing:-.057em;text-wrap:balance}",
 ".game-portal .hero>p{max-width:67ch;font-size:clamp(14px,1.45vw,18px);line-height:1.55;text-wrap:pretty}",
 ".game-portal .universe-kicker{color:var(--universe-accent);letter-spacing:.14em}",
 ".game-portal .hero .actions{gap:8px;margin-top:20px;position:relative;z-index:2}",
 ".game-portal .hero .actions :is(a,button){min-height:42px;border-radius:9px;background:rgba(13,22,36,.72);border-color:rgba(217,233,248,.26);backdrop-filter:blur(9px)}",
 ".game-portal .hero .actions :is(a,button):focus-visible{outline:3px solid var(--universe-accent);outline-offset:2px}",
 ".game-portal .cards:not(.index){grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:clamp(15px,2vw,28px)}",
 ".game-portal .cards:not(.index) .card{border:0;border-top:1px solid #ffffff25;border-radius:0;background:transparent;box-shadow:none}",
 ".game-portal .cards:not(.index) .card img{height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:10px}",
 ".game-portal .cards:not(.index) .card div{padding:17px 2px 15px}",
 ".game-portal .game-universe-share{border:0;border-top:1px solid #ffffff25;border-bottom:1px solid #ffffff25;border-radius:0;background:transparent;padding:24px 0;box-shadow:none}",
 ".game-portal .game-universe-share .actions a{border-radius:8px;background:#ffffff0b;border-color:#ffffff22}",
 ".game-portal .game-universe-share .actions a:focus-visible{outline:2px solid var(--universe-accent);outline-offset:2px}",
 "@media(max-width:720px){.game-portal{padding:16px 12px 48px}.game-portal .hero{min-height:355px;padding:28px 20px}.game-portal .hero-cover{width:100%;margin:0;float:none}.game-portal .hero h1{font-size:clamp(32px,8vw,52px)}.game-portal .hero .actions :is(a,button){font-size:12px;min-height:44px}}",
 '.game-portal #game-live,.game-portal #game-actus{scroll-margin-top:92px}',
 "@media(prefers-reduced-motion:reduce){.game-portal .cards.index>.game-index-card{transition:none;transform:none!important}}",
].join('');
function safeCover(a){return cardImageSources(a)[0]||'';}

function structuredData(object){
 return '<script type="application/ld+json">'+JSON.stringify(object).replace(/</g,'\\u003c')+'</script>';
}
function renderGameIndex(groups){
 const url=ORIGIN+'/univers',title='Jeux vidéo : articles et lives';
 const indexSchema={'@context':'https://schema.org','@type':'CollectionPage',name:title,url,
  mainEntity:{'@type':'ItemList',itemListElement:groups.map((g,i)=>({
   '@type':'ListItem',position:i+1,name:g.game,url:ORIGIN+'/jeux/'+encodeURIComponent(g.slug)
  }))}};
 const meta='<link rel="canonical" href="'+url+'"><meta property="og:type" content="website"><meta property="og:url" content="'+url+'">'+structuredData(indexSchema);
 const links=groups.map(g=>{
  const cover=safeCover(g.articles[0]);
  return '<article class="card game-index-card" data-swapp-game-card data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'">'+
   '<a class="game-index-link" href="/jeux/'+encodeURIComponent(g.slug)+'">'+
    (cover?'<div class="game-index-media"><img src="'+html(cover)+'" alt="Visuel du jeu '+html(g.game)+'" loading="lazy" decoding="async"></div>':'<div class="game-index-media game-index-no-art" aria-hidden="true"><span>SWAPP / GAME UNIVERSE</span></div>')+
    '<div class="game-index-details"><h3>'+html(g.game)+'</h3><span>'+g.count+' publication'+(g.count>1?'s':'')+'</span></div></a>'+
    '<div class="game-index-actions">'+
     '<button type="button" data-swapp-follow-game data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'" aria-pressed="false">＋ Suivre</button>'+
     '<button type="button" data-swapp-wishlist-game data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'" aria-pressed="false">♡ Mes envies</button>'+
    '</div></article>';
 }).join('');
 const body='<main class="game-portal"><p class="breadcrumb"><a href="/">SWAPP</a> / Jeux</p><header class="hero"><h1>Jeux vidéo : actualités et créateurs</h1><p>Retrouve les jeux couverts par SWAPP, leurs articles et les créateurs en direct.</p><div class="actions"><a href="/mes-jeux">Mes jeux suivis →</a></div></header><section><div class="mg-index-intro"><h2>Explorer les jeux</h2><a href="/mes-jeux">Retrouver ma sélection →</a></div><div class="cards index">'+links+'</div></section></main>';
 return layout({title,description:'Articles et créateurs autour des jeux vidéo couverts par SWAPP.',content:body,metadata:meta,extraCss:CSS,active:'games'});
}
function renderGamePage(group){
 const url=ORIGIN+'/jeux/'+encodeURIComponent(group.slug);
 const title=group.game+' : actualités et lives',description=group.count+' publication'+(group.count>1?'s':'')+' SWAPP sur '+group.game+', les créateurs réellement en direct et la communauté.';
 const cover=group.articles.map(safeCover).find(Boolean)||'';
 const pageSchema={'@context':'https://schema.org','@type':'CollectionPage',
  name:title,url,description,
  mainEntity:{'@type':'ItemList',itemListElement:group.articles.map((a,i)=>({
   '@type':'ListItem',position:i+1,name:String(a.title||'').slice(0,180),
   url:ORIGIN+'/actus/'+encodeURIComponent(a.slug)
  }))}};
 const meta=(group.count<2?'<meta name="robots" content="noindex,follow">':'')+
  '<link rel="canonical" href="'+url+'"><meta property="og:type" content="website"><meta property="og:url" content="'+url+'"><meta property="og:title" content="'+html(title)+'"><meta property="og:description" content="'+html(description)+'>'+
  (cover?'<meta property="og:image" content="'+html(cover)+'"><meta name="twitter:card" content="summary_large_image">':'<meta name="twitter:card" content="summary">')+structuredData(pageSchema);
 const channels=publicCommunityLinks();
 const xShare='https://x.com/intent/tweet?'+new URLSearchParams({
  text:group.game+' : découvre les actualités et les créateurs sur SWAPP',
  url
 }).toString();
 const blueskyShare='https://bsky.app/intent/compose?text='+encodeURIComponent(group.game+' : actualités et créateurs sur SWAPP\n'+url);
 const socialUrl='/social?game='+encodeURIComponent(group.game);
 const discordJoin=channels.discordInvite
   ?'<a href="'+html(channels.discordInvite)+'" target="_blank" rel="noopener noreferrer">Rejoindre le Discord SWAPP ↗</a>':'';
 const communityActions='<section class="game-universe-share" aria-labelledby="game-universe-share-title">'+
  '<div><span class="universe-kicker">FAIS VIVRE CET UNIVERS</span><h2 id="game-universe-share-title">Retrouve les autres joueurs.</h2><p>Partage ce jeu et prolonge les échanges dans la communauté.</p></div>'+
  '<div class="actions"><a href="'+html(xShare)+'" target="_blank" rel="noopener noreferrer">Partager ce jeu sur X ↗</a>'+
  '<a href="'+html(socialUrl)+'">Discuter sur SWAPP SOCIAL ↗</a>'+ 
  '<a href="'+html(blueskyShare)+'" target="_blank" rel="noopener noreferrer">Partager sur Bluesky ↗</a>'+discordJoin+'</div></section>';
 const cards=group.articles.map(a=>{
  const cover=safeCover(a),excerpt=String(a.summary||a.body||'').replace(/\s+/g,' ').slice(0,180);
  return '<a class="card" href="/actus/'+encodeURIComponent(a.slug)+'">'+
   (cover?'<img src="'+html(cover)+'" alt="" loading="lazy">':'')+
   '<div><small>'+html(a.category||'Actualité')+'</small><h3>'+html(a.title)+'</h3><p>'+html(excerpt)+'</p></div></a>';
 }).join('');
 const body='<main class="game-portal"><p class="breadcrumb"><a href="/">SWAPP</a> / <a href="/jeux">Jeux</a> / '+html(group.game)+'</p>'+
  '<header class="hero">'+(cover?'<img class="hero-cover" src="'+html(cover)+'" alt="Visuel de '+html(group.game)+'" loading="eager">':'')+'<span class="universe-kicker">SWAPP / GAME UNIVERSE</span><h1>'+html(group.game)+' : actualités et lives</h1><p>'+html(description)+'</p><div class="journey"><span>Actualités</span><span>Créateurs</span><span>Communauté</span><span>Mes jeux</span></div><div class="actions"><button type="button" data-swapp-wishlist-game data-game-slug="'+html(group.slug)+'" data-game-name="'+html(group.game)+'" aria-pressed="false">♡ Ajouter aux envies</button><button type="button" data-swapp-follow-game data-game-slug="'+html(group.slug)+'" data-game-name="'+html(group.game)+'" aria-pressed="false">＋ Suivre ce jeu</button><a href="#game-live">Voir les lives ↓</a><a href="#game-actus">Lire les articles ↓</a><a href="/mes-jeux">Mes jeux</a><a href="/actus">Toutes les actualités</a><a href="/decouvrir">Explorer les créateurs</a><a href="/social?game='+encodeURIComponent(group.game)+'">Salons du jeu</a><a href="/boutique">Consulter la boutique</a></div></header>'+
  '<section id="game-live" class="swapp-media-section" data-swapp-live-shelf data-game="'+html(group.game)+'"><div class="swapp-media-heading"><h2>En direct sur '+html(group.game)+'</h2></div>'+
  '<div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives actuellement disponibles…</p></div></section>'+
  '<section class="swapp-spotlight-public" data-spotlight-game="'+html(group.game)+'" aria-label="Créateurs Spotlight"></section>'+
  '<section id="game-actus"><h2>À lire sur '+html(group.game)+'</h2><div class="cards">'+cards+'</div></section>'+
  communityActions+'</main>';
 return layout({title,description,content:body,metadata:meta,extraCss:CSS,active:'games'});
}

// One personal hub, populated with verified published articles only.
// Preference state remains on the visitor's device and is never embedded in HTML.
function renderMyGames(groups=[]){
 const safe=(Array.isArray(groups)?groups:[]).filter(g=>g&&GAME.test(String(g.slug||''))&&Array.isArray(g.articles)).slice(0,40);
 const cards=safe.map(g=>{
  const recent=g.articles.slice(0,3).map(a=>{
   const date=String(a.publishedAt||'');
   const validDate=Number.isFinite(Date.parse(date))?new Date(date).toISOString():'';
   const dateText=validDate?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(validDate)):'';
   return '<a href="/actus/'+encodeURIComponent(a.slug)+'" data-story-date="'+html(validDate)+'" data-story-title="'+html(String(a.title).slice(0,155))+'">'+
     (dateText?'<time datetime="'+html(validDate)+'">'+html(dateText)+'</time>':'')+html(String(a.title).slice(0,155))+'</a>';
  }).join('');
  return '<article class="mg-card" data-swapp-game-card data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'">'+
   '<div class="mg-card-top"><div><span class="mg-eyebrow">'+g.count+' publication'+(g.count>1?'s':'')+' vérifiée'+(g.count>1?'s':'')+'</span><h3>'+html(g.game)+'</h3><p>Actualités, lives, joueurs et boutique</p></div><button type="button" data-swapp-follow-game data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'" aria-pressed="false">＋ Suivre ce jeu</button></div>'+
   '<span class="mg-new" data-my-games-news hidden></span><div class="mg-card-latest">'+recent+'</div>'+
   '<div class="mg-card-links"><button type="button" data-swapp-wishlist-game data-game-slug="'+html(g.slug)+'" data-game-name="'+html(g.game)+'" aria-pressed="false">♡ Ajouter aux envies</button><a href="/jeux/'+encodeURIComponent(g.slug)+'">Dossier et lives →</a><a href="/social?game='+encodeURIComponent(g.game)+'">Salons du jeu</a><a href="/boutique">Voir la boutique</a><button type="button" data-my-games-mark-seen hidden>Marquer comme vues</button></div></article>';
 }).join('');
 const body='<main class="swapp-my-games" data-swapp-library-root>'+
  '<p class="breadcrumb"><a href="/">SWAPP</a> / <a href="/jeux">Jeux</a> / Ma sélection</p>'+
  '<header class="mg-header"><div><span class="mg-eyebrow">SWAPP · MON ESPACE</span><h1>Mes jeux.</h1><p>Retrouve les actualités de tes jeux, les créateurs en direct et la communauté. Tu choisis ce que tu suis, sans notifications forcées.</p></div><a class="mg-header-link" href="/jeux">Découvrir les jeux ↗</a></header>'+
  '<section class="mg-digest" id="mes-nouveautes" aria-labelledby="mg-digest-title">'+
   '<div class="mg-digest-intro"><div><span class="mg-eyebrow">POUR TOI · ACTUALITÉ</span><h2 id="mg-digest-title">À lire sur tes jeux</h2><p>Les dernières publications SWAPP sur les jeux que tu suis ou gardes dans tes envies. Rien n’est ajouté à ta sélection sans ton choix.</p></div><a href="/actus">Toute l’actualité ↗</a></div>'+
   '<p class="mg-digest-status" data-my-games-digest-summary role="status" aria-live="polite">Chargement de ta sélection…</p>'+
   '<div class="mg-digest-list" data-my-games-digest></div></section>'+
  '<section class="mg-live-hub" id="mes-lives" data-my-games-live aria-labelledby="mg-lives-title">'+
   '<div class="mg-live-heading"><div><span class="mg-eyebrow">SWAPP LIVE · TWITCH</span><h2 id="mg-lives-title">En direct sur tes jeux</h2><p>Les lives SWAPP et Twitch réellement actifs sur les jeux de ta sélection. Les directs SWAPP apparaissent en priorité.</p></div><div class="mg-live-heading-actions"><button type="button" data-my-games-live-refresh>Actualiser les directs</button><button type="button" data-my-games-live-more hidden>Voir les jeux suivants</button><a href="/decouvrir">Tous les lives ↗</a></div></div>'+
   '<p class="mg-live-status" role="status" aria-live="polite" data-my-games-live-status>Choisis un jeu pour découvrir les chaînes en direct.</p>'+
   '<div class="mg-live-list" data-my-games-live-results></div>'+
   '<p class="mg-live-footnote">Une sélection de jeux est vérifiée lors de l’affichage de cette section. Actualisation uniquement sur demande, aucun suivi de tes visionnages.</p></section>'+
  '<section class="mg-sync" aria-label="Synchronisation de ma bibliothèque">'+
   '<div><strong>Retrouver mes jeux sur tous mes appareils</strong><p>Tu peux lier volontairement cette sélection à ton compte SWAPP. La première activation fusionne les jeux de cet appareil avec ceux du compte, sans récupérer ton activité ni tes achats.</p>'+
   '<p data-my-games-sync-status role="status" aria-live="polite">Sans synchronisation : préférences conservées sur cet appareil.</p></div>'+
   '<div class="mg-sync-actions"><button type="button" data-my-games-enable-sync>Synchroniser avec mon compte</button>'+
   '<button type="button" data-my-games-disable-sync hidden>Utiliser cet appareil uniquement</button>'+
   '<button type="button" data-my-games-export>Exporter ma sélection</button></div></section>'+
  '<section class="mg-loyalty" aria-label="Ma progression SWAPP" id="recompenses">'+
   '<div class="mg-loyalty-title"><div><span class="mg-eyebrow">MON PARCOURS SWAPP</span><h2>Points découverte</h2>'+
   '<p>10 points par nouveau jeu distinct suivi sur ton compte SWAPP, après activation de la synchronisation (10 jeux maximum). Aucun achat requis, aucun bonus quotidien.</p></div>'+
   '<div class="mg-loyalty-score"><strong data-swapp-rewards-points>—</strong><small>/ 100 points</small></div></div>'+
   '<div class="mg-level"><span data-swapp-rewards-level>Compte SWAPP requis</span><span data-swapp-rewards-next></span></div>'+
   '<div class="mg-track" role="progressbar" aria-label="Progression découverte" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-swapp-rewards-track><span data-swapp-rewards-fill></span></div>'+
   '<p class="mg-loyalty-note">Reconnaissance symbolique, sans valeur monétaire ni remise promise. Pas de points pour l’achat d’un jeu.</p></section>'+
  '<section class="mg-wishlist" aria-label="Ma liste de souhaits" id="liste-de-souhaits">'+
   '<div class="mg-section-head"><div><span class="mg-eyebrow">BOUTIQUE / À SURVEILLER</span><h2>Ma liste de souhaits <small data-swapp-wishlist-count></small></h2></div>'+
   '<button type="button" data-swapp-wishlist-clear class="mg-clear">Effacer mes envies</button></div>'+
   '<p class="mg-info">Retrouve les jeux que tu souhaites acheter. Aucun prix ni disponibilité n’est affiché sans offre vérifiée. Tu gardes toujours le contrôle.</p>'+
   '<p class="mg-wishlist-status" data-swapp-loyalty-status role="status" aria-live="polite"></p>'+
   '<div data-swapp-wishlist-results class="mg-wishlist-results"><p>Connecte-toi avec ton compte SWAPP pour retrouver tes envies.</p></div></section>'+
  '<p data-my-games-status role="status" aria-live="polite"></p>'+
  '<section aria-label="Jeux suivis"><div class="mg-section-head"><h2>Jeux suivis <small>(<span data-my-games-count>0</span>)</small></h2><button class="mg-clear" type="button" data-my-games-clear>Effacer ma sélection</button></div>'+
  '<div data-my-games-empty class="mg-empty"><strong>Ton espace commence avec tes jeux.</strong><p>Choisis un titre ci-dessous et appuie sur « Suivre ce jeu ». Les nouvelles publications apparaîtront ici à ta prochaine visite.</p></div>'+
  '<div class="mg-grid" data-my-games-followed></div></section>'+
  '<section aria-label="Découvrir les jeux"><div class="mg-section-head"><h2>Découvrir d’autres jeux</h2><input type="search" class="mg-input" data-my-games-search placeholder="Rechercher un jeu…" aria-label="Rechercher un jeu" autocomplete="off"></div>'+
  '<div class="mg-grid" data-my-games-available>'+cards+'</div><p data-my-games-no-match hidden>Aucun jeu correspondant dans les dossiers publiés.</p>'+
  (safe.length?'':'<p class="mg-info">Aucun dossier de jeu publié pour le moment. <a href="/actus">Lire les actualités →</a></p>')+
  '</section></main>';
 const meta='<meta name="robots" content="noindex,follow">';
 return layout({title:'Mes jeux',description:'Ta sélection personnelle de jeux, actualités et créateurs sur SWAPP.',content:body,metadata:meta,active:'games'});
}

module.exports={canonicalGame,gameSlug,gameHubUrl,gameHubs,renderGameIndex,renderGamePage,renderMyGames};
