/* SWAPP ACTUS: restore a direct /actus entry independently from session API health.
 * Only runs on an initial /actus document load, never on ordinary SPA navigation.
 */
(()=>{'use strict';
 const entry=(location.pathname||'/').replace(/\/+$/,'')||'/';
 if(entry!=='/actus'&&window.__SWAPP_DIRECT_ACTUS_ENTRY__!==true)return;
 const home=document.getElementById('home');
 const actus=document.getElementById('actus');
 if(!home||!actus)return;
 home.classList.remove('active');
 actus.classList.add('active');
 let leftEntry=false,rendering=false;
 const isActusPath=()=>((location.pathname||'/').replace(/\/+$/,'')||'/')==='/actus';
 const leave=()=>{leftEntry=true};
 document.addEventListener('click',event=>{
  if(event.target?.closest?.('header.top nav button,#mobileNav button,#actus a,.swapp-footer a'))leave();
 },true);
 window.addEventListener('popstate',leave);
 window.addEventListener('hashchange',()=>{if(!isActusPath())leave()});
 async function reconcile(){
  if(leftEntry||rendering)return;
  // Do not let an unrelated boot-time render rewrite a direct editorial URL to '/'.
  if(!isActusPath()){
   if(location.pathname!=='/')return leave();
   try{history.replaceState({view:'actus'},'','/actus')}catch(_){return}
  }
  if(actus.classList.contains('active')&&actus.querySelector('.swapp-actus-native'))return;
  if(!window.SwappActus)return;
  rendering=true;
  try{
   if(typeof window.setView==='function')await window.setView('actus');
   else await window.SwappActus.render(actus);
  }catch(error){
   console.warn('[SWAPP ACTUS] Impossible de restaurer la rubrique :',error);
  }finally{rendering=false}
 }
 // A late session response must not undo the restored editorial view.
 [0,180,850,2400,6000].forEach(delay=>setTimeout(reconcile,delay));
})();
