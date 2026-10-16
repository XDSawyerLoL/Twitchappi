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

function shopPrice(p){
 if(p.demo||!p.priceEur)return '';
 const amount=Number(p.priceEur);
 if(!Number.isFinite(amount)||amount<=0)return '';
 return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(amount);
}
function shopCard(p,index=0){
 const price=shopPrice(p);
 const target='/boutique/produit/'+encodeURIComponent(p.id);
 const label=p.demo?'À découvrir prochainement':price?'Prix indicatif':'Voir chez le marchand';
 const image='<img class="swapp-store-product-img" src="'+e(p.image)+'" alt="'+e(p.title)+'" loading="'+(index<3?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer">';
 const badge=p.demo?'<span class="swapp-store-tag">Aperçu</span>':'';
 return '<article class="swapp-store-card" data-shop-product data-shop-kind="'+e(p.kind)+'" data-shop-title="'+e(p.title.toLocaleLowerCase('fr'))+'">'+
  '<a class="swapp-store-card-media" href="'+target+'" aria-label="Voir la fiche : '+e(p.title)+'">'+image+badge+'</a>'+
  '<div class="swapp-store-card-body"><span class="swapp-store-card-kind">'+
    e(CATEGORIES.find(c=>c.id===p.kind)?.name||'SWAPP')+'</span>'+
    '<h3><a href="'+target+'">'+e(p.title)+'</a></h3>'+
    '<p class="swapp-store-card-description">'+e(p.description||'Découvrir cette référence')+'</p>'+
    '<div class="swapp-store-card-bottom"><div class="swapp-store-price">'+
     (price?'<strong>'+e(price)+'</strong><small>Prix à confirmer chez le vendeur</small>':
      '<strong>'+label+'</strong><small>'+(p.demo?'Présentation non commerciale':'Consulter l’offre externe')+'</small>')+
     '</div><a class="swapp-store-card-cta" href="'+target+'" aria-label="Détails de '+e(p.title)+'">Voir la fiche <span aria-hidden="true">↗</span></a></div></div></article>';
}
function shop(products=demoProducts,{source='demo'}={}){
 const cleaned=normalizeAll(products).filter(p=>p.visible&&p.image);
 const hero=cleaned.find(p=>p.kind==='games')||cleaned[0]||null;
 const count=cleaned.length;
 const tiles=CATEGORIES.map(c=>{
  const selection=cleaned.filter(p=>p.kind===c.id);
  const first=selection[0];
  return '<a class="swapp-store-department" href="#catalogue" data-shop-category-target="'+c.id+'">'+
   (first?'<img src="'+e(first.image)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'<span class="swapp-store-department-empty" aria-hidden="true"></span>')+
   '<span class="swapp-store-department-content"><small>RAYON '+e(c.code)+'</small><strong>'+e(c.name)+'</strong>'+
   '<span>'+selection.length+' référence'+(selection.length>1?'s':'')+' <span aria-hidden="true">→</span></span></span></a>';
 }).join('');
 const options=[{id:'all',name:'Tous les produits'},...CATEGORIES.map(c=>({id:c.id,name:c.name}))];
 const filters=options.map((o,i)=>'<button class="swapp-store-filter'+(i===0?' is-active':'')+'" data-shop-filter="'+o.id+'" type="button" aria-pressed="'+(i===0?'true':'false')+'">'+e(o.name)+'</button>').join('');
 const note=cleaned.some(p=>p.demo)||source==='demo'||source==='fallback'?
 '<div class="swapp-store-notice" role="note"><strong>La Boutique prend forme.</strong> Certains produits sont des aperçus non commercialisés. Images des jeux : visuels promotionnels ; accessoires : photos d’inspiration non contractuelles.</div>':'';
 const disclosure=cleaned.some(p=>!p.demo&&p.affiliate&&isAmazonLink(p.url))?
 '<p class="swapp-store-disclosure">'+e(amazonDisclosure)+'</p>':'';
 const cards=cleaned.map(shopCard).join('');
 const content='<main class="swapp-hub swapp-store" id="swapp-store">'+
  '<div class="swapp-store-topline"><span>SWAPP <span aria-hidden="true">/</span> BOUTIQUE</span>'+
   '<span>JEUX VIDÉO · STREETWEAR · SETUP</span></div>'+
  '<header class="swapp-store-head"><div><span class="swapp-store-eyebrow">LA BOUTIQUE SWAPP</span>'+
   '<h1>Du gaming à ton quotidien.</h1><p>Des jeux à découvrir. Des accessoires pour affirmer ton style. Une sélection réunie au même endroit.</p></div>'+
   '<a href="#catalogue" class="swapp-store-jump">Explorer le catalogue <span aria-hidden="true">↓</span></a></header>'+
  (hero?'<a class="swapp-store-campaign" href="/boutique/produit/'+encodeURIComponent(hero.id)+'">'+
   '<img src="'+e(hero.image2||hero.image)+'" alt="" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">'+
   '<span class="swapp-store-campaign-shade"></span><span class="swapp-store-campaign-copy">'+
    '<span>SÉLECTION EN VEDETTE</span><strong>'+e(hero.title)+'</strong>'+
    '<span class="swapp-store-campaign-link">Voir la fiche <span aria-hidden="true">↗</span></span></span></a>':'')+
  note+
  '<section class="swapp-store-departments" aria-labelledby="store-departments-title">'+
   '<div class="swapp-store-section-title"><div><small>NOS UNIVERS</small><h2 id="store-departments-title">Choisis ton rayon.</h2></div></div>'+
   '<div class="swapp-store-departments-grid">'+tiles+'</div></section>'+
  '<section class="swapp-store-catalogue" id="catalogue" aria-labelledby="store-products-title">'+
   '<div class="swapp-store-section-title"><div><small>LE CATALOGUE</small><h2 id="store-products-title">Tous les produits.</h2></div>'+
    '<span class="swapp-store-count" id="shop-result-count" aria-live="polite">'+count+' résultat'+(count>1?'s':'')+'</span></div>'+
   '<div class="swapp-store-toolbar"><div class="swapp-store-filters" role="group" aria-label="Filtrer les produits">'+filters+'</div>'+
   '<div class="swapp-store-tools"><label class="swapp-store-search"><span class="swapp-store-sr">Rechercher un produit</span>'+
    '<input type="search" id="swapp-store-search" placeholder="Rechercher un produit" autocomplete="off"></label>'+
   '<label class="swapp-store-sort"><span class="swapp-store-sr">Trier</span><select id="swapp-store-sort">'+
     '<option value="featured">Sélection SWAPP</option><option value="az">Nom A à Z</option>'+
     '<option value="za">Nom Z à A</option></select></label></div></div>'+
   '<div class="swapp-store-products" id="swapp-store-products">'+cards+'</div>'+
   '<div class="swapp-store-no-results" id="swapp-store-no-results" hidden><strong>Aucun produit trouvé.</strong>'+
   '<p>Essaie une autre recherche ou affiche tous les rayons.</p><button type="button" id="swapp-store-reset">Réinitialiser les filtres</button></div>'+
  '</section>'+
  '<footer class="swapp-store-footer"><div><strong>Une sélection transparente.</strong>'+
   '<p>SWAPP présente les produits, mais n’encaisse aucun paiement. Les achats éventuels s’effectuent chez le marchand externe. Les exemples ne sont pas achetables, et les prix renseignés sont à confirmer auprès du vendeur.</p>'+disclosure+
   '</div><a href="/actus">Explorer l’actualité <span aria-hidden="true">↗</span></a></footer>'+
  '</main>';
 return layout({title:'Boutique',description:'La boutique SWAPP : jeux vidéo, casquettes, accessoires et tapis de souris.',content,active:'shop',
  scripts:assets+'<link rel="stylesheet" href="/assets/swapp-shop.css?v=20261016-store-v5">'+
   '<script defer src="/assets/swapp-storefront.js?v=20261016-store-v5"></script>'});
}
function shopProduct(product,products=demoProducts){
 const all=normalizeAll(products).filter(p=>p.visible&&p.image);
 const p=all.find(x=>x.id===product?.id);
 if(!p)return null;
 const category=CATEGORIES.find(c=>c.id===p.kind);
 const price=shopPrice(p);
 const buy=p.demo?'<div class="swapp-store-detail-soon">Référence présentée en aperçu · Pas encore commercialisée</div>':
 '<a class="swapp-store-detail-buy" href="'+e(p.url)+'" target="_blank" rel="'+(p.affiliate?'sponsored nofollow noopener noreferrer':'noopener noreferrer')+'">Voir l’offre chez '+e(p.merchant)+' <span aria-hidden="true">↗</span></a>';
 const images=[p.image,p.image2].filter(Boolean);
 const secondary=images.length>1?'<div class="swapp-store-detail-thumbs">'+images.map((url,i)=>
 '<button type="button" data-shop-image="'+e(url)+'" aria-label="Afficher la photo '+(i+1)+'" aria-pressed="'+(i===0?'true':'false')+'">'+
 '<img src="'+e(url)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></button>').join('')+'</div>':'';
 const related=all.filter(x=>x.kind===p.kind&&x.id!==p.id).slice(0,3);
 const disclosure=p.affiliate?'<p class="swapp-store-detail-note">'+(isAmazonLink(p.url)?'Lien rémunéré par Amazon · '+e(amazonDisclosure):'Lien affilié : SWAPP peut recevoir une commission.')+'</p>':'';
 const content='<main class="swapp-hub swapp-store swapp-store-detail">'+
  '<nav class="swapp-store-crumb" aria-label="Fil d’Ariane"><a href="/boutique">Boutique</a><span aria-hidden="true">›</span>'+
   '<a href="/boutique#catalogue">'+e(category?.name||'Catalogue')+'</a><span aria-hidden="true">›</span><span>'+e(p.title)+'</span></nav>'+
  '<div class="swapp-store-detail-grid"><div class="swapp-store-detail-gallery">'+
    '<div class="swapp-store-detail-image"><img id="swapp-store-main-image" src="'+e(p.image)+'" alt="'+e(p.title)+'" decoding="async" referrerpolicy="no-referrer"></div>'+secondary+
   '</div><div class="swapp-store-detail-info">'+
    '<span class="swapp-store-eyebrow">'+e(category?.name||'SWAPP')+'</span><h1>'+e(p.title)+'</h1>'+
    '<p class="swapp-store-detail-description">'+e(p.description||'Sélection SWAPP.')+'</p>'+
    (p.badge?'<span class="swapp-store-detail-tag">'+e(p.badge)+'</span>':'')+
    '<div class="swapp-store-detail-purchase">'+
     (price?'<strong class="swapp-store-detail-price">'+e(price)+'</strong><p>Prix indicatif renseigné dans SWAPP. Vérifie le prix définitif chez le marchand.</p>':
      '<strong class="swapp-store-detail-price">'+(p.demo?'En préparation':'Prix chez le marchand')+'</strong>')+
     buy+disclosure+'</div>'+
    '<div class="swapp-store-detail-assurance"><strong>Information importante</strong><p>'+
     (p.demo?'Photographie de présentation non contractuelle. Aucun achat ni stock n’est annoncé.':
      'SWAPP ne traite pas le paiement, la livraison ni les retours : consulte les conditions du marchand.')+'</p></div></div></div>'+
    (related.length?'<section class="swapp-store-related"><div class="swapp-store-section-title"><div><small>À DÉCOUVRIR AUSSI</small><h2>Dans le même rayon.</h2></div></div>'+
     '<div class="swapp-store-products">'+related.map(shopCard).join('')+'</div></section>':'')+
  '</main>';
 return layout({title:p.title+' · Boutique',description:p.description||'Produit présenté sur SWAPP',content,active:'shop',
  metadata:p.demo?'<meta name="robots" content="noindex,follow">':'',
  scripts:assets+'<link rel="stylesheet" href="/assets/swapp-shop.css?v=20261016-store-v5">'+
   '<script defer src="/assets/swapp-storefront.js?v=20261016-store-v5"></script>'});
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
  '<div class="swapp-shop-amazon-prep"><label for="shop-admin-amazon-url">Lien Amazon Partenaires à préparer</label>'+
  '<div class="swapp-shop-amazon-row"><input id="shop-admin-amazon-url" type="url" maxlength="900" inputmode="url" value="https://link.amazon/B01fj5Alw" aria-describedby="shop-admin-amazon-help">'+
  '<button type="button" id="shop-admin-amazon-start">Préparer un brouillon</button></div>'+
  '<p id="shop-admin-amazon-help">Le lien a été fourni par l’administrateur, mais le produit n’a pas été identifié automatiquement. Complète son nom, sa catégorie et son image autorisée avant de le rendre visible. Aucun prix n’est inventé.</p></div>'+
  '<form id="shop-admin-editor"><div class="swapp-shop-admin-fields">'+
  '<label>Identifiant unique<input name="id" type="text" maxlength="50" pattern="[a-z0-9][a-z0-9-]{1,49}" required placeholder="casquette-violette"></label>'+
  '<label>Catégorie<select name="kind"><option value="games">Jeux vidéo</option><option value="caps">Casquettes</option><option value="pads">Tapis de souris</option></select></label>'+
  '<label class="wide">Nom du produit<input name="title" maxlength="110" required placeholder="Nom du produit"></label>'+
  '<label class="wide">Description<textarea name="description" maxlength="260" rows="3" placeholder="Quelques mots pour donner envie…"></textarea></label>'+
  '<label>Badge / mise en avant<input name="badge" maxlength="48" placeholder="Nouveauté, collection…"></label>'+
  '<label>Marchand<input name="merchant" maxlength="65" placeholder="Vendeur réel"></label>'+
  '<label>Prix indicatif € · facultatif pour les vrais produits<input name="priceEur" type="number" min="0.01" max="99999" step="0.01" inputmode="decimal" placeholder="Ex. 49.90"></label>'+
  '<label class="wide">Photo principale HTTPS · obligatoire pour être visible<input name="image" type="url" placeholder="https://…" aria-describedby="shop-image-help"></label>'+
  '<label class="wide">Deuxième photo HTTPS · facultative<input name="image2" type="url" placeholder="Vue en situation, détail…"></label>'+
  '<p class="swapp-shop-image-help" id="shop-image-help">Utilise des images réelles dont tu as le droit de diffusion. Vérifie leur aperçu avant de publier. Les références sans image restent masquées.</p>'+
  '<label class="wide">Lien marchand HTTPS<input name="url" type="url" placeholder="https://…"></label>'+
  '</div><div id="shop-admin-preview" class="swapp-shop-editor-preview" role="status" aria-live="polite"></div>'+
  '<div class="swapp-shop-admin-options"><label><input name="demo" type="checkbox" checked> Démonstration · pas de vente</label>'+
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
  scripts:'<link rel="stylesheet" href="/assets/swapp-shop.css?v=20261016-photographic-shop-v4">'+
   '<link rel="stylesheet" href="/assets/swapp-shop-admin.css?v=20261016-photographic-shop-v4">'+
   '<script defer src="/assets/swapp-shop-admin.js?v=20261016-photographic-shop-v4"></script>'});
}
module.exports={community,trailers,shop,shopProduct,shopAdmin,verifiedTrailers,curatedVideos,videoCard,safeProducts};
