'use strict';
/** One SWAPP navigation across catalogue, editorial, creator and classic SPA routes. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappNavigation=api;
})(typeof window!=='undefined'?window:null,function(){
 // First level stays deliberately short; SWAPER is a SWAPP TV feature.
 const items=Object.freeze([
  Object.freeze({id:'home',label:'Accueil',href:'/'}),
  Object.freeze({id:'categories',label:'Découvrir',href:'/categories'}),
  Object.freeze({id:'actus',label:'Actualité',href:'/actus'}),
  Object.freeze({id:'community',label:'Social',href:'/social'}),
  Object.freeze({id:'shop',label:'Boutique',href:'/boutique'}),
  Object.freeze({id:'tv',label:'SWAPP TV',href:'/tv'})
 ]);
 const swapper=Object.freeze({id:'swapper',label:'Swapper',href:'/decouvrir'});
 const video=Object.freeze({id:'trailers',label:'Vidéos',href:'/bandes-annonces'});
 const podcast=Object.freeze({id:'onair',label:'PODCAST',href:'/on-air'});
 const account=Object.freeze({id:'settings',label:'Compte',href:'/compte'});
 const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const isNews=active=>['actus','trailers','guides','onair'].includes(active);
 const isTv=active=>['tv','agenda','programme','discover','teams'].includes(active);
 function link(item,active){
  const selected=(item.id==='actus'&&isNews(active))||
   (item.id==='tv'&&isTv(active))||
   (item.id==='swapper'&&['discover','teams'].includes(active))||
   active===item.id;
  const current=active===item.id||(item.id==='swapper'&&active==='discover');
  const classes=[selected?'active':'',item.id==='tv'?'swapp-tv-nav-cta':''].filter(Boolean).join(' ');
  return '<a href="'+htmlEscape(item.href)+'" class="'+classes+'"'+
   (current?' aria-current="page"':'')+'>'+htmlEscape(item.label)+'</a>';
 }
 function tvMenu(active){
  return '<div class="swapp-tv-navigation">'+link(items[items.length-1],active)+
   '<details class="swapp-tv-submenu"><summary aria-label="Sous-menu SWAPP TV" title="Autres parcours SWAPP TV">'+
   '<span aria-hidden="true">▾</span></summary><div class="swapp-tv-submenu-links">'+
   link(swapper,active)+'</div></details></div>';
 }
 function desktopNavigation(active='actus'){
  return '<div class="navGroup">'+items.map(x=>x.id==='tv'?tvMenu(active):link(x,active)).join('')+'</div>';
 }
 function mobileNavigation(active='actus'){
  // Four priorities plus Plus, even on 320px screens; SWAPPER is not a fifth primary tab.
  const pinned=items.filter(x=>['home','categories','actus','tv'].includes(x.id));
  const extra=[...items.filter(x=>!pinned.includes(x)),video,podcast,account];
  const secondaryActive=extra.some(x=>x.id===active)||['guides','discover','teams'].includes(active);
  return pinned.map(x=>link(x,active)).join('')+
   '<details class="swapp-mobile-more"><summary'+(secondaryActive?' class="active"':'')+
   ' aria-label="Autres rubriques SWAPP">Plus</summary>'+
   '<div class="swapp-mobile-more-links">'+
   extra.map(x=>link(x,active)).join('')+
   '<div class="swapp-mobile-tv-subnav" role="group" aria-label="Sous-menu SWAPP TV">'+
   '<span class="swapp-mobile-tv-title">SWAPP TV</span>'+link(swapper,active)+'</div>'+
   '</div></details>';
 }
 function serverHeader(active='actus'){
  return '<header class="top"><div class="topbar">'+
   '<a class="brand" href="/" aria-label="SWAPP — Accueil"><span class="swapp-wordmark-text">SWAPP<span class="swapp-wordmark-dot" aria-hidden="true">.</span></span></a>'+
   '<nav id="nav" class="mainNav" aria-label="Navigation principale">'+desktopNavigation(active)+'</nav>'+
   '<div class="userArea"><button type="button" id="userBtn" class="userBtn" aria-haspopup="true" aria-expanded="false">'+
   '<img id="userAvatar" class="avatarMini" alt=""><span id="userLabel">Se connecter</span></button>'+
   '<div id="userMenu" class="menu"><a href="/compte">Mon espace SWAPP</a></div></div></div></header>';
 }
 function serverMobile(active='actus'){
  return '<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile">'+mobileNavigation(active)+'</nav>';
 }
 return Object.freeze({items,swapper,video,podcast,account,link,desktopNavigation,mobileNavigation,serverHeader,serverMobile});
});