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
    Object.freeze({id:'actus',label:'ACTUS',href:'/actus'})
  ]);
  const account=Object.freeze({id:'settings',label:'Compte',href:'/compte'});
  const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function link(item,active,mobile=false){
    return '<a href="'+htmlEscape(item.href)+'" class="'+(item.id==='actus'?'swappIntegratedNewsNav ':'')+
      (active===item.id?'active':'')+'"'+(active===item.id?' aria-current="page"':'')+
      '>'+htmlEscape(item.label)+'</a>';
  }
  function serverHeader(active='actus'){
    const navigation=items.map(item=>link(item,active)).join('');
    return '<header class="top"><div class="topbar">'+
      '<a class="brand" href="/" aria-label="Accueil SWAPP"><span class="brandMark" aria-hidden="true"></span><span>Swapp</span></a>'+
      '<nav id="nav" class="mainNav" aria-label="Navigation principale"><div class="navGroup">'+navigation+'</div></nav>'+
      '<div class="userArea"><button type="button" id="userBtn" class="userBtn" aria-haspopup="true" aria-expanded="false">'+
      '<img id="userAvatar" class="avatarMini" alt=""><span id="userLabel">Compte</span></button>'+
      '<div id="userMenu" class="menu"><a href="/compte">Mon compte SWAPP</a></div></div>'+
      '</div></header>';
  }
  function serverMobile(active='actus'){
    return '<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile">'+
      items.map(item=>link(item,active,true)).join('')+link(account,active,true)+'</nav>';
  }
  return Object.freeze({items,account,serverHeader,serverMobile});
});
