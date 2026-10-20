/* Mairy for SWAPP: opt-in on-page guide and real event notifications.
 * No microphone, push permission, telemetry, fake AI output or external prompt service.
 */
(()=>{'use strict';
 const core=window.SwappCompanionCore;
 if(!core||document.getElementById('swappCompanion'))return;
 const KEY='swapp_companion_preferences_v1';
 const state={open:false,tab:'mairy',live:false,news:false,unread:0,events:[],
  snapshots:{live:null,news:null},seen:{live:new Set(),news:new Set()},busy:false,polling:false,timer:null};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
  state.live=saved.live===true;state.news=saved.news===true;
 }catch(_){}
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({live:state.live,news:state.news}))}catch(_){}};
 const node=(tag,klass,value)=>{
  const element=document.createElement(tag);
  if(klass)element.className=klass;
  if(value!==undefined)element.textContent=String(value);
  return element;
 };
 const root=node('aside','swapp-companion');
 root.id='swappCompanion';
 root.setAttribute('aria-label','Mairy et événements SWAPP');
 root.innerHTML=`<div class="swapp-companion-toast" role="status" aria-live="polite" hidden>
  <span class="swapp-companion-toast-text"></span><button type="button" aria-label="Masquer la notification">×</button>
 </div>
 <section class="swapp-companion-panel" id="swappCompanionPanel" aria-label="Mairy, guide SWAPP" hidden>
  <header class="swapp-companion-heading">
    <span class="swapp-companion-small-face" aria-hidden="true"><i></i></span>
    <span><strong>Mairy</strong><small>Ton guide dans SWAPP</small></span>
    <button class="swapp-companion-close" type="button" aria-label="Fermer Mairy">×</button>
  </header>
  <div class="swapp-companion-tabs" role="tablist" aria-label="Mairy et événements">
   <button type="button" data-swapp-tab="mairy" role="tab" aria-selected="true" aria-controls="swappCompanionGuide" id="swappCompanionGuideTab">Discuter</button>
   <button type="button" data-swapp-tab="events" role="tab" aria-selected="false" aria-controls="swappCompanionEvents" id="swappCompanionEventsTab">Événements <span class="swapp-companion-tab-count" hidden></span></button>
   <button type="button" data-swapp-tab="community" role="tab" aria-selected="false" aria-controls="swappCompanionCommunity" id="swappCompanionCommunityTab">Social</button>
  </div>
  <div class="swapp-companion-pane" id="swappCompanionGuide" role="tabpanel" aria-labelledby="swappCompanionGuideTab">
   <p class="swapp-companion-intro">Je t'aide à trouver un direct, une actualité ou une fonctionnalité de SWAPP.</p>
   <div class="swapp-companion-suggestions">
    <button type="button" data-swapp-ask="Quels créateurs sont en direct ?">Voir les directs</button>
    <button type="button" data-swapp-ask="Quelles sont les actualités ?">Lire les actualités</button>
    <button type="button" data-swapp-ask="Comment personnaliser la couleur ?">Personnaliser SWAPP</button>
   </div>
   <div class="swapp-companion-conversation" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation avec Mairy"></div>
   <form class="swapp-companion-form"><label class="swapp-visually-hidden" for="swappCompanionQuestion">Question pour Mairy</label><input id="swappCompanionQuestion" type="text" maxlength="180" autocomplete="off" placeholder="Pose une question à Mairy…" required><button type="submit" aria-label="Envoyer la question">➜</button></form>
   <p class="swapp-companion-disclaimer">Guide local relié aux données publiques SWAPP. Pas de voix ni d'IA conversationnelle simulées.</p>
  </div>
  <div class="swapp-companion-pane" id="swappCompanionEvents" role="tabpanel" aria-labelledby="swappCompanionEventsTab" hidden>
   <p class="swapp-companion-intro">Choisis les événements à suivre. Aucun signalement avant ton accord.</p>
   <label class="swapp-companion-option"><span>Créateurs en direct <small>Nouveaux directs détectés pendant ta visite</small></span><input type="checkbox" data-swapp-watch="live"></label>
   <label class="swapp-companion-option"><span>Actualités <small>Nouveaux articles publiés pendant ta visite</small></span><input type="checkbox" data-swapp-watch="news"></label>
   <div class="swapp-companion-events-list" aria-live="polite"></div>
   <p class="swapp-companion-disclaimer">Contrôles effectués lorsque l'onglet est visible. Réglages enregistrés uniquement sur ton appareil. Aucune notification système.</p>
  </div>
  <div class="swapp-companion-pane" id="swappCompanionCommunity" role="tabpanel" aria-labelledby="swappCompanionCommunityTab" hidden>
   <p class="swapp-companion-intro">Découvre les dernières publications de SOCIAL, le réseau communautaire intégré à SWAPP.</p>
   <p class="swapp-companion-disclaimer">Aperçu des publications publiques. Ouvre Social pour accéder aux profils, messages, abonnements et discussions.</p>
   <div class="swapp-companion-community-list" aria-live="polite"></div>
   <button type="button" class="swapp-companion-reload">Actualiser les publications</button>
  </div>
 </section>
 <div class="swapp-companion-dock">
  <button type="button" class="swapp-companion-bell" aria-controls="swappCompanionPanel" aria-expanded="false" aria-label="Consulter les événements SWAPP"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="swapp-companion-unread" hidden></span></button>
  <button type="button" class="swapp-companion-launch" aria-controls="swappCompanionPanel" aria-expanded="false" aria-label="Parler à Mairy"><span class="swapp-mairy-face" aria-hidden="true"><i class="swapp-mairy-eyes"></i><i class="swapp-mairy-mouth"></i></span><span class="swapp-companion-name">Mairy</span></button>
 </div>`;
 const launcher=root.querySelector('.swapp-companion-launch');
 const bell=root.querySelector('.swapp-companion-bell');
 const panel=root.querySelector('.swapp-companion-panel');
 const closeButton=root.querySelector('.swapp-companion-close');
 const tabs=[...root.querySelectorAll('[data-swapp-tab]')];
 const panes={mairy:root.querySelector('#swappCompanionGuide'),events:root.querySelector('#swappCompanionEvents'),community:root.querySelector('#swappCompanionCommunity')};
 const question=root.querySelector('#swappCompanionQuestion');
 const form=root.querySelector('.swapp-companion-form');
 const conversation=root.querySelector('.swapp-companion-conversation');
 const list=root.querySelector('.swapp-companion-events-list');
 const communityList=root.querySelector('.swapp-companion-community-list');
 const badge=root.querySelector('.swapp-companion-unread');
 const tabCount=root.querySelector('.swapp-companion-tab-count');
 const toast=root.querySelector('.swapp-companion-toast');
 const toastText=root.querySelector('.swapp-companion-toast-text');
 const toggles=[...root.querySelectorAll('[data-swapp-watch]')];
 let toastTimer;
 function sync(){
  panel.hidden=!state.open;
  launcher.setAttribute('aria-expanded',String(state.open));
  bell.setAttribute('aria-expanded',String(state.open&&state.tab==='events'));
  for(const tab of tabs){
   const selected=tab.dataset.swappTab===state.tab;
   tab.setAttribute('aria-selected',String(selected));
   tab.tabIndex=selected?0:-1;
  }
  for(const [name,pane] of Object.entries(panes))pane.hidden=state.tab!==name;
  badge.hidden=state.unread===0;
  badge.textContent=state.unread>9?'9+':String(state.unread);
  tabCount.hidden=state.unread===0;
  tabCount.textContent=String(state.unread);
  toggles.forEach(el=>{el.checked=state[el.dataset.swappWatch]===true});
  if(state.open&&state.tab==='events'){state.unread=0;badge.hidden=true;tabCount.hidden=true}
 }
 function show(tab,fromButton){
  state.tab=tab;state.open=true;sync();
  if(tab==='events')renderEvents();
  if(tab==='community')loadCommunity();
  if(fromButton)requestAnimationFrame(()=>{(tab==='mairy'?question:tabs.find(x=>x.dataset.swappTab===tab))?.focus()});
 }
 function dismiss(){
  state.open=false;sync();
 }
 function addReply(text,links){
  const row=node('div','swapp-companion-message is-mairy');
  row.append(node('span','swapp-companion-message-by','Mairy'),node('p','',text));
  if(Array.isArray(links)&&links.length){
   const group=node('div','swapp-companion-response-links');
   for(const info of links.slice(0,3)){
    if(typeof info.href!=='string'||!info.href.startsWith('/')||info.href.startsWith('//'))continue;
    const anchor=node('a','',info.label);anchor.href=info.href;group.append(anchor);
   }
   row.append(group);
  }
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
 }
 function appendQuestion(text){
  const row=node('div','swapp-companion-message is-visitor');
  row.append(node('span','swapp-companion-message-by','Vous'),node('p','',text));
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
 }
 async function readJson(path){
  const response=await fetch(path,{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
 }
 async function answer(text){
  if(state.busy)return;
  const q=core.clean(text);
  if(!q)return;
  state.busy=true;
  question.disabled=true;
  appendQuestion(q);
  const query=core.normalize(q);
  try{
   if(/(?:\blives?\b|\bdirects?\b|\bstreams?\b|\bjoue(?:nt)?\b|\bcreateurs?\b|\bregarder\b)/.test(query)){
    const results=core.lives(await readJson('/api/discovery/home-lives?limit=30&lang=fr'));
    if(!results.length)return addReply('Aucun direct disponible dans les données SWAPP pour le moment.',[{href:'/decouvrir',label:'Explorer les créateurs'}]);
    const choices=core.suggest(q,results);
    if(!choices.length)return addReply('Aucun direct confirmé pour ce jeu parmi les données SWAPP actuellement disponibles.',[{href:'/decouvrir',label:'Explorer les créateurs'}]);
    addReply(choices.length+' créateur'+(choices.length>1?'s':'')+' à découvrir parmi les directs disponibles :',
     choices.map(item=>({href:item.href,label:item.title+(item.game?' · '+item.game:'')})));
   }else if(/(?:\bactu(?:alite|alites|s)?\b|\barticles?\b|\bnouvelles?\b|\binfos?\b|\bnews\b)/.test(query)){
    const results=core.news(await readJson('/api/actus'));
    if(!results.length)return addReply('Aucun article disponible actuellement.',[{href:'/actus',label:'Ouvrir Actualité'}]);
    const matches=core.suggest(q,results);
    if(!matches.length)return addReply('Aucune actualité confirmée pour ce jeu dans le catalogue SWAPP.',[{href:'/actus',label:'Toutes les actualités'}]);
    addReply('Voici des articles disponibles dans SWAPP :',matches.map(item=>({href:item.href,label:item.title})));
   }else if(/(?:\bcouleur\b|\btheme\b|\bapparence\b|\bpersonnalis)/.test(query)){
    addReply('Pour changer les couleurs, ouvre Compte, puis Apparence. Ton choix est appliqué dans SWAPP, y compris Actualité.',[{href:'/compte',label:'Mon compte'}]);
   }else if(/(?:\bnotification\b|\bevenement\b|\balerte\b|\bprevenir\b)/.test(query)){
    addReply('Tu peux suivre les directs et les actualités en activant les catégories dans Événements. Rien n’est activé automatiquement.');
    show('events',false);
   }else if(/(?:\bcommunaute\b|\bsocial\b|\bdiscussion\b|\bmessage\b)/.test(query)){
    addReply('La rubrique Social donne accès aux publications, profils, messages privés et groupes. Ton compte SWAPP suffit pour y participer.');
    show('community',false);
   }else{
    addReply('Je peux te montrer les directs disponibles, les dernières actualités, les réglages de couleurs et les événements. Quelle partie veux-tu explorer ?');
   }
  }catch(_){
   addReply('Je n’arrive pas à consulter les données en direct. Tu peux toujours parcourir SWAPP.',[
    {href:'/decouvrir',label:'Découvrir les lives'},{href:'/actus',label:'Lire les actualités'}]);
  }finally{state.busy=false;question.disabled=false}
 }
let loadingCommunity=false;
 async function loadCommunity(){
  if(loadingCommunity)return;
  loadingCommunity=true;
  communityList.replaceChildren(node('p','swapp-companion-empty','Chargement des publications publiques…'));
  try{
   const data=await readJson('/api/swapp/social-preview');
   if(data.success!==true||!Array.isArray(data.posts))throw Error('unavailable');
   communityList.replaceChildren();
   for(const post of data.posts.slice(0,5)){
    if(!post||typeof post.body!=='string')continue;
    const card=node('article','swapp-companion-post');
    card.append(node('strong','',core.clean(post.author||'Membre SOCIAL')));
    if(post.handle)card.append(node('small','', '@'+core.clean(post.handle)));
    card.append(node('p','',String(post.body).slice(0,420)));
    communityList.append(card);
   }
   if(!communityList.children.length){
    communityList.append(node('p','swapp-companion-empty','Aucune publication publique disponible actuellement.'));
   }
   const openAll=node('a','swapp-companion-reload','Ouvrir le réseau SOCIAL →');openAll.href='/communaute';communityList.append(openAll);
  }catch(_){
   communityList.replaceChildren(node('p','swapp-companion-empty','SOCIAL ne répond pas actuellement. Aucun contenu fictif n’est affiché.'));
  }finally{loadingCommunity=false}
 }
 function renderEvents(){
  list.replaceChildren();
  if(!state.live&&!state.news){
   list.append(node('p','swapp-companion-empty','Active une catégorie pour suivre ses nouveautés.'));
   return;
  }
  if(!state.events.length){
   list.append(node('p','swapp-companion-empty','Aucun nouvel événement depuis l’activation. Les événements déjà en cours ne déclenchent pas d’alerte.'));
   return;
  }
  for(const item of state.events){
   const card=node('a','swapp-companion-event');card.href=item.href;
   card.append(node('span','swapp-companion-event-type',item.kind==='live'?'EN DIRECT':'ACTUALITÉ'),
    node('strong','',item.title),node('small','',item.detail));
   list.append(card);
  }
 }
 function watching(){
  return core.isWatching(location.pathname,document.querySelector('.view.active')?.id)||
   !!document.fullscreenElement;
 }
 function notify(event){
  if(document.visibilityState!=='visible'||watching()||(state.open&&state.tab==='events'))return;
  toastText.textContent=event.title;
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.hidden=true},6500);
 }
 function publish(event){
  state.events.unshift(event);
  state.events.length=Math.min(state.events.length,12);
  if(!(state.open&&state.tab==='events'))state.unread=Math.min(9,state.unread+1);
  sync();renderEvents();notify(event);
 }
 async function refresh(){
  if(!state.live&&!state.news)return;
  if(document.visibilityState!=='visible'||state.busy||state.polling)return;
  state.polling=true;
  const jobs=[];
  for(const kind of ['live','news']){
   if(!state[kind])continue;
   jobs.push((async()=>{
    try{
     const data=await readJson(kind==='live'?'/api/discovery/home-lives?limit=35&lang=fr':'/api/actus');
     const current=kind==='live'?core.lives(data):core.news(data);
     const before=state.snapshots[kind];
     const fresh=core.newlySeen(before,current).filter(item=>!state.seen[kind].has(item.id));
     state.snapshots[kind]=current;
     for(const item of current)state.seen[kind].add(item.id);
     for(const item of fresh)if(state[kind])publish(item);
    }catch(_){
     // Failure does not establish a baseline or manufacture a new event.
    }
   })());
  }
  try{await Promise.allSettled(jobs)}finally{state.polling=false}
 }
 function startChecks(){
  if(state.timer)clearInterval(state.timer);
  if(state.live||state.news){state.timer=setInterval(refresh,120000);refresh()};
 }
 launcher.addEventListener('click',()=>state.open&&state.tab==='mairy'?dismiss():show('mairy',true));
 bell.addEventListener('click',()=>state.open&&state.tab==='events'?dismiss():show('events',true));
 closeButton.addEventListener('click',()=>{
  dismiss();
  (state.tab==='events'?bell:launcher).focus();
 });
 tabs.forEach(tab=>tab.addEventListener('click',()=>show(tab.dataset.swappTab,false)));
 tabs.forEach((tab,index)=>tab.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
   (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  show(tabs[next].dataset.swappTab,false);
  tabs[next].focus();
 }));
 root.querySelector('.swapp-companion-reload').addEventListener('click',loadCommunity);
 root.querySelectorAll('[data-swapp-ask]').forEach(button=>button.addEventListener('click',()=>answer(button.dataset.swappAsk)));
 form.addEventListener('submit',event=>{
  event.preventDefault();const value=question.value;question.value='';answer(value);
 });
 toggles.forEach(toggle=>toggle.addEventListener('change',()=>{
  const kind=toggle.dataset.swappWatch;
  state[kind]=toggle.checked;
  state.snapshots[kind]=null;
  state.seen[kind].clear();
  save();renderEvents();startChecks();
 }));
 root.querySelector('.swapp-companion-toast button').addEventListener('click',()=>{toast.hidden=true});
 toast.addEventListener('click',event=>{
  if(event.target.closest('button'))return;
  toast.hidden=true;show('events',false);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.open){dismiss();launcher.focus()}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')refresh();
  else toast.hidden=true;
 });
 document.body.append(root);
 sync();renderEvents();startChecks();
})();
