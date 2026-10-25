(()=>{'use strict';
const $=id=>document.getElementById(id);
if(!$('swapp-tv'))return;
const by=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node};
const api=async(path,options={})=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'service_unavailable');return data};
const safeLogin=s=>/^[a-z0-9_]{3,25}$/.test(String(s||'').toLowerCase());
const gameOf=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
const gamesFrom=data=>[...new Set((Array.isArray(data.articles)?data.articles:[]).filter(x=>x?.slug&&x.status!=='draft').map(gameOf).filter(x=>x.length>1))].slice(0,16);
const state={queue:null,selection:null,playing:null,discovery:[],index:0,consent:false,autoAdvance:false,games:[],queueMode:false};
const setText=(id,text)=>{$(id).textContent=text};
function renderQueue(data){
 const waiting=Array.isArray(data.waiting)?data.waiting:[],enabled=Boolean(data.enabled);
 const access=$('stv-creator-access');
 if(access)access.hidden=false; // Keep the queue visible even while enrollment is closed.
 $('stv-join').disabled=!enabled||!state.games.length;
 $('stv-leave').disabled=!enabled;
 setText('stv-queue-status',!enabled?'Inscriptions suspendues pour le moment. La file reste visible et les inscriptions reprendront quand la régie sera prête.':
  data.director_enabled?'File accessible. Chaque direct est vérifié avant de passer à l’antenne.':
  'File accessible, mais les passages à l’antenne sont actuellement suspendus.');
 setText('stv-creator-hint',enabled?'Rejoindre la file SWAPP TV':'Inscriptions fermées temporairement');
 setText('stv-next-title',enabled?'CRÉATEURS EN ATTENTE':'FILE D’ATTENTE · PAUSE');
 setText('stv-queue-count',enabled?(waiting.length>=100?'100+ en attente':waiting.length+' en attente'):'Inscriptions fermées');
}
function rail(data){
 const list=$('stv-next-list');list.replaceChildren();
 let rows=[];
 if(Array.isArray(data?.waiting)&&data.waiting.length)rows=data.waiting.slice(0,5).map(x=>({name:x.creator_login,game:x.game,desc:'En attente de vérification'}));
 else if(!data?.enabled)rows=state.discovery.slice(state.index+1,state.index+5).map(x=>({name:x.display_name||x.login,game:x.game,desc:'Découverte, non programmé'}));
 if(!rows.length){list.append(by('p',null,data?.enabled?'Aucune inscription en attente.':'File momentanément fermée. Aucun créateur en attente.'));return}
 for(const x of rows){const card=by('div','stv-next-item');card.append(by('strong',null,x.name||'Créateur'),by('small',null,(x.game||'Jeu')+' · '+x.desc));list.append(card)}
}
function renderScreen(item,{onAir=false}={}){
 const login=String(item?.twitch_login||item?.login||'').toLowerCase(),valid=safeLogin(login)&&String(item?.platform||'twitch')==='twitch';
 state.selection=valid?{login,game:item.game||item.game_name||'Jeu',name:item.creator_login||item.display_name||login,onAir}:null;
 const same=state.playing===login&&state.consent&&valid;
 if(!same){state.consent=false;state.playing=null;const layer=$('stv-screen').querySelector('.stv-player-layer');if(layer)layer.remove();$('stv-screen-inner').hidden=false;}
 if(typeof updateTwitchChat==='function')updateTwitchChat();
 const name=state.selection?.name||'Antenne en préparation';
 setText('stv-now-name',name);setText('stv-now-game',state.selection?.game||'En attente de programmation');
 setText('stv-screen-game',state.selection?.game?.toUpperCase()||'GAME UNIVERSE');
 $('stv-watch').disabled=!state.selection;
 $('stv-air-state').textContent=onAir&&valid?'ANTENNE ACTIVE':valid?'DÉCOUVERTE':'HORS ANTENNE';
 $('stv-air-state').style.color=onAir&&valid?'var(--tv-accent,#67dce8)':'';
 setText('stv-stage-status',onAir&&valid?'Créateur sélectionné par la régie SWAPP TV.':valid?'Direct trouvé dans la découverte. Lecture volontaire, sans garantie de maintien en ligne.':'Aucun passage vérifié à cette heure.');
 // A single voluntary Play authorises subsequent verified TV transitions.
 // Do not auto-start public discovery or silently start before first consent.
 if(state.autoAdvance&&onAir&&valid&&!same)play();
 else syncWatchButton();
}
function syncWatchButton(){
 const watching=Boolean(state.selection&&state.playing===state.selection.login&&state.consent);
 setText('stv-watch',watching?'■ ARRÊTER':'▶ REGARDER');
 $('stv-watch').setAttribute('aria-pressed',String(watching));
}
function stopPlayback(){
 state.consent=false;state.playing=null;state.autoAdvance=false;
 $('stv-screen').querySelector('.stv-player-layer')?.remove();
 $('stv-screen-inner').hidden=false;
 syncWatchButton();
}
function play(){
 const item=state.selection;if(!item||!safeLogin(item.login))return;
 const screen=$('stv-screen');screen.querySelector('.stv-player-layer')?.remove();
 const layer=by('div','stv-player-layer');const frame=by('iframe');frame.title='Direct Twitch de '+item.name;const parent=location.hostname;
 frame.src='https://player.twitch.tv/?'+new URLSearchParams({channel:item.login,parent,autoplay:'true',muted:'true'});
 frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
 layer.append(frame,by('div','stv-player-overlay','SWAPP TV  /  '+(item.onAir?'À L’ANTENNE':'DÉCOUVERTE')));
 screen.append(layer);$('stv-screen-inner').hidden=true;state.playing=item.login;state.consent=true;
 // Resume subsequent 10-minute TV slots only if the user started an actual
 // on-air relay. Browser embedding is muted to respect autoplay policy.
 state.autoAdvance=Boolean(item.onAir);
 syncWatchButton();
}
async function refreshQueue(){
 try{
  const data=await api('/api/swapp-tv/queue/status');state.queue=data;state.queueMode=Boolean(data.enabled);
  renderQueue(data);rail(data);
  if(data.enabled){const item=data.director_enabled?data.on_air:null;
   if(!item||!safeLogin(item.twitch_login))renderScreen(null);
   else if(!state.selection||state.selection.login!==String(item.twitch_login).toLowerCase()||!state.selection.onAir)renderScreen(item,{onAir:true});
  }
  return data;
 }catch{const data={enabled:false,director_enabled:false,waiting:[]};state.queue=data;state.queueMode=false;renderQueue(data);rail(data);return data}
}
// Rotate discovery across games and creators without using viewer counts.
// Input from the game-live endpoint may be ordered by popularity; that
// provider order must not decide who appears first on SWAPP TV.
function fairDiscovery(candidates,rotation=Math.floor(Date.now()/600000)){
 const hash=value=>{
  let n=2166136261;
  for(const ch of String(value)){n=Math.imul(n^ch.charCodeAt(0),16777619)}
  return n>>>0;
 };
 const buckets=new Map();
 for(const item of Array.isArray(candidates)?candidates:[]){
  const game=String(item?.game||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(!game)continue;
  if(!buckets.has(game))buckets.set(game,[]);
  buckets.get(game).push(item);
 }
 const gameKeys=[...buckets.keys()].sort((a,b)=>
  hash(rotation+':'+a)-hash(rotation+':'+b)||a.localeCompare(b));
 for(const key of gameKeys){
  buckets.get(key).sort((a,b)=>
   hash(rotation+':'+String(a.login))-hash(rotation+':'+String(b.login))||
   String(a.login).localeCompare(String(b.login)));
 }
 const result=[];
 while(gameKeys.length){
  for(let i=gameKeys.length-1;i>=0;i--){
   const group=buckets.get(gameKeys[i]);
   if(group.length)result.push(group.shift());
   if(!group.length)gameKeys.splice(i,1);
  }
 }
 return result;
}
async function discovery(){
 if(state.queueMode)return;
 const found=[],keys=new Set();
 for(const game of state.games.slice(0,5)){
  try{const result=await api('/api/discovery/game-lives?game='+encodeURIComponent(game)+'&limit=12');
   for(const x of Array.isArray(result.items)?result.items:[]){
    const login=String(x.login||'').toLowerCase(),platform=String(x.platform||'').toLowerCase(),key=platform+':'+login;
    if(platform!=='twitch'||!safeLogin(login)||keys.has(key))continue;
    if(String(x.game_name||x.game||'').trim().toLocaleLowerCase()!==game.toLocaleLowerCase())continue;
    keys.add(key);found.push({...x,game,platform});
   }
  }catch{}
 }
 const ordered=fairDiscovery(found);
 const active=!state.selection?.onAir&&ordered.find(item=>item.login===state.selection?.login);
 state.discovery=ordered;
 state.index=active?ordered.indexOf(active):0;
 // Periodic discovery refresh must never tear down a stream the viewer
 // deliberately launched if its login is still in the verified result set.
 if(!state.queueMode){
  if(!active)renderScreen(ordered[0]||null);
  rail(null);
 }
}
async function mutate(method){
 const node=$('stv-queue-status');node.textContent='Vérification de ton compte…';
 try{
  const body=method==='POST'?JSON.stringify({game:$('stv-game').value}):undefined;
  const response=await api('/api/swapp-tv/queue',{method,headers:{'Content-Type':'application/json','X-SWAPP-SPOTLIGHT-ACTION':'creator'},...(body?{body}:{})});
  await refreshQueue();
  node.textContent=method==='POST'?'Inscription enregistrée. Le passage dépend de la disponibilité et de la régie.':response.left?'Inscription retirée.':'Aucune inscription en attente à retirer.';
 }catch(e){node.textContent=({'swapp_account_required':'Connecte-toi à SWAPP pour rejoindre la file.','verified_twitch_link_required':'Relie d’abord ton compte Twitch.','already_in_queue':'Tu es déjà dans la file.','spotlight_game_not_covered':'Aucun article publié ne couvre ce jeu.','game_not_found_on_twitch':'Jeu non reconnu exactement sur Twitch.'}[e.message]||'Action impossible actuellement : '+e.message)}
}

// Channel UI: one modal programme + Twitch chat for the selected creator,
// SWAPP's existing MySQL chat room for everyone on the platform.
const programme=$('stv-program-dialog');
const programmeTrigger=$('stv-program-open');
programmeTrigger?.addEventListener('click',()=>{
 if(programme?.showModal&&!programme.open){programmeTrigger.setAttribute('aria-expanded','true');programme.showModal();}
});
$('stv-program-close')?.addEventListener('click',()=>programme?.close());
programme?.addEventListener('close',()=>{programmeTrigger?.setAttribute('aria-expanded','false');programmeTrigger?.focus();});
programme?.addEventListener('click',e=>{if(e.target===programme)programme.close()});
const dock=$('stv-dock'),dockToggle=$('stv-dock-toggle'),dockScrim=$('stv-dock-scrim');
const dockMobile=window.matchMedia('(max-width:720px)');
const tabs=[
 {kind:'twitch',tab:$('stv-tab-twitch'),pane:$('stv-pane-twitch')},
 {kind:'swapp',tab:$('stv-tab-swapp'),pane:$('stv-pane-swapp')},
 {kind:'queue',tab:$('stv-tab-queue'),pane:$('stv-pane-queue')}
];
let activeDock='twitch';
function synchronizeDock(){
 const mobile=dockMobile.matches;
 const open=dock.classList.contains('is-open')&&mobile;
 dockToggle.setAttribute('aria-expanded',String(open));
 dockScrim.hidden=!open;
 dock.setAttribute('aria-hidden',String(mobile&&!open));
 dock.inert=mobile&&!open;
 if(!mobile)dock.classList.remove('is-open');
}
function closeDock(){
 dock.classList.remove('is-open');synchronizeDock();
 if(dockMobile.matches)dockToggle.focus();
}
dockToggle.addEventListener('click',()=>{
 dock.classList.toggle('is-open');synchronizeDock();
 if(dock.classList.contains('is-open'))tabs.find(x=>x.kind===activeDock)?.tab.focus();
});
dockScrim.addEventListener('click',closeDock);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&dock.classList.contains('is-open'))closeDock();
});
dockMobile.addEventListener?.('change',synchronizeDock);
synchronizeDock();
const showChat=kind=>{
 activeDock=kind;
 $('stv-chat-area').hidden=kind==='queue';
 for(const x of tabs){
  const active=x.kind===kind;
  x.tab.setAttribute('aria-selected',String(active));
  x.tab.tabIndex=active?0:-1;
  x.pane.hidden=!active;
 }
 if(kind==='twitch')updateTwitchChat();
 if(kind==='swapp')void refreshSwappChat();
};
for(const [index,x] of tabs.entries()){
 x.tab.addEventListener('click',()=>showChat(x.kind));
 x.tab.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:
   (index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
  showChat(tabs[next].kind);tabs[next].tab.focus();
 });
}
let embeddedTwitch='';
showChat('twitch');
function updateTwitchChat(){
 const target=$('stv-twitch-chat');
 if(!target)return;
 const login=state.selection?.login||'';
 if($('stv-pane-twitch').hidden)return;
 if(!safeLogin(login)){
  embeddedTwitch='';target.replaceChildren(by('p',null,'Le tchat Twitch apparaîtra lorsqu’un direct sera sélectionné.'));return;
 }
 if(embeddedTwitch===login)return;
 embeddedTwitch=login;target.replaceChildren();
 const frame=by('iframe');frame.title='Tchat Twitch de '+login;
 frame.src='https://www.twitch.tv/embed/'+encodeURIComponent(login)+'/chat?'+new URLSearchParams({parent:location.hostname,darkpopout:'true'});
 frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';
 frame.setAttribute('allow','fullscreen');target.append(frame);
}
let chatBusy=false,chatSignature='',chatKnown=false;
function chatError(message){
 const stream=$('stv-swapp-messages');
 if(!chatKnown)stream.replaceChildren(by('p',null,message));
 $('stv-chat-status').textContent=message;
}
async function refreshSwappChat(){
 if(chatBusy||document.visibilityState==='hidden')return;
 chatBusy=true;
 try{
  const data=await api('/api/swapp-tv/chat');
  const messages=Array.isArray(data.messages)?data.messages:[];
  const sig=messages.map(m=>m.id).join('|');
  if(sig!==chatSignature||!chatKnown){
   chatSignature=sig;chatKnown=true;
   const container=$('stv-swapp-messages');
   const pinned=container.scrollHeight-container.scrollTop-container.clientHeight<70;
   container.replaceChildren();
   if(!messages.length)container.append(by('p',null,'Pas encore de messages. Lance la discussion SWAPP TV.'));
   for(const m of messages.slice(-80)){
    const line=by('div','stv-chat-line');
    line.append(by('strong',null,String(m.handle||'Membre SWAPP').slice(0,40)),by('span',null,String(m.body||'').slice(0,160)));
    container.append(line);
   }
   if(pinned)container.scrollTop=container.scrollHeight;
  }
  $('stv-chat-status').textContent='Conversation SWAPP TV · compte SWAPP requis pour envoyer';
 }catch(e){chatError('Discussion SWAPP indisponible actuellement. '+e.message)}
 finally{chatBusy=false}
}
$('stv-swapp-chat-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const field=$('stv-swapp-chat-input'),message=field.value.trim(),button=e.target.querySelector('button');
 if(!message||button.disabled)return;
 button.disabled=true;
 try{
  await api('/api/swapp-tv/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:message})});
  field.value='';chatSignature='';await refreshSwappChat();
 }catch(error){
  $('stv-chat-status').replaceChildren();
  if(error.message==='swapp_account_required'){
   $('stv-chat-status').append('Connecte-toi à SWAPP pour écrire. ');
   const link=by('a',null,'Connexion SWAPP ↗');link.href='/compte';$('stv-chat-status').append(link);
  }else $('stv-chat-status').textContent='Envoi impossible : '+error.message;
 }finally{button.disabled=false}
});
void refreshSwappChat();
setInterval(()=>{if(!$('stv-pane-swapp').hidden)void refreshSwappChat()},7000);

