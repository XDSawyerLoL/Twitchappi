'use strict';
/*
 * SWAPP Live Creator Studio — UI only.
 * All stream state and video come from existing local APIs; this file does not
 * simulate a live feed, subscriber activity, or a scene-compositing engine.
 */
(function(){
 const $=id=>document.getElementById(id);
 const video=$('video'),empty=$('emptyPreview');
 const previewButton=$('previewButton'),liveButton=$('liveButton'),stopButton=$('stopButton');
 const account=$('account'),connectButton=$('connectButton');
 const presetButtons=Array.from(document.querySelectorAll('[data-preset]'));
 const settings=['display','fps','bitrate','audio','mic','encoder','captureMode','obsSource'];
 const storageKey='swapp.creator.studio.settings.v1';
 let connected=false,login='',configuredKey='',captureKey='',capturing=false,published=false;
 let previewReady=false,working=false,hls=null,libobsAvailable=false,activeEngine='',lastMessage='',darkChecks=0,externalSource=false;
 let savedAudio='',savedMic='';

 function activity(message,kind=''){
  const feed=$('activityList');
  if(!feed)return;
  const entry=document.createElement('div');
  entry.className='activity-entry'+(kind?' '+kind:'');
  const dot=document.createElement('span');dot.className='activity-dot';dot.setAttribute('aria-hidden','true');
  const body=document.createElement('div'),title=document.createElement('strong'),time=document.createElement('time');
  title.textContent=String(message||'').replace(/\s+/g,' ').slice(0,180);
  const now=new Date();time.dateTime=now.toISOString();
  time.textContent=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  body.append(title,time);entry.append(dot,body);feed.prepend(entry);
  while(feed.childElementCount>24)feed.lastElementChild.remove();
 }

 function status(message,kind=''){
  const badge=$('badge');
  badge.textContent=message;
  badge.dataset.error=kind==='error'?'1':'0';
  badge.dataset.live=kind==='live'?'1':'0';
  if(message!==lastMessage){activity(message,kind);lastMessage=message}
 }

 function persist(){
  try{
   const next={};
   for(const id of settings)next[id]=$(id).value;
   localStorage.setItem(storageKey,JSON.stringify(next));
  }catch(_){}
 }

 function restore(){
  try{
   const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
   for(const id of settings){
    if(typeof saved[id]==='string'&&Array.from($(id).options).some(o=>o.value===saved[id]))$(id).value=saved[id];
   }
   savedAudio=String(saved.audio||'');savedMic=String(saved.mic||'');
  }catch(_){}
 }

 function sourceLabel(){
  const mode=$('captureMode').value,monitor=Number($('display').value)+1;
  if(mode==='external')return 'Signal OBS/RTMP externe';
  if(mode==='libobs')return $('obsSource').value==='game'?'Jeu plein écran (libobs)':'Écran via libobs';
  if(mode==='gdigrab')return 'Bureau complet (Windows)';
  if(mode==='ddagrab')return 'Écran '+monitor+' (DirectX)';
  return 'Détection automatique';
 }

 function syncPresets(){
  const mode=$('captureMode').value,display=$('display').value,source=$('obsSource').value;
  let selected='';
  if(mode==='ddagrab'&&display==='0')selected='primary';
  else if(mode==='ddagrab'&&display==='1')selected='secondary';
  else if(mode==='gdigrab')selected='desktop';
  else if(mode==='libobs'&&source==='game')selected='game';
  else if(mode==='external')selected='external';
  for(const button of presetButtons){
   const active=button.dataset.preset===selected;
   button.classList.toggle('is-selected',active);
   button.setAttribute('aria-pressed',String(active));
   button.disabled=working||capturing||(button.dataset.preset==='game'&&!libobsAvailable);
  }
  $('activeSourceText').textContent='Source : '+sourceLabel();
  $('engineChip').textContent='Moteur : '+(activeEngine||(mode==='ddagrab'?'DirectX':mode==='gdigrab'?'GDI':mode==='libobs'?'libobs':'Auto'));
  $('presetHelp').textContent=selected==='game'
   ?'Capture du jeu natif via libobs. Le moteur doit être compilé et installé.'
   :selected==='external'
   ?'Signal RTMP externe détecté automatiquement dès que la source envoie du H.264/AAC. L’aperçu et le bouton Direct s’activent lorsqu’un flux réel arrive.'
   :selected==='desktop'
   ?'Mode compatible : toute la surface du bureau Windows peut être visible, y compris des informations privées.'
   :mode==='auto'
   ?'Détection automatique avec repli FFmpeg. Les réglages sont conservés sur ce PC.'
   :'Le moniteur est sélectionné pour le prochain aperçu. Pour changer en cours de live, arrête d’abord la capture.';
  $('metricEncoder').textContent=activeEngine==='libobs'?'Géré par libobs':$('encoder').selectedOptions[0]?.textContent||'Automatique';
  $('metricQuality').textContent='1080p · '+$('fps').value+' IPS';
  $('metricBitrate').textContent=(Number($('bitrate').value)/1000).toLocaleString('fr-FR')+' Mb/s';
  $('frameQuality').textContent='1920 × 1080 · '+$('fps').value+' IPS cible';
 }

 function buttons(){
  previewButton.disabled=working||capturing||!connected||$('captureMode').value==='external';
  liveButton.disabled=working||!capturing||!previewReady||!connected||captureKey!==configuredKey||published;
  stopButton.disabled=working||(!capturing&&!published)||(externalSource&&!published);
  for(const id of settings.slice(0,7))$(id).disabled=working||capturing;
  const nativeMode=$('captureMode').value;
  $('obsSource').disabled=working||capturing||!libobsAvailable||nativeMode==='ddagrab'||nativeMode==='gdigrab';
  $('soundToggle').disabled=!capturing||!previewReady;
  $('copyKey').disabled=!connected;
  $('revealKey').disabled=!connected;
  $('disconnectButton').disabled=!connected||working||capturing||published;
  $('repairButton').disabled=!published||working;
  const nativeOpt=$('captureMode').querySelector('option[value="libobs"]');
  if(nativeOpt)nativeOpt.disabled=!libobsAvailable;
  const top=$('topLiveState'),corner=$('previewStateLabel');
  const state=published?'live':capturing?'preview':'';
  top.className='state-pill'+(state?' '+state:'');
  top.textContent=published?'EN DIRECT':capturing?'APERÇU LOCAL':'HORS LIGNE';
  corner.className='frame-tag'+(published?' live':'');
  corner.textContent=published?'EN DIRECT · SWAPP':capturing?'APERÇU LOCAL':'APERÇU INACTIF';
  syncPresets();
 }

 function choosePreset(key){
  if(working||capturing)return;
  if(key==='game'&&!libobsAvailable){
   status('Game Capture nécessite un moteur libobs compilé. Essaie DirectX ou Bureau complet.','error');
   return;
  }
  switch(key){
   case 'primary':
    $('captureMode').value='ddagrab';$('display').value='0';$('obsSource').value='display';break;
   case 'secondary':
    $('captureMode').value='ddagrab';$('display').value='1';$('obsSource').value='display';break;
   case 'desktop':
    $('captureMode').value='gdigrab';$('obsSource').value='display';break;
   case 'game':
    $('captureMode').value='libobs';$('obsSource').value='game';break;
   case 'external':
    $('captureMode').value='external';$('obsSource').value='display';break;
   default:return;
  }
  persist();buttons();
  status('Source sélectionnée : '+sourceLabel()+'. Lance la prévisualisation pour vérifier l’image.');
 }

 async function api(url,options){
  const response=await fetch(url,{cache:'no-store',...options});
  const json=await response.json().catch(()=>({success:false,error:'Réponse serveur illisible.'}));
  if(!response.ok||json.success===false)throw new Error(json.error||'Erreur HTTP '+response.status);
  return json;
 }

 async function getAccount(){
  try{
   const data=await api('/api/account/status');
   const wasConnected=connected,oldLogin=login;
   connected=!!data.connected;
   login=data.user?.login||'';
   configuredKey=connected?(data.stream_key||''):'';
   $('streamKey').value=configuredKey;
   // This is a password input by default. Never persist or log stream credentials.
   if(capturing&&connected&&captureKey!==configuredKey&&!working)
    status('La clé SWAPP a changé. Arrête puis relance la capture pour publier.','error');
   account.textContent=connected?'@'+login:'Compte non connecté';
   $('profileName').textContent=connected?'@'+login:'Non connecté';
   $('profileMeta').textContent=connected?'Créateur SWAPP connecté':'Connecte ton compte SWAPP';
   $('profileHint').textContent=connected?'Ta chaîne est prête. Prévisualise l’image avant de passer en direct.':'Ton live sera publié sur ta chaîne après connexion et confirmation du direct.';
   $('channelLink').href=connected&&login?'https://swapp.tv/'+encodeURIComponent(login):'https://swapp.tv';
   connectButton.hidden=connected;
   if(connected&&(!wasConnected||oldLogin!==login))activity('Compte @'+login+' connecté à SWAPP.');
  }catch(_){
   connected=false;configuredKey='';$('streamKey').value='';
   account.textContent='Connexion indisponible';
   $('profileName').textContent='Non connecté';
   $('profileMeta').textContent='Connexion SWAPP indisponible';
   connectButton.hidden=false;
  }
  buttons();
 }

 function connect(){
  const callback='http://127.0.0.1:'+location.port+'/api/account/browser-callback';
  const url='https://swapp.tv/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(callback);
  window.open(url,'_blank');
  status('Connecte-toi dans ton navigateur. La session sera reconnue automatiquement.');
 }

 async function loadConnection(){
  try{
   const data=await api('/api/setup/check');
   if(data.rtmp&&/^rtmp:\/\/127\.0\.0\.1:\d+\/live$/.test(data.rtmp))
    $('rtmpServer').value=data.rtmp;
  }catch(e){status('Informations RTMP indisponibles : '+e.message,'error')}
 }

 async function copyCredential(id){
  const value=$(id).value;
  if(!value||id==='streamKey'&&!connected){
   status('Connecte d’abord ton compte SWAPP pour obtenir la clé.','error');return;
  }
  try{
   await navigator.clipboard.writeText(value);
   status(id==='streamKey'?'Clé de diffusion copiée. Ne la partage jamais publiquement.':'Adresse RTMP locale copiée.');
  }catch(e){status('Copie refusée par Windows : '+e.message,'error')}
 }

 async function disconnect(){
  if(capturing||published||working)return;
  working=true;buttons();
  try{
   await api('/api/account/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   connected=false;configuredKey='';login='';
   $('streamKey').value='';
   status('Compte SWAPP déconnecté. La clé est retirée de cette fenêtre.');
   await getAccount();
  }catch(e){status('Déconnexion impossible : '+e.message,'error')}
  finally{working=false;buttons()}
 }

 async function repair(){
  if(working||!published)return;
  working=true;buttons();
  status('Vérification et réparation du relais public…');
  try{
   await api('/api/tunnel/repair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:configuredKey})});
   status('Vérification du relais terminée. Contrôle le retour sur ta chaîne SWAPP.','live');
  }catch(e){status('Relais non réparé : '+e.message,'error')}
  finally{working=false;buttons()}
 }

 async function audioDevices(){
  try{
   const data=await api('/api/screen/audio-devices');
   const devices=Array.isArray(data.devices)?data.devices:[];
   for(const name of devices){
    for(const id of ['audio','mic']){
     const opt=document.createElement('option');opt.value=name;opt.textContent=name;
     $(id).appendChild(opt);
    }
   }
   const stereo=devices.find(x=>/stereo mix|mixage stéréo|loopback|virtual.audio/i.test(x));
   $('audio').value=devices.includes(savedAudio)?savedAudio:(stereo||'');
   $('mic').value=devices.includes(savedMic)?savedMic:'';
   $('mixerAvailability').textContent=devices.length
    ?'Périphériques DirectShow détectés. Le son du jeu exige une entrée loopback ou Stereo Mix compatible.'
    :'Aucune entrée DirectShow détectée. Le live pourra fonctionner sans audio ; libobs/WASAPI reste une évolution distincte.';
   buttons();
  }catch(_){
   $('mixerAvailability').textContent='Liste audio indisponible. La capture vidéo reste utilisable.';
  }
 }

 function resetPreview(){
  try{video.pause()}catch(_){}
  video.muted=true;
  $('soundToggle').textContent='Écouter l’aperçu';
  video.removeAttribute('src');
  if(hls){hls.destroy();hls=null}
  video.load();
  video.style.display='none';
  empty.style.display='flex';
  $('previewExplanation').textContent='Choisis une source à gauche et clique sur « Prévisualiser ». Ton image apparaîtra ici avant toute diffusion publique.';
  previewReady=false;
  buttons();
 }

 function playPreview(key){
  resetPreview();
  const url='/hls/'+encodeURIComponent(key)+'/index.m3u8';
  $('previewExplanation').textContent='Connexion à la prévisualisation locale… La vidéo est encore privée.';
  const attempt=()=>void video.play().catch(()=>{
   status('Lecture automatique bloquée : clique dans le lecteur pour démarrer la prévisualisation.','error');
  });
  if(typeof Hls!=='undefined'&&Hls.isSupported()){
   hls=new Hls({lowLatencyMode:true,liveSyncDurationCount:2,maxBufferLength:8,
    manifestLoadingMaxRetry:8,levelLoadingMaxRetry:8,fragLoadingMaxRetry:8});
   hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls?.loadSource(url));
   hls.on(Hls.Events.MANIFEST_PARSED,attempt);
   hls.on(Hls.Events.ERROR,(_event,data)=>{
    if(data?.fatal)status('Décodage du flux impossible : '+(data.details||'erreur HLS')+'. Vérifie la source.','error');
   });
   hls.attachMedia(video);
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
   video.src=url;
   video.addEventListener('loadedmetadata',attempt,{once:true});
  }else{
   status('Ce lecteur ne prend pas en charge HLS.','error');
  }
 }

 video.addEventListener('loadeddata',()=>{
  if(!capturing)return;
  previewReady=true;
  video.style.display='block';
  empty.style.display='none';
  status(published?'Ton direct est actif sur SWAPP.':'Aperçu reçu. Vérifie que le jeu est visible avant de lancer le direct.',published?'live':'');
  buttons();
 });
 video.addEventListener('playing',()=>{
  if(capturing){previewReady=true;video.style.display='block';empty.style.display='none';buttons()}
 });
 video.addEventListener('error',()=>{if(capturing)status('Le lecteur ne peut pas décoder la vidéo locale.','error')});

 async function start(){
  if(working||capturing)return;
  working=true;buttons();
  status('Démarrage de '+sourceLabel()+'… Aucune diffusion publique pour le moment.');
  try{
   const data=await api('/api/screen/start',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     display:Number($('display').value),fps:Number($('fps').value),
     bitrate:Number($('bitrate').value),audioDevice:$('audio').value,micDevice:$('mic').value,
     encoder:$('encoder').value,method:$('captureMode').value,source:$('obsSource').value
    })
   });
   capturing=true;captureKey=data.key;
   activeEngine=data.engine==='libobs'?'libobs':data.method==='ddagrab'?'DirectX':'GDI';
   playPreview(data.key);
   status('Capture '+sourceLabel()+' active ('+activeEngine+'). Vérifie ton image avant de diffuser.'+
    (data.method==='gdigrab'?' Attention : le bureau virtuel complet peut être visible.':''));
  }catch(e){capturing=false;activeEngine='';status('Capture impossible : '+e.message,'error');resetPreview()}
  finally{working=false;buttons()}
 }

 async function publish(){
  if(working||!capturing||!previewReady||!connected||captureKey!==configuredKey)return;
  working=true;buttons();
  status('Publication sur SWAPP en cours…');
  try{
   await api('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   published=true;
   const link=login?'https://swapp.tv/'+encodeURIComponent(login):'ta chaîne SWAPP';
   status('Direct actif sur SWAPP : '+link,'live');
  }catch(e){status('Publication impossible : '+e.message,'error')}
  finally{working=false;buttons()}
 }

 async function stop(){
  if(working)return;
  working=true;buttons();
  status('Arrêt du direct et de la capture…');
  const errors=[];
  if(published){
   try{await api('/api/tunnel/stop',{method:'POST'})}catch(e){errors.push('Publication : '+e.message)}
  }
  try{await api('/api/screen/stop',{method:'POST'})}catch(e){errors.push('Capture : '+e.message)}
  capturing=false;published=false;captureKey='';activeEngine='';resetPreview();
  status(errors.length?'Arrêt local demandé. Vérifie le direct public : '+errors.join(' ; '):'Capture et direct arrêtés.',errors.length?'error':'');
  working=false;buttons();
 }

 async function refresh(){
  await getAccount();
  if(working)return;
  try{
   const s=await api('/api/screen/status');
   const previous=libobsAvailable;
   libobsAvailable=!!s.libobsAvailable;
   $('nativeNotice').textContent=libobsAvailable
    ?'Composants libobs détectés sur ce PC. Capture de jeu native disponible sous réserve de compatibilité du jeu.'
    :'libobs n’est pas installé dans cette version. Les sources DirectX et GDI restent disponibles ; Game Capture est désactivé.';
   $('gamePresetDetail').textContent=libobsAvailable?'Capture native · libobs':'Nécessite le moteur libobs';
   if(!libobsAvailable&&$('captureMode').value==='libobs'&&!capturing){
    $('captureMode').value='ddagrab';persist();
   }
   if(previous!==libobsAvailable)activity(libobsAvailable?'Moteur libobs détecté.':'Mode FFmpeg disponible ; Game Capture natif non installé.');
   if(capturing&&!s.capturing){
    capturing=false;published=false;captureKey='';activeEngine='';resetPreview();
    status('La capture s’est interrompue : '+(s.error||'source indisponible'),'error');
   }
  }catch(_){}
  buttons();
 }

 $('soundToggle').addEventListener('click',()=>{
  if(!capturing||!previewReady)return;
  video.muted=!video.muted;
  video.volume=.25;
  $('soundToggle').textContent=video.muted?'Écouter l’aperçu':'Couper le retour audio';
  status(video.muted?'Retour audio coupé.':'Retour audio local activé à faible volume. Attention au risque d’écho.');
 });
 video.addEventListener('click',()=>{if(capturing&&video.paused)void video.play()});
 for(const button of presetButtons)button.addEventListener('click',()=>choosePreset(button.dataset.preset));
 for(const id of settings)$(id).addEventListener('change',()=>{
  persist();
  if(id==='captureMode'&&$('captureMode').value==='libobs'&&!libobsAvailable){
   $('captureMode').value='ddagrab';
   status('libobs n’est pas installé. DirectX reste sélectionné.','error');
  }
  buttons();
 });

 // This is a cautionary detector: naturally dark scenes can be flagged.
 setInterval(()=>{
  if(!capturing||!previewReady||published||video.readyState<2){darkChecks=0;return}
  try{
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(video,0,0,64,36);
   const pixels=ctx.getImageData(0,0,64,36).data;
   let lit=0;
   for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>35)lit++;
   darkChecks=lit<15?darkChecks+1:0;
   if(darkChecks===3)status('L’aperçu semble noir. Vérifie ton jeu ; essaie « Bureau complet » si nécessaire.','error');
  }catch(_){}
 },2400);

 connectButton.addEventListener('click',connect);
 $('copyRtmp').addEventListener('click',()=>copyCredential('rtmpServer'));
 $('copyKey').addEventListener('click',()=>copyCredential('streamKey'));
 $('revealKey').addEventListener('click',()=>{
  const hidden=$('streamKey').type==='password';
  $('streamKey').type=hidden?'text':'password';
  $('revealKey').textContent=hidden?'Masquer':'Afficher';
 });
 $('disconnectButton').addEventListener('click',disconnect);
 $('repairButton').addEventListener('click',repair);
 previewButton.addEventListener('click',start);
 liveButton.addEventListener('click',publish);
 stopButton.addEventListener('click',stop);
 window.addEventListener('beforeunload',()=>{
  if(capturing)navigator.sendBeacon?.('/api/screen/stop');
 });
 restore();buttons();
 activity('SWAPP Creator Studio chargé. Aucune diffusion en cours.');
 void loadConnection();void refresh();void audioDevices();
 setInterval(refresh,4000);
})();
