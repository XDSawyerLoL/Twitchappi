/* SWAPP channel actions: Follow / opt-in bell / monthly support directly
 * beside the LIVE player heading. Move actual native nodes; never clone
 * handlers or move the video, native chat or stream title.
 */
(function(){
 'use strict';
 const root=document.getElementById('channel');if(!root)return;
 const LOGIN=/^[a-z0-9_-]{2,48}$/;
 const el=(tag,cls,label)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(label!==undefined)n.textContent=label;return n;
 };
 const loginFor=page=>{
  const candidate=String(page?.dataset?.channelLogin||'').toLowerCase();
  if(LOGIN.test(candidate))return candidate;
  const found=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return found?found[1].toLowerCase():'';
 };
 let dialog=null,dialogTitle=null,dialogMessage=null,dialogStatus=null;
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=el('dialog','swapp-live-subscription-dialog');
  dialog.setAttribute('aria-label','Soutenir une chaîne SWAPP');
  const head=el('div','swapp-live-subscription-top');
  dialogTitle=el('h2','',"S'abonner à cette chaîne");
  const dismiss=el('button','swapp-live-subscription-close','×');
  dismiss.type='button';dismiss.setAttribute('aria-label','Fermer');
  dismiss.addEventListener('click',()=>dialog.close());
  head.append(dialogTitle,dismiss);
  const description=el('p','swapp-live-subscription-description',
   'Les abonnements payants aux chaînes SWAPP sont en préparation.');
  dialogMessage=el('p','swapp-live-subscription-detail','');
  dialogStatus=el('p','swapp-live-subscription-status','');
  dialogStatus.setAttribute('role','status');
  dialogStatus.setAttribute('aria-live','polite');
  const foot=el('footer','swapp-live-subscription-foot');
  const close=el('button','swapp-live-subscription-done','Compris');
  close.type='button';close.addEventListener('click',()=>dialog.close());foot.append(close);
  dialog.append(head,description,dialogMessage,dialogStatus,foot);
  document.body.append(dialog);
  return dialog;
 }
 async function openSubscription(page){
  const login=loginFor(page);
  if(!LOGIN.test(login))return;
  ensureDialog();
  dialogTitle.textContent="S'abonner à @"+login;
  dialogMessage.textContent='Le suivi et la lecture du direct restent gratuits.';
  dialogStatus.textContent="Aucun paiement n'est activé pour le moment.";
  if(!dialog.open)dialog.showModal();
  try{
   const response=await fetch('/api/swapp/channel-subscriptions/'+encodeURIComponent(login)+'/status',
    {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error('Indisponible');
   const result=await response.json();
   if(result.success!==true||result.creator!==login)throw Error('Statut non vérifié');
   if(!dialog.open||dialogTitle.textContent!=="S'abonner à @"+login)return;
   if(result.available===false){
    dialogStatus.textContent=result.message||"L'abonnement mensuel est en préparation.";
   }else{
    // Deliberately NO checkout URL or imaginary plan until an independently
    // verified and tested paid subscription flow is connected.
    dialogStatus.textContent='Le paiement ne peut pas encore être lancé depuis cette page.';
   }
  }catch(_){
   if(dialog.open)dialogStatus.textContent='Statut des abonnements indisponible. Aucun paiement ne sera lancé.';
  }
 }
 function buttonFor(page){
  let button=page.querySelector('.swapp-live-subscribe-button');
  if(button)return button;
  button=el('button','swapp-live-subscribe-button',"S'abonner");
  button.type='button';
  button.title='Soutenir ce créateur chaque mois — lancement prochain';
  button.setAttribute('aria-haspopup','dialog');
  const label=el('span','swapp-live-subscribe-soon','Bientôt');
  button.append(label);
  button.addEventListener('click',()=>void openSubscription(page));
  return button;
 }
 function mount(page){
  if(page.dataset.channelLive!=='true')return;
  const headline=page.querySelector('.channelLiveLayout > .swapp-watch-headline');
  if(!headline)return;
  let toolbar=headline.querySelector('.swapp-live-viewer-actions');
  if(!toolbar){
   toolbar=el('div','swapp-live-viewer-actions');
   toolbar.setAttribute('role','group');
   toolbar.setAttribute('aria-label','Actions sur la chaîne');
   headline.append(toolbar);
  }
  const login=loginFor(page);
  if(!login)return;
  const owner=page.dataset.channelOwner==='true';
  if(!owner){
   const follow=page.querySelector('.swapp-channel-follow-btn');
   // Follow is a real native toggle. Move it ONLY after the owner-authenticated
   // follow module has bound its click handler and initial state.
   if(follow?.dataset.swappFollowBound==='true'&&follow.parentElement!==toolbar)
    toolbar.prepend(follow);
   const bell=page.querySelector('.swapp-live-alert-bell');
   if(bell&&bell.parentElement!==toolbar)toolbar.append(bell);
  }
  const subscribe=buttonFor(page);
  if(subscribe.parentElement!==toolbar)toolbar.append(subscribe);
 }
 let scheduled=false;
 function queue(){
  if(scheduled||!root.classList.contains('active'))return;
  scheduled=true;
  requestAnimationFrame(()=>{
   scheduled=false;
   for(const page of root.querySelectorAll('.creatorRefine.swapp-channel-polish'))mount(page);
  });
 }
 new MutationObserver(records=>{
  if(records.some(record=>record.addedNodes?.length||record.removedNodes?.length))queue();
 }).observe(root,{childList:true,subtree:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
 window.addEventListener('popstate',queue);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
 else queue();
})();
