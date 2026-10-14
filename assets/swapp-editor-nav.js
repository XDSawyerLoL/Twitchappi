/* Editorial tools appear in the existing SWAPP account menu after server role validation. */
(() => {
  'use strict';
  const menu=document.getElementById('userMenu');
  if(!menu || typeof fetch!=='function')return;
  let allowed=false,pending=false,lastAttempt=0;
  function syncLink(){
    const link=menu.querySelector('[data-swapp-editor-link]');
    if(!allowed){if(link)link.remove();return;}
    if(link)return;
    const a=document.createElement('a');
    a.href='/actus/studio';a.textContent='Rédaction d’articles';
    a.dataset.swappEditorLink='1';
    menu.appendChild(a);
  }
  async function check(force=false){
    const now=Date.now();
    if(pending || (!force && now-lastAttempt<3000))return;
    pending=true;lastAttempt=now;
    try{
      const r=await fetch('/api/editor/actus/access',{credentials:'same-origin',
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
      const result=r.ok?await r.json():null;
      allowed=Boolean(result?.canEdit);
    }catch(_){allowed=false;}
    finally{pending=false;syncLink();}
  }
  const observer=new MutationObserver(records=>{
    if(records.every(record=>[...record.addedNodes].every(n=>n.nodeType===1 && n.dataset?.swappEditorLink)))return;
    if(allowed)syncLink();
    else check();
  });
  observer.observe(menu,{childList:true});
  check(true);
})();
