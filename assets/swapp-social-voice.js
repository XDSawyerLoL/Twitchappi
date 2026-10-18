// SWAPP SOCIAL — voluntary audio rooms (WebRTC mesh, no recording).
(()=>{
 'use strict';
 const host=document.getElementById('swappSocialNative');
 const area=host?.querySelector('.swapp-interactive');
 const container=area?.querySelector('#ssi-room-panel .ssi-panel-inner');
 if(!area||!container)return;

 const section=document.createElement('section');
 section.className='swapp-voice';section.setAttribute('aria-label','Salon vocal');
 section.innerHTML=`
 <header class="swapp-voice-heading">
  <div class="swapp-voice-brand">
   <span class="swapp-voice-mark" aria-hidden="true"><svg viewBox="0 0 36 36"><path d="M8 16v4M13 10v16M18 6v24M23 11v14M28 16v4"/></svg></span>
   <div><span class="swapp-voice-eyebrow">SOCIAL / EN DIRECT</span><strong>Salon vocal</strong><small>6 personnes · Aucun enregistrement</small></div>
  </div>
  <span id="swapp-voice-live" class="swapp-voice-live">Hors ligne</span>
 </header>
 <div class="swapp-voice-stage">
  <div class="swapp-voice-room">
   <div><span class="swapp-voice-room-tag">CONVERSATION</span><h3 id="swapp-voice-room-name">Choisis un salon</h3><p id="swapp-voice-room-game">Sélectionne un salon de discussion ci-dessous.</p></div>
   <div class="swapp-voice-room-count"><strong id="swapp-voice-count">0</strong><span> / 6 connectés</span></div>
  </div>
  <div class="swapp-voice-members-title"><strong>Participants</strong><span id="swapp-voice-member-caption">En attente de connexion</span></div>
  <div id="swapp-voice-peers" class="swapp-voice-peers" aria-label="Participants audio"></div>
 </div>
 <footer class="swapp-voice-footer">
  <div class="swapp-voice-controls">
   <button type="button" id="swapp-voice-join" class="swapp-voice-primary" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18a7 7 0 0 1 0-12M15 6a7 7 0 0 1 0 12M4 12h16"/></svg>Rejoindre le vocal</button>
   <button type="button" id="swapp-voice-mute" class="swapp-voice-control" aria-pressed="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg><span data-voice-label>Micro actif</span></button>
   <button type="button" id="swapp-voice-deafen" class="swapp-voice-control" aria-pressed="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13v-2a9 9 0 0 1 18 0v2M4 13h3v7H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM20 13h-3v7h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"/></svg><span data-voice-label>Écouter</span></button>
   <button type="button" id="swapp-voice-play" class="swapp-voice-control" hidden>Activer le son</button>
   <button type="button" id="swapp-voice-leave" class="swapp-voice-leave" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 8 2-2a12 12 0 0 1 14 0l2 2-3 5-4-2v-2a11 11 0 0 0-4 0v2l-4 2Z"/></svg>Quitter</button>
  </div>
  <p id="swapp-voice-notice" class="swapp-voice-notice" role="status" aria-live="polite">Sélectionne un salon pour rejoindre l’audio.</p>
 </footer>
 <div id="swapp-voice-audio" hidden></div>
`;
 // Keep the voice controls above the list of rooms, immediately visible on entry.
 // Joining still requires choosing or creating an actual room first.
 container.insertBefore(section,area.querySelector('#ssi-room-results'));
 const $=selector=>section.querySelector(selector);
 const joinButton=$('#swapp-voice-join'),muteButton=$('#swapp-voice-mute');
 const leaveButton=$('#swapp-voice-leave'),status=$('#swapp-voice-notice'),playButton=$('#swapp-voice-play');
 const live=$('#swapp-voice-live'),people=$('#swapp-voice-peers'),audioHost=$('#swapp-voice-audio');
 const roomLabel=$('#swapp-voice-room-name'),gameLabel=$('#swapp-voice-room-game');
 const countLabel=$('#swapp-voice-count'),caption=$('#swapp-voice-member-caption');
 const deafenButton=$('#swapp-voice-deafen');
 let selectedRoom=String(area.dataset.activeSocialRoom||''),connectedRoom='',busy=false,muted=false,deafened=false;
 let selectedRoomName='',selectedRoomGame='';
 const tiles=new Map(),meters=new Map();
 let audioContext=null,meterFrame=0,lastFrame=0;
 let socket=null,media=null,iceServers=[],lifecycle=0;
 const peers=new Map();
 const profiles=new Map();
 const notice=value=>{status.textContent=value};

 function updateRoomDetails(){
  if(!selectedRoom){selectedRoomName='';selectedRoomGame='';return}
  const option=[...area.querySelectorAll('[data-room]')].find(el=>el.dataset.room===selectedRoom);
  if(option){
   selectedRoomName=option.querySelector('.ssi-room-name')?.textContent?.replace(/^#\s*/,'').trim()||'Salon sélectionné';
   selectedRoomGame=option.querySelector('.ssi-room-game')?.textContent?.trim()||'';
  }else if(!selectedRoomName)selectedRoomName='Salon sélectionné';
 }
 function tile(id,handle,isSelf,isMuted){
  let node=tiles.get(id);
  if(!node){
   node=document.createElement('div');node.className='swapp-voice-participant';
   node.innerHTML='<span class="swapp-voice-avatar"><span class="swapp-voice-initial"></span><span class="swapp-voice-activity" aria-hidden="true"><i></i><i></i><i></i></span></span>'+
    '<span class="swapp-voice-person"><strong></strong><small></small></span>';
   tiles.set(id,node);
  }
  const name=String(handle||'Membre').slice(0,42);
  node.querySelector('.swapp-voice-initial').textContent=name.replace(/^@/,'').slice(0,1).toUpperCase()||'?';
  node.querySelector('strong').textContent=name;
  node.querySelector('small').textContent=isMuted?'Micro coupé':(isSelf?'Vous':'Connecté');
  node.classList.toggle('is-self',isSelf);
  node.classList.toggle('is-muted',Boolean(isMuted));
  if(isMuted)node.classList.remove('is-speaking');
  return node;
 }
 function repaint(){
  const joined=Boolean(socket?.connected&&media&&connectedRoom);
  updateRoomDetails();
  section.dataset.voiceState=joined?'connected':busy?'connecting':'idle';
  roomLabel.textContent=selectedRoomName||'Choisis un salon';
  gameLabel.textContent=selectedRoom?(selectedRoomGame||'Conversation de joueurs'):'Sélectionne un salon de discussion ci-dessous.';
  joinButton.hidden=joined;joinButton.disabled=busy||!selectedRoom;
  muteButton.hidden=!joined;deafenButton.hidden=!joined;leaveButton.hidden=!joined;
  if(!joined)playButton.hidden=true;
  muteButton.querySelector('[data-voice-label]').textContent=muted?'Micro coupé':'Micro actif';
  deafenButton.querySelector('[data-voice-label]').textContent=deafened?'Son coupé':'Écouter';
  muteButton.setAttribute('aria-pressed',String(muted));
  deafenButton.setAttribute('aria-pressed',String(deafened));
  live.textContent=joined?(muted?'Micro coupé':'Connecté'):busy?'Connexion…':'Hors ligne';
  live.classList.toggle('is-live',joined);
  const members=joined?[{id:'__self',handle:'Vous',self:true,muted},...profiles.entries().map(([id,value])=>({id,handle:value.handle,muted:!!value.muted,self:false}))]:[];
  countLabel.textContent=String(members.length);
  caption.textContent=joined?members.length+' / 6 connectés':'En attente de connexion';
  if(!joined){
   tiles.clear();
   const empty=document.createElement('div');empty.className='swapp-voice-empty';
   empty.textContent=selectedRoom?'Salon prêt. Rejoins-le pour prendre la parole.':'Choisis un salon pour parler avec la communauté.';
   people.replaceChildren(empty);
   return;
  }
  const nodes=members.map(person=>tile(person.id,person.handle,person.self,person.muted));
  for(const id of [...tiles.keys()])if(!members.some(p=>p.id===id))tiles.delete(id);
  people.replaceChildren(...nodes);
 }

 function stopMeter(id){
  const track=meters.get(id);if(!track)return;
  try{track.source.disconnect();track.analyser.disconnect()}catch{}
  meters.delete(id);
  tiles.get(id)?.classList.remove('is-speaking');
 }
 function stopAllMeters(){
  if(meterFrame)cancelAnimationFrame(meterFrame);
  meterFrame=0;lastFrame=0;
  for(const id of [...meters.keys()])stopMeter(id);
  const context=audioContext;audioContext=null;
  if(context)context.close().catch(()=>{});
 }
 function updateAudioMeters(time){
  meterFrame=0;
  if(time-lastFrame>=100){
   lastFrame=time;
   for(const [id,entry] of meters){
    const node=tiles.get(id);if(!node)continue;
    entry.analyser.getByteTimeDomainData(entry.values);
    let energy=0;
    for(const sample of entry.values){const value=(sample-128)/128;energy+=value*value}
    const volume=Math.sqrt(energy/entry.values.length);
    const isMuted=id==='__self'?muted:!!profiles.get(id)?.muted;
    node.classList.toggle('is-speaking',!isMuted&&volume>0.042);
    node.style.setProperty('--voice-level',String(Math.max(.15,Math.min(1,volume*9))));
   }
  }
  if(meters.size)meterFrame=requestAnimationFrame(updateAudioMeters);
 }
 async function attachAudioMeter(id,stream){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context||!stream?.getAudioTracks?.().length)return;
  try{
   if(!audioContext)audioContext=new Context();
   if(audioContext.state==='suspended')await audioContext.resume();
   if(!media||id!=='__self'&&!connectedRoom)return;
   stopMeter(id);
   const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();
   analyser.fftSize=512;analyser.smoothingTimeConstant=.6;
   source.connect(analyser);
   meters.set(id,{source,analyser,values:new Uint8Array(analyser.fftSize)});
   if(!meterFrame)meterFrame=requestAnimationFrame(updateAudioMeters);
  }catch{}
 }
 function closePeer(id){
  const peer=peers.get(id);
  if(!peer)return;
  peer.pc.ontrack=null;peer.pc.onicecandidate=null;peer.pc.onconnectionstatechange=null;
  peer.pc.close();peer.audio?.remove();peers.delete(id);stopMeter(id);tiles.delete(id);
 }
 function leave(){
  lifecycle++;
  socket?.emit('voice:leave');
  socket?.disconnect();socket=null;
  for(const id of [...peers.keys()])closePeer(id);
  profiles.clear();audioHost.replaceChildren();playButton.hidden=true;
  stopAllMeters();
  media?.getTracks().forEach(track=>track.stop());media=null;
  connectedRoom='';busy=false;muted=false;deafened=false;repaint();
 }
 function send(to,kind,data){
  if(socket?.connected&&connectedRoom)socket.emit('voice:signal',{to,kind,data});
 }
 function ensurePeer(id){
  if(peers.has(id))return peers.get(id);
  if(!media)return null;
  const pc=new RTCPeerConnection({iceServers,iceTransportPolicy:'all'});
  const element=document.createElement('audio');
  element.autoplay=true;element.playsInline=true;
  element.setAttribute('aria-label','Audio du membre du salon');
  audioHost.append(element);
  const peer={pc,audio:element,queued:[]};
  peers.set(id,peer);
  media.getTracks().forEach(track=>pc.addTrack(track,media));
  pc.onicecandidate=event=>{if(event.candidate)send(id,'ice',event.candidate.toJSON())};
  pc.ontrack=event=>{
   const stream=event.streams?.[0]||new MediaStream([event.track]);
   element.srcObject=stream;
   element.muted=deafened;
   void attachAudioMeter(id,stream);
   if(deafened)return;
   element.play().catch(()=>{
    playButton.hidden=false;
    notice('Ton navigateur bloque la lecture automatique. Utilise « Activer le son ».');
   });
  };
  pc.onconnectionstatechange=()=>{
   if(pc.connectionState==='failed')notice('Une connexion audio a échoué. Un relais TURN peut être nécessaire.');
  };
  return peer;
 }
 async function startOffer(id){
  const peer=ensurePeer(id);if(!peer)return;
  try{
   const offer=await peer.pc.createOffer();
   await peer.pc.setLocalDescription(offer);
   send(id,'offer',peer.pc.localDescription.toJSON());
  }catch{notice('Impossible d’établir la connexion audio.')}
 }
 async function onSignal(packet){
  const id=packet?.from;
  if(typeof id!=='string'||!connectedRoom||!media)return;
  const peer=ensurePeer(id);
  if(!peer)return;
  try{
   if(packet.kind==='offer'){
    await peer.pc.setRemoteDescription(new RTCSessionDescription(packet.data));
    const answer=await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    send(id,'answer',peer.pc.localDescription.toJSON());
   }else if(packet.kind==='answer'){
    await peer.pc.setRemoteDescription(new RTCSessionDescription(packet.data));
   }else if(packet.kind==='ice'){
    if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(new RTCIceCandidate(packet.data));
    else peer.queued.push(packet.data);
   }
   if(peer.pc.remoteDescription){
    for(const candidate of peer.queued.splice(0))await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
   }
  }catch{notice('Échange audio incomplet avec un participant.')}
 }
 async function join(){
  if(busy||!selectedRoom||media)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||
   !window.RTCPeerConnection||typeof window.io!=='function'){
   notice('L’audio nécessite HTTPS, un navigateur récent et une connexion temps réel.');
   return;
  }
  busy=true;repaint();const revision=++lifecycle,room=selectedRoom;
  notice('Autorise le microphone pour rejoindre le salon…');
  try{
   // Microphone permission occurs ONLY after an explicit user click.
   const local=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
   });
   if(revision!==lifecycle){local.getTracks().forEach(t=>t.stop());return}
   media=local;
   void attachAudioMeter('__self',local);
   const response=await fetch('/api/swapp/social/voice-ticket',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Accept':'application/json','Content-Type':'application/json'},body:'{}'
   });
   const auth=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(({
    swapp_account_required:'Connecte-toi à SWAPP pour parler.',
    social_storage_unavailable:'Les salons SOCIAL sont actuellement indisponibles.'
   })[auth.error]||'Accès vocal indisponible.');
   if(revision!==lifecycle){leave();return}
   iceServers=Array.isArray(auth.iceServers)?auth.iceServers:[];
   const connection=window.io('/swapp-social-voice',{
    reconnection:false,transports:['websocket','polling'],auth:{ticket:auth.ticket}
   });
   socket=connection;
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Connexion au salon expirée.')),12000);
    connection.once('connect',()=>{clearTimeout(timer);resolve()});
    connection.once('connect_error',error=>{clearTimeout(timer);reject(error)});
   });
   if(revision!==lifecycle||room!==selectedRoom){leave();return}
   // Register signalling listeners BEFORE requesting the room. The first SDP offer
   // can arrive before the join acknowledgment, especially on fast connections.
   connectedRoom=room;
   connection.on('voice:joined',payload=>{
    if(!payload?.id||!connectedRoom)return;
    profiles.set(payload.id,{handle:payload.handle});repaint();void startOffer(payload.id);
   });
   connection.on('voice:left',payload=>{
    if(!payload?.id)return;profiles.delete(payload.id);closePeer(payload.id);repaint();
   });
   connection.on('voice:mute',payload=>{
    if(!profiles.has(payload?.id))return;
    profiles.get(payload.id).muted=Boolean(payload.muted);repaint();
   });
   connection.on('voice:signal',packet=>{void onSignal(packet)});
   connection.on('disconnect',()=>{
    if(connectedRoom){leave();notice('Connexion vocale interrompue. Rejoins le salon pour réessayer.')}
   });
   const result=await new Promise((resolve,reject)=>{
    connection.timeout(12000).emit('voice:join',{roomId:room},(err,data)=>
     err?reject(Error('Le salon ne répond pas.')):resolve(data));
   });
   if(!result?.ok)throw Error(({
    room_full:'Salon vocal complet (6 personnes).',
    not_found:'Ce salon n’existe plus.',
    social_storage_unavailable:'Serveur des salons indisponible.'
   })[result?.error]||'Impossible de rejoindre le salon.');
   if(revision!==lifecycle){leave();return}
   busy=false;
   for(const profile of result.peers||[])if(profile?.id&&!profiles.has(profile.id))profiles.set(profile.id,{handle:profile.handle});
   notice('Microphone ouvert. La voix est transmise directement aux autres participants.');
   repaint();
  }catch(error){
   if(revision===lifecycle){
    leave();
    notice(error?.name==='NotAllowedError'?'Autorisation du microphone refusée.':
     error?.name==='NotFoundError'?'Aucun microphone détecté.':
     error?.message||'Audio indisponible. Vérifie le micro et la connexion.');
   }
  }
 }
 joinButton.addEventListener('click',()=>{void join()});
 playButton.addEventListener('click',()=>{
  Promise.allSettled([...audioHost.querySelectorAll('audio')].map(el=>el.play())).then(results=>{
   const blocked=results.some(r=>r.status==='rejected');
   playButton.hidden=!blocked;
   notice(blocked?'Le navigateur refuse encore le son. Vérifie ses autorisations.':'Son activé pour ce salon vocal.');
  });
 });
 muteButton.addEventListener('click',()=>{
  if(!media||!connectedRoom)return;
  muted=!muted;
  media.getAudioTracks().forEach(track=>{track.enabled=!muted});
  socket?.emit('voice:mute',muted);
  repaint();
 });
 leaveButton.addEventListener('click',()=>{leave();notice('Tu as quitté le salon vocal.')});
 area.addEventListener('ssi:room-selected',event=>{
  const id=String(event.detail?.id||'');
  if(id===selectedRoom)return;
  if(media||socket)leave();
  selectedRoom=id;notice(id?'Rejoins ce salon vocal lorsque tu le souhaites.':'Choisis un salon de discussion.');
  repaint();
 });
 const observer=new MutationObserver(()=>{
  if(host.dataset.socialView!=='rooms'&&(media||socket)){
   leave();notice('Microphone fermé en quittant les salons.');
  }
 });
 observer.observe(host,{attributes:true,attributeFilter:['data-social-view']});
 window.addEventListener('pagehide',leave);
 repaint();
})();
