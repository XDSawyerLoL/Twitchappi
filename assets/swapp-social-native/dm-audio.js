import {esc,timeAgo} from './core.js';
const BASE='/api/swapp/direct-audio';
const MAX_BYTES=512*1024,MAX_SECONDS=30;
const uuid=/^[a-f0-9-]{36}$/i;
const types=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'];
let recorder=null,stream=null,parts=[],started=0,timeout=null,timerInterval=null,draft=null,objectUrl='',conversation='',busy=false;
let onUpdate=null;

async function request(path,options={}){
 const response=await fetch(BASE+path,{credentials:'same-origin',cache:'no-store',...options});
 const type=String(response.headers.get('content-type')||'');
 const data=type.includes('application/json')?await response.json().catch(()=>({})):{};
 if(!response.ok)throw Error(({
  swapp_account_required:'Connecte-toi à SWAPP pour utiliser les messages vocaux.',
  social_storage_unavailable:'Stockage vocal indisponible.',
  invalid_audio:'Format audio non reconnu.',
  invalid_duration:'Durée de l’enregistrement invalide.',
  rate_limited:'Trop de messages vocaux. Réessaie plus tard.',
  audio_too_large:'L’enregistrement est trop volumineux.',
  not_found:'Message vocal introuvable.',
  storage_unavailable:'Enregistrement vocal temporairement indisponible.'
 })[data.error]||'Service vocal indisponible.');
 return data;
}
export async function loadVoiceNotes(handle){
 try{
  const data=await request('/notes?peer='+encodeURIComponent(handle));
  return Array.isArray(data.notes)?data.notes:[];
 }catch{return[]}
}
export function renderVoiceNote(note,userId){
 if(!uuid.test(String(note?.id||'')))return'';
 const mine=note.fromMe===true;
 const id=encodeURIComponent(note.id);
 return '<div class="pulse-message pulse-audio-message'+(mine?' mine':'')+'" data-note-id="'+esc(note.id)+'">'+
  '<span class="pulse-audio-message-title">Message vocal · '+Math.max(1,Math.min(30,Number(note.duration)||1))+' s</span>'+
  '<audio controls preload="none" playsinline src="'+BASE+'/media/'+id+'" aria-label="Message vocal de '+esc(mine?'vous':note.from)+'"></audio>'+
  '<div class="pulse-audio-meta"><small>'+esc(timeAgo(note.createdAt))+'</small>'+
  (mine?'<button type="button" data-voice-delete="'+esc(note.id)+'" aria-label="Supprimer mon message vocal">Supprimer</button>':'')+'</div></div>';
}
function controls(){return document.querySelector('.social-dm-view .pulse-dm-audio-controls')}
function show(message){
 const box=controls();if(!box)return;
 const st=box.querySelector('[data-voice-status]');
 if(st)st.textContent=message;
 const recording=Boolean(recorder&&recorder.state==='recording');
 box.dataset.audioState=recording?'recording':busy?'sending':draft?'preview':'idle';
 const seconds=draft?draft.duration:recording?Math.min(MAX_SECONDS,Math.floor((Date.now()-started)/1000)):0;
 const counter=box.querySelector('[data-voice-timer]');
 if(counter)counter.textContent='0:'+String(seconds).padStart(2,'0');
 box.querySelector('[data-voice-start]').hidden=recording||!!draft||busy;
 box.querySelector('[data-voice-stop]').hidden=!recording;
 box.querySelector('[data-voice-send]').hidden=!draft||busy;
 box.querySelector('[data-voice-cancel]').hidden=!draft&&!recording;
 box.querySelector('[data-voice-preview]').hidden=!draft;
 if(draft){
  const preview=box.querySelector('[data-voice-preview]');
  if(preview.src!==objectUrl)preview.src=objectUrl;
 }
}
function discard(){
 clearTimeout(timeout);timeout=null;
 clearInterval(timerInterval);timerInterval=null;
 if(recorder&&recorder.state==='recording'){recorder.onstop=null;recorder.stop()}
 recorder=null;parts=[];
 if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}
 draft=null;started=0;busy=false;
 if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}
 const p=controls()?.querySelector('[data-voice-preview]');
 if(p)p.removeAttribute('src');
}
function preferredType(){
 return types.find(type=>typeof MediaRecorder.isTypeSupported==='function'&&MediaRecorder.isTypeSupported(type))||'';
}
async function begin(){
 const box=controls(),handle=box?.dataset.handle;
 if(!box||!handle||busy||recorder)return;
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  show('Ce navigateur ne prend pas en charge le microphone sécurisé.');return;
 }
 discard();conversation=handle;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(!box.isConnected||box.dataset.handle!==conversation){discard();return}
  const mimeType=preferredType();
  recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:32000});
  parts=[];started=Date.now();
  recorder.ondataavailable=event=>{if(event.data?.size)parts.push(event.data)};
  recorder.onstop=()=>{
   if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}
   clearTimeout(timeout);timeout=null;
   clearInterval(timerInterval);timerInterval=null;
   const duration=Math.min(MAX_SECONDS,Math.max(1,Math.ceil((Date.now()-started)/1000)));
   const mime=(recorder?.mimeType||mimeType||parts[0]?.type||'').split(';')[0];
   recorder=null;
   const blob=new Blob(parts,{type:mime});parts=[];
   if(blob.size===0||blob.size>MAX_BYTES||!['audio/webm','audio/ogg','audio/mp4'].includes(mime)){
    draft=null;show('Format audio incompatible ou fichier trop lourd.');return;
   }
   draft={blob,mime,duration};
   objectUrl=URL.createObjectURL(blob);
   show('Enregistrement prêt : écoute-le, puis choisis Envoyer ou Effacer.');
  };
  recorder.start(500);
  timerInterval=setInterval(()=>show('Enregistrement en cours…'),500);
  timeout=setTimeout(()=>stop(),MAX_SECONDS*1000);
  show('Enregistrement… 30 secondes maximum.');
 }catch(error){
  discard();show(error?.name==='NotAllowedError'?'Accès au microphone refusé.':'Microphone indisponible.');
 }
}
function stop(){
 if(!recorder||recorder.state!=='recording')return;
 recorder.stop();
 clearInterval(timerInterval);timerInterval=null;
 show('Préparation du message vocal…');
}
async function send(){
 const box=controls();
 if(!box||!draft||busy||!box.dataset.handle)return;
 busy=true;show('Envoi du message vocal…');
 try{
  const note=draft;
  await request('/notes/'+encodeURIComponent(box.dataset.handle),{
   method:'POST',headers:{'Content-Type':note.mime,'X-SWAPP-Audio-Duration':String(note.duration)},body:note.blob
  });
  discard();
  show('Message vocal envoyé.');
  if(typeof onUpdate==='function')await onUpdate(box.dataset.handle);
 }catch(error){busy=false;show(error.message)}
}
export function setupVoiceNotes({onConversationChange}={}){
 onUpdate=onConversationChange;
 document.addEventListener('click',async event=>{
  const start=event.target.closest('[data-voice-start]');
  if(start){void begin();return}
  if(event.target.closest('[data-voice-stop]')){stop();return}
  if(event.target.closest('[data-voice-cancel]')){discard();show('Enregistrement effacé.');return}
  if(event.target.closest('[data-voice-send]')){void send();return}
  const remove=event.target.closest('[data-voice-delete]');
  if(remove&&uuid.test(remove.dataset.voiceDelete||'')&&!busy){
   if(!confirm('Supprimer définitivement ce message vocal ?'))return;
   busy=true;
   try{
    await request('/notes/'+encodeURIComponent(remove.dataset.voiceDelete),{method:'DELETE'});
    remove.closest('.pulse-audio-message')?.remove();
   }catch(error){alert(error.message)}
   finally{busy=false}
  }
 });
 // Switching conversation destroys the recorder and releases the microphone.
 const feed=document.getElementById('pulse-feed');
 if(feed){
  const observer=new MutationObserver(()=>{
   if(recorder||stream||draft){
    const box=controls();
    if(!box||box.dataset.handle!==conversation)discard();
   }
  });
  observer.observe(feed,{childList:true,subtree:false});
 }
 window.addEventListener('pagehide',discard);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&recorder){discard();show('Enregistrement arrêté lors de la mise en arrière-plan.')}
 });
}
