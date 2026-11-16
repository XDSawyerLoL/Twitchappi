'use strict';
/* Player presence is explicit, temporary and authenticated.
 * A Twitch/ SWAPP link is not proof of being live. Only verified SWAPP feed
 * entries are displayed with the "EN DIRECT" marker.
 */
(()=>{
 const root=document.querySelector('.ss-pro[data-ss-server-id]');if(!root)return;
 const id=String(root.dataset.ssServerId||'');
 if(!/^[a-f0-9]{32}$/.test(id))return;
 const $=selector=>root.querySelector(selector);
 const make=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el};
 const players=$('#ss-lfg-list'),lives=$('#ss-community-lives'),form=$('#ss-lfg-form');
 const remove=$('#ss-lfg-remove'),playerStatus=$('#ss-lfg-status');
 const availableCount=$('#ss-lfg-count'),availableLabel=$('#ss-lfg-count-label');
 const signInHint=$('#ss-lfg-signin');
 const submitButton=form?.querySelector('[type="submit"]');
 const creatorStatus=$('#ss-creator-status'),creatorActions=$('#ss-creator-actions');
 const ownerTwitch=String(root.querySelector('[data-ss-owner-twitch]')?.dataset.ssOwnerTwitch||'');
 const endpoint='/api/swapp/serveurs/'+encodeURIComponent(id);
 let current=null,liveItems=[],liveChecked=false,liveFailure=false;
 const message=(el,value)=>{if(el)el.textContent=String(value||'')};
 function apiError(status,data){
  if(status===401)return 'Connecte-toi à SWAPP depuis la page Mon compte.';
  if(status===403)return 'Action refusée : session ou association de chaîne à vérifier.';
  if(status===404)return 'Cette communauté ou cette association est introuvable.';
  if(status===429)return data?.error==='annonce_trop_recente'?'Patiente une minute avant de renouveler ton annonce.':
   data?.error==='limite_annonces'?'Tu peux être disponible dans trois communautés à la fois.':'Trop de demandes. Réessaie plus tard.';
  if(status===422)return 'Vérifie les informations renseignées.';
  return 'La communauté est momentanément indisponible (HTTP '+status+').';
 }
 async function call(path,body){
  const res=await fetch(endpoint+path,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body||{})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(apiError(res.status,data));
  return data;
 }
 async function refresh(){
  const res=await fetch(endpoint+'/community',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!res.ok)throw Error(apiError(res.status,{}));
  current=await res.json();
  drawPlayers();drawCreators();drawLives();
 }
 const voiceLabel={yes:'Avec vocal',no:'Sans vocal',either:'Vocal au choix'};
 function drawPlayers(){
  if(!players||!current)return;
  players.replaceChildren();
  players.setAttribute('aria-busy','false');
  const entries=Array.isArray(current.players)?current.players:[];
  const mine=Boolean(current.mine?.lfg),anonymous=current.authenticated===false;
  if(remove)remove.hidden=!mine;
  if(signInHint)signInHint.hidden=!anonymous;
  if(submitButton){
   const title=submitButton.querySelector('.ss-lfg-action-label strong');
   const detail=submitButton.querySelector('.ss-lfg-action-label small');
   if(title)title.textContent=anonymous?'Se connecter pour publier':mine?'Actualiser ma disponibilité':'Me rendre disponible';
   if(detail)detail.textContent=anonymous?'Compte SWAPP requis':mine?'Prolonger ma visibilité d’une heure':'Mon annonce sera visible 1 heure';
  }
  if(availableCount)availableCount.textContent=entries.length>=30?'30+':String(entries.length);
  if(availableLabel)availableLabel.textContent=entries.length===0?'Aucun joueur signalé':
   entries.length===1?'Joueur disponible':'Joueurs disponibles';
  if(!entries.length){
   const empty=make('div','ss-lfg-empty');
   const visual=make('span','ss-lfg-empty-icon','✦');visual.setAttribute('aria-hidden','true');
   const content=make('div','ss-lfg-empty-copy');
   content.append(make('strong','','La prochaine équipe commence avec toi.'),
    make('p','','Personne n’a encore publié de disponibilité ici. Fais-toi connaître et invite d’autres joueurs à te rejoindre.'));
   const action=make('button','ss-lfg-empty-action','Publier ma disponibilité');
   action.type='button';
   action.addEventListener('click',()=>{
    form?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'center'});
    form?.elements?.message?.focus();
   });
   empty.append(visual,content,action);players.append(empty);return;
  }
  for(const person of entries){
   const card=make('article','ss-community-player ss-lfg-player');
   const avatar=make('span','ss-lfg-avatar',String(person.name||'J').trim().charAt(0).toUpperCase()||'J');
   avatar.setAttribute('aria-hidden','true');
   const info=make('div','ss-lfg-player-info');
   const first=make('div','ss-community-row ss-lfg-player-heading');
   first.append(make('strong','',person.name||'Joueur SWAPP'));
   if(person.mine)first.append(make('span','ss-community-owner','Mon annonce'));
   info.append(first);
   const note=String(person.message||'').trim();
   if(note)info.append(make('p','',note));
   const meta=make('div','ss-lfg-player-meta');
   meta.append(make('span','ss-lfg-voice-badge',voiceLabel[person.voice]||'Vocal au choix'));
   const expiration=Date.parse(String(person.expires_at||''));
   if(Number.isFinite(expiration)){
    const minutes=Math.ceil((expiration-Date.now())/60000);
    if(minutes>0&&minutes<=60)meta.append(make('small','','Encore '+minutes+' min'));
   }
   info.append(meta);card.append(avatar,info);players.append(card);
  }
 }
 async function submitPlayer(event){
  event.preventDefault();
  if(current?.authenticated===false){window.location.href='/compte';return}
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await call('/lfg',{message:form.elements.message.value,voice:form.elements.voice.value});
   message(playerStatus,'Tu es visible pendant une heure. Les joueurs peuvent maintenant te retrouver dans cette communauté.');
   await refresh();
  }catch(error){message(playerStatus,error.message)}finally{button.disabled=false}
 }
 form?.addEventListener('submit',submitPlayer);
 remove?.addEventListener('click',async()=>{
  remove.disabled=true;
  try{await call('/lfg/remove');message(playerStatus,'Ta disponibilité a été retirée. Tu pourras la republier quand tu voudras.');await refresh()}
  catch(error){message(playerStatus,error.message)}finally{remove.disabled=false}
 });
 async function creatorAction(path,body,success){
  try{await call(path,body);message(creatorStatus,success);await refresh()}
  catch(error){message(creatorStatus,error.message)}
 }
 function drawCreators(){
  if(!current||!creatorActions)return;
  creatorActions.replaceChildren();
  const linked=Array.isArray(current.mine?.creators)?current.mine.creators:[];
  const available=Array.isArray(current.available)?current.available:[];
  for(const creator of available){
   const existing=linked.find(x=>x.platform===creator.platform);
   if(existing){
    const cell=make('div','ss-community-creator-self');
    cell.append(make('small','',creator.platform==='twitch'?'Twitch · '+creator.login:'SWAPP · '+creator.login));
    cell.append(make('span','',existing.status==='pending'?'En attente de validation':'Association validée'));
    const button=make('button','ss-community-secondary','Retirer');
    button.type='button';button.addEventListener('click',()=>creatorAction('/creators/'+encodeURIComponent(existing.id)+'/remove',{},'Association retirée.'));
    cell.append(button);creatorActions.append(cell);
   }else{
    const button=make('button','ss-community-secondary','Associer '+(creator.platform==='twitch'?'Twitch':'SWAPP')+' · '+creator.login);
    button.type='button';button.addEventListener('click',()=>creatorAction('/creators',{platform:creator.platform},'Demande envoyée au responsable du serveur.'));
    creatorActions.append(button);
   }
  }
  if(!available.length)creatorActions.append(make('p','ss-community-empty','Connecte ton compte SWAPP (et Twitch pour associer ta chaîne Twitch).'));
  const mod=$('#ss-creator-moderation'),pending=$('#ss-creator-pending');
  mod.hidden=!current.owner;
  pending.replaceChildren();
  if(current.owner){
   if(!current.pending?.length)pending.append(make('p','ss-community-empty','Aucune demande en attente.'));
   for(const item of (current.pending||[])){
    const card=make('article','ss-community-player');
    card.append(make('strong','',item.platform.toUpperCase()+' · '+item.login));
    for(const [decision,label] of [['approved','Accepter'],['rejected','Refuser']]){
     const button=make('button','ss-community-secondary',label);button.type='button';
     button.addEventListener('click',()=>creatorAction('/creators/'+encodeURIComponent(item.id)+'/moderate',{decision},decision==='approved'?'Association approuvée.':'Demande refusée.'));
     card.append(button);
    }
    pending.append(card);
   }
  }
 }
 function normalizedLive(raw,defaultPlatform){
  const p=String(raw?.platform||defaultPlatform||'').toLowerCase();
  const platform=['swapp','oryon','native'].includes(p)?'swapp':'twitch';
  const login=String(raw?.login||raw?.user_login||raw?.host_login||raw?.room||'').trim().toLowerCase();
  if(!(platform==='twitch'?/^[a-z0-9_]{2,25}$/:/^[a-z0-9_][a-z0-9_-]{1,39}$/).test(login))return null;
  const audience=raw?.viewer_count??raw?.viewers;
  const n=(typeof audience==='number'&&Number.isSafeInteger(audience)&&audience>=0)?audience:null;
  let thumb='';
  try{
   const uri=new URL(String(raw?.thumbnail_url||raw?.img||raw?.banner_url||'').replaceAll('{width}','640').replaceAll('{height}','360'));
   const host=uri.hostname.toLowerCase();
   if(uri.protocol==='https:'&&!uri.username&&!uri.password&&
    (host==='static-cdn.jtvnw.net'||host.endsWith('.jtvnw.net')||host.endsWith('.twitchcdn.net')||host==='swapp.tv'))thumb=uri.href;
  }catch(_){}
  return {platform,login,title:String(raw?.title||'Direct en cours').slice(0,140),
   game:String(raw?.game_name||raw?.category||raw?.game||'').slice(0,70),
   viewers:n,thumb};
 }
 async function getVerifiedLives(){
  const sources=[['/api/discovery/home-lives?limit=80&lang=fr','swapp'],
   ['/api/twitch/streams/top?limit=100&lang=fr','twitch']];
  const output=await Promise.allSettled(sources.map(async([url,platform])=>{
   const r=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('Source indisponible');
   const data=await r.json();if(!Array.isArray(data?.items))throw Error('Source invalide');
   return data.items.map(item=>normalizedLive(item,platform)).filter(Boolean);
  }));
  liveChecked=output.some(x=>x.status==='fulfilled');
  liveFailure=output.some(x=>x.status==='rejected');
  const found=new Map();
  for(const entry of output)if(entry.status==='fulfilled')for(const item of entry.value)found.set(item.platform+':'+item.login,item);
  liveItems=[...found.values()];
  drawLives();
 }
 function drawLives(){
  if(!lives||!current)return;
  lives.replaceChildren();
  const members=Array.isArray(current.creators)?current.creators:[],affiliates=new Map();
  for(const c of members)affiliates.set(c.platform+':'+c.login,{...c,source:'Créateur approuvé'});
  if(/^[a-z0-9_]{2,25}$/.test(ownerTwitch)&&!affiliates.has('twitch:'+ownerTwitch))
   affiliates.set('twitch:'+ownerTwitch,{platform:'twitch',login:ownerTwitch,source:'Chaîne renseignée sur la fiche'});
  if(!liveChecked&&!liveFailure){
   lives.append(make('p','ss-community-empty','Vérification des directs…'));return;
  }
  const active=[...affiliates.values()].map(person=>({...person,live:liveItems.find(l=>l.platform===person.platform&&l.login===person.login)}))
   .filter(c=>Boolean(c.live));
  const inactive=[...affiliates.values()].filter(c=>!active.some(x=>x.platform===c.platform&&x.login===c.login));
  for(const item of active){
   const card=make('article','ss-community-live');
   if(item.live.thumb){
    const art=make('img','ss-community-live-art');art.src=item.live.thumb;art.alt='';art.loading='lazy';art.referrerPolicy='no-referrer';card.append(art);
   }
   const info=make('div','ss-community-live-info');
   info.append(make('span','ss-community-onair','EN DIRECT'),make('strong','',item.login),make('small','',item.source));
   info.append(make('p','',item.live.title));
   const meta=item.live.game+(item.live.viewers===null?'':' · '+item.live.viewers.toLocaleString('fr-FR')+' spectateurs');
   info.append(make('small','',meta));
   const open=make('a','ss-community-watch','Regarder sur SWAPP');
   open.href=item.platform==='swapp'?'/'+encodeURIComponent(item.login):'/live/twitch/'+encodeURIComponent(item.login);
   info.append(open);card.append(info);lives.append(card);
  }
  if(!active.length)lives.append(make('p','ss-community-empty',liveChecked?
   'Aucun direct associé confirmé dans les flux actuellement remontés par SWAPP.':
   'Vérification des directs momentanément indisponible.'));
  for(const item of inactive){
   const card=make('div','ss-community-offair');
   card.append(make('strong','',item.login),make('small','',item.source+' · Direct non confirmé'));
   const link=make('a','','Consulter la chaîne');
   link.href=item.platform==='swapp'?'/'+encodeURIComponent(item.login):'/live/twitch/'+encodeURIComponent(item.login);
   card.append(link);lives.append(card);
  }
  if(!affiliates.size)lives.append(make('p','ss-community-empty','Aucun créateur associé pour le moment.'));
  if(liveFailure)lives.append(make('small','ss-community-source-note','Certaines sources de directs ne répondent pas : résultats potentiellement incomplets.'));
 }
 async function init(){
  try{await refresh()}catch(error){
   message(playerStatus,error.message);
   if(players){
    players.setAttribute('aria-busy','false');
    players.replaceChildren(make('p','ss-community-empty','Impossible de vérifier les disponibilités pour le moment.'));
   }
   if(availableCount)availableCount.textContent='—';
   if(availableLabel)availableLabel.textContent='Données non vérifiées';
   lives.replaceChildren(make('p','ss-community-empty','Impossible de vérifier les créateurs de cette communauté.'));
   return;
  }
  getVerifiedLives().catch(()=>{liveFailure=true;drawLives()});
 }
 init();
 // Presence expires after 60 minutes. Update the visible module each minute.
 // Keep external Twitch/SWAPP discovery at its existing 5-minute cadence.
 const presenceTicker=setInterval(()=>{
  if(document.visibilityState!=='visible')return;
  refresh().catch(()=>{
   if(availableCount)availableCount.textContent='—';
   if(availableLabel)availableLabel.textContent='Mise à jour indisponible';
  });
 },60*1000);
 const liveTicker=setInterval(()=>{
  if(document.visibilityState!=='visible')return;
  getVerifiedLives().catch(()=>{});
 },5*60*1000);
 window.addEventListener('pagehide',()=>{
  clearInterval(presenceTicker);clearInterval(liveTicker);
 },{once:true});
})();
