(()=>{'use strict';
const $=id=>document.getElementById(id);
if(!$('swapp-tv'))return;
const by=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node};
const api=async(path,options={})=>{
 // A stalled provider must not freeze the station before the first picture.
 const timeout=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'&&
  !options.signal?{signal:AbortSignal.timeout(8500)}:{};
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...timeout,...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'service_unavailable');
 return data;
};
const safeLogin=s=>/^[a-z0-9_]{3,25}$/.test(String(s||'').toLowerCase());
const safeNativeLogin=s=>/^[a-z0-9_-]{2,32}$/.test(String(s||'').toLowerCase());
const gameOf=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
const gamesFrom=data=>[...new Set((Array.isArray(data.articles)?data.articles:[]).filter(x=>x?.slug&&x.status!=='draft').map(gameOf).filter(x=>x.length>1))].slice(0,16);
const state={queue:null,selection:null,playing:null,playingPlatform:null,playingBroadcastId:null,discovery:[],native:[],nativeIndex:0,nativeFetchedAt:0,index:0,consent:false,autoAdvance:false,autoStartPending:true,autoSource:null,playStartedAt:0,games:[],queueMode:false,
 passage:{key:'',game:'',seenLive:false,offline:0,cancelled:false,pending:false}};
const TV_SLOT_SECONDS=300; // Five-minute verified queue slot, shared with swapp-tv-director.MAX_AIR_SECONDS.
function tvTime(value){
 if(value instanceof Date)return value.getTime();
 const str=String(value||'').trim().replace(' ','T');
 if(!str)return NaN;
 return Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/.test(str)?str:str+'Z');
}
function updateSlotClock(now=Date.now()){
 const node=$('stv-slot-clock');
 if(!node)return;
 const data=state.queue;
 const stamp=data?.enabled&&data?.director_enabled?tvTime(data.on_air?.started_at):NaN;
 if(!Number.isFinite(stamp)||stamp>now+5000||now-stamp>3*3600000){
  node.hidden=true;node.textContent='';return;
 }
 const seconds=Math.max(0,Math.ceil((stamp+TV_SLOT_SECONDS*1000-now)/1000));
 node.hidden=false;
 node.textContent=seconds>0
  ?'PROCHAIN RELAIS · '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')
  :'RELAIS EN PRÉPARATION';
}

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
 setText('stv-creator-hint',state.native.length?'Chaînes SWAPP diffusées sans Twitch':enabled?'Rejoindre la file SWAPP TV':'Inscriptions fermées temporairement');
 setText('stv-next-title',state.native.length?'À SUIVRE SUR SWAPP':enabled?'CRÉATEURS EN ATTENTE':'FILE D’ATTENTE · PAUSE');
 setText('stv-queue-count',state.native.length?state.native.length+' directs SWAPP':enabled?(waiting.length>=100?'100+ en attente':waiting.length+' en attente'):'Inscriptions fermées');
}
function rail(data){
 const list=$('stv-next-list');list.replaceChildren();
 let rows=[];
 if(state.native.length)rows=state.native.filter(x=>x.login!==state.selection?.login).slice(0,5).map(x=>({name:x.display_name||x.login,game:x.game,desc:'Direct SWAPP natif'}));
 else if(Array.isArray(data?.waiting)&&data.waiting.length)rows=data.waiting.slice(0,5).map(x=>({name:x.creator_login,game:x.game,desc:'En attente de vérification'}));
 else if(!data?.enabled)rows=state.discovery.slice(state.index+1,state.index+5).map(x=>({name:x.display_name||x.login,game:x.game,desc:'Découverte, non programmé'}));
 if(!rows.length){list.append(by('p',null,state.native.length?'Ce direct SWAPP est seul à l’antenne pour le moment.':data?.enabled?'Aucune inscription en attente.':'File momentanément fermée. Aucun créateur en attente.'));return}
 for(const x of rows){const card=by('div','stv-next-item');card.append(by('strong',null,x.name||'Créateur'),by('small',null,(x.game||'Jeu')+' · '+x.desc));list.append(card)}
}
function renderScreen(item,{onAir=false}={}){
 const login=String(item?.login||item?.twitch_login||'').toLowerCase();
 const platform=String(item?.platform||'twitch').toLowerCase();
 const valid=platform==='swapp'?safeNativeLogin(login):platform==='twitch'&&safeLogin(login);
 state.selection=valid?{login,platform,game:item.game||item.game_name||'Jeu',name:item.creator_login||item.display_name||login,onAir,broadcastId:item.broadcast_id||null}:null;
 const same=state.playing===login&&state.playingPlatform===platform&&state.playingBroadcastId===(state.selection?.broadcastId||null)&&state.consent&&valid;
 if(!same){state.consent=false;state.playing=null;state.playingPlatform=null;state.playingBroadcastId=null;const layer=$('stv-screen').querySelector('.stv-player-layer');if(layer)layer.remove();$('stv-screen-inner').hidden=false;}
 if(platform==='swapp'&&typeof showChat==='function'&&activeDock==='twitch')showChat('swapp');
 if(typeof updateTwitchChat==='function')updateTwitchChat();
 const name=state.selection?.name||'Antenne en préparation';
 setText('stv-now-name',name);setText('stv-now-game',state.selection?.game||'En attente de programmation');
 setText('stv-screen-game',state.selection?.game?.toUpperCase()||'GAME UNIVERSE');
 $('stv-watch').disabled=!state.selection;
 $('stv-air-state').textContent=valid&&platform==='swapp'?'ANTENNE NATIVE SWAPP':onAir&&valid?'ANTENNE ACTIVE':valid?'DÉCOUVERTE':'HORS ANTENNE';
 $('stv-air-state').style.color=onAir&&valid?'var(--tv-accent,#67dce8)':'';
 setText('stv-stage-status',valid&&platform==='swapp'?'Diffusion native SWAPP, indépendante du lecteur Twitch.':onAir&&valid?'Créateur sélectionné par la régie SWAPP TV.':valid?'Direct en cours de chargement automatique (son coupé). La disponibilité peut évoluer.':'Aucun passage vérifié à cette heure.');
 // SWAPP TV should behave like a TV channel: the first verified/live source
 // starts muted on arrival (browser autoplay policy), not after another click.
 // If no real source is available, stay idle; never manufacture a broadcast.
 if(state.autoStartPending&&valid&&document.visibilityState!=='hidden'){
  state.autoStartPending=false;
  play();
 }else if(state.autoAdvance&&state.autoSource===(platform==='swapp'?'native':onAir?'queue':'discovery')&&valid&&!same)play();
 else syncWatchButton();
}
function syncWatchButton(){
 const watching=Boolean(state.selection&&state.playing===state.selection.login&&state.playingPlatform===state.selection.platform&&state.consent);
 setText('stv-watch',watching?'■ ARRÊTER':'▶ REGARDER');
 $('stv-watch').setAttribute('aria-pressed',String(watching));
}
function stopPlayback(){
 resetPassage();
 state.consent=false;state.playing=null;state.playingPlatform=null;state.autoAdvance=false;state.autoStartPending=false;state.autoSource=null;state.playStartedAt=0;
 $('stv-screen').querySelector('.stv-player-layer')?.remove();
 $('stv-screen-inner').hidden=false;
 syncWatchButton();
}
function play(){
 const item=state.selection;if(!item||(item.platform==='swapp'?!safeNativeLogin(item.login):!safeLogin(item.login)))return;
 const screen=$('stv-screen');screen.querySelector('.stv-player-layer')?.remove();
 const layer=by('div','stv-player-layer');const frame=by('iframe');
 frame.title='Direct '+(item.platform==='swapp'?'SWAPP':'Twitch')+' de '+item.name;
 if(item.platform==='swapp'){
  // First-party channel, no Amazon domain or Twitch cookies involved.
  frame.src='/api/oryon/local-relay/'+encodeURIComponent(item.login)+'/player';
 }else{
  const parent=location.hostname;
  frame.src='https://player.twitch.tv/?'+new URLSearchParams({channel:item.login,parent,autoplay:'true',muted:'true'});
 }
 frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;
 frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';
 frame.addEventListener('error',()=>{
  if(state.selection?.login!==item.login||state.playing!==item.login)return;
  $('stv-screen').querySelector('.stv-player-layer')?.remove();
  $('stv-screen-inner').hidden=false;
  state.playing=null;state.consent=false;state.autoAdvance=false;
  setText('stv-stage-status','Le lecteur externe est bloqué ou indisponible. Clique sur Regarder pour réessayer.');
  syncWatchButton();
 });
 layer.append(frame,by('div','stv-player-overlay','SWAPP TV  /  '+(item.onAir?'À L’ANTENNE':'DÉCOUVERTE')));
 screen.append(layer);$('stv-screen-inner').hidden=true;state.autoStartPending=false;state.playing=item.login;state.playingPlatform=item.platform;state.playingBroadcastId=item.broadcastId||null;state.consent=true;
 // Resume subsequent five-minute TV slots after a real stream starts.
 // Browser embedding remains muted to respect autoplay policy.
 state.autoAdvance=true;
 state.autoSource=item.platform==='swapp'?'native':item.onAir?'queue':'discovery';
 state.playStartedAt=Date.now();
 resetPassage();
 syncWatchButton();
 // Establish the initial live state as soon as the viewer starts playing.
 void maybePassage();
}
// SWAPP PASSAGE: a station viewer remains with the same GAME when the
// broadcaster really ends. Playback starts muted and can be stopped explicitly.
let passageClock=null,passageBusy=false;
const PASSAGE_KEY='swapp-passage-tab-v2';
function recentlyWatched(){
 try{
  const rows=JSON.parse(sessionStorage.getItem(PASSAGE_KEY)||'[]');
  return Array.isArray(rows)?rows.filter(x=>/^(swapp|twitch):[a-z0-9_-]{2,40}$/.test(x)).slice(-3):[];
 }catch{return []}
}
function markWatched(platform,login){
 try{
  const key=platform+':'+login;
  sessionStorage.setItem(PASSAGE_KEY,JSON.stringify([...recentlyWatched().filter(x=>x!==key),key].slice(-3)));
 }catch{}
}
function resetPassage(){
 if(passageClock){clearInterval(passageClock);passageClock=null}
 $('stv-passage')?.remove();
 state.passage={key:'',game:'',seenLive:false,offline:0,cancelled:false,pending:false};
}
function passageTarget(next){
 const name=String(next?.login||'').toLowerCase(),kind=String(next?.platform||'');
 return Boolean((kind==='swapp'?safeNativeLogin(name):kind==='twitch'&&safeLogin(name))&&
  typeof next?.game==='string'&&next.game.length>=2);
}
function passagePanel(){
 let el=$('stv-passage');if(el)return el;
 el=by('section','stv-passage');el.id='stv-passage';
 el.setAttribute('aria-label','Relais de fin de direct SWAPP TV');
 const where=$('stv-screen')?.parentElement;
 const bar=where?.querySelector('.stv-nowbar');
 if(bar)bar.insertAdjacentElement('afterend',el);
 else where?.append(el);
 return el;
}
async function passageCheck(info,commit=false,sourceProof=''){
 const query=new URLSearchParams({platform:info.platform,login:info.login,game:info.game||'',
  exclude:recentlyWatched().join(',')});
 if(commit){query.set('phase','commit');query.set('source_proof',sourceProof)}
 return api('/api/swapp/live-handoff?'+query.toString());
}
async function passageGo(){
 const current=state.passage;
 if(!state.consent||!current.pending||current.cancelled||document.visibilityState==='hidden')return;
 const key=current.key,from=state.selection;
 try{
  const result=await passageCheck({platform:from.platform,login:from.login,game:current.game},true,current.liveProof||'');
  if(state.passage!==current||result?.success!==true)return;
  if(result.current?.live){resetPassage();return}
  const next=result.next;
  if(!passageTarget(next)){
   const panel=passagePanel();panel.textContent='Le live est terminé. Aucun autre direct du même jeu n’est actuellement vérifié.';
   current.pending=false;return;
  }
  if(state.passage.key!==key||state.selection!==from)return;
  resetPassage();
  state.autoAdvance=false; // avoid a duplicate iframe reconstruction
  renderScreen({platform:next.platform,login:next.login,game:next.game,
   display_name:next.name||next.login,broadcast_id:null},{onAir:next.platform==='swapp'});
  play(); // Reuse the existing player; no duplicate iframe.
  markWatched(from.platform,from.login);
  // A TV handoff counts only once the new embedded destination loaded,
  // never on recommendation, countdown, or API suggestion.
  if(typeof result.transfer_token==='string'){
   const frame=$('stv-screen').querySelector('.stv-player-layer iframe');
   frame?.addEventListener('load',()=>{
    void fetch('/api/swapp/passage/arrive',{method:'POST',
     headers:{'Content-Type':'application/json'},credentials:'omit',
     body:JSON.stringify({token:result.transfer_token}),keepalive:true
    }).catch(()=>{});
   },{once:true});
  }
 }catch(_){
  if(state.passage===current){passagePanel().textContent='Relais indisponible. Le lecteur reste sur la chaîne actuelle.';current.pending=false;}
 }
}
function passageOffer(next){
 const current=state.passage;
 if(current.pending||current.cancelled)return;
 const panel=passagePanel();panel.replaceChildren();
 if(!passageTarget(next)){
  panel.append(by('strong',null,'Le direct vient de se terminer.'),
   by('p',null,'Aucun autre créateur vérifié sur ce jeu pour le moment.'));
  current.pending=false;return;
 }
 current.pending=true;let seconds=9;
 const label=by('strong',null,'La partie continue sur SWAPP TV');
 const text=by('p',null,'');
 const controls=by('div','stv-passage-actions');
 const now=by('button',null,'Passer maintenant');now.type='button';
 const cancel=by('button',null,'Rester ici');cancel.type='button';
 const render=()=>{text.textContent='Prochain direct : '+(next.name||next.login)+' · '+current.game+
  ' · dans '+seconds+' s.'};
 now.addEventListener('click',()=>{if(passageClock)clearInterval(passageClock);passageClock=null;void passageGo()});
 cancel.addEventListener('click',()=>{current.cancelled=true;current.pending=false;if(passageClock)clearInterval(passageClock);passageClock=null;panel.remove()});
 controls.append(now,cancel);panel.append(label,text,controls);render();
 passageClock=setInterval(()=>{
  if(state.passage!==current||current.cancelled){clearInterval(passageClock);passageClock=null;return}
  if(document.visibilityState==='hidden')return;
  seconds--;
  if(seconds<=0){clearInterval(passageClock);passageClock=null;void passageGo()}
  else render();
 },1000);
}
async function maybePassage(){
 const item=state.selection;
 if(passageBusy||!state.consent||!item||state.playing!==item.login||
  state.playingPlatform!==item.platform||document.visibilityState==='hidden')return;
 const key=item.platform+':'+item.login;
 if(state.passage.key!==key){
  resetPassage();
  state.passage.key=key;state.passage.game=String(item.game||'').slice(0,90);
 }
 if(state.passage.cancelled||state.passage.pending)return;
 const current=state.passage;
 passageBusy=true;
 try{
  const data=await passageCheck({platform:item.platform,login:item.login,game:current.game});
  if(state.passage!==current||state.selection!==item||data?.success!==true)return;
  if(data.current?.live===true){
   current.seenLive=true;current.offline=0;
   if(typeof data.live_proof==='string')current.liveProof=data.live_proof;
   if(String(data.current.game||'').length>=2)current.game=data.current.game;
   $('stv-passage')?.remove();
  }else if(data.current?.live===false&&current.seenLive){
   current.offline++;
   if(current.offline>=2)passageOffer(data.next);
  }
 }catch(_){/* An API outage is not a broadcast end. */}
 finally{passageBusy=false}
}
// Verified first-party stream registry: ONLY HLS with a fresh manifest
// and real media segments. WebRTC signalling and account heartbeats are
// not enough to claim the channel has playable video.
function mapNativeLives(payload,rotation=Math.floor(Date.now()/600000)){
 if(payload?.success!==true||!Array.isArray(payload.items))return [];
 const unique=new Set(),result=[];
 for(const x of payload.items){
  const login=String(x.login||'').toLowerCase();
  if(x.platform!=='swapp'||x.media!=='hls'||x.media_verified!==true||
     !safeNativeLogin(login)||unique.has(login))continue;
  const expected='/api/oryon/local-relay/'+encodeURIComponent(login)+'/player';
  if(x.player_url!==expected)continue; // refuse external or unverified URLs
  unique.add(login);
  result.push({login,platform:'swapp',media:'hls',media_verified:true,
    display_name:String(x.display_name||login).slice(0,80),
    game:String(x.game||'Jeu vidéo').slice(0,100),
    title:String(x.title||'').slice(0,180),
    broadcast_id:String(x.broadcast_id||'').slice(0,40)});
 }
 // Shuffle by verified game and a stable time window, never viewer counts.
 // This also neutralises API order (currently newest stream first).
 return fairDiscovery(result,rotation);
}
async function refreshQueue(){
 try{
  // Fetch the optional queue concurrently: its latency must not postpone the
  // first verifiable native live, and an outage must not block discovery.
  const queueRequest=api('/api/swapp-tv/queue/status').catch(()=>null);
  const nativeData=await api('/api/swapp-tv/native-lineup').catch(()=>null);
  if(nativeData?.success===true){
   state.native=mapNativeLives(nativeData);
   state.nativeFetchedAt=Date.now();
  }else if(Date.now()-state.nativeFetchedAt>25000){
   // Short grace for API glitches, never continue advertising stale streams.
   state.native=[];
  }
  if(state.native.length&&!state.selection?.login)renderScreen(state.native[0],{onAir:true});
  const data=await queueRequest;
  if(!data)throw Error('tv_queue_status_unavailable');
  state.queue=data;
  // An open enrollment queue is NOT an active TV broadcast. Without a
  // confirmed on-air director slot, start actual Twitch discovery instead.
  state.queueMode=state.native.length>0||
   Boolean(data.director_enabled&&safeLogin(data.on_air?.twitch_login));
  renderQueue(data);updateSlotClock();
  if(state.native.length){
   const active=state.native.find(x=>x.login===state.selection?.login&&state.selection?.platform==='swapp'&&x.broadcast_id===(state.selection?.broadcastId||null));
   const item=active||state.native[state.nativeIndex%state.native.length];
   state.nativeIndex=state.native.indexOf(item);
   // Do not replace a stream on a temporary disappearance from the lineup.
    // SWAPP PASSAGE confirms its actual end before changing to another game.
    if(!active&&!(state.consent&&state.playing===state.selection?.login))renderScreen(item,{onAir:true});
  }else if(data.enabled){
   const item=data.director_enabled?data.on_air:null;
   if(!item||!safeLogin(item.twitch_login)){
    if(!state.consent)renderScreen(null);
   }else{
    const login=String(item.twitch_login).toLowerCase();
    const changed=!state.selection||state.selection.login!==login||
      state.selection.platform!=='twitch'||!state.selection.onAir;
    if(changed){
     // A real, newly selected director slot supersedes the old one even
     // while an existing queue player is still running.
     if(state.consent&&state.autoAdvance)state.autoSource='queue';
     renderScreen(item,{onAir:true});
    }else if(state.consent&&state.autoSource==='discovery'){
     state.autoSource='queue'; // same Twitch creator now occupies official slot
    }
   }
  }else if(state.selection?.platform==='swapp'&&!state.consent){
   renderScreen(null);
  }
  rail(data);
  return data;
 }catch{
  const data={enabled:false,director_enabled:false,waiting:[]};state.queue=data;
  state.queueMode=state.native.length>0;
  if(state.native.length&&!state.selection?.login)renderScreen(state.native[0],{onAir:true});
  renderQueue(data);rail(data);updateSlotClock();return data;
 }
}
// Rotate discovery across games and creators without using viewer counts.
// Input from the game-live endpoint may be ordered by popularity; that
// provider order must not decide who appears first on SWAPP TV.
function fairDiscovery(candidates,rotation=Math.floor(Date.now()/300000)){
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
 const games=state.games.slice(0,5);
 // Look up editorial games concurrently; sequential retries can keep the TV
 // screen blank for 40+ seconds when one remote game endpoint is unavailable.
 const results=await Promise.all(games.map(async game=>{
  try{return {game,result:await api('/api/discovery/game-lives?game='+encodeURIComponent(game)+'&limit=12')}}
  catch{return {game,result:null}}
 }));
 for(const {game,result} of results){
  for(const x of Array.isArray(result?.items)?result.items:[]){
   const login=String(x.login||'').toLowerCase(),platform=String(x.platform||'').toLowerCase(),key=platform+':'+login;
   if(platform!=='twitch'||!safeLogin(login)||keys.has(key))continue;
   if(String(x.game_name||x.game||'').trim().toLocaleLowerCase()!==game.toLocaleLowerCase())continue;
   keys.add(key);found.push({...x,login,game,platform});
  }
 }
 // Prefer SWAPP's already diversified, actual-live discovery pool.
 // This brings small communities on-screen instead of always promoting
 // Twitch's largest channels when the editorial list is empty.
 if(!found.length){
  try{
   const home=await api('/api/discovery/home-lives?limit=12&lang=fr');
   for(const x of Array.isArray(home?.items)?home.items:[]){
    const login=String(x.user_login||x.login||'').toLowerCase();
    const game=String(x.game_name||x.game||'').trim();
    if(x.platform!=='twitch'||!safeLogin(login)||game.length<2||keys.has('twitch:'+login))continue;
    keys.add('twitch:'+login);
    found.push({login,platform:'twitch',game,
     display_name:String(x.user_name||x.display_name||login)});
   }
  }catch{}
 }
 // Fallback to the public Twitch "streams" API only when SWAPP's home
 // discovery is also unavailable: these are still real live broadcasters.
 if(!found.length){
  try{
   const top=await api('/api/twitch/streams/top?limit=24');
   for(const x of Array.isArray(top?.items)?top.items:Array.isArray(top?.streams)?top.streams:[]){
    const login=String(x.user_login||x.login||'').toLowerCase();
    const game=String(x.game_name||x.game||'').trim();
    if(!safeLogin(login)||game.length<2||keys.has('twitch:'+login))continue;
    keys.add('twitch:'+login);
    found.push({login,platform:'twitch',game,display_name:String(x.user_name||x.display_name||login)});
   }
  }catch{}
 }
 const ordered=fairDiscovery(found);
 const active=!state.selection?.onAir&&ordered.find(item=>item.login===state.selection?.login);
 state.discovery=ordered;
 state.index=active?ordered.indexOf(active):0;
 // Never tear down a watched creator on a periodic discovery refresh.
 if(!state.queueMode){
  if(!active&&!state.consent)renderScreen(ordered[0]||null);
  rail(null);
 }
}
// Fallback channel: genuine live discovery also rotates after one explicit
// viewer action. Never promote stale input without the API discovery refresh.
const DISCOVERY_SLOT_MS=5*60*1000;
function maybeAdvanceDiscovery(now=Date.now()){
 if(state.queueMode||!state.consent||!state.autoAdvance||
    state.autoSource!=='discovery'||now-state.playStartedAt<DISCOVERY_SLOT_MS)return false;
 const candidates=state.discovery;
 if(candidates.length<2){
  state.playStartedAt=now;return false;
 }
 const current=candidates.findIndex(x=>x.login===state.selection?.login);
 state.index=((current<0?0:current)+1)%candidates.length;
 renderScreen(candidates[state.index],{onAir:false});
 rail(null);
 return true;
}
// Rotate native SWAPP creators in the verified first-party pool.
function maybeAdvanceNative(now=Date.now()){
 if(!state.autoAdvance||state.autoSource!=='native'||!state.consent||
    now-state.playStartedAt<DISCOVERY_SLOT_MS)return false;
 if(state.native.length<2){state.playStartedAt=now;return false;}
 const current=state.native.findIndex(x=>x.login===state.selection?.login);
 state.nativeIndex=((current<0?0:current)+1)%state.native.length;
 renderScreen(state.native[state.nativeIndex],{onAir:true});
 rail(state.queue);
 return true;
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
 if(state.selection?.platform==='swapp'){
  embeddedTwitch='';target.replaceChildren(by('p',null,'Ce direct est diffusé directement sur SWAPP. Utilise le tchat SWAPP pour discuter.'));return;
 }
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
setInterval(updateSlotClock,1000);
setInterval(()=>{updateRotationBar();maybeAdvanceDiscovery();maybeAdvanceNative()},1000);
setInterval(()=>{void maybePassage()},25000);

$('stv-watch').addEventListener('click',()=>{
 if(state.selection&&state.playing===state.selection.login&&state.playingPlatform===state.selection.platform&&state.consent)stopPlayback();
 else play();
});
$('stv-join').addEventListener('click',()=>mutate('POST'));
$('stv-leave').addEventListener('click',()=>mutate('DELETE'));
$('stv-immersive').addEventListener('click',()=>{
 const enabled=$('swapp-tv').classList.toggle('tv-immersive');if(enabled&&dock.classList.contains('is-open'))closeDock();$('stv-immersive').setAttribute('aria-pressed',String(enabled));$('stv-immersive').textContent=enabled?'← QUITTER':'⛶ IMMERSION';
});
// If the page opened in a background tab, begin when it becomes visible.
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&state.autoStartPending&&state.selection)play();
});
function updateRotationBar(now=Date.now()){
 const el=$('stv-rotation'),track=$('stv-rotation-track'),
  fill=$('stv-rotation-fill'),clock=$('stv-rotation-clock'),label=$('stv-rotation-label');
 if(!el||!track||!fill||!clock||!label)return;
 const active=state.consent&&state.selection&&state.playing===state.selection.login;
 el.hidden=!active;
 if(!active)return;
 const serverSlot=state.autoSource==='queue'&&state.queue?.director_enabled;
 const official=serverSlot?tvTime(state.queue?.on_air?.started_at):NaN;
 const started=Number.isFinite(official)&&official>0&&official<=now+5000?official:state.playStartedAt;
 const elapsed=Math.max(0,now-started);
 const remaining=Math.max(0,Math.ceil((DISCOVERY_SLOT_MS-elapsed)/1000));
 const elapsedSeconds=Math.min(TV_SLOT_SECONDS,Math.floor(elapsed/1000));
 const alternatives=state.autoSource==='native'?state.native.length>1:
  state.autoSource==='discovery'?state.discovery.length>1:
   Boolean(state.queue?.waiting?.length);
 label.textContent=remaining===0?'RELAIS EN COURS':
  alternatives?'PROCHAIN STREAMER DANS':'PROCHAINE VÉRIFICATION DANS';
 clock.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 track.setAttribute('aria-valuenow',String(elapsedSeconds));
 track.setAttribute('aria-valuetext',remaining===0?'Relais en cours':'Prochain contrôle dans '+remaining+' secondes');
 fill.style.width=(100*elapsedSeconds/TV_SLOT_SECONDS).toFixed(1)+'%';
}
function explainEmptyStation(){
 // No invented streamer, no invisible stalled spinner. Any real live found
 // by the next refresh still autostarts unless the viewer clicked Stop.
 if(state.autoStartPending&&!state.selection&&!state.consent){
  setText('stv-stage-status',
   'Aucun direct disponible pour le moment. Recherche automatique de vrais lives en cours…');
 }
}
let stationRefreshing=false;
async function refreshStation(){
 if(stationRefreshing)return;
 stationRefreshing=true;
 try{
  await refreshQueue();
  if(state.autoStartPending&&!state.queueMode)await discovery();
  explainEmptyStation();
 }finally{stationRefreshing=false}
}
async function init(){
 // Previous boot awaited queue + ACTUS before looking for even one streamer:
 // a slow MySQL queue or editorial endpoint could leave the screen blank.
 // Start independent actual-live discovery IMMEDIATELY, concurrently with
 // native HLS and the director. First valid source autoplays muted.
 const editorial=api('/api/actus').catch(()=>({articles:[]}));
 const bootQueue=refreshQueue();
 const bootDiscovery=discovery();
 // Periodic retries are installed before any external API resolves. A
 // temporarily unavailable provider is never a permanent black screen.
 setInterval(()=>{void refreshStation().catch(()=>{})},30000);
 setInterval(()=>{if(!state.queueMode)void discovery().catch(()=>{})},180000);
 const outcome=await Promise.allSettled([bootQueue,bootDiscovery]);
 updateRotationBar();
 explainEmptyStation();
 // ACTUS is optional content for later game-specific discovery; its failure
 // must never disable the TV station or cancel the automatic playback.
 const data=await editorial;
 state.games=gamesFrom(data);
 const select=$('stv-game');select.replaceChildren();
 for(const g of state.games){const o=by('option',null,g);o.value=g;select.append(o)}
 if(!state.games.length){const o=by('option',null,'Aucun jeu éditorial disponible');o.value='';select.append(o)}
 if(state.queue)renderQueue(state.queue);
 if(!state.queueMode&&!state.consent&&state.games.length)void discovery().catch(()=>{});
 // If a provider failed during first paint, the periodic retry will recover.
 if(outcome.every(result=>result.status==='rejected'))explainEmptyStation();
}
void init().catch(error=>{
 // Show an actual diagnostic; do not leave an infinite "Connexion…" state.
 console.warn('[SWAPP TV] Startup:',String(error?.message||error).slice(0,140));
 explainEmptyStation();
});
})();
