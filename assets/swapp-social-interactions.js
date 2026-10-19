// SWAPP SOCIAL · Living hub. Uses only real account-bound MySQL interactions.
(()=>{
 'use strict';
 const host=document.getElementById('swappSocialNative');
 if(!host)return;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={
  team:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 0 0-6M19 20v-2a5 5 0 0 0-3-4.6"/>',
  poll:'<path d="M4 20V12M10 20V4M16 20v-8M22 20V8"/>',
  rooms:'<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
  chat:'<path d="M5 4h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 1-2Z"/><path d="M9 10h7M9 14h5"/>'
 };
 const icon=name=>'<span class="ssi-icon" aria-hidden="true"><svg viewBox="0 0 24 24">'+icons[name]+'</svg></span>';
 const empty=(symbol,message)=>'<div class="ssi-empty"><span class="ssi-empty-glyph" aria-hidden="true">'+symbol+'</span><span>'+message+'</span></div>';
 const area=document.createElement('section');area.className='swapp-interactive';area.hidden=true;area.setAttribute('aria-label','Espaces SOCIAL · SWAPP');
 area.innerHTML=`
  <header class="ssi-intro">
   <div class="ssi-intro-copy"><span class="ssi-kicker"><i aria-hidden="true"></i> SWAPP / SOCIAL</span>
    <h2>Le jeu se vit ensemble.</h2>
    <p>Une équipe à trouver, un avis à partager, une discussion à lancer. Choisis ton espace.</p>
   </div>
   <div class="ssi-intro-side">
    <div class="ssi-stats" aria-label="Activité enregistrée">
     <div class="ssi-stat"><strong id="ssi-count-matches">—</strong><span>compatibilités</span></div>
     <div class="ssi-stat"><strong id="ssi-count-polls">—</strong><span>sondages</span></div>
     <div class="ssi-stat"><strong id="ssi-count-rooms">—</strong><span>salons</span></div>
    </div>
    <nav class="ssi-links" aria-label="Découvrir SWAPP"><a href="/jeux">Univers de jeux ↗</a><a href="/decouvrir">Lives ↗</a></nav>
   </div>
  </header>
  <nav class="ssi-section-nav" aria-label="Parcourir les espaces SOCIAL">
   <span class="ssi-nav-label">Explorer SOCIAL</span>
   <a href="#ssn-passport" data-ssi-target="ssn-passport">01 <span>Passeport</span></a>
   <a href="#ssn-universe" data-ssi-target="ssn-universe">02 <span>Univers</span></a>
   <a href="#ssi-match-panel" data-ssi-target="ssi-match-panel">03 <span>Match</span></a>
   <a href="#ssi-poll-panel" data-ssi-target="ssi-poll-panel">04 <span>Sondages</span></a>
   <a href="#ssi-room-panel" data-ssi-target="ssi-room-panel">05 <span>Salons</span></a>
   <a href="#ssi-chat-panel" data-ssi-target="ssi-chat-panel">06 <span>Discussion</span></a>
  </nav>
  <div class="ssi-sections" id="ssi-sections">
   <div class="ssi-section-group">
    <section class="ssi-panel ssi-panel-match" id="ssi-match-panel" aria-labelledby="ssi-match-title">
     <div class="ssi-panel-inner">
      <div class="ssi-panel-head"><div class="ssi-head-main">${icon('team')}<div><span class="ssi-section-label">SWAPP Match</span><h3 id="ssi-match-title">Trouve ta team</h3><p class="ssi-panel-desc">De vrais joueurs qui cherchent le même jeu.</p></div></div><span class="ssi-count" id="ssi-match-badge" title="Compatibilités trouvées">—</span></div>
      <div id="ssi-match-results" class="ssi-list" aria-live="polite"></div>
      <button class="ssi-button ssi-block-action" type="button" data-open-form="match" aria-controls="ssi-form-match" aria-expanded="false">+ Chercher des coéquipiers</button>
      <form class="ssi-inline-form" id="ssi-form-match" hidden>
       <label class="ssi-field">Jeu<input name="game" required maxlength="65" autocomplete="off" placeholder="Ex. Helldivers 2"></label>
       <div class="ssi-form-row"><label class="ssi-field">Plateforme<select name="platform" required><option>PC</option><option>PlayStation</option><option>Xbox</option><option>Switch</option><option>Multiplateforme</option></select></label>
        <label class="ssi-field">Ambiance<select name="style"><option>Décontracté</option><option>Coopération</option><option>Compétitif</option><option>Débutant bienvenu</option></select></label></div>
       <label class="ssi-field">Quand jouer ?<input name="availability" required maxlength="65" placeholder="Ex. Ce soir vers 21 h"></label>
       <div class="ssi-form-actions"><button type="submit" class="ssi-button">Publier ma recherche</button><button type="button" class="ssi-ghost" data-close-form="match">Annuler</button></div>
      </form>
     </div>
    </section>
    <section class="ssi-panel ssi-panel-polls" id="ssi-poll-panel" aria-labelledby="ssi-poll-title">
     <div class="ssi-panel-inner">
      <div class="ssi-panel-head"><div class="ssi-head-main">${icon('poll')}<div><span class="ssi-section-label">La communauté décide</span><h3 id="ssi-poll-title">À vous de voter</h3><p class="ssi-panel-desc">Des questions et des résultats, pas des likes vides.</p></div></div><span class="ssi-count" id="ssi-poll-badge" title="Nombre de sondages">—</span></div>
      <div id="ssi-poll-results" class="ssi-list" aria-live="polite"></div>
      <button class="ssi-ghost ssi-block-action" type="button" data-open-form="poll" aria-controls="ssi-form-poll" aria-expanded="false">+ Poser une question</button>
      <form class="ssi-inline-form" id="ssi-form-poll" hidden>
       <label class="ssi-field">Ta question<input name="question" required maxlength="120" placeholder="À quel jeu on joue ce week-end ?"></label>
       <div class="ssi-form-row"><label class="ssi-field">Réponse 1<input name="a" required maxlength="80"></label><label class="ssi-field">Réponse 2<input name="b" required maxlength="80"></label></div>
       <div class="ssi-form-row"><label class="ssi-field">Réponse 3 · facultative<input name="c" maxlength="80"></label><label class="ssi-field">Réponse 4 · facultative<input name="d" maxlength="80"></label></div>
       <div class="ssi-form-actions"><button type="submit" class="ssi-button">Lancer le vote</button><button type="button" class="ssi-ghost" data-close-form="poll">Annuler</button></div>
      </form>
     </div>
    </section>
   </div>
   <div class="ssi-section-group">
    <section class="ssi-panel ssi-panel-rooms" id="ssi-room-panel" aria-labelledby="ssi-rooms-title">
     <div class="ssi-panel-inner">
      <div class="ssi-panel-head"><div class="ssi-head-main">${icon('rooms')}<div><span class="ssi-section-label">TES ESPACES</span><h3 id="ssi-rooms-title">Salons vocaux</h3><p class="ssi-panel-desc">Choisis un salon pour discuter.</p></div></div><span class="ssi-count" id="ssi-room-badge" title="Nombre de salons">—</span></div>
      <div class="ssi-room-list" id="ssi-room-results" aria-live="polite"></div>
      <button type="button" class="ssi-ghost ssi-block-action" id="ssi-game-room-scope" data-action="toggle-game-rooms" hidden>Voir tous les salons</button>
      <button type="button" class="ssi-ghost ssi-block-action" data-open-form="room" aria-controls="ssi-form-room" aria-expanded="false">+ Créer mon salon</button>
      <form class="ssi-inline-form" id="ssi-form-room" hidden>
       <label class="ssi-field">Nom du salon<input name="name" required maxlength="60" placeholder="Ex. Squad du soir"></label>
       <label class="ssi-field">Jeu associé (facultatif)<input name="game" maxlength="65" placeholder="Ex. PUBG"></label>
       <label class="ssi-field">Visibilité<select name="visibility"><option value="private">Personnel : accessible via ton invitation</option><option value="public">Public : visible par tous</option></select></label>
       <div class="ssi-form-actions"><button type="submit" class="ssi-button">Créer le salon</button><button type="button" class="ssi-ghost" data-close-form="room">Annuler</button></div>
      </form>
     </div>
    </section>
    <section class="ssi-panel ssi-panel-chat ssi-chat-panel" id="ssi-chat-panel" aria-labelledby="ssi-chat-title">
     <div class="ssi-panel-inner">
      <div class="ssi-panel-head"><div class="ssi-head-main">${icon('chat')}<div><span class="ssi-section-label">MESSAGES DU SALON</span><div class="ssi-chat-heading"><h3 id="ssi-chat-title">Discussion écrite</h3></div><p class="ssi-chat-hint" id="ssi-chat-hint">Messages de la communauté</p></div></div></div>
      <div class="ssi-personal-invites" id="ssi-personal-invites" hidden>
       <strong>Inviter dans mon canal</strong><p>Seuls les membres ayant rejoint par le lien peuvent lire et participer.</p>
       <label class="ssi-field" for="ssi-personal-url">Lien d’invitation<input id="ssi-personal-url" type="url" readonly aria-label="Lien d’invitation au canal" autocomplete="off"></label>
       <div class="ssi-personal-actions"><button type="button" class="ssi-button" data-ssi-copy-invite>Copier le lien</button><button type="button" class="ssi-ghost" data-ssi-rotate-invite>Renouveler le lien</button></div>
       <p id="ssi-invite-notice" role="status" aria-live="polite"></p>
      </div>
      <div id="ssi-chat-body" aria-live="off"><div class="ssi-room-placeholder">Rejoins un salon pour échanger avec la communauté.</div></div>
     </div>
    </section>
   </div>
  </div>
  <p class="ssi-notice" id="ssi-notice" role="status" aria-live="polite"></p>
 `;
 const welcome=host.querySelector('#pulse-welcome');
 (welcome?.parentNode||host).insertBefore(area,welcome?.nextSibling||null);
 const $=sel=>area.querySelector(sel);
 const errText={swapp_account_required:'Connecte-toi à SWAPP pour participer.',swapp_session_unavailable:'Ta session SWAPP ne répond pas. Actualise la page.',storage_unavailable:'La base de données est temporairement inaccessible.',already_voted:'Tu as déjà voté à ce sondage.',rate_limited:'Patiente une minute avant de recommencer.',invalid_origin:'Ta session a expiré. Actualise la page.',invalid_match:'Vérifie les informations de ton annonce.',invalid_poll:'Vérifie la question et les réponses.',invalid_room:'Renseigne le nom du salon et le jeu.',invalid_message:'Écris un message avant de l’envoyer.',social_storage_unavailable:'Les salons sont temporairement indisponibles.',invalid_invite:'Invitation invalide ou expirée.',invite_unavailable:'Les invitations sont indisponibles.',personal_room_limit:'Tu as déjà 10 canaux personnels.',personal_room_full:'Ce salon est complet.'};
 async function req(endpoint,method='GET',data){
  const r=await fetch('/api/swapp/interactions/'+endpoint,{method,credentials:'same-origin',headers:{'Accept':'application/json',...(method!=='GET'?{'Content-Type':'application/json'}:{})},cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(errText[result.error]||'SWAPP SOCIAL ne répond pas ('+r.status+').');
  return result;
 }
 let toastTimer;
 function notice(message,type='success'){
  const slot=$('#ssi-notice');slot.textContent=message;slot.dataset.type=type;
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{slot.textContent='';slot.removeAttribute('data-type')},6500);
 }
 const asCount=x=>Array.isArray(x)?x.length:0;
 let matches=[],polls=[],rooms=[],activeRoom='',chatTimer=null,chatVersion=0,chatSignature='',pollsExpanded=false,roomsExpanded=false;
 const queryGame=String(new URLSearchParams(window.location.search).get('game')||'').trim();
 const initialGame=queryGame.length>=2&&queryGame.length<=65?queryGame:'';
 let roomGameFilter=initialGame,roomRequestId=0;
 const metric=(name,n)=>{$('#ssi-count-'+name).textContent=String(n);};
 function renderMatches(){
  const count=asCount(matches);metric('matches',count);$('#ssi-match-badge').textContent=count;
  const list=$('#ssi-match-results');
  if(!count){list.innerHTML=empty('✦','Pas encore de joueur compatible. Publie une recherche pour trouver ta première équipe.');return}
  list.innerHTML=matches.slice(0,6).map(m=>`<div class="ssi-item"><div class="ssi-item-head"><strong>${escape(m.game)}</strong><span class="ssi-chip ssi-match-score">${Math.max(0,Math.min(100,Number(m.score)||0))}% match</span></div><p class="ssi-item-meta"><b>@${escape(m.handle)}</b> · ${escape(m.platform)}<br>${escape(m.availability)}${m.style?' · '+escape(m.style):''}</p><button class="ssi-ghost" type="button" data-message-user="${escape(m.handle)}">Envoyer un message ↗</button></div>`).join('');
 }
 function renderPolls(){
  const count=asCount(polls);metric('polls',count);$('#ssi-poll-badge').textContent=count;
  const el=$('#ssi-poll-results');
  if(!count){el.innerHTML=empty('?','Aucun vote en cours pour le moment. Lance la première question.');return}
  const visible=pollsExpanded?polls:polls.slice(0,3);
  el.innerHTML=visible.map(p=>{
   const choices=Array.isArray(p.choices)?p.choices:[];
   const counts=Array.isArray(p.counts)?p.counts:[];
   const total=counts.reduce((n,v)=>n+Math.max(0,Number(v)||0),0);
   return `<div class="ssi-item ssi-poll"><h4>${escape(p.question)}</h4><div class="ssi-poll-options">${choices.map((choice,i)=>{
    const n=Math.max(0,Number(counts[i])||0),pct=total?Math.round(n*100/total):0;
    return `<button class="ssi-vote" type="button" data-vote="${escape(p.id)}" data-choice="${i}" title="Voter pour cette réponse"><span class="ssi-vote-bar" style="--vote-pct:${pct}%"></span><span>${escape(choice)}</span><strong>${total?pct+'%':'—'}</strong></button>`;
   }).join('')}</div><div class="ssi-poll-foot"><span>${total} vote${total>1?'s':''}</span><span>Une voix par compte SWAPP</span></div></div>`;
  }).join('')+(count>3?'<button type="button" class="ssi-ghost" data-action="toggle-polls">'+(pollsExpanded?'Voir moins':'Voir les '+(count-3)+' autres sondages')+'</button>':'');
 }
 function renderRooms(){
  const title=$('#ssi-rooms-title'),switcher=$('#ssi-game-room-scope');
  if(title)title.textContent=roomGameFilter?'Salons · '+roomGameFilter:'Salons vocaux';
  if(switcher&&initialGame){switcher.hidden=false;switcher.textContent=roomGameFilter?'Voir tous les salons':'Revenir aux salons de '+initialGame}
  const count=asCount(rooms);metric('rooms',count);$('#ssi-room-badge').textContent=count;
  const el=$('#ssi-room-results');
  if(!count){el.innerHTML=empty('⌁',roomGameFilter?'Aucun salon accessible pour '+escape(roomGameFilter)+'. Crée le premier ou affiche tous les salons.':'Aucun salon pour le moment. Crée le premier.');return}
  const visible=roomsExpanded?rooms:rooms.slice(0,6);
  el.innerHTML=visible.map(r=>`<button class="ssi-room" type="button" data-room="${escape(r.id)}" aria-pressed="${r.id===activeRoom}" aria-label="Sélectionner le salon ${escape(r.name)}"><span class="ssi-room-voice-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4V9Zm12-1a5 5 0 0 1 0 8m2-11a9 9 0 0 1 0 14"/></svg></span><span class="ssi-room-info"><span class="ssi-room-name">${r.private?'🔒 ':''}${escape(r.name)}</span><span class="ssi-room-game">${escape(r.game)} · ${r.private?'Sur invitation':'Public'} · Vocal et texte</span></span></button>`).join('')+(count>6?'<button type="button" class="ssi-ghost" data-action="toggle-rooms">'+(roomsExpanded?'Voir moins':'Voir tous les salons ('+count+')')+'</button>':'');
 }
 async function loadMatches(){try{const data=await req('match2/compatible');matches=Array.isArray(data.matches)?data.matches:[];renderMatches()}catch(e){$('#ssi-match-results').innerHTML=empty('! ',escape(e.message));}}
 async function loadPolls(){try{const data=await req('polls');polls=Array.isArray(data.polls)?data.polls:[];renderPolls()}catch(e){$('#ssi-poll-results').innerHTML=empty('! ',escape(e.message));}}
 async function loadRooms(){
  const requestId=++roomRequestId,filter=roomGameFilter;
  const data=await req('rooms'+(filter?'?game='+encodeURIComponent(filter):''));
  if(requestId!==roomRequestId)return;
  const same=window.SwappGameIdentity?.sameGame;
  const normalized=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  rooms=(Array.isArray(data.rooms)?data.rooms:[]).filter(r=>!filter||(typeof same==='function'?same(filter,r.game):normalized(filter)===normalized(r.game)));
  if(activeRoom&&!rooms.some(r=>r.id===activeRoom)){activeRoom='';stopChat();area.dataset.activeSocialRoom='';area.dispatchEvent(new CustomEvent('ssi:room-selected',{detail:{id:''}}))}
  if(!activeRoom&&rooms.length)await selectRoom(rooms[0].id,false);
  renderRooms();
 }
 function stopChat(){if(chatTimer){clearInterval(chatTimer);chatTimer=null}chatVersion++;chatSignature=''}
 const clock=x=>{const t=new Date(Number(x));return Number.isFinite(t.getTime())?t.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''};
 function chatLines(data){
  const items=Array.isArray(data.messages)?data.messages:[];
  if(!items.length)return '<div class="ssi-chat-empty">Pas encore de messages. Brise la glace.</div>';
  return items.map(m=>`<div class="ssi-chat-line"><span class="ssi-chat-avatar" aria-hidden="true">${escape(String(m.handle||'?').slice(0,1).toUpperCase())}</span><div class="ssi-chat-content"><div class="ssi-chat-author">${escape(m.handle)}<time>${escape(clock(m.createdAt))}</time></div><div class="ssi-chat-bubble">${escape(m.body)}</div></div></div>`).join('');
 }
 async function updateChat(forceScroll=false){
  const id=activeRoom,version=chatVersion;
  if(!id)return;
  try{
   const data=await req('rooms/'+encodeURIComponent(id)+'/messages');
   if(id!==activeRoom||version!==chatVersion)return;
   const stream=$('#ssi-chat-stream');if(!stream)return;
   const items=Array.isArray(data.messages)?data.messages:[];
   const signature=items.map(m=>m.id).join('|');
   if(signature===chatSignature)return;
   const pin=forceScroll||stream.scrollHeight-stream.scrollTop-stream.clientHeight<100;
   chatSignature=signature;
   stream.innerHTML=chatLines(data);
   if(pin)stream.scrollTop=stream.scrollHeight;
  }catch(e){if(id===activeRoom&&version===chatVersion)notice(e.message,'error')}
 }

 const inviteBox=$('#ssi-personal-invites'),inviteInput=$('#ssi-personal-url'),inviteStatus=$('#ssi-invite-notice');
 let inviteRevision=0;
 function absoluteInvite(token){
  const url=new URL('/communaute',window.location.origin);
  url.searchParams.set('invite',token);
  return url.toString();
 }
 async function updateInvitePanel(room){
  const rev=++inviteRevision;
  inviteBox.hidden=!(room?.private&&room.owner);
  inviteInput.value='';inviteStatus.textContent='';
  if(inviteBox.hidden)return;
  inviteStatus.textContent='Préparation du lien…';
  try{
   const data=await req('rooms/'+encodeURIComponent(room.id)+'/invite');
   if(rev!==inviteRevision||activeRoom!==room.id)return;
   inviteInput.value=absoluteInvite(data.invite);
   inviteStatus.textContent='Prêt à partager. Un compte SWAPP est nécessaire pour rejoindre.';
  }catch(e){if(rev===inviteRevision)inviteStatus.textContent=e.message}
 }
 inviteBox.querySelector('[data-ssi-copy-invite]').addEventListener('click',()=>{
  const url=inviteInput.value;
  if(!url){inviteStatus.textContent='Lien indisponible.';return}
  if(navigator.clipboard?.writeText){
   void navigator.clipboard.writeText(url).then(
    ()=>{inviteStatus.textContent='Lien copié. Tu peux l’envoyer à tes invités.'},
    ()=>{inviteInput.select();inviteStatus.textContent='Sélectionne le lien pour le copier.'});
  }else{inviteInput.select();inviteStatus.textContent='Sélectionne le lien pour le copier.'}
 });
 inviteBox.querySelector('[data-ssi-rotate-invite]').addEventListener('click',async()=>{
  const room=rooms.find(r=>r.id===activeRoom);
  if(!room?.owner||!room.private)return;
  if(!window.confirm('Créer un nouveau lien ? L’ancien sera désactivé, sans retirer les membres déjà admis.'))return;
  const revision=++inviteRevision,roomId=room.id;
  inviteInput.value='';
  try{
   const response=await req('rooms/'+encodeURIComponent(room.id)+'/invite/rotate','POST',{});
   if(revision!==inviteRevision||activeRoom!==roomId)return;
   inviteInput.value=absoluteInvite(response.invite);
   inviteStatus.textContent='Nouveau lien disponible. L’ancien ne fonctionne plus.';
  }catch(e){if(revision===inviteRevision)inviteStatus.textContent=e.message}
 });
 async function acceptInviteLink(){
  const url=new URL(window.location.href),token=url.searchParams.get('invite');
  if(!token)return;
  try{
   const joined=await req('rooms/join','POST',{invite:token});
   if(!joined.room?.id)throw Error('Réponse invalide du salon');
   if(!rooms.some(r=>r.id===joined.room.id))rooms.unshift(joined.room);
   roomsExpanded=true;renderRooms();
   await selectRoom(joined.room.id);
   url.searchParams.delete('invite');
   window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
   host.dataset.requestedSocialView='rooms';
   host.dispatchEvent(new CustomEvent('swapp:social-view',{bubbles:true,detail:{view:'rooms'}}));
   notice('Invitation acceptée : salon vocal et discussion accessibles.');
  }catch(e){notice(e.message+' Connecte-toi puis réouvre ton invitation si nécessaire.','error')}
 }

 async function selectRoom(id,rerender=true){
  const item=rooms.find(r=>r.id===id);if(!item)return;
  if(activeRoom===id&&$('#ssi-chat-stream'))return;
  stopChat();activeRoom=id;
  area.dataset.activeSocialRoom=id;
  area.dispatchEvent(new CustomEvent('ssi:room-selected',{detail:{id,name:item.name,game:item.game}}));
  $('#ssi-chat-title').textContent='Discussion écrite';
  $('#ssi-chat-hint').textContent='Salon : '+item.name;
  void updateInvitePanel(item);
  $('#ssi-chat-body').innerHTML='<div class="ssi-chat-stream" id="ssi-chat-stream" aria-label="Messages du salon" aria-live="polite"><div class="ssi-chat-empty">Chargement de la discussion…</div></div><form class="ssi-compose" id="ssi-form-chat"><input name="body" maxlength="160" required autocomplete="off" aria-label="Votre message" placeholder="Écris ton message…"><button type="submit" class="ssi-button">Envoyer ↗</button></form>';
  if(rerender)renderRooms();
  await updateChat(true);
  if(activeRoom===id)chatTimer=setInterval(()=>{if(document.visibilityState==='visible')void updateChat()},5000);
 }
 function toggleForm(name,open){
  const form=$('#ssi-form-'+name),button=$('[data-open-form="'+name+'"]');
  if(!form||!button)return;form.hidden=!open;button.setAttribute('aria-expanded',String(open));
  if(open)form.querySelector('input')?.focus();
 }
 async function save(kind,form){
  const data=new FormData(form),button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
   if(kind==='match'){
    await req('matches','POST',{game:data.get('game'),platform:data.get('platform'),availability:data.get('availability'),style:data.get('style')});
    await loadMatches();notice('Recherche publiée. SWAPP va comparer les prochaines annonces.');
   }else if(kind==='poll'){
    const choices=[data.get('a'),data.get('b'),data.get('c'),data.get('d')].map(x=>String(x||'').trim()).filter(Boolean);
    await req('polls','POST',{question:data.get('question'),choices});
    await loadPolls();notice('Sondage créé. Les votes sont enregistrés.');
   }else if(kind==='room'){
    const personal=data.get('visibility')!=='public';
    const created=await req(personal?'rooms/personal':'rooms','POST',{name:data.get('name'),game:data.get('game')||'Discussion'});
    activeRoom='';stopChat();await loadRooms();
    const shown=rooms.some(r=>r.id===created.room?.id);
    if(shown)await selectRoom(created.room.id);
    notice((personal?'Canal personnel créé. Partage ton lien d’invitation.':'Salon public créé.')+(shown?'':' Retrouve-le dans tous les salons.'));
   }
   form.reset();toggleForm(kind,false);
  }catch(e){notice(e.message,'error')}
  finally{button.disabled=false}
 }
 // Game context cards can open genuine MySQL rooms not yet shown in the recent list.
 area.addEventListener('ssi:open-room',async event=>{
  const room=event.detail;
  if(!room||typeof room.id!=='string'||typeof room.name!=='string')return;
  if(!rooms.some(r=>r.id===room.id))rooms.push({id:room.id,name:room.name,game:room.game||'',messageCount:0});
  roomsExpanded=true;renderRooms();
  await selectRoom(room.id);
  $('#ssi-chat-title')?.scrollIntoView?.({behavior:'smooth',block:'center'});
 });
 area.addEventListener('ssi:match-game',event=>{
  const game=String(event.detail?.game||'').slice(0,65);
  if(!game)return;
  toggleForm('match',true);
  const field=$('#ssi-form-match [name="game"]');
  if(field){field.value=game;field.focus()}
 });
 area.addEventListener('ssi:room-game',event=>{
  const game=String(event.detail?.game||'').slice(0,65);
  if(!game)return;
  toggleForm('room',true);
  const field=$('#ssi-form-room [name="game"]');
  if(field){field.value=game;field.focus()}
 });
 area.addEventListener('ssi:passport-saved',()=>void loadMatches());
 area.addEventListener('click',async event=>{
  const open=event.target.closest('[data-open-form]');if(open){
   toggleForm(open.dataset.openForm,!$('#ssi-form-'+open.dataset.openForm).hidden);
   if(open.dataset.openForm==='room'&&roomGameFilter){const field=$('#ssi-form-room [name="game"]');if(field&&!field.value.trim())field.value=roomGameFilter}
   return;
  }
  const close=event.target.closest('[data-close-form]');if(close){toggleForm(close.dataset.closeForm,false);return}
  const action=event.target.closest('[data-action]');if(action){
   if(action.dataset.action==='toggle-polls'){pollsExpanded=!pollsExpanded;renderPolls()}
   if(action.dataset.action==='toggle-rooms'){roomsExpanded=!roomsExpanded;renderRooms()}
   if(action.dataset.action==='toggle-game-rooms'){
    roomGameFilter=roomGameFilter?'':initialGame;
    activeRoom='';stopChat();roomsExpanded=false;
    await loadRooms();
   }
   return;
  }
  const vote=event.target.closest('[data-vote]');if(vote){
   vote.disabled=true;
   try{await req('polls/'+encodeURIComponent(vote.dataset.vote)+'/vote','POST',{choice:Number(vote.dataset.choice)});await loadPolls();notice('Vote enregistré. Merci !')}
   catch(e){notice(e.message,'error');vote.disabled=false}
   return;
  }
  const room=event.target.closest('[data-room]');if(room){
   await selectRoom(room.dataset.room);
   // On a small screen, show the selected voice stage without scrolling on initial load.
   if(window.matchMedia?.('(max-width:650px)').matches&&event.isTrusted){
    area.querySelector('#ssi-chat-panel .swapp-voice')?.scrollIntoView({behavior:'smooth',block:'start'});
   }
  }
 });
 area.addEventListener('submit',async event=>{
  const form=event.target;if(!form.id?.startsWith('ssi-form-'))return;event.preventDefault();
  if(form.id==='ssi-form-chat'){
   const field=form.querySelector('[name="body"]'),message=field?.value?.trim(),button=form.querySelector('[type="submit"]');
   if(!activeRoom||!message)return;
   button.disabled=true;
   try{await req('rooms/'+encodeURIComponent(activeRoom)+'/messages','POST',{body:message});field.value='';await updateChat(true);field.focus()}
   catch(e){notice(e.message,'error')}
   finally{button.disabled=false}
  }else await save(form.id.slice('ssi-form-'.length),form);
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeRoom)void updateChat()});
 async function initialize(retry=0){
  try{
   area.hidden=false;host.classList.add('ssi-enhanced');
   await loadRooms();
   await Promise.all([loadMatches(),loadPolls()]);
   await acceptInviteLink();
  }catch(e){
   if(retry<3){setTimeout(()=>void initialize(retry+1),1000*(retry+1));return}
   // Keep a retryable hidden module instead of permanently removing the interface.
   area.hidden=true;host.classList.remove('ssi-enhanced');
  }
 }
 document.getElementById('swapp-social-retry-modules')?.addEventListener('click',()=>{
  area.hidden=true;
  host.classList.remove('ssi-enhanced');
  void initialize(0);
 });
 void initialize();
})();
