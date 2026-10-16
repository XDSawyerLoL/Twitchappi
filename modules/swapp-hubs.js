'use strict';
// Native SWAPP community, trailer and shop pages. Identical navigation, no fake products.
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml:e}=require('./swapp-news/article-core');
const catalog=require('../data/justplayer-public-catalog.json');
const fs=require('node:fs');
const path=require('node:path');
const assets='<link rel="stylesheet" href="/assets/swapp-hubs.css?v=20261015-hubs-3">';
function heading(kicker,title,subtitle){
 return '<header class="swapp-hub-head"><span class="swapp-hub-eyebrow">'+e(kicker)+'</span><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></header>';
}
function community(){
 // The actual SOCIAL user interface is vendored from Quantic Sillage.
 // SWAPP renders it directly inside the canonical site shell, not as an iframe.
 const content=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/social-body.html'),'utf8');
 const scripts=assets+
  '<link rel="stylesheet" href="/assets/swapp-social-native/social-swapp.css?v=20261015-full-social-3">'+
  '<script type="module" src="/assets/swapp-social-native/app.js?v=20261015-full-social-6"></script>';
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
  scripts:assets+'<link rel="stylesheet" href="/assets/swapp-video-gallery.css?v=20261015-gallery-4">'+
   '<script defer src="/assets/swapp-video-player.js?v=20261015-gallery-4"></script>'});
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
function shop(products=[]){
 // Boutique products are managed independently from editorial partner links.
 // An empty catalog means the selection is genuinely in preparation.
 const cards=safeProducts(products).map(p=>
 '<article class="swapp-hub-tile">'+(p.image?'<img class="swapp-shop-picture" src="'+e(p.image)+'" alt="" loading="lazy">':'<div class="swapp-hub-tile-art"><span aria-hidden="true">✦</span><small>'+e(p.category)+'</small></div>')+
 '<div class="swapp-hub-tile-copy"><span class="swapp-shop-label">'+e(p.merchant)+'</span><h2>'+e(p.title)+'</h2><p>'+e(p.description)+'</p>'+
 (p.affiliate?'<p class="swapp-hub-disclosure">Lien affilié : SWAPP peut percevoir une commission.</p>':'')+
 '<a class="swapp-hub-link" href="'+e(p.url)+'" target="_blank" rel="'+(p.affiliate?'sponsored nofollow noopener noreferrer':'noopener noreferrer')+'">Découvrir chez '+e(p.merchant)+' ↗</a></div></article>'
 ).join('');
 const main='<main class="swapp-hub">'+heading('SWAPP · Boutique','Une sélection. Pas un supermarché.','Jeux, accessoires et créations pour streamers. Des recommandations choisies, pas des publicités envahissantes.')+
 '<div class="swapp-hub-shop-note"><strong>Le choix de la transparence</strong><p>Les offres n’apparaissent qu’après validation du vendeur et du lien. Aucun faux prix ni fausse promotion. Les achats se font chez le marchand indiqué.</p></div>'+
 '<section class="swapp-hub-grid" aria-label="Produits de la boutique">'+(cards||'<p class="swapp-hub-empty">La sélection commerciale est en préparation. Aucun produit n’est inventé pour remplir cette page.</p>')+'</section>'+
 '<p class="swapp-hub-small">La Boutique est indépendante des liens affiliés des articles. Les produits seront présentés ici uniquement après sélection et vérification.</p></main>';
 return layout({title:'Boutique',description:'Boutique et sélection gaming avec transparence des liens sur SWAPP.',content:main,active:'shop',scripts:assets});
}
module.exports={community,trailers,shop,verifiedTrailers,curatedVideos,videoCard,safeProducts};
