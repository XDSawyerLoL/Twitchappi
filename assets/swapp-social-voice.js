// SWAPP SOCIAL — voluntary audio rooms (WebRTC mesh, no recording).
(()=>{
 'use strict';
 const host=document.getElementById('swappSocialNative');
 const area=host?.querySelector('.swapp-interactive');
 const container=area?.querySelector('#ssi-chat-panel .ssi-panel-inner');
 if(!area||!container)return;

 const section=document.createElement('section');
 section.className='swapp-voice';section.setAttribute('aria-label','Salon vocal');
 section.innerHTML=`
  <div class="swapp-voice-heading"><div><strong>Salon vocal</strong><small>6 participants maximum · aucun enregistrement</small></div><span id="swapp-voice-live" class="swapp-voice-live">Hors ligne</span></div>
  <p id="swapp-voice-notice" class="swapp-voice-notice" role="status" aria-live="polite">Sélectionne un salon pour rejoindre l’audio.</p>
  <div class="swapp-voice-controls">
   <button type="button" id="swapp-voice-join" disabled>Rejoindre le vocal</button>
   <button type="button" id="swapp-voice-mute" hidden>Couper le micro</button>
   <button type="button" id="swapp-voice-leave" hidden>Quitter</button>
  </div>
  <div id="swapp-voice-peers" class="swapp-voice-peers" aria-label="Participants audio"></div>
  <div id="swapp-voice-audio" hidden></div>`;
 container.insertBefore(section,area.querySelector('#ssi-chat-body'));
 const $=selector=>section.querySelector(selector);
 const joinButton=$('#swapp-voice-join'),muteButton=$('#swapp-voice-mute');
 const leaveButton=$('#swapp-voice-leave'),status=$('#swapp-voice-notice');
 const live=$('#swapp-voice-live'),people=$('#swapp-voice-peers'),audioHost=$('#swapp-voice-audio');
 let selectedRoom=String(area.dataset.activeSocialRoom||''),connectedRoom='',busy=false,muted=false;
 let socket=null,media=null,iceServers=[],lifecycle=0;
 const peers=new Map();
 const profiles=new Map();
 const notice=value=>{status.textContent=value};
 function repaint(){
  const joined=Boolean(socket?.connected&&media&&connectedRoom);
  joinButton.hidden=joined;
  joinButton.disabled=busy||!selectedRoom;
  muteButton.hidden=!joined;leaveButton.hidden=!joined;
  muteButton.textContent=muted?'Activer le micro':'Couper le micro';
  muteButton.setAttribute('aria-pressed',String(muted));
  live.textContent=joined?'Micro actif':'Hors ligne';
  live.classList.toggle('is-live',joined);
  people.replaceChildren();
  if(!joined)return;
  const members=[{handle:'Vous'+(muted?' (muet)':'')},...profiles.values()];
  for(const member of members){
   const item=document.createElement('span');
   item.className='swapp-voice-participant';
   item.textContent=String(member.handle||'Membre').slice(0,60)+(member.muted?' · muet':'');
   people.appendChild(item);
  }
 }
 function closePeer(id){
  const peer=peers.get(id);
  if(!peer)return;
  peer.pc.ontrack=null;peer.pc.onicecandidate=null;peer.pc.onconnectionstatechange=null;
  peer.pc.close();peer.audio?.remove();peers.delete(id);
 }
 function leave(){
  lifecycle++;
  socket?.emit('voice:leave');
  socket?.disconnect();socket=null;
  for(const id of [...peers.keys()])closePeer(id);
  profiles.clear();audioHost.replaceChildren();
  media?.getTracks().forEach(track=>track.stop());media=null;
  connectedRoom='';busy=false;muted=false;repaint();
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
   element.play().catch(()=>{
    notice('Le navigateur bloque la lecture. Active le son ou touche la page pour écouter.');
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
