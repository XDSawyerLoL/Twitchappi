/* SERVEUR + moderation reminders across SWAPP.
 * Uses existing SWAPP admin session; no user IDs or secrets in the browser.
 */
(()=>{
 'use strict';
 if(window.__swappServersModerationAlertsBooted)return;
 window.__swappServersModerationAlertsBooted=true;
 const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/swapp-servers-alerts.css?v=20261116-admin-flood-v2';
 document.head.append(css);
 let pending=0,allowed=false,requesting=false,accessDenied=false,backoffUntil=0;
 const target='/serveurs#ss-review';
 function badge(text){const b=document.createElement('span');b.className='ss-pending-badge';b.textContent=text;return b}
 function render(){
  document.querySelectorAll('#nav a[href="/serveurs"],#mobileNav a[href="/serveurs"]').forEach(link=>{
   link.querySelector('.ss-pending-badge')?.remove();
   if(allowed&&pending>0){link.append(badge(String(pending)));link.title=pending+' serveur(s) à examiner'}
  });
  const menu=document.querySelector('#userMenu');
  if(menu){
   const old=menu.querySelector('a[data-swapp-server-mod-alert]');
   if(!allowed)old?.remove();
   else{
    const a=old||document.createElement('a');
    a.dataset.swappServerModAlert='1';a.href=target;a.className='ss-review-menu-link';
    a.textContent=pending>0?'SERVEUR + · '+pending+' demande'+(pending===1?'':'s')+' à examiner':'SERVEUR + · Gérer les validations';
    if(!old)menu.prepend(a);
   }
  }
  const button=document.querySelector('#userBtn');
  if(button){
   button.querySelector('.ss-user-pending')?.remove();
   if(allowed&&pending>0){const b=badge(String(pending));b.classList.add('ss-user-pending');b.title=pending+' serveur(s) à examiner';button.append(b)}
  }
  const settings=document.querySelector('#settings');
  if(settings){
   let alert=settings.querySelector('[data-ss-account-alert]');
   if(!allowed){alert?.remove()}
   else{
    if(!alert){alert=document.createElement('a');alert.dataset.ssAccountAlert='1';alert.className='ss-account-alert';settings.prepend(alert)}
    alert.href=target;alert.textContent=pending>0?'SERVEUR + : '+pending+' serveur'+(pending===1?'':'s')+' en attente de validation →':'SERVEUR + : gérer les serveurs et les validations →';
   }
  }
  const review=document.querySelector('#ss-review');
  if(review&&allowed&&pending>0){const head=document.querySelector('#ss-review-refresh');if(head)head.textContent='Actualiser les '+pending+' demandes'}
 }
 let queued=false;
 function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render()})}
 async function refresh({force=false}={}){
  if(requesting||document.visibilityState==='hidden')return;
  // A session rejected by the real admin guard must not be polled again.
  if(accessDenied&&!force)return;
  if(!force&&Date.now()<backoffUntil)return;
  if(force){accessDenied=false;backoffUntil=0}
  requesting=true;
  try{
   const res=await fetch('/api/swapp/serveurs/moderation/count',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(res.status===401||res.status===403){
    const mime=(res.headers.get('content-type')||'').toLowerCase();
    const body=mime.includes('json')?await res.json().catch(()=>({})):{};
    if(res.status===401||body.error==='acces_refuse'){
     accessDenied=true;allowed=false;pending=0;return;
    }
    // WAF HTML challenges are NOT proof that this account is not an admin.
    allowed=false;pending=0;backoffUntil=Date.now()+600000;return;
   }
   if(!res.ok){
    allowed=false;pending=0;
    backoffUntil=Date.now()+(res.status===429?300000:120000);return;
   }
   if(!(res.headers.get('content-type')||'').toLowerCase().includes('json')){
    allowed=false;pending=0;backoffUntil=Date.now()+300000;return;
   }
   const data=await res.json();allowed=true;accessDenied=false;backoffUntil=0;
   pending=Math.max(0,Math.min(999,Number(data.pending)||0));
  }catch(_){backoffUntil=Date.now()+120000}
  finally{requesting=false;schedule()}
 }
 for(const id of ['userMenu','nav','mobileNav','settings']){
  const element=document.getElementById(id);
  if(element&&window.MutationObserver)new MutationObserver(schedule).observe(element,{childList:true,subtree:false});
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
 document.addEventListener('click',event=>{
  if(event.target?.closest?.('[data-ss-admin-refresh]'))refresh({force:true});
 },true);
 window.addEventListener('swapp:session-changed',()=>refresh({force:true}));
 refresh();
 const interval=setInterval(refresh,180000);interval.unref?.();
})();
