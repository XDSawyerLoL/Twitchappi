/* SWAPP ASCENSION — only actual receipt aggregates, not follower claims. */
(()=>{'use strict';
 const root=document.getElementById('swapp-ascension');if(!root)return;
 const status=root.querySelector('#sa-status'),button=root.querySelector('#sa-refresh');
 const received=root.querySelector('#sa-received'),sent=root.querySelector('#sa-sent'),
  creators=root.querySelector('#sa-creators');
 let loading=false;
 async function refresh(){
  if(loading)return;loading=true;button.disabled=true;status.textContent='Mise à jour de tes données…';
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),10000);
  try{
   const response=await fetch('/api/swapp/passage/ascension',{credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'},signal:ctl.signal});
   const data=await response.json().catch(()=>({}));
   if(response.status===401){
    status.replaceChildren('Connecte-toi à SWAPP pour consulter ton impact. ');
    const a=document.createElement('a');a.href='/compte';a.textContent='Me connecter';
    status.append(a);return;
   }
   if(!response.ok||data.success!==true)throw Error(data.reason||'unavailable');
   if(data.meaning!=='confirmed_destination_page_open')throw Error('unsupported_metrics');
   const fmt=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?
    new Intl.NumberFormat('fr-FR').format(Number(n)):'—';
   received.textContent=fmt(data.received);sent.textContent=fmt(data.sent);
   creators.textContent=fmt(data.source_creators);
   status.textContent='Données de passages confirmés sur les 30 derniers jours.';
  }catch(_){
   status.textContent='Statistiques indisponibles. Le service nécessite la base MySQL SWAPP, sans frais supplémentaires.';
  }finally{clearTimeout(timeout);button.disabled=false;loading=false}
 }
 button.addEventListener('click',()=>void refresh());
 void refresh();
})();