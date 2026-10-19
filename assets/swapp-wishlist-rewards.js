// SWAPP wishlists & discovery points. Server is authoritative; no fictional offers or XP.
(()=>{
 'use strict';
 const API='/api/swapp/interactions';
 const slugOK=v=>typeof v==='string'&&v.length>=3&&v.length<=90&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
 const cleanName=v=>String(v||'').trim().slice(0,100);
 const $$=q=>[...document.querySelectorAll(q)];
 const $=q=>document.querySelector(q);
 const panel=$('[data-swapp-library-root]');
 let wishlist=[],loggedIn=false,busy=false,hydrated=false,loading=null;
 const notice=message=>{
  const el=$('[data-swapp-loyalty-status]');
  if(el)el.textContent=message;
 };
 async function call(path,method='GET',payload){
  const response=await fetch(API+path,{
   method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const message=response.status===401?'Connecte-toi au compte SWAPP pour utiliser ta liste de souhaits.':
    response.status===409?'Tu peux enregistrer 50 jeux maximum dans tes envies.':
    response.status===503?'Le service est momentanément indisponible.':'Modification impossible. Réessaie plus tard.';
   const error=new Error(message);error.status=response.status;throw error;
  }
  return data;
 }
 function renderButtons(){
  const slugs=new Set(wishlist.map(x=>x.slug));
  $$('[data-swapp-wishlist-game]').forEach(button=>{
   const active=slugs.has(button.dataset.gameSlug);
   button.setAttribute('aria-pressed',String(active));
   button.textContent=button.dataset.wishlistError?'Compte SWAPP requis':active?'♥ Dans mes envies':'♡ Ajouter aux envies';
   button.disabled=busy;
   button.setAttribute('aria-label',button.dataset.wishlistError||((active?'Retirer de ma liste de souhaits : ':'Ajouter à ma liste de souhaits : ')+(button.dataset.gameName||'jeu')));
  });
 }
 function renderWishlist(){
  const list=$('[data-swapp-wishlist-results]');
  const count=$('[data-swapp-wishlist-count]');
  if(count)count.textContent='('+wishlist.length+'/50)';
  if(!list)return;
  list.replaceChildren();
  if(!loggedIn){
   const p=document.createElement('p');
   p.textContent='Connecte-toi à ton compte SWAPP pour conserver tes envies entre appareils.';
   list.append(p);return;
  }
  if(!wishlist.length){
   const p=document.createElement('p');
   p.textContent='Aucun jeu dans tes envies. Ajoute un titre depuis son dossier.';
   list.append(p);return;
  }
  for(const item of wishlist){
   if(!slugOK(item.slug))continue;
   const row=document.createElement('article');row.className='mg-wish-row';
   const body=document.createElement('div');
   const editorial=!!document.querySelector('[data-swapp-game-card][data-game-slug="'+item.slug+'"]');
   const a=document.createElement('a');a.href=editorial?'/jeux/'+item.slug:'/boutique';a.textContent=cleanName(item.game);
   const small=document.createElement('small');
   small.textContent=editorial?'Dossier du jeu · Aucune offre annoncée':'Voir la vitrine · Disponibilité non vérifiée';
   body.append(a,small);
   const remove=document.createElement('button');
   remove.type='button';remove.textContent='Retirer';remove.dataset.wishlistRemove=item.slug;
   remove.setAttribute('aria-label','Retirer '+cleanName(item.game)+' de mes envies');
   row.append(body,remove);list.append(row);
  }
 }
 function setWishlist(rows){
  wishlist=Array.isArray(rows)?rows.filter(x=>slugOK(x.slug)).slice(0,50):[];
  loggedIn=true;renderWishlist();renderButtons();
 }
 async function refreshWishlist(){
  try{const data=await call('/library/wishlist');setWishlist(data.wishlist);hydrated=true}
  catch(error){
   if(error.status===401){loggedIn=false;wishlist=[];hydrated=true;renderWishlist();renderButtons()}
   if(panel)notice(error.message);
  }
 }
 async function ensureWishlist(){
  if(hydrated)return;
  if(!loading)loading=refreshWishlist().finally(()=>{loading=null});
  await loading;
  if(!hydrated)throw new Error('Impossible de vérifier ta liste de souhaits pour le moment.');
 }
 async function refreshRewards(){
  if(!panel)return;
  const score=$('[data-swapp-rewards-points]');
  const level=$('[data-swapp-rewards-level]');
  const next=$('[data-swapp-rewards-next]');
  const fill=$('[data-swapp-rewards-fill]');
  const track=$('[data-swapp-rewards-track]');
  try{
   const data=await call('/rewards/me');
   const p=data.rewards;
   if(!p||!Number.isInteger(p.points)||p.points<0||p.points>100)throw Error('Progression indisponible.');
   if(score)score.textContent=String(p.points);
   if(level)level.textContent=p.level;
   if(next)next.textContent=p.pointsToNext?'Encore '+p.pointsToNext+' pts pour '+p.nextLevel:'Parcours découverte terminé';
   if(fill)fill.style.width=p.points+'%';
   if(track)track.setAttribute('aria-valuenow',String(p.points));
  }catch(error){
   if(score)score.textContent='—';
   if(level)level.textContent=error.status===401?'Compte SWAPP requis':'Progression indisponible';
   if(next)next.textContent='';
   if(fill)fill.style.width='0%';
   if(track)track.setAttribute('aria-valuenow','0');
  }
 }
 function mutate(action,button){
  if(busy)return;
  busy=true;renderButtons();
  void Promise.resolve().then(action).then(data=>{
   setWishlist(data.wishlist);
   notice('Ta liste de souhaits a été mise à jour.');
  }).catch(error=>{
   notice(error.message);
   // Native HTML dialogs interrupt play. Display the problem next to the action.
   if(button&&!panel){
    button.dataset.wishlistError=error.message;
   }
  }).finally(()=>{busy=false;renderButtons()});
 }
 document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-swapp-wishlist-game]');
  if(btn){
   delete btn.dataset.wishlistError;
   const slug=btn.dataset.gameSlug,game=cleanName(btn.dataset.gameName);
   if(!slugOK(slug)||game.length<2)return;
   mutate(async()=>{
    await ensureWishlist();
    const exists=wishlist.some(x=>x.slug===slug);
    return call('/library/wishlist/'+encodeURIComponent(slug),exists?'DELETE':'PUT',exists?undefined:{game});
   },btn);return;
  }
  const remove=event.target.closest('[data-wishlist-remove]');
  if(remove){
   const slug=remove.dataset.wishlistRemove;
   if(slugOK(slug))mutate(async()=>{await ensureWishlist();return call('/library/wishlist/'+encodeURIComponent(slug),'DELETE')},remove);
   return;
  }
  const clear=event.target.closest('[data-swapp-wishlist-clear]');
  if(clear&&wishlist.length&&window.confirm('Vider ta liste de souhaits SWAPP ?')){
   mutate(async()=>{await ensureWishlist();return call('/library/wishlist','DELETE')},clear);
  }
 });
 window.addEventListener('swapp:library-changed',()=>{void refreshRewards()});
 window.addEventListener('pageshow',e=>{if(e.persisted){void refreshWishlist();void refreshRewards()}});
 // SPA game actions can appear after the initial script evaluation.
 // Delegated clicks remain active even if there were no cards on first load.
 if(panel||$('[data-swapp-wishlist-game]').length)void refreshWishlist();
 void refreshRewards();
})();
