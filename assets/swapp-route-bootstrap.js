/* Restore direct SWAPP SPA routes after boot-time session/network updates.
 * Only the entry route is protected. Deliberate navigation is never reverted.
 */
(()=>{'use strict';
 const ROUTES=Object.freeze({
  '/actus':'actus','/decouvrir':'discover','/categories':'categories',
  '/equipes':'teams','/compte':'settings','/dashboard':'dashboard'
 });
 const normalize=path=>(path||'/').replace(/\/+$/,'')||'/';
 const entryPath=normalize(location.pathname);
 const entry=ROUTES[entryPath];
 if(!entry)return;
 const home=document.getElementById('home');
 const target=document.getElementById(entry);
 if(!home||!target)return;
 home.classList.remove('active');
 target.classList.add('active');
 let leftEntry=false,rendering=false,restored=false;
 const leave=()=>{leftEntry=true};
 document.addEventListener('click',event=>{
  // A click on another destination means the user has left the original route.
  if(event.target?.closest?.('header.top a,header.top nav button,#mobileNav a,#mobileNav button,#home a,#actus a,.swapp-footer a,[data-view]'))leave();
 },true);
 window.addEventListener('popstate',leave);
 window.addEventListener('hashchange',()=>{if(normalize(location.pathname)!==entryPath)leave()});
 async function reconcile(){
  if(leftEntry||rendering)return;
  if(normalize(location.pathname)!==entryPath){
   // Only repair the accidental root rewrite observed during boot.
   if(normalize(location.pathname)!=='/')return leave();
   try{history.replaceState({view:entry},'',entryPath+(location.search||'')+(location.hash||''))}catch(_){return}
  }
  // Once hydrated, keep the user's current route without redundant renders.
  if(restored&&target.classList.contains('active'))return;
  if(entry==='actus'&&target.classList.contains('active')&&target.querySelector('.swapp-actus-native'))return;
  if(typeof window.setView!=='function'&&!(entry==='actus'&&window.SwappActus))return;
  rendering=true;
  try{
   if(typeof window.setView==='function')await window.setView(entry);
   else await window.SwappActus.render(target);
   restored=true;
  }catch(error){
   console.warn('[SWAPP ROUTES] Restauration impossible :',error);
  }finally{rendering=false}
 }
 [0,180,850,2400,6000].forEach(delay=>setTimeout(reconcile,delay));
})();
