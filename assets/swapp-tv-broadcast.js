(()=>{'use strict';
const $=id=>document.getElementById(id);
if(!$('swapp-tv'))return;
const by=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node};
const api=async(path,options={})=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'service_unavailable');return data};
const safeLogin=s=>/^[a-z0-9_]{3,25}$/.test(String(s||'').toLowerCase());
const gameOf=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
const gamesFrom=data=>[...new Set((Array.isArray(data.articles)?data.articles:[]).filter(x=>x?.slug&&x.status!=='draft').map(gameOf).filter(x=>x.length>1))].slice(0,16);
const state={queue:null,selection:null,playing:null,discovery:[],index:0,consent:false,games:[],queueMode:false};
const setText=(id,text)=>{$(id).textContent=text};
function renderQueue(data){
 const waiting=Array.isArray(data.waiting)?data.waiting:[],enabled=Boolean(data.enabled);
 const access=$('stv-creator-access');
 if(access){access.hidden=!enabled;if(!enabled)access.open=false;}
 $('stv-join').disabled=!enabled||!state.games.length;
 $('stv-leave').disabled=!enabled;
 setText('stv-queue-status',!enabled?'La file n’est pas ouverte actuellement.':
  data.director_enabled?'File accessible. Chaque direct est vérifié avant de passer à l’antenne.':
  'File accessible, mais les passages à l’antenne sont actuellement suspendus.');
 setText('stv-next-title',enabled?'CRÉATEURS EN ATTENTE':'À DÉCOUVRIR');
 setText('stv-queue-count',enabled?(waiting.length>=100?'100+ en attente':waiting.length+' en attente'):'');
}
function rail(data){
 const list=$('stv-next-list');list.replaceChildren();
 let rows=[];
 if(data?.enabled)rows=(Array.isArray(data.waiting)?data.waiting:[]).slice(0,5).map(x=>({name:x.creator_login,game:x.game,desc:'En attente de vérification'}));
 else rows=state.discovery.slice(state.index+1,state.index+5).map(x=>({name:x.display_name||x.login,game:x.game,desc:'Découverte, non programmé'}));
 if(!rows.length){list.append(by('p',null,data?.enabled?'Aucune inscription en attente.':'Aucun direct découvert pour le moment.'));return}
 for(const x of rows){const card=by('div','stv-next-item');card.append(by('strong',null,x.name||'Créateur'),by('small',null,(x.game||'Jeu')+' · '+x.desc));list.append(card)}
}
function renderScreen(item,{onAir=false}={}){
 const login=String(item?.twitch_login||item?.login||'').toLowerCase(),valid=safeLogin(login)&&String(item?.platform||'twitch')==='twitch';
 state.selection=valid?{login,game:item.game||item.game_name||'Jeu',name:item.creator_login||item.display_name||login,onAir}:null;
 const same=state.playing===login&&state.consent&&valid;
 if(!same){state.consent=false;state.playing=null;const layer=$('stv-screen').querySelector('.stv-player-layer');if(layer)layer.remove();$('stv-screen-inner').hidden=false;}
 const name=state.selection?.name||'Antenne en préparation';
 setText('stv-now-name',name);setText('stv-now-game',state.selection?.game||'En attente de programmation');
 setText('stv-screen-game',state.selection?.game?.toUpperCase()||'GAME UNIVERSE');
 $('stv-watch').disabled=!state.selection;
 $('stv-air-state').textContent=onAir&&valid?'ANTENNE ACTIVE':valid?'DÉCOUVERTE':'HORS ANTENNE';
 $('stv-air-state').style.color=onAir&&valid?'var(--tv-accent,#67dce8)':'';
 setText('stv-stage-status',onAir&&valid?'Créateur sélectionné par la régie SWAPP TV.':valid?'Direct trouvé dans la découverte. Lecture volontaire, sans garantie de maintien en ligne.':'Aucun passage vérifié à cette heure.');
}
function play(){
 const item=state.selection;if(!item||!safeLogin(item.login))return;
 const screen=$('stv-screen');screen.querySelector('.stv-player-layer')?.remove();
 const layer=by('div','stv-player-layer');const frame=by('iframe');frame.title='Direct Twitch de '+item.name;const parent=location.hostname;
 frame.src='https://player.twitch.tv/?'+new URLSearchParams({channel:item.login,parent,autoplay:'true',muted:'true'});
 frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
 layer.append(frame,by('div','stv-player-overlay','SWAPP TV  /  '+(item.onAir?'À L’ANTENNE':'DÉCOUVERTE')));
 screen.append(layer);$('stv-screen-inner').hidden=true;state.playing=item.login;state.consent=true;
 setText('stv-watch','▶ EN LECTURE');
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
 state.discovery=found;state.index=0;
 if(!state.queueMode){renderScreen(found[0]||null);rail(null)}
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
$('stv-watch').addEventListener('click',play);
$('stv-join').addEventListener('click',()=>mutate('POST'));
$('stv-leave').addEventListener('click',()=>mutate('DELETE'));
$('stv-immersive').addEventListener('click',()=>{
 const enabled=$('swapp-tv').classList.toggle('tv-immersive');$('stv-immersive').setAttribute('aria-pressed',String(enabled));$('stv-immersive').textContent=enabled?'✕ SORTIR':'⛶ IMMERSION';
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
