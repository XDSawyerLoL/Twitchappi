'use strict';
/** Unified SWAPP site navigation; shared by the SPA and native pages. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappNavigation=api;
})(typeof window!=='undefined'?window:null,function(){
 // Deliberately flat: no nested Discover or Actualité menus.
 const items=Object.freeze([
  Object.freeze({id:'home',label:'Accueil',href:'/'}),
  Object.freeze({id:'discover',label:'SWAPER',href:'/decouvrir'}),
  Object.freeze({id:'categories',label:'DÉCOUVRIR',href:'/categories'}),
  Object.freeze({id:'actus',label:'Actualité',href:'/actus'}),
  Object.freeze({id:'community',label:'Social',href:'/social'}),
  Object.freeze({id:'shop',label:'Boutique',href:'/boutique'}),
  Object.freeze({id:'tv',label:'SWAPP TV',href:'/tv'})
 ]);
 const video=Object.freeze({id:'trailers',label:'Vidéos',href:'/bandes-annonces'});
 const podcast=Object.freeze({id:'onair',label:'PODCAST',href:'/on-air'});
 const account=Object.freeze({id:'settings',label:'Compte',href:'/compte'});
 const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const isNews=active=>active==='actus'||active==='trailers'||active==='guides'||active==='onair';
 const isDiscover=active=>active==='discover'||active==='teams';
 const isTv=active=>active==='tv'||active==='agenda'||active==='programme';
 function link(item,active,shortLabel=''){
  const selected=(item.id==='discover'&&isDiscover(active))||(item.id==='actus'&&isNews(active))||(item.id==='tv'&&isTv(active))||active===item.id;
  const current=active===item.id;
  const classes=[selected?'active':'',item.id==='tv'?'swapp-tv-nav-cta':'',item.id==='discover'?'swapp-direct-nav-cta':''].filter(Boolean).join(' ');
  const label=shortLabel||item.label;
  const accessibility=shortLabel&&shortLabel!==item.label?' aria-label="'+htmlEscape(item.label)+'"':'';
  return '<a href="'+htmlEscape(item.href)+'" class="'+classes+'"'+accessibility+(current?' aria-current="page"':'')+'>'+
   (item.id==='tv'?'':'')+htmlEscape(label)+'</a>';
 }
 function desktopNavigation(active='actus'){
  return '<div class="navGroup">'+items.map(x=>link(x,active)).join('')+'</div>';
 }
 function mobileNavigation(active='actus'){
  // Four primary destinations plus one "Plus" button fit 320px phones.
  const pinned=items.filter(x=>['home','discover','categories','actus'].includes(x.id));
  const other=items.filter(x=>!pinned.includes(x));
  const extra=[...other,video,podcast,account];
  const secondaryActive=extra.some(x=>x.id===active)||active==='guides';
  return pinned.map(x=>link(x,active,undefined)).join('')+
   '<details class="swapp-mobile-more"><summary'+(secondaryActive?' class="active"':'')+
   ' aria-label="Autres rubriques SWAPP">Plus</summary>'+
   '<div class="swapp-mobile-more-links">'+
   extra.map(x=>link(x,active)).join('')+
   '</div></details>';
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
