/* SPA account menu adapter. One renderer is shared with SWAPP native pages.
 * Twitch account connections and disconnections are available only in /compte.
 */
(()=>{'use strict';
 const menu=document.getElementById('userMenu'),trigger=document.getElementById('userBtn');
 if(!menu||!trigger)return;
 let scheduled=false,appearanceOpened=false,tastesOpened=false;
 const close=()=>{
  menu.classList.remove('open');
  trigger.setAttribute('aria-expanded','false');
 };
 function enhance(){
  scheduled=false;
  // The original SPA replaces its menu at every session change; re-enhance
  // only those fresh menus. Do not recursively enhance our own DOM changes.
  if(menu.querySelector('.swapp-account-unified-root'))return;
  const shared=window.SwappUnifiedAccountMenu;
  const original=[...menu.querySelectorAll('button,a')];
  const local=original.some(item=>/logoutOryon\s*\(/.test(item.getAttribute('onclick')||''));
  const twitch=original.some(item=>/logoutTwitch\s*\(/.test(item.getAttribute('onclick')||''));
  const signedIn=local||twitch||!!menu.querySelector('.small');
  if(!shared?.render){
   // Fail closed: even if the shared renderer is missing, the global header
   // must never expose a Twitch OAuth action.
   for(const item of original){
    if(/(?:Connecter|Déconnecter) Twitch/.test(item.textContent||''))item.remove();
   }
   return;
  }
  const label=document.getElementById('userLabel');
  shared.render(menu,{
   signedIn,localAccount:local,
   displayName:label?.textContent||'Compte SWAPP',
   appearanceOpen:appearanceOpened,tastesOpen:tastesOpened,
   onAppearanceToggle:value=>{appearanceOpened=value},
   onTastesToggle:value=>{tastesOpened=value},
   onClose:close,
   onBroadcast:local?()=>{if(typeof window.setView==='function')window.setView('manager');else window.location.href='/compte'}:null,
   onLogout:signedIn?async()=>{
    if(local&&typeof window.logoutOryon==='function')return window.logoutOryon();
    if(twitch&&typeof window.logoutTwitch==='function')return window.logoutTwitch();
    window.location.href='/compte';
   }:null
  });
  trigger.setAttribute('aria-haspopup','true');
  trigger.setAttribute('aria-expanded',String(menu.classList.contains('open')));
 }
 const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(enhance)};
 const observer=new MutationObserver(schedule);
 observer.observe(menu,{childList:true});
 enhance();
 trigger.addEventListener('click',()=>queueMicrotask(()=>{
  trigger.setAttribute('aria-expanded',String(menu.classList.contains('open')));
 }));
 document.addEventListener('click',event=>{
  if(!event.target.closest('.userArea')&&!menu.classList.contains('open'))
   trigger.setAttribute('aria-expanded','false');
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.classList.contains('open')){
   close();trigger.focus();
  }
 });
})();