$('stv-watch').addEventListener('click',()=>{
 if(state.selection&&state.playing===state.selection.login&&state.consent)stopPlayback();
 else play();
});
$('stv-join').addEventListener('click',()=>mutate('POST'));
$('stv-leave').addEventListener('click',()=>mutate('DELETE'));
$('stv-immersive').addEventListener('click',()=>{
 const enabled=$('swapp-tv').classList.toggle('tv-immersive');if(enabled&&dock.classList.contains('is-open'))closeDock();$('stv-immersive').setAttribute('aria-pressed',String(enabled));$('stv-immersive').textContent=enabled?'← QUITTER':'⛶ IMMERSION';
});
async function init(){
 try{const data=await api('/api/actus');state.games=gamesFrom(data);const select=$('stv-game');select.replaceChildren();for(const g of state.games){const o=by('option',null,g);o.value=g;select.append(o)}
 if(!state.games.length){const o=by('option',null,'Aucun jeu éditorial disponible');o.value='';select.append(o)}
 await refreshQueue();if(!state.queueMode)await discovery();
 setInterval(refreshQueue,45000);
 setInterval(async()=>{if(!state.queueMode){await discovery()}},180000);
 }catch(e){setText('stv-stage-status','Programmation indisponible pour le moment.');setText('stv-queue-status','Les données éditoriales sont indisponibles.');$('stv-join').disabled=true}
}
init();
})();
