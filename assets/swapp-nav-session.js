/* Align account display across SWAPP, ACTUS and internal watch pages. */
(()=>{
  'use strict';
  const el=document.querySelector('[data-swapp-account]');
  if(!el)return;
  const label=el.querySelector('[data-swapp-account-label]');
  if(!label)return;
  fetch('/api/oryon/session',{method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)})
    .then(response=>response.ok?response.json():null)
    .then(result=>{
      if(!result?.success)return;
      const user=result.local||result.twitch;
      if(user){label.textContent=String(user.display_name||user.login||'Compte').slice(0,40);}
    })
    .catch(()=>{}); // Navigation never depends on session endpoint availability.
})();