// SWAPP Mes jeux — explicit follows, only local preferences, no tracking or polling.
(()=>{
 'use strict';
 const KEY='swapp:followed-games:v1',LIMIT=30,SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
 const validSlug=s=>typeof s==='string'&&s.length>=3&&s.length<=90&&SLUG.test(s);
 const cleanName=v=>String(v||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,100);
 const now=()=>new Date().toISOString();
 function read(){
  try{
   const stored=JSON.parse(localStorage.getItem(KEY)||'null');
   if(!stored||stored.version!==1||!Array.isArray(stored.games))return[];
   const ids=new Set();
   return stored.games.filter(item=>{
    if(!validSlug(item?.slug)||ids.has(item.slug))return false;
    ids.add(item.slug);return true;
   }).slice(0,LIMIT).map(item=>({
    slug:item.slug,game:cleanName(item.game)||item.slug,
    followedAt:typeof item.followedAt==='string'&&!Number.isNaN(Date.parse(item.followedAt))?item.followedAt:now(),
    seenAt:typeof item.seenAt==='string'&&!Number.isNaN(Date.parse(item.seenAt))?item.seenAt:''
   }));
  }catch{return []}
 }
 function save(games){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,games}));return true}
  catch{return false}
 }
 let games=read();

 const SYNC_KEY='swapp:follow-sync-account:v1';
 let syncAccountId='';
 try{
  const value=JSON.parse(localStorage.getItem(SYNC_KEY)||'null');
  if(typeof value?.id==='string'&&/^[a-zA-Z0-9_-]{3,100}$/.test(value.id))syncAccountId=value.id;
 }catch{}
 let syncing=false;
 const syncEndpoint='/api/swapp/interactions/library';
 async function api(path,method='GET',body){
  const response=await fetch(syncEndpoint+path,{
   method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=new Error(response.status===401?'Connecte-toi à ton compte SWAPP pour synchroniser.':
    response.status===409?'La bibliothèque du compte atteint sa limite de 30 jeux.':
    response.status===503?'La base SWAPP est temporairement indisponible.':'Synchronisation impossible. Réessaie plus tard.');
   error.status=response.status;throw error;
  }
  return data;
 }
 function syncNotice(message){
  const label=document.querySelector('[data-my-games-sync-status]');
  if(label)label.textContent=message;
 }
 function syncUI(){
  const start=document.querySelector('[data-my-games-enable-sync]');
  const stop=document.querySelector('[data-my-games-disable-sync]');
  if(start){start.hidden=!!syncAccountId;start.disabled=syncing;}
  if(stop){stop.hidden=!syncAccountId;stop.disabled=syncing;}

 }
 function applyRemote(data){
  if(!data||!Array.isArray(data.games))throw Error('Réponse de bibliothèque invalide.');
  const incoming=data.games.filter(g=>validSlug(g?.slug)&&cleanName(g.game)).slice(0,LIMIT).map(g=>({
   slug:g.slug,game:cleanName(g.game),followedAt:g.followedAt||now(),seenAt:g.seenAt||''
  }));
  games=incoming;
  if(!save(incoming))syncNotice('Bibliothèque synchronisée ; copie locale indisponible sur cet appareil.');
  update();
 }
 async function restoreSync(){
  if(!syncAccountId||syncing)return;
  syncing=true;syncUI();
  try{
   const remote=await api('/games');
   if(String(remote.userId)!==syncAccountId){
    syncAccountId='';
    try{localStorage.removeItem(SYNC_KEY)}catch{}
    syncNotice('Compte SWAPP différent : synchronisation désactivée sur cet appareil. La sélection locale est conservée.');
    return;
   }
   applyRemote(remote);syncNotice('Tes jeux sont à jour sur ce compte SWAPP.');
  }catch(error){syncNotice(error.message+' La sélection reste disponible localement.');}
  finally{syncing=false;syncUI();}
 }
 async function enableSync(){
  if(syncing)return;
  syncing=true;syncUI();
  try{
   const account=await api('/games');
   if(!account.userId||typeof account.userId!=='string')throw Error('Compte SWAPP introuvable.');
   if(syncAccountId&&syncAccountId!==account.userId)throw Error('Le compte a changé. Désactive d’abord la synchronisation précédente.');
   // Explicit first-time merge; preserves pre-existing follows in the account.
   const remote=await api('/import','POST',{games:games.map(({slug,game})=>({slug,game}))});
   if(String(remote.userId)!==String(account.userId))throw Error('Identité SWAPP différente pendant la synchronisation.');
   try{localStorage.setItem(SYNC_KEY,JSON.stringify({id:String(remote.userId)}))}
   catch{throw Error('Impossible de mémoriser ton consentement sur cet appareil. Les jeux ont été sauvegardés sur le compte.')}
   syncAccountId=String(remote.userId);applyRemote(remote);
   syncNotice('Synchronisation activée. Tu retrouveras ces jeux sur tes autres appareils après connexion.');
  }catch(error){syncNotice(error.message);}
  finally{syncing=false;syncUI();}
 }
 async function updateServer(method,path,body){
  if(!syncAccountId)return false;
  if(syncing){status('Une synchronisation est déjà en cours.');return true;}
  syncing=true;syncUI();
  try{
   const account=await api('/games');
   if(String(account.userId)!==syncAccountId)throw Error('Compte SWAPP différent : modifications refusées. Recharge la page.');
   const payload=await api(path,method,body);
   applyRemote(payload);
   status('Modifications enregistrées sur ton compte SWAPP.');
  }catch(error){status(error.message+' Aucun changement n’a été appliqué.');}
  finally{syncing=false;syncUI();}
  return true;
 }
 function exportSelection(){
  const json=JSON.stringify({format:'swapp-my-games',version:1,exportedAt:now(),games:games.map(x=>({...x}))},null,2);
  const file=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download='swapp-mes-jeux.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  syncNotice('Export enregistré sur cet appareil. Les données ne sont pas envoyées à un tiers.');
 }

 const root=document.querySelector('[data-swapp-library-root]');
 const $=q=>document.querySelector(q);
 const $$=q=>[...document.querySelectorAll(q)];
 const status=(message)=>{
  const element=$('[data-my-games-status]');
  if(element)element.textContent=message;
 };
 function isFollowing(slug){return games.some(game=>game.slug===slug)}
 function articleDate(article){
  const d=article.dataset.storyDate;
  const stamp=Date.parse(d||'');
  return Number.isFinite(stamp)?stamp:0;
 }
 function unseen(card,item){
  if(!item)return 0;
  const since=Math.max(Date.parse(item.followedAt)||0,Date.parse(item.seenAt)||0);
  return [...card.querySelectorAll('[data-story-date]')].filter(a=>articleDate(a)>since).length;
 }
 function updateHomeLink(){
  const nav=$('#home .swapp-home-feature-links');
  if(!nav)return;
  let link=nav.querySelector('[data-my-games-home-link]');
  if(!games.length){link?.remove();return}
  if(!link){
   link=document.createElement('a');
   link.className='swapp-home-feature-cta';
   link.dataset.myGamesHomeLink='1';link.href='/mes-jeux';
   nav.appendChild(link);
  }
  link.textContent='Mes jeux suivis ('+games.length+')';
  link.setAttribute('aria-label','Retrouver mes '+games.length+' jeux suivis');
 }
 function update(){
  const favorites=new Map(games.map(item=>[item.slug,item]));
  $$('[data-swapp-follow-game]').forEach(button=>{
   const slug=button.dataset.gameSlug;
   const picked=favorites.has(slug);
   button.setAttribute('aria-pressed',String(picked));
   button.textContent=picked?'✓ Jeu suivi':'＋ Suivre ce jeu';
   button.setAttribute('aria-label',(picked?'Ne plus suivre ':'Suivre ')+(button.dataset.gameName||slug));
  });
  $$('[data-swapp-favorites-count]').forEach(el=>el.textContent=String(games.length));
  updateHomeLink();
  if(!root)return;
  const followed=root.querySelector('[data-my-games-followed]');
  const explore=root.querySelector('[data-my-games-available]');
  const empty=root.querySelector('[data-my-games-empty]');
  const count=root.querySelector('[data-my-games-count]');
  const cards=[...root.querySelectorAll('[data-swapp-game-card]')];
  const selected=[],others=[];
  for(const card of cards){
   const item=favorites.get(card.dataset.gameSlug);
   const target=item?selected:others;
   target.push(card);
   const label=card.querySelector('[data-my-games-news]');
   const mark=card.querySelector('[data-my-games-mark-seen]');
   const countNew=unseen(card,item);
   if(label){label.hidden=!item||countNew===0;label.textContent=countNew+' nouvelle'+(countNew>1?'s':'')+' actu'+(countNew>1?'s':'');}
   if(mark)mark.hidden=!item||countNew===0;
  }
  // Keep saved titles in user's chosen order; never sort by an engagement score.
  selected.sort((a,b)=>games.findIndex(g=>g.slug===a.dataset.gameSlug)-games.findIndex(g=>g.slug===b.dataset.gameSlug));
  followed.replaceChildren(...selected);
  explore.replaceChildren(...others);
  if(empty)empty.hidden=selected.length>0;
  if(count)count.textContent=String(selected.length);
  const search=root.querySelector('[data-my-games-search]');
  const q=(search?.value||'').trim().toLocaleLowerCase('fr');
  for(const card of others)card.hidden=!!q&&!card.dataset.gameName.toLocaleLowerCase('fr').includes(q);
  const none=root.querySelector('[data-my-games-no-match]');
  if(none)none.hidden=!q||others.some(card=>!card.hidden);
 }
 document.addEventListener('click',async event=>{
  const follow=event.target.closest('[data-swapp-follow-game]');
  if(follow){
   const slug=follow.dataset.gameSlug,game=cleanName(follow.dataset.gameName);
   if(!validSlug(slug)||!game)return;
   const existing=games.find(x=>x.slug===slug);
   const next=existing?games.filter(x=>x.slug!==slug):[...games,{slug,game,followedAt:now(),seenAt:''}];
   if(!existing&&next.length>LIMIT){status('Tu peux suivre 30 jeux au maximum.');follow.textContent='Limite de 30 jeux atteinte';follow.setAttribute('aria-live','polite');return}
   if(syncAccountId){await updateServer(existing?'DELETE':'PUT','/games/'+encodeURIComponent(slug),existing?undefined:{game});return}
   if(!save(next)){status('Enregistrement local indisponible. Autorise le stockage dans ton navigateur.');follow.textContent='Enregistrement indisponible';follow.setAttribute('aria-live','polite');return}
   games=next;update();
   status(existing?'Jeu retiré de ta sélection.':'Jeu ajouté. Les prochaines actualités seront signalées ici.');
   return;
  }
  const seen=event.target.closest('[data-my-games-mark-seen]');
  if(seen){
   const slug=seen.closest('[data-swapp-game-card]')?.dataset.gameSlug;
   if(syncAccountId){await updateServer('PUT','/games/'+encodeURIComponent(slug)+'/seen');return}
   const next=games.map(x=>x.slug===slug?{...x,seenAt:now()}:x);
   if(!save(next)){status('Impossible de sauvegarder cette action.');return}
   games=next;update();status('Nouveautés marquées comme consultées.');
  }
 });
 if(root){
  root.querySelector('[data-my-games-search]')?.addEventListener('input',update);
  root.querySelector('[data-my-games-clear]')?.addEventListener('click',async()=>{
   if(!games.length)return;
   // Deliberately explicit: clearing your library does not delete the account.
   if(!window.confirm(syncAccountId?'Ne plus suivre tous les jeux sur ce compte SWAPP et sur cet appareil ?':'Ne plus suivre tous les jeux sur cet appareil ?'))return;
   if(syncAccountId){await updateServer('DELETE','/games');return}
   if(!save([])){status('Impossible de modifier la sélection.');return}
   games=[];update();status('Sélection locale effacée.');
  });
 }
 // Your account menu is rebuilt by the SPA: attach a single durable, low-noise link.
 const menu=$('#userMenu');
 function menuLink(){
  if(!menu||menu.querySelector('[data-my-games-menu]'))return;
  const a=document.createElement('a');
  a.href='/mes-jeux';a.dataset.myGamesMenu='1';
  a.textContent='Mes jeux suivis';
  const badge=document.createElement('small');badge.setAttribute('data-swapp-favorites-count','');badge.textContent=String(games.length);
  badge.setAttribute('aria-label',' jeux suivis');
  a.append(' ',badge);menu.appendChild(a);
 }
 if(root){
  root.querySelector('[data-my-games-enable-sync]')?.addEventListener('click',()=>{void enableSync()});
  root.querySelector('[data-my-games-disable-sync]')?.addEventListener('click',()=>{
   syncAccountId='';try{localStorage.removeItem(SYNC_KEY)}catch{}
   syncUI();syncNotice('Synchronisation désactivée : les jeux restent sur cet appareil et sur ton compte SWAPP jusqu’à leur suppression explicite.');
  });
  root.querySelector('[data-my-games-export]')?.addEventListener('click',exportSelection);
 }
 if(menu){
  menuLink();
  new MutationObserver(menuLink).observe(menu,{childList:true});
 }
 window.addEventListener('swapp:home-feature-ready',updateHomeLink);
 window.addEventListener('storage',e=>{
  if(e.key===KEY||e.key===null){games=read();update();}
  if(e.key===SYNC_KEY){
   try{const v=JSON.parse(e.newValue||'null');syncAccountId=typeof v?.id==='string'?v.id:''}catch{syncAccountId=''}
   syncUI();if(syncAccountId)void restoreSync();
  }
 });
 update();syncUI();
 if(syncAccountId)void restoreSync();
})();