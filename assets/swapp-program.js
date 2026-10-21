(()=>{'use strict';
const root=document.querySelector('#swapp-program');if(!root)return;
const tv=root.dataset.mode==='tv',content=document.querySelector('#swapp-program-content'),status=document.querySelector('#swapp-program-status'),controls=document.querySelector('#swapp-program-controls');
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const json=async(url)=>{const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return response.json()};
const gameName=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
const gamesOf=articles=>[...new Set(articles.filter(a=>a&&a.slug&&a.status!=='draft').map(gameName).filter(x=>x.length>1))].slice(0,12);
function choice(games){const label=el('label','Jeu : '),select=el('select');select.setAttribute('aria-label','Choisir un jeu');for(const g of games){const o=el('option',g);o.value=g;select.append(o)}label.append(select);controls.replaceChildren(label);return select}
const validLogin=x=>/^[a-z0-9_]{2,25}$/.test(String(x||'').toLowerCase());
const sameGame=(a,b)=>String(a).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')===String(b).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
let timer=null,epoch=0;
async function agenda(game){const data=await json('/api/creator/spotlight?game='+encodeURIComponent(game));if(data.success!==true||!Array.isArray(data.items))throw Error('invalid_agenda');const now=Date.now();const rows=data.items.filter(x=>x.status==='reserved'&&Date.parse(x.end_at)>now).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));const list=el('section');if(!rows.length){list.append(el('p','Aucun rendez-vous Spotlight confirmé pour ce jeu.'));return list}for(const r of rows){const a=el('article',undefined,'swapp-program-card');a.append(el('strong',r.creator_login||r.twitch_login||'Créateur'),el('p',new Date(r.start_at).toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short'})));if(r.live?.state==='live_verified')a.append(el('span','DIRECT VÉRIFIÉ'));list.append(a)}return list}
async function tvData(game){const data=await json('/api/discovery/game-lives?game='+encodeURIComponent(game)+'&limit=24');if(data.success!==true||!sameGame(game,data.game)||!Array.isArray(data.items))throw Error('invalid_live_results');return data}
async function showAntenna(){
 try{
  const data=await json('/api/swapp-tv/queue/status');
  const existing=document.querySelector('#swapp-tv-antenna');
  if(!data.enabled){if(existing)existing.remove();return}
  if(existing&&existing.dataset.onAir===String(data.on_air?.id||'')){const prior=existing.querySelector('[data-swapp-tv-waiting]');if(prior){prior.replaceChildren(...(Array.isArray(data.waiting)?data.waiting:[]).slice(0,12).map(item=>el('li',item.creator_login+' · '+item.game)))}return;}
  const panel=el('section',undefined,'swapp-tv-antenna');panel.id='swapp-tv-antenna';panel.dataset.onAir=String(data.on_air?.id||'');
  panel.append(el('h2','SWAPP TV · Antenne commune'));
  if(data.on_air?.twitch_login){
   panel.append(el('p','À l’antenne : '+data.on_air.creator_login+' · '+data.on_air.game));
   const login=String(data.on_air.twitch_login).toLowerCase();
   if(/^[a-z0-9_]{3,25}$/.test(login)){
    const slot=el('div',undefined,'swapp-tv-player-slot');slot.dataset.login=login;
    const play=el('button','Lancer le direct (son désactivé)');play.type='button';
    play.addEventListener('click',()=>{
     const iframe=el('iframe');iframe.title='Direct Twitch — '+login;
     const params=new URLSearchParams({channel:login,parent:location.hostname,autoplay:'true',muted:'true'});
     iframe.src='https://player.twitch.tv/?'+params.toString();
     iframe.allow='autoplay; fullscreen';iframe.allowFullscreen=true;
     iframe.referrerPolicy='strict-origin-when-cross-origin';
     slot.replaceChildren(iframe);
    });
    slot.append(play);panel.append(slot);
   }
  }else panel.append(el('p','Aucun créateur actuellement à l’antenne.'));
  const list=el('ol');list.dataset.swappTvWaiting='1';
  for(const item of (Array.isArray(data.waiting)?data.waiting:[]).slice(0,12)){
   list.append(el('li',item.creator_login+' · '+item.game));
  }
  panel.append(el('h3','File d’attente publique'),list);
  const form=el('form');const select=el('select');
  select.setAttribute('aria-label','Jeu couvert par SWAPP');
  const games=Array.isArray(window.__swappTvGames)?window.__swappTvGames:[];
  if(!games.length){const unavailable=el('p','La réservation sera accessible après la validation de la programmation.');panel.append(unavailable)}
  else{
   for(const game of games){const option=el('option',game);option.value=game;select.append(option)}
   const join=el('button','Rejoindre la file');join.type='submit';
   const leave=el('button','Quitter la file');leave.type='button';
   const result=el('p');result.setAttribute('role','status');
   form.append(select,join,leave,result);
   const mutation=async(method)=>{
    result.textContent='Vérification du compte et du jeu…';
    try{
     const response=await fetch('/api/swapp-tv/queue',{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-SWAPP-SPOTLIGHT-ACTION':'creator'},...(method==='POST'?{body:JSON.stringify({game:select.value})}:{})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(data.error||'queue_unavailable');
     result.textContent=method==='POST'?'Demande enregistrée. Le passage à l’antenne dépendra de la régie.':'Sortie de file enregistrée.';
     await showAntenna();
    }catch(e){result.textContent=({'swapp_account_required':'Connecte-toi à SWAPP.','verified_twitch_link_required':'Lie ta chaîne Twitch.','already_in_queue':'Tu es déjà dans la file.','spotlight_game_not_covered':'Ce jeu doit être couvert par un article publié.'}[e.message]||'Inscription indisponible : '+e.message)}
   };
   form.addEventListener('submit',event=>{event.preventDefault();mutation('POST')});
   leave.addEventListener('click',()=>mutation('DELETE'));
   panel.append(form);
  }
  const parent=document.querySelector('#swapp-program-controls');
  if(existing)existing.replaceWith(panel);else parent.append(panel);
 }catch{const existing=document.querySelector('#swapp-tv-antenna');if(existing)existing.remove()}
}
async function runTv(games){
 const round=++epoch,found=[],spotlights=[];let partial=false;
 for(const game of games.slice(0,6)){
  try{
   const d=await tvData(game);if(d.coverage==='partial'||d.coverage==='native-only')partial=true;
   for(const item of d.items)found.push({...item,game});
   // Spotlight is optional: unavailable bookings never imply a fake live.
   try{const slots=await json('/api/creator/spotlight?game='+encodeURIComponent(game));if(Array.isArray(slots.items))spotlights.push(...slots.items)}catch{}
  }catch{partial=true}
 }
 if(round!==epoch)return;
 const lineup=globalThis.SwappTvRotation?.lineup(found,spotlights)||[];
 let index=0;
 const render=()=>{
  if(!lineup.length){content.replaceChildren(el('p',partial?'Aucun direct confirmé dans les résultats accessibles. Twitch peut être partiel.':'Aucun direct confirmé actuellement.'));return}
  const s=lineup[index%lineup.length],card=el('article',undefined,'swapp-tv-feature');
  card.append(el('small',(s.spotlight?'Créneau Spotlight vérifié · ':'SWAPP TV · ')+s.game),el('h2',s.display_name||s.login),el('p',s.title||'Direct en cours'));
  const a=el('a','Regarder le direct sur SWAPP →');
  a.href=s.platform==='twitch'?'/live/twitch/'+encodeURIComponent(s.login)+'?game='+encodeURIComponent(s.game):'/'+encodeURIComponent(s.login);
  card.append(a);
  const more=el('p',(index%lineup.length+1)+' / '+lineup.length+' · Rotation équitable · 60 secondes · Lecture volontaire');
  content.replaceChildren(card,more);
  status.textContent=partial?'Sélection basée sur des résultats partiels, sans garantie de permanence du live.':'Sélection issue des résultats de directs, actualisée régulièrement.';
 };
 render();if(timer)clearInterval(timer);
 timer=setInterval(()=>{index++;if(index%Math.max(1,lineup.length)===0){clearInterval(timer);runTv(games)}else render()},60000);
}
async function init(){try{const data=await json('/api/actus');if(!Array.isArray(data.articles))throw Error('invalid_articles');const games=gamesOf(data.articles);if(!games.length){status.textContent='Aucun jeu éditorial disponible pour le moment.';return}if(tv){status.textContent='Vérification de la régie collective…';window.__swappTvGames=games;const queue=await json('/api/swapp-tv/queue/status').catch(()=>({enabled:false}));if(queue.enabled){await showAntenna();status.textContent='Antenne commune synchronisée par SWAPP TV.';content.replaceChildren(el('p','Les passages à l’antenne sont pilotés par la régie commune, et non par un carrousel local.'));setInterval(showAntenna,60000)}else{status.textContent='Régie non activée : découverte des directs disponibles.';await runTv(games)}}else{const select=choice(games);const show=async()=>{status.textContent='Lecture des réservations Spotlight…';try{const node=await agenda(select.value);content.replaceChildren(node);status.textContent='Agenda du jeu : '+select.value}catch{content.replaceChildren(el('p','Agenda Spotlight indisponible ou non activé.'));status.textContent='Aucun créneau ne peut être confirmé.'}};select.addEventListener('change',show);await show()}}catch{status.textContent='Les données SWAPP sont momentanément indisponibles.'}}
init();
})();
