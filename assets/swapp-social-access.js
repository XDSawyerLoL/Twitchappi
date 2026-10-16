/* SWAPP local or Twitch session gate for the community experience. */
(()=>{'use strict';
 const box=document.getElementById('swapp-social-access');
 if(!box)return;
 const gate=box.querySelector('.swapp-social-access-gate');
 const note=gate?.querySelector('p');
 const set=unlocked=>{
   box.classList.remove('is-pending','is-locked','is-unlocked');
   box.classList.add(unlocked?'is-unlocked':'is-locked');
   box.querySelector('.swapp-social-access-content')?.setAttribute('aria-hidden',unlocked?'false':'true');
   if('inert' in HTMLElement.prototype)box.querySelector('.swapp-social-access-content').inert=!unlocked;
 };
 // Fail closed on failed request or ambiguous session result.
 const check=async()=>{
  try{
   const r=await fetch('/api/oryon/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('session unavailable');
   const data=await r.json();
   set(Boolean(data?.success&&(data.local||data.twitch)));
  }catch{
   if(note)note.textContent='Connexion non vérifiée. Identifie-toi sur SWAPP pour accéder à SOCIAL.';
   set(false);
  }
 };
 check();
 window.addEventListener('pageshow',check);
})();
