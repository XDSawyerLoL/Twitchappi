/* Rédaction is an account-menu action, never a second top-level menu. */
(() => {
  'use strict';
  const menu=document.getElementById('userMenu');
  if(!menu || typeof fetch!=='function')return;
  let allowed=false,pending=false,last=0;
  function renderEditorAccess(){
    let link=menu.querySelector('[data-swapp-editor-link]');
    let shop=menu.querySelector('[data-swapp-shop-admin-link]');
    let fair=menu.querySelector('[data-swapp-fair-admin-link]');
    if(!allowed){if(link)link.remove();if(shop)shop.remove();if(fair)fair.remove();return;}
    if(!link){
     link=document.createElement('a');
     link.href='/actus/studio';
     link.dataset.swappEditorLink='1';
     link.textContent='Studio administrateur · Posts & vidéos';
     menu.appendChild(link);
    }
    if(!shop){
     shop=document.createElement('a');
     shop.href='/boutique/admin';
     shop.dataset.swappShopAdminLink='1';
     shop.textContent='Gestion Boutique · Produits & vitrine';
     menu.appendChild(shop);
    }
    if(!fair){
     fair=document.createElement('a');
     fair.href='/admin/fair-discovery';
     fair.dataset.swappFairAdminLink='1';
     fair.textContent='Fair Discovery · Visibilité des créateurs';
     menu.appendChild(fair);
    }
  }
  async function check(force=false){
    if(pending || (!force&&Date.now()-last<3000))return;
    pending=true;last=Date.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),6500);
    try{
      const response=await fetch('/api/editor/actus/access',{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
      const data=response.ok?await response.json():null;
      allowed=Boolean(data?.canEdit);
    }catch(_){allowed=false;}
    finally{clearTimeout(timer);pending=false;renderEditorAccess();}
  }
  const observer=new MutationObserver(records=>{
    // The link inserted by this script must not trigger another check.
    if(records.every(r=>[...r.addedNodes].every(n=>n.nodeType===1&&(n.dataset?.swappEditorLink||n.dataset?.swappShopAdminLink||n.dataset?.swappFairAdminLink))))return;
    if(allowed)renderEditorAccess();
    else check();
  });
  observer.observe(menu,{childList:true});
  check(true);
})();