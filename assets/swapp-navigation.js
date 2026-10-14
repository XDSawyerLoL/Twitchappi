/* Shared navigation for SWAPP main application, ACTUS, articles and player.
   The same five routes and interactive DOM are used on every page. */
(function(root){
  'use strict';
  const links=Object.freeze([
    {id:'home',label:'Accueil',href:'/'},
    {id:'discover',label:'Découvrir',href:'/decouvrir'},
    {id:'categories',label:'Catégories',href:'/categories'},
    {id:'teams',label:'Équipes',href:'/equipes'},
    {id:'actus',label:'ACTUS',href:'/actus'}
  ]);
  function render(menu,mobile,{active='home',navigate}={}){
    if(!menu)return;
    menu.replaceChildren();
    const container=document.createElement('div');container.className='navGroup';
    for(const item of links){
      const a=document.createElement('a');
      a.href=item.href;
      a.className='swappGlobalNavLink'+(item.id==='actus'?' swappIntegratedNewsNav':'')+(active===item.id?' active':'');
      a.textContent=item.label;
      if(active===item.id)a.setAttribute('aria-current','page');
      if(typeof navigate==='function' && item.id!=='actus'){
        a.addEventListener('click',e=>{
          if(e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate(item.id);
        });
      }
      container.appendChild(a);
    }
    menu.appendChild(container);
    if(mobile && mobile!==menu){
      mobile.replaceChildren();
      for(const item of links){
        const a=document.createElement('a');a.href=item.href;
        a.className='swappGlobalNavLink'+(item.id==='actus'?' swappIntegratedNewsNav':'')+(active===item.id?' active':'');
        a.textContent=item.label;
        if(active===item.id)a.setAttribute('aria-current','page');
        if(typeof navigate==='function' && item.id!=='actus'){
          a.addEventListener('click',e=>{
            if(e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;
            e.preventDefault();navigate(item.id);
          });
        }
        mobile.appendChild(a);
      }
    }
  }
  function mountStandalone(){
    if(document.body?.dataset.swappPage!=='editorial')return;
    const menu=document.getElementById('nav'), mobile=document.getElementById('mobileNav');
    render(menu,mobile,{active:document.body.dataset.swappActive||'actus'});
    const btn=document.getElementById('userBtn'), popup=document.getElementById('userMenu');
    const label=document.getElementById('userLabel'), avatar=document.getElementById('userAvatar');
    if(!btn || !popup)return;
    const accountLink=document.createElement('a');
    accountLink.href='/compte';accountLink.textContent='Mon compte SWAPP';popup.appendChild(accountLink);
    btn.setAttribute('aria-expanded','false');
    function close(){popup.classList.remove('open');btn.setAttribute('aria-expanded','false')}
    btn.addEventListener('click',()=>{let show=!popup.classList.contains('open');popup.classList.toggle('open',show);btn.setAttribute('aria-expanded',String(show))});
    document.addEventListener('click',e=>{if(!e.target.closest('.userArea'))close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
    if(typeof fetch==='function'){
      fetch('/api/oryon/session',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)})
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(!data?.success)return;
        const u=data.local || data.twitch;
        if(!u)return;
        const name=String(u.display_name||u.login||'Compte').slice(0,40);
        if(label)label.textContent=name;
        const picture=u.avatar_url||u.profile_image_url;
        if(avatar && typeof picture==='string'){
          try{const url=new URL(picture);if(url.protocol==='https:')avatar.src=url.href}catch(_){}
        }
      }).catch(()=>{});
    }
  }
  root.SWAPPNavigation={links,render,mountStandalone};
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountStandalone);
    else mountStandalone();
  }
})(typeof window!=='undefined'?window:{});
