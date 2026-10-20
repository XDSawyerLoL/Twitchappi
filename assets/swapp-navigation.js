'use strict';
/**
 * Single public navigation contract shared by the SWAPP SPA and server-rendered pages.
 * Browser: window.SwappNavigation; Node: require('../../assets/swapp-navigation').
 */
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
    Object.freeze({id:'community',label:'Social',href:'/communaute'}),
    Object.freeze({id:'trailers',label:'Vidéos',href:'/bandes-annonces'}),
    Object.freeze({id:'shop',label:'Boutique',href:'/boutique'})
  ]);
  const account=Object.freeze({id:'settings',label:'Compte',href:'/compte'});
  const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function link(item,active,mobile=false){
    return '<a href="'+htmlEscape(item.href)+'" class="'+(active===item.id?'active':'')+'"'+(active===item.id?' aria-current="page"':'')+
      '>'+htmlEscape(item.label)+'</a>';
  }
  function serverHeader(active='actus'){
    const navigation=items.map(item=>link(item,active)).join('');
    return '<header class="top"><div class="topbar">'+
      '<a class="brand" href="/" aria-label="SWAPP — Accueil"><span class="swapp-wordmark-text">SWAPP<span class="swapp-wordmark-dot" aria-hidden="true">.</span></span></a>'+
      '<nav id="nav" class="mainNav" aria-label="Navigation principale"><div class="navGroup">'+navigation+'</div></nav>'+
      '<div class="userArea"><button type="button" id="userBtn" class="userBtn" aria-haspopup="true" aria-expanded="false">'+
      '<img id="userAvatar" class="avatarMini" alt=""><span id="userLabel">Compte</span></button>'+
      '<div id="userMenu" class="menu"><a href="/compte">Mon compte SWAPP</a></div></div>'+
      '</div></header>';
  }
  function serverMobile(active='actus'){
    const main=items.filter(item=>['home','discover','actus','community'].includes(item.id));
    const other=items.filter(item=>!main.includes(item));
    return '<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile">'+
      main.map(item=>link(item,active,true)).join('')+
      '<details class="swapp-mobile-more"><summary'+(other.some(item=>item.id===active)||active===account.id?' class="active"':'')+'>Plus</summary><div class="swapp-mobile-more-links">'+other.map(item=>link(item,active,true)).join('')+link(account,active,true)+'</div></details></nav>';
  }
  return Object.freeze({items,account,serverHeader,serverMobile});
});
