'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const video=$('video'),empty=$('emptyPreview');
 const previewButton=$('previewButton'),liveButton=$('liveButton'),stopButton=$('stopButton');
 const account=$('account'),connectButton=$('connectButton');
 let connected=false,login='',configuredKey='',captureKey='',capturing=false,published=false,previewReady=false,working=false,hls=null;
 function status(message,kind=''){
  const badge=$('badge');
  badge.textContent=message;
  badge.dataset.error=kind==='error'?'1':'0';
  badge.dataset.live=kind==='live'?'1':'0';
 }
 function buttons(){
  previewButton.disabled=working||capturing;
  liveButton.disabled=working||!capturing||!previewReady||!connected||captureKey!==configuredKey||published;
  stopButton.disabled=working||!capturing;
  for(const id of ['display','fps','bitrate','audio','mic','encoder','captureMode'])$(id).disabled=working||capturing;
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
   connected=!!data.connected;
   login=data.user?.login||'';
   configuredKey=data.stream_key||'';
   if(capturing&&connected&&captureKey!==configuredKey&&!working)status('Ta clé SWAPP a changé après connexion. Arrête puis relance la capture pour publier.','error');
   account.textContent=connected?'Connecté : '+login:'Compte non connecté';
   connectButton.hidden=connected;
  }catch(_){connected=false;account.textContent='Connexion SWAPP indisponible'}
  buttons();
 }
 function connect(){
  const callback='http://127.0.0.1:'+location.port+'/api/account/browser-callback';
  const url='https://swapp.tv/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(callback);
  window.open(url,'_blank');
  status('Connecte-toi dans ton navigateur. La session sera reconnue automatiquement.');
 }
 async function audioDevices(){
  try{
   const data=await api('/api/screen/audio-devices');
   for(const name of data.devices||[]){
    for(const id of ['audio','mic']){
     const opt=document.createElement('option');opt.value=name;opt.textContent=name;
     $(id).appendChild(opt);
    }
   }
   const stereo=(data.devices||[]).find(x=>/stereo mix|mixage stéréo|loopback|virtual.audio|wentbackward/i.test(x));
   if(stereo)$('audio').value=stereo;
  }catch(_){}
 }
 function resetPreview(){
  try{video.pause()}catch(_){}
  video.removeAttribute('src');
  if(hls){hls.destroy();hls=null}
  video.load();
  video.style.display='none';
  empty.style.display='block';
  previewReady=false;
  buttons();
 }
 function playPreview(key){
  resetPreview();
  const url='/hls/'+encodeURIComponent(key)+'/index.m3u8';
  empty.textContent='Connexion à la prévisualisation locale…';
  if(typeof Hls!=='undefined'&&Hls.isSupported()){
   hls=new Hls({lowLatencyMode:true,liveSyncDurationCount:2,maxBufferLength:8,
    manifestLoadingMaxRetry:8,levelLoadingMaxRetry:8,fragLoadingMaxRetry:8});
   hls.loadSource(url);hls.attachMedia(video);
   hls.on(Hls.Events.ERROR,(_event,data)=>{
    if(data?.fatal)status('L’aperçu n’arrive pas à décoder le flux : '+(data.details||'erreur vidéo')+'. Vérifie l’encodeur et la capture.','error');
   });
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
   video.src=url;
  }else{
   status('Ce lecteur ne prend pas en charge HLS.','error');return;
  }
  void video.play().catch(()=>{status('Lecture automatique bloquée. Clique dans le lecteur pour démarrer.','error')});
 }
 video.addEventListener('loadeddata',()=>{
  if(!capturing)return;
  previewReady=true;
  video.style.display='block';
  empty.style.display='none';
  status(published?'● En direct sur SWAPP.':'Aperçu reçu. Vérifie que le jeu est visible avant de lancer le direct.',published?'live':'');
  buttons();
 });
 video.addEventListener('playing',()=>{
  if(capturing){previewReady=true;video.style.display='block';empty.style.display='none';buttons()}
 });
 video.addEventListener('error',()=>{if(capturing)status('Le lecteur local ne peut pas décoder la vidéo.','error')});
 async function start(){
  if(working||capturing)return;
  working=true;buttons();
  status('Démarrage de la capture DirectX… Cela ne publie rien sur Internet.');
  try{
   const data=await api('/api/screen/start',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({display:Number($('display').value),fps:Number($('fps').value),
     bitrate:Number($('bitrate').value),audioDevice:$('audio').value,micDevice:$('mic').value,
     encoder:$('encoder').value,method:$('captureMode').value})
   });
   capturing=true;captureKey=data.key;
   playPreview(data.key);
   status('Capture '+(data.method==='ddagrab'?'DirectX':'Windows classique')+
    ' · '+(data.encoder==='nvenc'?'NVIDIA NVENC':'x264')+
    ' active. Vérifie les images avant de diffuser.'+
    (data.method==='gdigrab'?'\nMode secours : tout le bureau virtuel est capturé.':''));
  }catch(e){capturing=false;status('Capture impossible : '+e.message,'error');resetPreview()}
  finally{working=false;buttons()}
 }
 async function publish(){
  if(working||!capturing||!previewReady||!connected)return;
  working=true;buttons();
  status('Publication sur SWAPP en cours…');
  try{
   await api('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
   published=true;
   const link=login?'https://swapp.tv/'+encodeURIComponent(login):'ta chaîne SWAPP';
   status('● En direct sur SWAPP\nTon écran est maintenant visible sur : '+link,'live');
  }catch(e){status('Publication impossible : '+e.message,'error')}
  finally{working=false;buttons()}
 }
 async function stop(){
  if(working)return;
  working=true;buttons();
  status('Arrêt du direct et libération de la capture…');
  const errors=[];
  if(published){
   try{await api('/api/tunnel/stop',{method:'POST'})}catch(e){errors.push('Publication : '+e.message)}
  }
  try{await api('/api/screen/stop',{method:'POST'})}catch(e){errors.push('Capture : '+e.message)}
  capturing=false;published=false;captureKey='';resetPreview();
  status(errors.length?'Arrêt local demandé. Vérifie le statut public : '+errors.join(' ; '):'Capture et direct arrêtés.',errors.length?'error':'');
  working=false;buttons();
 }
 async function refresh(){
  await getAccount();
  if(working)return;
  try{
   const s=await api('/api/screen/status');
   if(capturing&&!s.capturing){
    capturing=false;published=false;captureKey='';resetPreview();
    status('La capture Windows s’est interrompue : '+(s.error||'source indisponible'),'error');
   }
  }catch(_){}
  buttons();
 }
 let darkChecks=0;
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
   if(darkChecks>=3)status('L’aperçu semble noir. Vérifie ton jeu ; si le moniteur affiche une image, arrête puis essaie le mode de capture Windows classique.','error');
  }catch(_){}
 },2400);
 connectButton.addEventListener('click',connect);
 previewButton.addEventListener('click',start);
 liveButton.addEventListener('click',publish);
 stopButton.addEventListener('click',stop);
 window.addEventListener('beforeunload',()=>{
  // The native process also disposes of the child capture on app exit.
  if(capturing)navigator.sendBeacon?.('/api/screen/stop');
 });
 void getAccount();void audioDevices();buttons();
 setInterval(refresh,4000);
})();
