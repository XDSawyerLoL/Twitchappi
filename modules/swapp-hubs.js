'use strict';
// Native SWAPP community, trailer and shop pages. Identical navigation, no fake products.
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml:e}=require('./swapp-news/article-core');
const catalog=require('../data/justplayer-public-catalog.json');
const fs=require('node:fs');
const path=require('node:path');
const {CATEGORIES,demoProducts,normalizeAll}=require('./swapp-shop-catalog');
const {isAmazonLink,amazonDisclosure}=require('../assets/swapp-article-extras');
const assets='<link rel="stylesheet" href="/assets/swapp-hubs.css?v=20261015-hubs-3">';
function heading(kicker,title,subtitle){
 return '<header class="swapp-hub-head"><span class="swapp-hub-eyebrow">'+e(kicker)+'</span><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></header>';
}
function community(){
 // The actual SOCIAL user interface is vendored from Quantic Sillage.
 // SWAPP renders it directly inside the canonical site shell, not as an iframe.
 const content=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/social-body.html'),'utf8');
 const scripts=assets+
  '<link rel="stylesheet" href="/assets/swapp-social-native/social-swapp.css?v=20261016-social-fixed-10">'+
  '<script type="module" src="/assets/swapp-social-native/app.js?v=20261016-social-fixed-js-10"></script>';
 return layout({title:'Communauté',description:'Le réseau SOCIAL complet intégré dans SWAPP : profils, publications, communautés et messagerie.',content,active:'community',scripts});
}
function verifiedTrailers(items=catalog.items){
 const out=[],seen=new Set();
 for(const item of Array.isArray(items)?items:[]){
  if(item?.type!=='video_embed')continue;
  let u;try{u=new URL(String(item.url||''))}catch{continue}
  if(u.protocol!=='https:'||!['justplayer.fr','www.justplayer.fr'].includes(u.hostname)||!/^\/supporters\/video_embeds\/[a-z0-9-]+\/?$/.test(u.pathname)||seen.has(u.href))continue;
  seen.add(u.href);
  out.push({title:String(item.title||'Bande-annonce').slice(0,180),url:u.href,date:String(item.publishedAt||''),game:String(item.game||'')});
 }
 return out;
}
function curatedVideos(){
 const raw=require('../data/swapp-video-series.json');
 return raw.items.filter(item=>{
  if(typeof item.title!=='string'||!item.title.trim())return false;
  if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(item.id))return false;
  try{
   const url=new URL(item.source),picture=new URL(item.image);
   return url.protocol==='https:'&&url.hostname==='justplayer.fr'&&
    url.pathname==='/supporters/video_embeds/'+item.id&&picture.protocol==='https:'&&
    picture.hostname==='storage.googleapis.com'&&!url.username&&!url.password;
  }catch{return false}
 });
}
function videoCard(item,{featured=false}={}){
 const youtube=typeof item.youtubeId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(item.youtubeId)?item.youtubeId:'';
 const playable=!!youtube;
 const meta=item.native?(item.series?'Trailer · SWAPP':'Vidéo · SWAPP'):(playable?'Bande-annonce officielle · Lecture SWAPP':'Vidéo archivée · lecteur indisponible');
 const original=e(item.source),name=e(item.title),thumbnail=e(item.image);
 const visual='<img src="'+thumbnail+'" alt="" loading="'+(featured?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer">'+
  '<span class="swapp-video-shade"><span class="swapp-video-play-icon" aria-hidden="true">'+(playable?'▶':'↗')+'</span>'+
  '<span class="swapp-video-action">'+(playable?'Lire dans SWAPP':'Consulter la source')+'</span></span>';
 const launch=playable
  ?'<button type="button" class="swapp-video-open" data-swapp-video-play="1" data-video-source="'+original+'" data-video-youtube="'+e(youtube)+'" data-video-title="'+name+'" aria-label="Lire la bande-annonce officielle de '+name+'">'+visual+'</button>'
  :'<a class="swapp-video-open swapp-video-external" href="'+original+'" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la source historique : '+name+'">'+visual+'</a>';
 return '<article class="swapp-video-item'+(featured?' swapp-video-featured':'')+'">'+launch+
  '<div class="swapp-video-caption"><small>'+e(meta)+'</small><h3>'+name+'</h3>'+
  (item.playbackNote?'<p class="swapp-video-unavailable">'+e(item.playbackNote)+'</p>':'')+
  '<a href="'+original+'"'+(item.native?'':' target="_blank" rel="noopener noreferrer"')+'>'+(item.native?'Voir la publication SWAPP →':'Publication originale ↗')+'</a></div></article>';
}
function trailers(published=[]){
 // Editorially approved Firestore videos precede the historical JustPlayer set.
 const studio=(Array.isArray(published)?published:[]).filter(a=>
  a&&a.status==='published'&&['video','trailer'].includes(a.contentType)&&
  /^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||''))&&
  /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(String(a.trailerUrl||''))
 ).slice(0,36).map(a=>{
  const videoId=require('../assets/swapp-article-extras').trailerId(a.trailerUrl);
  return {id:a.slug,title:a.title,date:a.publishedAt,image:a.image?.url||('https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg'),
   source:'/actus/'+encodeURIComponent(a.slug),youtubeId:videoId,
   series:a.contentType==='trailer',native:true};
 }).filter(a=>a.youtubeId);
 const data=[...studio,...curatedVideos()];
 const inSeries=data.filter(v=>v.series),recent=data.filter(v=>!v.series);
 const featured=studio[0]||recent[0]||inSeries[0];
 const main='<main class="swapp-hub swapp-hub-videos">'+heading('SWAPP · Vidéos','Place aux bandes-annonces.','Les vidéos et bandes-annonces disponibles dans SWAPP lorsque leur intégration est autorisée.')+
 (featured?'<div class="swapp-featured-video">'+videoCard(featured,{featured:true})+'</div>':'')+
 '<div class="swapp-video-section-title"><h2>LES TRAILERS</h2><span>'+inSeries.length+' vidéos de la collection</span></div>'+
 '<section class="swapp-video-grid" aria-label="Série LES TRAILERS">'+
 (inSeries.map(x=>videoCard(x)).join('')||'<p>Aucune bande-annonce vérifiée.</p>')+'</section>'+
 (recent.length>1?'<div class="swapp-video-section-title"><h2>Dernières vidéos</h2></div><section class="swapp-video-grid" aria-label="Dernières vidéos">'+recent.filter(x=>x!==featured).map(x=>videoCard(x)).join('')+'</section>':'')+
 '<p class="swapp-hub-small">Les lecteurs SWAPP utilisent exclusivement des vidéos officielles intégrables. Les archives dont le lecteur ne peut pas être intégré restent consultables à leur adresse originale.</p></main>';
 return layout({title:'Vidéos',description:'Les vidéos et bandes-annonces du magazine SWAPP.',content:main,active:'trailers',
  scripts:assets+'<link rel="stylesheet" href="/assets/swapp-video-gallery.css?v=20261016-ios-journey-1">'+
   '<script defer src="/assets/swapp-video-player.js?v=20261016-ios-journey-1"></script>'});
}
function safeProducts(items){
 const out=[];
 for(const p of Array.isArray(items)?items.slice(0,40):[]){
  let u;try{u=new URL(String(p?.url||''))}catch{continue}
  if(u.protocol!=='https:'||u.username||u.password)continue;
  const title=String(p.title||'').trim().slice(0,120);
  if(!title)continue;
  let image=null;
  try{const i=new URL(String(p.image||''));if(i.protocol==='https:'&&!i.username&&!i.password)image=i.href}catch{}
  out.push({title,url:u.href,image,description:String(p.description||'').slice(0,250),merchant:String(p.merchant||'Partenaire').slice(0,60),affiliate:p.affiliate===true,category:String(p.category||'Sélection').slice(0,40)});
 }
 return out;
}
function shopArt(p){
 if(p.image)return '<img class="swapp-shop-product-image" src="'+e(p.image)+'" alt="" loading="lazy" decoding="async">';
 const shape=p.kind==='caps'
  ?'<span class="swapp-shop-cap-crown"></span><span class="swapp-shop-cap-brim"></span>'
  :p.kind==='pads'
   ?'<span class="swapp-shop-pad-surface"></span><span class="swapp-shop-pad-edge"></span>'
   :'<span class="swapp-shop-game-orbit"></span><span class="swapp-shop-game-core"></span>';
 return '<div class="swapp-shop-art swapp-shop-art--'+e(p.kind)+'" aria-hidden="true">'+
  '<span class="swapp-shop-art-light"></span>'+shape+'<span class="swapp-shop-art-number">'+
  e(p.kind==='games'?'PLAY':'SWAPP')+'</span></div>';
}
function shopCard(p,i){
 const amazonPartner=!p.demo&&p.affiliate&&isAmazonLink(p.url);
 const action=p.demo?'<span class="swapp-shop-coming">Produit de démonstration · Non commercialisé</span>':
 '<a class="swapp-shop-buy" href="'+e(p.url)+'" target="_blank" rel="'+(p.affiliate?'sponsored nofollow noopener noreferrer':'noopener noreferrer')+'">Découvrir chez '+e(p.merchant)+' <span aria-hidden="true">↗</span></a>';
 return '<article class="swapp-shop-card'+(i===0?' swapp-shop-card-featured':'')+'">'+
 '<div class="swapp-shop-visual">'+shopArt(p)+(p.demo?'<span class="swapp-shop-demo-chip">Exemple</span>':'')+'</div>'+
 '<div class="swapp-shop-card-copy">'+
 '<span class="swapp-shop-kicker">'+e(p.badge||((p.kind==='games')?'Jeu vidéo':'Accessoire'))+'</span>'+
 '<h3>'+e(p.title)+'</h3><p>'+e(p.description||'Une sélection SWAPP à découvrir.')+'</p>'+
 (p.affiliate?'<small class="swapp-shop-disclosure">'+(amazonPartner?'Lien rémunéré par Amazon':'Lien affilié · commission possible')+'</small>':'')+
 '<div class="swapp-shop-card-foot">'+action+'</div></div></article>';
}
function shop(products=demoProducts,{source='demo'}={}){
 const clean=normalizeAll(products).filter(x=>x.visible);
 const count=clean.length;
 const hasAmazonPartner=clean.some(p=>!p.demo&&p.affiliate&&isAmazonLink(p.url));
 const sections=CATEGORIES.map(cat=>{
  const selection=clean.filter(x=>x.kind===cat.id);
  return '<section class="swapp-shop-aisle" id="rayon-'+cat.id+'" aria-labelledby="shop-title-'+cat.id+'">'+
   '<header class="swapp-shop-aisle-head"><span class="swapp-shop-aisle-count">'+cat.code+'</span>'+
   '<div><span class="swapp-shop-aisle-label">'+e(cat.subtitle)+'</span><h2 id="shop-title-'+cat.id+'">'+e(cat.name)+'</h2></div>'+
   '<span class="swapp-shop-aisle-quantity">'+selection.length+' sélection'+(selection.length>1?'s':'')+'</span></header>'+
   '<div class="swapp-shop-products">'+(selection.map((p,i)=>shopCard(p,i)).join('')||
    '<p class="swapp-shop-aisle-empty">Ce rayon attend ses prochains produits.</p>')+'</div></section>';
 }).join('');
 const note=source==='demo'||source==='fallback'
 ?'<p class="swapp-shop-demo-banner" role="note">Vitrine de démonstration : les produits marqués « Exemple » sont fictifs ou illustratifs et ne sont pas proposés à la vente.</p>':'';
 const main='<main class="swapp-hub swapp-shop">'+
  '<div class="swapp-shop-hero"><div class="swapp-shop-hero-text"><span class="swapp-shop-overline">SWAPP / Le shop</span>'+
  '<h1>Le gaming se vit <em>aussi hors écran.</em></h1>'+
  '<p>Des jeux qui valent le détour, des casquettes qui ont du caractère et des tapis qui habillent ton setup. Une vitrine faite pour les passionnés.</p>'+
  '<div class="swapp-shop-hero-actions"><a class="swapp-shop-primary" href="#selection">Explorer la collection <span aria-hidden="true">↘</span></a>'+
  '<a class="swapp-shop-secondary" href="#shop-transparence">Comment fonctionne la boutique ?</a></div></div>'+
  '<div class="swapp-shop-hero-art" aria-hidden="true"><span class="swapp-shop-hero-ring"></span><span class="swapp-shop-hero-emblem">S<span>·</span></span>'+
  '<span class="swapp-shop-hero-tag">SWAPP EDITION</span></div></div>'+
  note+
  '<nav class="swapp-shop-categories" aria-label="Rayons de la boutique"><span>LES RAYONS</span>'+
   CATEGORIES.map(cat=>'<a href="#rayon-'+cat.id+'">'+e(cat.name)+' <span aria-hidden="true">↗</span></a>').join('')+
  '</nav>'+
  '<div class="swapp-shop-intro" id="selection"><div><span class="swapp-shop-overline">La sélection</span><h2>À toi de choisir ton univers.</h2></div>'+
  '<p>'+count+' référence'+(count>1?'s':'')+' à découvrir · Trois univers, un même esprit SWAPP.</p></div>'+
  '<div class="swapp-shop-aisles">'+sections+'</div>'+
  '<aside class="swapp-shop-trust" id="shop-transparence"><span class="swapp-shop-trust-icon" aria-hidden="true">✳</span>'+
  '<div><h2>Une vitrine transparente.</h2><p>Les exemples ne sont pas achetables. Quand un produit réel sera publié, le bouton dirigera vers son marchand identifié, sans paiement ni collecte bancaire sur SWAPP. Les liens affiliés seront signalés.</p>'+
  (hasAmazonPartner?'<p class="swapp-shop-amazon-disclosure">'+e(amazonDisclosure)+'</p>':'')+'</div>'+
  '<a href="/actus">Retour à l’actualité <span aria-hidden="true">→</span></a></aside>'+
  '</main>';
 return layout({title:'Boutique',description:'Boutique gaming SWAPP : jeux vidéo, casquettes et tapis de souris sélectionnés.',content:main,active:'shop',
  scripts:assets+'<link rel="stylesheet" href="/assets/swapp-shop.css?v=20261016-shop-v2-partners">'});
}
function shopAdmin(){
 const content='<main class="swapp-shop-admin"><aside class="swapp-shop-admin-menu"><a href="/boutique">← Voir la Boutique</a>'+
  '<span class="swapp-shop-admin-caption">SWAPP · ADMINISTRATION</span><h1>Gestion Boutique</h1>'+
  '<nav aria-label="Administration Boutique"><a class="active" href="#shop-admin-catalog">Produits & vitrines</a>'+
  '<a href="#shop-admin-form">Modifier un produit</a><a href="/actus/studio">Studio · Actualité & vidéos</a></nav>'+
  '<p>Les produits visibles sont publiés directement sur la vitrine après sauvegarde.</p></aside>'+
  '<section class="swapp-shop-admin-main"><header><span class="swapp-shop-overline">Éditeur sécurisé</span>'+
  '<h2>Composer la vitrine.</h2><p>Ajoute, modifie et ordonne les jeux, casquettes et tapis de souris. Aucun outil externe nécessaire.</p>'+
  '<div id="shop-admin-status" role="status" aria-live="polite">Chargement du catalogue…</div></header>'+
  '<section id="shop-admin-catalog" class="swapp-shop-admin-panel"><div class="swapp-shop-admin-bar"><h3>Catalogue</h3>'+
  '<button id="shop-admin-new" type="button">+ Nouveau produit</button></div>'+
  '<div id="shop-admin-list" class="swapp-shop-admin-list"></div></section>'+
  '<section id="shop-admin-form" class="swapp-shop-admin-panel"><h3>Fiche produit</h3>'+
  '<form id="shop-admin-editor"><div class="swapp-shop-admin-fields">'+
  '<label>Identifiant unique<input name="id" type="text" maxlength="50" pattern="[a-z0-9][a-z0-9-]{1,49}" required placeholder="casquette-violette"></label>'+
  '<label>Catégorie<select name="kind"><option value="games">Jeux vidéo</option><option value="caps">Casquettes</option><option value="pads">Tapis de souris</option></select></label>'+
  '<label class="wide">Nom du produit<input name="title" maxlength="110" required placeholder="Nom du produit"></label>'+
  '<label class="wide">Description<textarea name="description" maxlength="260" rows="3" placeholder="Quelques mots pour donner envie…"></textarea></label>'+
  '<label>Badge / mise en avant<input name="badge" maxlength="48" placeholder="Nouveauté, collection…"></label>'+
  '<label>Marchand<input name="merchant" maxlength="65" placeholder="Vendeur réel"></label>'+
  '<label class="wide">URL de l’image HTTPS<input name="image" type="url" placeholder="https://…"></label>'+
  '<label class="wide">Lien marchand HTTPS<input name="url" type="url" placeholder="https://…"></label>'+
  '</div><div class="swapp-shop-admin-options"><label><input name="demo" type="checkbox" checked> Démonstration · pas de vente</label>'+
  '<label><input name="visible" type="checkbox" checked> Visible sur la Boutique</label>'+
  '<label><input name="affiliate" type="checkbox"> Lien affilié · commission possible</label></div>'+
  '<p class="swapp-shop-admin-affiliate-note">Pour un lien Amazon Partenaires, coche « Lien affilié ». SWAPP affichera la mention Amazon obligatoire à côté du produit et dans la rubrique Transparence. Ne publie que des liens créés dans ton compte partenaire.</p>'+
  '<div class="swapp-shop-admin-actions"><button type="submit" id="shop-admin-apply">Appliquer à la liste</button>'+
  '<button type="button" id="shop-admin-remove">Supprimer ce produit</button></div></form></section>'+
  '<section class="swapp-shop-admin-panel swapp-shop-admin-publish"><h3>Publier les modifications</h3>'+
  '<p>Les fiches de démonstration ne comportent aucun paiement. Pour un produit réel visible, renseigne un marchand et son lien HTTPS.</p>'+
  '<button id="shop-admin-save" type="button">Enregistrer sur SWAPP</button>'+
  '<a href="/boutique" target="_blank" rel="noopener">Ouvrir la vitrine ↗</a></section></section></main>';
 return layout({title:'Gestion Boutique',description:'Gestion privée de la vitrine SWAPP',content,active:'shop',
  metadata:'<meta name="robots" content="noindex,nofollow">',
  scripts:'<link rel="stylesheet" href="/assets/swapp-shop.css?v=20261016-shop-v2-partners">'+
   '<link rel="stylesheet" href="/assets/swapp-shop-admin.css?v=20261016-shop-v2-partners">'+
   '<script defer src="/assets/swapp-shop-admin.js?v=20261016-shop-v2-partners"></script>'});
}
module.exports={community,trailers,shop,shopAdmin,verifiedTrailers,curatedVideos,videoCard,safeProducts};
