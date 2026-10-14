/* Rédaction is an account-menu action, never a second top-level menu. */
(() => {
  'use strict';
  const menu=document.getElementById('userMenu');
  if(!menu || typeof fetch!=='function')return;
  let allowed=false,pending=false,last=0;
  function renderEditorAccess(){
    let link=menu.querySelector('[data-swapp-editor-link]');
    if(!allowed){if(link)link.remove();return;}
    if(link)return;
    link=document.createElement('a');
    link.href='/actus/studio';
    link.dataset.swappEditorLink='1';
    link.textContent='Rédaction d’articles';
    menu.appendChild(link);
  }
  async function check(force=false){
    if(pending || (!force&&Date.now()-last<3000))return;
    pending=true;last=Date.now();
    try{
      const response=await fetch('/api/editor/actus/access',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
      const data=response.ok?await response.json():null;
      allowed=Boolean(data?.canEdit);
    }catch(_){allowed=false;}
    finally{pending=false;renderEditorAccess();}
  }
  const observer=new MutationObserver(records=>{
    // The link inserted by this script must not trigger another check.
    if(records.every(r=>[...r.addedNodes].every(n=>n.nodeType===1&&n.dataset?.swappEditorLink)))return;
    if(allowed)renderEditorAccess();
    else check();
  });
  observer.observe(menu,{childList:true});
  check(true);
})();