// SWAPP SOCIAL: real player passport and game-based discovery on existing MySQL.
(()=>{
 'use strict';
 const host=document.getElementById('swappSocialNative');
 const area=host?.querySelector('.swapp-interactive');
 if(!area)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const $=q=>area.querySelector(q);
 const api=async(path,method='GET',body)=>{
  const res=await fetch('/api/swapp/interactions/'+path,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(method!=='GET'?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(({swapp_account_required:'Compte SWAPP requis.',invalid_passport:'Vérifie les champs du profil.',invalid_games:'Cinq jeux au maximum.',storage_unavailable:'Base de données indisponible.'})[result.error]||'Service indisponible ('+res.status+').');
  return result;
 };
 const intro=area.querySelector('.ssi-intro'),grid=area.querySelector('.ssi-sections');
 if(!intro||!grid)return;
 const layout=document.createElement('div');
 layout.className='ssn-space';
 layout.innerHTML=`
 <section class="ssn-passport" id="ssn-passport" aria-labelledby="ssn-passport-title">
  <div class="ssn-head"><span class="ssn-avatar" aria-hidden="true">◈</span><div class="ssn-copy">
   <span class="ssi-kicker">IDENTITÉ JOUEUR</span><h3 id="ssn-passport-title">Ton passeport gaming</h3>
   <p>Un seul compte SWAPP. Tes jeux et disponibilités, sous ton contrôle.</p></div>
   <button type="button" id="ssn-passport-toggle" class="ssi-ghost" aria-expanded="false" aria-controls="ssn-passport-form">Personnaliser</button>
  </div>
  <div class="ssn-summary" id="ssn-passport-summary" aria-live="polite">Chargement du profil…</div>
  <form class="ssn-form" id="ssn-passport-form" hidden>
   <div class="ssn-fields">
    <label>Nom affiché<input name="displayName" maxlength="60" placeholder="Comment veux-tu être appelé ?"></label>
    <label>Jeux favoris · 5 maximum<input name="games" maxlength="329" placeholder="PUBG, Valorant, Minecraft…"></label>
    <label>Plateforme<select name="platform"><option>PC</option><option>PlayStation</option><option>Xbox</option><option>Switch</option><option>Multiplateforme</option></select></label>
    <label>Style de jeu<select name="style"><option>Décontracté</option><option>Coopération</option><option>Compétitif</option><option>Débutant bienvenu</option></select></label>
    <label>Disponibilités<input name="availability" maxlength="100" placeholder="Ex. soirées, week-end"></label>
    <label>Présentation<input name="bio" maxlength="200" placeholder="Quelques mots sur toi"></label>
   </div>
   <label class="ssn-privacy"><input type="checkbox" name="public"> Rendre mon passeport visible aux autres membres.</label>
   <p class="ssn-footnote">Privé par défaut. Tes informations servent à améliorer SWAPP Match même lorsque ton passeport est privé. Aucun e-mail affiché.</p>
   <div class="ssn-actions"><button class="ssi-button" type="submit">Enregistrer mon passeport</button><button class="ssi-ghost" type="button" id="ssn-passport-cancel">Annuler</button></div>
  </form>
 </section>
 <section class="ssn-universe" id="ssn-universe" aria-labelledby="ssn-universe-title">
  <div class="ssn-head"><span class="ssn-orbit" aria-hidden="true">✦</span><div class="ssn-copy"><span class="ssi-kicker">UNIVERS VIVANTS</span>
   <h3 id="ssn-universe-title">De l'actu au jeu.</h3><p>Un même jeu, ses coéquipiers, ses discussions et les lives SWAPP.</p></div>
  </div>
  <form id="ssn-game-form" class="ssn-search">
   <input name="game" required maxlength="65" minlength="2" autocomplete="off" aria-label="Chercher un univers de jeu" placeholder="Explore un jeu (ex. PUBG)">
   <button class="ssi-button" type="submit">Explorer ↗</button>
  </form>
  <div id="ssn-game-results" class="ssn-game-results" aria-live="polite"></div>
 </section>`;
 grid.parentNode.insertBefore(layout,grid);
 const passportForm=$('#ssn-passport-form'),passportToggle=$('#ssn-passport-toggle');
 const msg=(message,type='success')=>{
  const el=area.querySelector('#ssi-notice');if(!el)return;
  el.textContent=message;el.dataset.type=type;
 };
 const navigateTo=view=>{
  // Save a deep link even when the module initializes before the native controller.
  if(view==='play'||view==='rooms')host.dataset.requestedSocialView=view;
  const button=host.querySelector('.pulse-community-shortcuts button[data-view="'+view+'"]')||
   host.querySelector('.pulse-sidebar button[data-view="'+view+'"]')||
   host.querySelector('.pulse-mobile-nav button[data-view="'+view+'"]');
  if(button)button.click();
  else host.dispatchEvent(new CustomEvent('swapp:social-view',{bubbles:true,detail:{view}}));
 };
 let passport=null;
 const selectedGame=new URLSearchParams(location.search).get('game');
 let gameRequest=0;
 function summary(p){
  passport=p;
  const games=Array.isArray(p.games)?p.games:[];
  const labels=[p.platform,p.style,p.availability].filter(Boolean);
  $('#ssn-passport-title').textContent=(p.displayName||p.handle||'Ton')+' · Gaming';
  $('#ssn-passport-summary').innerHTML='<span class="ssn-handle">@'+esc(p.handle)+'</span>'+
   '<span class="ssn-visibility">'+(p.public?'Passeport public':'Passeport privé')+'</span>'+
   (games.length?'<div class="ssn-tags">'+games.map(g=>'<button type="button" data-ssn-game="'+esc(g)+'">'+esc(g)+'</button>').join('')+'</div>':'<p>Ajoute tes jeux favoris pour améliorer tes compatibilités.</p>')+
   (labels.length?'<p>'+labels.map(esc).join(' · ')+'</p>':'')+
   (p.bio?'<p>'+esc(p.bio)+'</p>':'');
 }
 async function getPassport(){
  try{const data=await api('passport/me');summary(data.passport)}
  catch(error){$('#ssn-passport-summary').textContent=error.message}
 }
 function togglePassport(open){
  passportForm.hidden=!open;passportToggle.setAttribute('aria-expanded',String(open));
  passportToggle.textContent=open?'Fermer':'Personnaliser';
  if(open&&passport){
   const p=passport;for(const name of ['displayName','platform','style','availability','bio'])
    passportForm.elements[name].value=p[name]||'';
   passportForm.elements.games.value=(Array.isArray(p.games)?p.games:[]).join(', ');
   passportForm.elements.public.checked=!!p.public;
   passportForm.elements.displayName.focus();
  }
 }
 function cards(game,data){
  const rooms=Array.isArray(data.rooms)?data.rooms:[],matches=Array.isArray(data.matches)?data.matches:[];
  const roomHtml=rooms.length?rooms.map(r=>'<button type="button" class="ssn-room" data-ssn-room="'+esc(r.id)+'" data-ssn-name="'+esc(r.name)+'" data-ssn-game="'+esc(r.game)+'"># '+esc(r.name)+' <span>Entrer ↗</span></button>').join(''):'<p>Pas encore de salon pour ce jeu.</p>';
  const players=matches.length?matches.slice(0,8).map(m=>'<div class="ssn-player"><strong>@'+esc(m.handle)+'</strong><span>'+esc(m.platform)+' · '+esc(m.availability)+'</span><button class="ssi-ghost" type="button" data-message-user="'+esc(m.handle)+'">Contacter ↗</button></div>').join(''):'<p>Pas encore de recherche d’équipe pour ce jeu.</p>';
  return '<div class="ssn-universe-title"><strong>'+esc(game)+'</strong><span>'+rooms.length+' salon'+(rooms.length>1?'s':'')+' · '+matches.length+' annonce'+(matches.length>1?'s':'')+'</span></div>'+
  '<div class="ssn-game-columns"><section><h4>Discussions</h4>'+roomHtml+'</section><section><h4>Joueurs en recherche</h4>'+players+'</section></div>'+
  '<section class="ssn-live-section"><div class="ssn-universe-title"><strong>Créateurs en direct</strong><span>Pour '+esc(game)+'</span></div><div id="ssn-live-results" aria-live="polite">Recherche de lives en cours…</div></section>'+
  '<div class="ssn-actions"><button class="ssi-button" type="button" data-ssn-match="'+esc(game)+'">Chercher une équipe</button>'+
  '<button class="ssi-ghost" type="button" data-ssn-create-room="'+esc(game)+'">Créer un salon</button>'+
  '<a class="ssi-ghost" href="/decouvrir">Voir les lives ↗</a><a class="ssi-ghost" href="/jeux">Actualités & jeux ↗</a></div>';
 }
 async function loadGameLives(game,version){
  const holder=$('#ssn-live-results');if(!holder)return;
  try{
   const res=await fetch('/api/discovery/game-lives?game='+encodeURIComponent(game)+'&limit=5',{
    credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'
   });
   if(!res.ok)throw Error('live_unavailable');
   const data=await res.json();
   if(version!==gameRequest||!$('#ssn-live-results'))return;
   const items=data.success===true&&String(data.game||'').trim().toLowerCase()===game.toLowerCase()&&Array.isArray(data.items)?data.items:[];
   const safe=items.filter(x=>/^[a-z0-9_]{2,25}$/.test(String(x.login||''))&&['twitch','oryon','swapp'].includes(String(x.platform||''))&&String(x.game_name||x.category||x.game||'').trim().toLowerCase()===game.toLowerCase());
   holder.innerHTML=safe.length?'<div class="ssn-lives">'+safe.map(live=>{
    const login=String(live.login),name=esc(live.display_name||login);
    const platform=String(live.platform||'');
    const href=platform==='twitch'?'/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(game):'/'+encodeURIComponent(login);
    const viewerCount=Math.max(0,Number(live.viewer_count)||0);
    return '<a class="ssn-live" href="'+esc(href)+'">'+
     '<span class="ssn-live-dot" aria-hidden="true"></span><strong>'+name+'</strong>'+
     '<span>'+esc(platform==='twitch'?'Twitch':'SWAPP')+' · '+viewerCount+' spectateur'+(viewerCount>1?'s':'')+'</span></a>';
   }).join('')+'</div>':'<p>Aucun live confirmé pour ce jeu actuellement.</p>';
  }catch{
   if(version===gameRequest&&$('#ssn-live-results'))$('#ssn-live-results').textContent='Lives momentanément indisponibles.';
  }
 }
 async function openGame(game){
  const name=String(game||'').trim().slice(0,65),version=++gameRequest;
  if(name.length<2)return;
  $('#ssn-game-form').elements.game.value=name;
  $('#ssn-game-results').textContent='Recherche des conversations et des coéquipiers…';
  try{
   const data=await api('game/context?game='+encodeURIComponent(name));
   if(version!==gameRequest)return;
   $('#ssn-game-results').innerHTML=cards(name,data);
   void loadGameLives(name,version);
   const uri=new URL(location.href);uri.searchParams.set('game',name);
   history.replaceState(history.state,'',uri.pathname+uri.search+uri.hash);
  }catch(error){if(version===gameRequest)$('#ssn-game-results').textContent=error.message}
 }
 passportToggle.addEventListener('click',()=>togglePassport(passportForm.hidden));
 $('#ssn-passport-cancel').addEventListener('click',()=>togglePassport(false));
 passportForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=new FormData(passportForm);
  const games=String(data.get('games')||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(games.length>5||games.some(g=>g.length>65)){msg('Indique au maximum cinq jeux, de 65 caractères chacun.','error');return}
  const submit=passportForm.querySelector('[type="submit"]');submit.disabled=true;
  try{
   const response=await api('passport/me','PUT',{displayName:data.get('displayName'),games,
    platform:data.get('platform'),style:data.get('style'),
    availability:data.get('availability'),bio:data.get('bio'),public:data.has('public')});
   summary(response.passport);togglePassport(false);
   area.dispatchEvent(new Event('ssi:passport-saved'));msg('Passeport sauvegardé sur ton compte SWAPP.');
  }catch(error){msg(error.message,'error')}
  finally{submit.disabled=false}
 });
 $('#ssn-game-form').addEventListener('submit',e=>{
  e.preventDefault();void openGame(new FormData(e.target).get('game'));
 });
 area.addEventListener('click',e=>{
  const game=e.target.closest('[data-ssn-game]');if(game){void openGame(game.dataset.ssnGame);return}
  const match=e.target.closest('[data-ssn-match]');if(match){area.dispatchEvent(new CustomEvent('ssi:match-game',{detail:{game:match.dataset.ssnMatch}}));return}
  const create=e.target.closest('[data-ssn-create-room]');if(create){navigateTo('rooms');area.dispatchEvent(new CustomEvent('ssi:room-game',{detail:{game:create.dataset.ssnCreateRoom}}));return}
  const room=e.target.closest('[data-ssn-room]');if(room){
   navigateTo('rooms');
   area.dispatchEvent(new CustomEvent('ssi:open-room',{detail:{id:room.dataset.ssnRoom,name:room.dataset.ssnName,game:room.dataset.ssnGame}}));
  }
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-next-game]');
  if(!button)return;
  event.preventDefault();
  navigateTo('play');
  void openGame(button.dataset.nextGame);
  area.scrollIntoView?.({behavior:'smooth',block:'start'});
 });
 if(selectedGame&&selectedGame.length<=65){
  const init=()=>{navigateTo('play');void openGame(selectedGame)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
 }
 void getPassport();
})();
