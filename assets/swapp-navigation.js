'use strict';
/** Unified SWAPP site navigation; shared by the SPA and native pages. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappNavigation=api;
})(typeof window!=='undefined'?window:null,function(){
 const items=Object.freeze([
  Object.freeze({id:'home',label:'Accueil',href:'/'}),
  Object.freeze({id:'discover',label:'Découvrir',href:'/decouvrir'}),
  Object.freeze({id:'categories',label:'Catégories',href:'/categories'}),
  Object.freeze({id:'teams',label:'Équipes',href:'/equipes'}),
  Object.freeze({id:'actus',label:'Actualité',href:'/actus'}),
  Object.freeze({id:'guides',label:'Guides',href:'/guides/aion-2'}),
  Object.freeze({id:'community',label:'Social',href:'/social'}),
  Object.freeze({id:'tv',label:'SWAPP TV',href:'/tv'}),
  Object.freeze({id:'shop',label:'Boutique',href:'/boutique'})
 ]);
 const video=Object.freeze({id:'trailers',label:'Vidéos',href:'/bandes-annonces'});
 const account=Object.freeze({id:'settings',label:'Compte',href:'/compte'});
 const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const isNews=active=>active==='actus'||active==='trailers';
 const isTv=active=>active==='tv'||active==='agenda'||active==='programme';
 function link(item,active){
  const selected=(item.id==='actus'&&isNews(active))||(item.id==='tv'&&isTv(active))||active===item.id;
  const classes=[selected?'active':'',item.id==='tv'?'swapp-tv-nav-cta':''].filter(Boolean).join(' ');
  return '<a href="'+htmlEscape(item.href)+'" class="'+classes+'"'+(selected?' aria-current="page"':'')+'>'+
   (item.id==='tv'?'<span class="swapp-tv-nav-icon" aria-hidden="true">◉</span>':'')+htmlEscape(item.label)+'</a>';
 }
 function newsNav(active){
  return '<div class="swapp-news-nav">'+link(items.find(x=>x.id==='actus'),active)+
   '<details class="swapp-news-more"><summary aria-label="Ouvrir les rubriques Actualité" title="Rubriques Actualité">⌄</summary>'+
   '<div class="swapp-news-menu"><a href="/actus"'+(active==='actus'?' aria-current="page"':'')+'>Tous les articles</a>'+
   '<a href="/bandes-annonces"'+(active==='trailers'?' aria-current="page"':'')+'>Vidéos et bandes-annonces</a></div></details></div>';
 }
 function desktopNavigation(active='actus'){
  return '<div class="navGroup">'+items.map(x=>x.id==='actus'?newsNav(active):link(x,active)).join('')+'</div>';
 }
 function mobileNavigation(active='actus'){
  const pinned=items.filter(x=>['home','discover','actus','tv'].includes(x.id));
  const other=items.filter(x=>!pinned.includes(x));
  return pinned.map(x=>link(x,active)).join('')+
   '<details class="swapp-mobile-more"><summary'+(other.some(x=>x.id===active)||active===video.id||active===account.id?' class="active"':'')+'>Plus</summary>'+
   '<div class="swapp-mobile-more-links">'+
   '<span class="swapp-mobile-menu-title">ACTUALITÉ</span>'+
   '<a href="/bandes-annonces"'+(active==='trailers'?' class="active" aria-current="page"':'')+'>Vidéos et bandes-annonces</a>'+
   '<span class="swapp-mobile-menu-title">SWAPP</span>'+
   other.map(x=>link(x,active)).join('')+link(account,active)+'</div></details>';
 }
 function serverHeader(active='actus'){
  return '<header class="top"><div class="topbar">'+
   '<a class="brand" href="/" aria-label="SWAPP — Accueil"><span class="swapp-wordmark-text">SWAPP<span class="swapp-wordmark-dot" aria-hidden="true">.</span></span></a>'+
   '<nav id="nav" class="mainNav" aria-label="Navigation principale">'+desktopNavigation(active)+'</nav>'+
   '<div class="userArea"><button type="button" id="userBtn" class="userBtn" aria-haspopup="true" aria-expanded="false">'+
   '<img id="userAvatar" class="avatarMini" alt=""><span id="userLabel">Compte</span></button>'+
   '<div id="userMenu" class="menu"><a href="/compte">Mon espace SWAPP</a></div></div></div></header>';
 }
 function serverMobile(active='actus'){
  return '<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile">'+mobileNavigation(active)+'</nav>';
 }
 return Object.freeze({items,video,account,link,desktopNavigation,mobileNavigation,serverHeader,serverMobile});
});
