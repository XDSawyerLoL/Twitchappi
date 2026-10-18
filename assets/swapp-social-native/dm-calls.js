// One-to-one WebRTC audio calls for signed-in SWAPP SOCIAL members.
// Incoming invitation never activates a microphone; the receiver must accept.
import {state} from './core.js';
const TOKEN_URL='/api/swapp/social/voice-ticket';
const errorText={
 invalid_recipient:'Membre introuvable.',offline:'Ce membre n’est pas connecté à SOCIAL.',
 busy:'Ce membre est déjà occupé.',rate_limited:'Attends avant de relancer un appel.',
 expired:'Cet appel n’est plus disponible.'
};

export function setupDirectCalls(){
 const host=document.getElementById('swappSocialNative');
 if(!host)return;
 const tray=document.createElement('div');
 tray.className='pulse-call-panel';tray.hidden=true;tray.setAttribute('role','status');
 tray.innerHTML='<strong data-call-title>Appel vocal</strong><p data-call-status aria-live="polite"></p>'+
  '<div class="pulse-call-actions"><button type="button" data-call-accept hidden>Accepter</button>'+
  '<button type="button" data-call-decline hidden>Refuser</button>'+
  '<button type="button" data-call-mute hidden>Couper le micro</button>'+
  '<button type="button" data-call-listen hidden>Activer le son</button>'+
  '<button type="button" data-call-end hidden>Raccrocher</button></div>';
 host.appendChild(tray);
 const $=q=>tray.querySelector(q);
 const speaker=document.createElement('audio');speaker.autoplay=true;speaker.playsInline=true;
 speaker.setAttribute('aria-label','Audio du correspondant');tray.appendChild(speaker);
 let socket=null,connecting=null,mic=null,peer=null,ice=[],call=null,muted=false,iceServers=[],seq=0;
 let pending=[],connectAt=0;
 function show(text,title='Appel vocal'){
  tray.hidden=false;
  $('[data-call-title]').textContent=title;
  $('[data-call-status]').textContent=text;
  const incoming=call?.phase==='ringing-in';
  $('[data-call-accept]').hidden=!incoming;
  $('[data-call-decline]').hidden=!incoming;
  $('[data-call-mute]').hidden=call?.phase!=='active';
  $('[data-call-listen]').hidden=true;
  $('[data-call-end]').hidden=(!call||incoming);
  $('[data-call-mute]').textContent=muted?'Réactiver le micro':'Couper le micro';
 }
 function reset({signal=false}={}){
  const old=call;call=null;seq++;
  if(signal&&old?.id)socket?.emit('call:end',{callId:old.id});
  if(peer){peer.ontrack=null;peer.onicecandidate=null;peer.close();peer=null}
  if(mic){mic.getTracks().forEach(track=>track.stop());mic=null}
  speaker.srcObject=null;ice=[];pending=[];muted=false;
  tray.hidden=true;
 }
 function provideIce(){
  return iceServers;
 }
 function createPeer(id,role){
  if(!mic||peer)return;
  peer=new RTCPeerConnection({iceServers:provideIce()});
  mic.getTracks().forEach(track=>peer.addTrack(track,mic));
  peer.onicecandidate=event=>{
   if(event.candidate&&call?.id&&call.peerId===id)
    socket?.emit('call:signal',{callId:call.id,kind:'ice',data:event.candidate.toJSON()});
  };
  peer.ontrack=event=>{
   speaker.srcObject=event.streams?.[0]||new MediaStream([event.track]);
   speaker.play().catch(()=>{
    $('[data-call-listen]').hidden=false;
    $('[data-call-status]').textContent='Appuie sur « Activer le son » pour écouter.';
   });
  };
  peer.onconnectionstatechange=()=>{
   if(peer?.connectionState==='failed')show('Connexion audio impossible. Un relais TURN peut être nécessaire.');
  };
  if(role==='caller')void sendOffer();
 }
 async function sendOffer(){
  try{
   if(!peer||!call)return;
   const offer=await peer.createOffer();
   await peer.setLocalDescription(offer);
   socket?.emit('call:signal',{callId:call.id,kind:'offer',data:peer.localDescription.toJSON()});
  }catch{show('Impossible de démarrer le flux audio.')}
 }
 async function handleSignal(message){
  if(!call||call.phase!=='active'||!peer||call.id!==message?.callId||
    call.peerId!==message?.from)return;
  try{
   if(message.kind==='offer'){
    await peer.setRemoteDescription(new RTCSessionDescription(message.data));
    const answer=await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket?.emit('call:signal',{callId:call.id,kind:'answer',data:peer.localDescription.toJSON()});
   }else if(message.kind==='answer'){
    await peer.setRemoteDescription(new RTCSessionDescription(message.data));
   }else if(message.kind==='ice'){
    if(peer.remoteDescription)await peer.addIceCandidate(new RTCIceCandidate(message.data));
    else pending.push(message.data);
   }
   if(peer.remoteDescription){
    for(const candidate of pending.splice(0))
     await peer.addIceCandidate(new RTCIceCandidate(candidate));
   }
  }catch{show('La connexion audio du correspondant est incomplète.')}
 }
 async function microphone(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)
   throw Error('Microphone ou WebRTC indisponible sur ce navigateur.');
  return navigator.mediaDevices.getUserMedia({
   audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
  });
 }
 function attach(instance){
  instance.on('call:incoming',packet=>{
   if(!packet?.callId||call)return;
   call={id:packet.callId,handle:packet.fromHandle,phase:'ringing-in',peerId:''};
   show('Appel entrant de @'+packet.fromHandle,'Appel entrant');
  });
  instance.on('call:answered-elsewhere',packet=>{
   if(call?.id===packet?.callId&&call.phase==='ringing-in')reset();
  });
  instance.on('call:accepted',packet=>{
   if(!call||call.id!==packet?.callId||!mic)return;
   call.phase='active';call.peerId=packet.peer;
   show('Conversation audio avec @'+call.handle,'Appel en cours');
   createPeer(packet.peer,packet.role);
  });
  instance.on('call:signal',packet=>{void handleSignal(packet)});
  instance.on('call:ended',packet=>{
   if(call?.id!==packet?.callId)return;
   reset();
  });
  instance.on('disconnect',()=>{
   if(call)reset();
   if(socket===instance)socket=null;
  });
 }
 async function connect(){
  if(socket?.connected)return socket;
  if(connecting)return connecting;
  if(!state.user||typeof window.io!=='function')return null;
  connecting=(async()=>{
   const response=await fetch(TOKEN_URL,{method:'POST',credentials:'same-origin',
    headers:{Accept:'application/json','Content-Type':'application/json'},body:'{}',cache:'no-store'});
   if(!response.ok)throw Error('Accès aux appels indisponible.');
   const data=await response.json();
   iceServers=Array.isArray(data.iceServers)?data.iceServers:[];
   const instance=window.io('/swapp-social-voice',{
    auth:{ticket:data.ticket},transports:['websocket','polling'],reconnection:false
   });
   attach(instance);
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Connexion vocale expirée.')),12000);
    instance.once('connect',()=>{clearTimeout(timer);resolve()});
    instance.once('connect_error',error=>{clearTimeout(timer);reject(error)});
   }).catch(error=>{instance.disconnect();throw error});
   socket=instance;connectAt=Date.now();return socket;
  })().finally(()=>{connecting=null});
  return connecting;
 }
 async function invite(handle){
  if(call)return;
  if(!state.user){alert('Connecte-toi à SWAPP pour appeler.');return}
  const revision=++seq;
  show('Connexion au service des appels…');
  try{
   const connection=await connect();
   if(!connection)throw Error('Service des appels indisponible.');
   // The initiator explicitly allows their microphone when clicking Call.
   const local=await microphone();
   if(revision!==seq){local.getTracks().forEach(track=>track.stop());return}
   mic=local;call={id:'',handle,phase:'dialing',peerId:''};
   show('Appel de @'+handle+'…');
   const result=await new Promise((resolve,reject)=>{
    connection.timeout(12000).emit('call:invite',{handle},(error,data)=>
     error?reject(Error('Le serveur ne répond pas.')):resolve(data));
   });
   if(revision!==seq){reset();return}
   if(!result?.ok)throw Error(errorText[result?.error]||'Appel impossible.');
   call.id=result.callId;call.phase='waiting';
   show('Appel de @'+handle+'… En attente de réponse.');
  }catch(error){
   reset();alert(error?.name==='NotAllowedError'?'Autorisation du microphone refusée.':error.message);
  }
 }
 async function accept(){
  if(call?.phase!=='ringing-in')return;
  const current=call,revision=seq;
  show('Ouverture du microphone…');
  try{
   mic=await microphone();
   if(call!==current||revision!==seq){mic.getTracks().forEach(track=>track.stop());mic=null;return}
   const result=await new Promise((resolve,reject)=>{
    socket.timeout(12000).emit('call:answer',{callId:call.id,accept:true},(error,data)=>
     error?reject(Error('Le serveur ne répond pas.')):resolve(data));
   });
   if(!result?.ok)throw Error(errorText[result?.error]||'Appel expiré.');
   // The caller is responsible for issuing the initial offer.
   call.phase='active';call.peerId=result.peer;
   createPeer(result.peer,'callee');
   show('Conversation audio avec @'+call.handle,'Appel en cours');
  }catch(error){
   socket?.emit('call:answer',{callId:current.id,accept:false});
   reset();
   alert(error?.name==='NotAllowedError'?'Microphone refusé.':error.message);
  }
 }
 tray.addEventListener('click',event=>{
  if(event.target.closest('[data-call-accept]')){void accept();return}
  if(event.target.closest('[data-call-decline]')){
   socket?.emit('call:answer',{callId:call?.id,accept:false});reset();return;
  }
  if(event.target.closest('[data-call-end]')){reset({signal:true});return}
  if(event.target.closest('[data-call-mute]')){
   muted=!muted;
   mic?.getAudioTracks().forEach(track=>{track.enabled=!muted});
   show(muted?'Microphone coupé.':'Microphone actif.','Appel en cours');return;
  }
  if(event.target.closest('[data-call-listen]')){
   speaker.play().then(()=>{event.target.hidden=true}).catch(()=>{});
  }
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-call-handle]');
  if(!button)return;
  const handle=button.dataset.callHandle;
  if(handle)void invite(handle);
 });
 // Presence is available while SOCIAL is open. No incoming system pushes off-site.
 void connect().catch(()=>{});
 setInterval(()=>{if(state.user&&!socket?.connected&&!connecting&&Date.now()-connectAt>15000)
  void connect().catch(()=>{});},45000);
 window.addEventListener('pagehide',()=>{reset({signal:true});socket?.disconnect()});
}
