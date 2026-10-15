'use strict';
// Native SWAPP community, trailer and shop pages. Identical navigation, no fake products.
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml:e}=require('./swapp-news/article-core');
const catalog=require('../data/justplayer-public-catalog.json');
const assets='<link rel="stylesheet" href="/assets/swapp-hubs.css?v=20261015-hubs-1">';
function heading(kicker,title,subtitle){
 return '<header class="swapp-hub-head"><span class="swapp-hub-eyebrow">'+e(kicker)+'</span><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></header>';
}
function community(){
 const main='<main class="swapp-hub" id="swappCommunity">'+heading('SWAPP · Communauté','On ne joue jamais vraiment seul.','Discussions publiques issues du prototype SOCIAL, au cœur de SWAPP.')+
 '<div class="swapp-hub-toolbar"><span id="swappSocialStatus" class="swapp-hub-status" role="status">Chargement des discussions publiques…</span><button id="swappCommunityRefresh" class="swapp-hub-action" type="button">Actualiser</button></div>'+
 '<div class="swapp-community-layout"><section id="swappCommunityFeed" class="swapp-community-feed" aria-label="Publications"><p class="swapp-hub-empty">Chargement des publications…</p></section>'+
 '<aside class="swapp-community-side"><h2>Rejoindre la conversation</h2><p>Le prototype SOCIAL dispose de sa propre identité. SWAPP ne mélange pas les comptes ni les messages privés.</p><button class="swapp-hub-action" id="swappCommunityJoin" type="button">Connexion SOCIAL</button><p class="swapp-hub-small">Publications authentiques. Aucun faux compte, aucun faux message.</p></aside></div>'+
 '<section class="swapp-community-auth" id="swappSocialAuth" hidden aria-label="Connexion à SOCIAL"><div class="swapp-community-auth-box"><button type="button" class="swapp-community-auth-close" aria-label="Fermer">×</button><h2>Compte SOCIAL</h2><p>Connecte-toi avec ton compte SOCIAL. Les identités SWAPP ne sont pas automatiquement associées.</p>'+
 '<form id="swappSocialAuthForm"><label>Identifiant SOCIAL<input name="handle" autocomplete="username" required minlength="3" maxlength="24"></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><button class="swapp-hub-action" type="submit">Se connecter</button><p id="swappSocialAuthError" class="swapp-hub-error" role="alert"></p></form>'+
 '<p class="swapp-hub-small">La connexion est transmise au serveur SOCIAL officiel via SWAPP. Aucun mot de passe n’est enregistré dans SWAPP ; la session ne survit pas au rechargement.</p></div></section></main>';
 return layout({title:'Communauté',description:'Discussions de joueurs et de créateurs reliées au prototype SOCIAL.',content:main,active:'community',scripts:assets+'<script defer src="/assets/swapp-community-page.js?v=20261015-hubs-1"></script>'});
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
function trailers(){
 const cards=verifiedTrailers().map(item=>
  '<article class="swapp-hub-tile"><div class="swapp-hub-tile-art" aria-hidden="true"><span>▶</span><small>VIDÉO · JUSTPLAYER</small></div><div class="swapp-hub-tile-copy"><h2>'+e(item.title)+'</h2>'+
  '<p>Archive vidéo JustPlayer'+(item.date?' · '+e(item.date):'')+'</p><a href="'+e(item.url)+'" class="swapp-hub-link" target="_blank" rel="noopener noreferrer">Voir la vidéo originale ↗</a></div></article>'
 ).join('');
 const main='<main class="swapp-hub">'+heading('SWAPP · Vidéos','Les jeux prennent vie.','Bandes-annonces et vidéos sélectionnées, sans lecture automatique.')+
 '<p class="swapp-hub-small swapp-hub-caption">Les archives déjà disponibles sur JustPlayer sont conservées. Une bande-annonce n’est intégrée au lecteur SWAPP que si une URL vidéo vérifiée a été fournie.</p>'+
 '<section class="swapp-hub-grid" aria-label="Bandes-annonces">'+(cards||'<p class="swapp-hub-empty">Aucune bande-annonce authentifiée pour le moment.</p>')+'</section></main>';
 return layout({title:'Bandes-annonces',description:'Bandes-annonces et vidéos de jeux sur SWAPP.',content:main,active:'trailers',scripts:assets});
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
 const cards=safeProducts(products).map(p=>
 '<article class="swapp-hub-tile">'+(p.image?'<img class="swapp-shop-picture" src="'+e(p.image)+'" alt="" loading="lazy">':'<div class="swapp-hub-tile-art"><span aria-hidden="true">✦</span><small>'+e(p.category)+'</small></div>')+
 '<div class="swapp-hub-tile-copy"><span class="swapp-shop-label">'+e(p.merchant)+'</span><h2>'+e(p.title)+'</h2><p>'+e(p.description)+'</p>'+
 (p.affiliate?'<p class="swapp-hub-disclosure">Lien affilié : SWAPP peut percevoir une commission.</p>':'')+
 '<a class="swapp-hub-link" href="'+e(p.url)+'" target="_blank" rel="'+(p.affiliate?'sponsored nofollow noopener noreferrer':'noopener noreferrer')+'">Découvrir chez '+e(p.merchant)+' ↗</a></div></article>'
 ).join('');
 const main='<main class="swapp-hub">'+heading('SWAPP · Boutique','Une sélection. Pas un supermarché.','Jeux, accessoires et créations pour streamers. Des recommandations choisies, pas des publicités envahissantes.')+
 '<div class="swapp-hub-shop-note"><strong>Le choix de la transparence</strong><p>Les offres n’apparaissent qu’après validation du vendeur et du lien. Aucun faux prix ni fausse promotion. Les achats se font chez le marchand indiqué.</p></div>'+
 '<section class="swapp-hub-grid" aria-label="Produits de la boutique">'+(cards||'<p class="swapp-hub-empty">La sélection commerciale est en préparation. Aucun produit n’est inventé pour remplir cette page.</p>')+'</section>'+
 '<p class="swapp-hub-small">Les éventuels liens rémunérés seront clairement signalés avant le clic, sans suivi comportemental SWAPP.</p></main>';
 return layout({title:'Boutique',description:'Boutique et sélection gaming avec transparence des liens sur SWAPP.',content:main,active:'shop',scripts:assets});
}
module.exports={community,trailers,shop,verifiedTrailers,safeProducts};
