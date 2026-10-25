/* SWAPP Live: real active-viewer presence + browser-native vertical short clips.
 * The live HLS decoder, bitrate and OBS settings are never touched.
 */
(function(){
 'use strict';
 const video=document.getElementById('video');
 const media=document.querySelector('.media');
 const toolbar=document.querySelector('.toolbar');
 if(!video||!media||!toolbar)return;
 const match=(location.pathname||'').match(/\/local-relay\/([a-z0-9_-]{2,48})\/player\/?$/i);
 if(!match)return;
 const base='/api/oryon/local-relay/'+encodeURIComponent(match[1].toLowerCase());
 const badge=document.createElement('output');
 badge.className='swapp-swapper-badge';
 badge.setAttribute('aria-label','Swappers en lecture');
 badge.title='Sessions qui regardent effectivement la vidéo, actualisées régulièrement';
 badge.textContent='— Swappers';
 media.appendChild(badge);
 let session='';
 try{
  const arr=new Uint8Array(16);crypto.getRandomValues(arr);
  session=Array.from(arr,b=>b.toString(16).padStart(2,'0')).join('');
 }catch(_){}
 let joined=false;
 function isWatching(){
  return session&&document.visibilityState==='visible'&&video.readyState>=2&&
   video.videoWidth>0&&!video.paused&&!video.ended&&!video.error;
 }
 async function heartbeat(){
  const watching=!!isWatching();
  if(!watching){
   if(joined)await leave();
   return refreshAudience();
  }
  try{
   const r=await fetch(base+'/audience/heartbeat',{
    method:'POST',cache:'no-store',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({session})
   });
   if(!r.ok)return;
   const response=await r.json();
   joined=!!response.live;
   renderAudience(response);
  }catch(_){}
 }
 function renderAudience(data){
  if(!data?.success)return;
  const n=Math.max(0,Math.min(999999,Number(data.swappers)||0));
  badge.textContent=n.toLocaleString('fr-FR')+' Swapper'+(n===1?'':'s');
 }
 async function refreshAudience(){
  try{
   const r=await fetch(base+'/audience',{cache:'no-store',credentials:'same-origin'});
   if(r.ok)renderAudience(await r.json());
  }catch(_){}
 }
 async function leave(){
  if(!joined||!session)return;
  joined=false;
  try{
   await fetch(base+'/audience/leave',{method:'POST',cache:'no-store',
    credentials:'same-origin',keepalive:true,
    headers:{'Content-Type':'application/json'},body:JSON.stringify({session})});
  }catch(_){}
 }
 const leaveNow=()=>{
  if(!joined||!session)return;
  joined=false;
  const body=JSON.stringify({session});
  try{
   if(navigator.sendBeacon?.(base+'/audience/leave',new Blob([body],{type:'application/json'})))return;
  }catch(_){}
  fetch(base+'/audience/leave',{method:'POST',body,keepalive:true,headers:{'Content-Type':'application/json'}}).catch(()=>{});
 };
 video.addEventListener('playing',()=>void heartbeat());
 video.addEventListener('pause',()=>void leave());
 video.addEventListener('ended',()=>void leave());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)leaveNow();else void heartbeat()});
 window.addEventListener('pagehide',leaveNow,{capture:true});
 setInterval(()=>void heartbeat(),15000);
 refreshAudience();

 // SHORT: recording starts on click, records the NEXT 15 seconds (never pretends
 // to have an existing rewind buffer). 9:16 crop is exported from a canvas.
 const toggle=document.createElement('button');
 toggle.id='swappShortToggle';toggle.type='button';toggle.className='swapp-short-toggle';
 toggle.textContent='✂ Short';
 toggle.setAttribute('aria-label','Ouvrir le mode Short');
 toggle.setAttribute('aria-pressed','false');
 const spacer=toolbar.querySelector('.flex');
 if(spacer)toolbar.insertBefore(toggle,spacer);
 else toolbar.appendChild(toggle);
function mountImageEnhancement(){
 // Display-only SDR adjustment. The OBS H264/AAC bitstream remains unchanged.
 const looks={
  original:{brightness:100,contrast:100,saturation:100},
  balanced:{brightness:108,contrast:110,saturation:106},
  vivid:{brightness:115,contrast:118,saturation:110}
 };
 const key='swapp:live:picture:v1';
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const readSettings=()=>{
  try{
   const data=JSON.parse(localStorage.getItem(key)||'null');
   if(!data||typeof data!=='object')return {...looks.balanced};
   return {
    brightness:clamp(Number(data.brightness)||108,90,130),
    contrast:clamp(Number(data.contrast)||110,90,135),
    saturation:clamp(Number(data.saturation)||106,90,125)
   };
  }catch(_){return {...looks.balanced}}
 };
 let settings=readSettings();
 const currentFilter=()=>{
  if(Object.values(settings).every(v=>v===100))return 'none';
  return `brightness(${settings.brightness/100}) contrast(${settings.contrast/100}) saturate(${settings.saturation/100})`;
 };
 const style=document.createElement('style');
 style.id='swapp-live-picture-style';
 style.textContent=`
 .swapp-picture-btn{width:30px!important;min-width:28px!important;flex:0 0 auto!important;
  display:grid!important;place-items:center!important;padding:0!important;
  font:600 18px/1 system-ui!important;color:#e4d9fb!important;cursor:pointer}
 .swapp-picture-btn[aria-expanded="true"]{background:rgba(168,85,247,.20)!important;color:#fff!important}
 .swapp-picture-panel[hidden]{display:none!important}
 .swapp-picture-panel{position:absolute;z-index:15;bottom:8px;right:10px;
  width:min(250px,calc(100% - 20px));padding:12px;display:grid;gap:10px;
  background:rgba(9,11,20,.95);border:1px solid rgba(255,255,255,.18);
  backdrop-filter:blur(18px);box-shadow:0 12px 35px rgba(0,0,0,.5);
  border-radius:11px;color:#fff;box-sizing:border-box;font:500 12px/1.3 system-ui}
 .swapp-picture-panel header{display:flex;justify-content:space-between;align-items:center;gap:8px}
 .swapp-picture-panel header strong{font-size:13px;font-weight:700}
 .swapp-picture-panel header button{width:28px;height:28px;padding:0;border:0;
  color:#ddd;background:rgba(255,255,255,.08);border-radius:6px;cursor:pointer}
 .swapp-picture-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
 .swapp-picture-presets button{font:600 11px/1.2 system-ui;padding:7px 2px;
  background:rgba(255,255,255,.07);color:#ccc;border:1px solid rgba(255,255,255,.12);
  border-radius:6px;cursor:pointer;min-width:0}
 .swapp-picture-presets button[aria-pressed="true"]{
  background:rgba(151,79,232,.3);color:#fff;border-color:rgba(187,127,255,.7)}
 .swapp-picture-field{display:grid;gap:3px}
 .swapp-picture-field label{display:flex;justify-content:space-between;gap:8px;color:#d5d8e4}
 .swapp-picture-field output{font-variant-numeric:tabular-nums;color:#e0c4ff}
 .swapp-picture-field input{width:100%;margin:0;accent-color:#a875f5;cursor:pointer}
 .swapp-picture-panel small{color:#a9aaba;font-size:10px;line-height:1.35}
 .swapp-picture-panel button:focus-visible,.swapp-picture-btn:focus-visible{
  outline:2px solid #e8bbff;outline-offset:2px}
 @media(max-width:620px){
  .swapp-picture-btn{width:26px!important;min-width:24px!important;font-size:16px!important}
  .swapp-picture-panel{right:5px;bottom:5px;width:min(230px,calc(100% - 10px));padding:9px}
 }
 @media(prefers-reduced-motion:reduce){.swapp-picture-panel *{transition:none!important}}
 `;
 document.head.appendChild(style);
 const trigger=document.createElement('button');
 trigger.type='button';trigger.id='swappPictureButton';
 trigger.className='swapp-picture-btn';trigger.textContent='◐';
 trigger.title="Contraste, lumière et couleurs du direct";
 trigger.setAttribute('aria-label',"Améliorer l'image du direct");
 trigger.setAttribute('aria-expanded','false');
 const panel=document.createElement('section');panel.id='swappPicturePanel';
 panel.className='swapp-picture-panel';panel.hidden=true;
 panel.setAttribute('aria-label',"Réglages de l'image");
 trigger.setAttribute('aria-controls',panel.id);
 const header=document.createElement('header');
 const heading=document.createElement('strong');heading.textContent='Rendu vidéo';
 const close=document.createElement('button');close.type='button';close.textContent='×';
 close.setAttribute('aria-label','Fermer les réglages');
 header.append(heading,close);
 const presets=document.createElement('div');presets.className='swapp-picture-presets';
 const presetButtons={};
 const sliders={};
 const persist=()=>{
  video.style.filter=currentFilter();
  for(const [k,v] of Object.entries(sliders)){
   v.input.value=String(settings[k]);
   v.output.textContent=settings[k]+' %';
  }
  for(const [k,button] of Object.entries(presetButtons)){
   const active=Object.keys(settings).every(prop=>settings[prop]===looks[k][prop]);
   button.setAttribute('aria-pressed',String(active));
  }
  try{localStorage.setItem(key,JSON.stringify(settings))}catch(_){}
 };
 const setLook=values=>{
  settings={
   brightness:clamp(Number(values.brightness)||100,90,130),
   contrast:clamp(Number(values.contrast)||100,90,135),
   saturation:clamp(Number(values.saturation)||100,90,125)
  };
  persist();
 };
 for(const [name,label] of [['original','Original'],['balanced','Optimisé'],['vivid','Intense']]){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.setAttribute('aria-pressed','false');
  button.addEventListener('click',()=>setLook(looks[name]));
  presets.appendChild(button);presetButtons[name]=button;
 }
 panel.append(header,presets);
 for(const [k,label,min,max] of [['brightness','Luminosité',90,130],['contrast','Contraste',90,135],['saturation','Couleurs',90,125]]){
  const block=document.createElement('div');block.className='swapp-picture-field';
  const labelEl=document.createElement('label');labelEl.textContent=label;
  const output=document.createElement('output');labelEl.appendChild(output);
  const input=document.createElement('input');input.type='range';
  input.min=String(min);input.max=String(max);input.step='1';
  input.setAttribute('aria-label',label);
  input.addEventListener('input',()=>setLook({...settings,[k]:Number(input.value)}));
  block.append(labelEl,input);
  panel.appendChild(block);sliders[k]={input,output};
 }
 const note=document.createElement('small');
 note.textContent="Rendu local uniquement, sans modifier OBS ni l'encodage.";
 panel.appendChild(note);
 media.appendChild(panel);
 const spacer=toolbar.querySelector('.flex');
 if(spacer)toolbar.insertBefore(trigger,spacer);
 else toolbar.appendChild(trigger);
 const hide=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false')};
 trigger.addEventListener('click',()=>{
  panel.hidden=!panel.hidden;
  trigger.setAttribute('aria-expanded',String(!panel.hidden));
 });
 close.addEventListener('click',()=>{hide();trigger.focus()});
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){hide();trigger.focus()}
 });
 toggle.addEventListener('click',hide);
 setLook(settings);
 return currentFilter;
}
 const pictureFilter=mountImageEnhancement();
 const panel=document.createElement('section');
 panel.className='swapp-short-panel';panel.hidden=true;
 panel.setAttribute('aria-label','Création de clip vertical');
 const preview=document.createElement('canvas');
 preview.width=540;preview.height=960;
 preview.setAttribute('aria-label','Aperçu vidéo vertical neuf seizièmes');
 const caption=document.createElement('strong');
 caption.textContent='Short · 9:16';
 const hint=document.createElement('p');
 hint.textContent='Enregistre les 15 prochaines secondes du direct.';
 const cropLabel=document.createElement('label');cropLabel.textContent='Cadrage';
 const crop=document.createElement('input');
 crop.type='range';crop.min='0';crop.max='100';crop.value='50';crop.step='1';
 crop.setAttribute('aria-label','Cadrage horizontal du clip');
 cropLabel.appendChild(crop);
 const capture=document.createElement('button');
 capture.className='swapp-short-record';capture.type='button';capture.textContent='● Enregistrer 15 s';
 const feedback=document.createElement('small');
 feedback.className='swapp-short-feedback';feedback.setAttribute('role','status');feedback.textContent='';
 panel.append(caption,preview,hint,cropLabel,capture,feedback);
 media.appendChild(panel);
 let enabled=false,raf=0,lastDraw=0,recorder=null,clock=0,stopTimer=0,recorded=[],mixed=null;
 const ctx=preview.getContext('2d',{alpha:false});
 const draw=t=>{
  if(!enabled)return;
  raf=requestAnimationFrame(draw);
  if(t-lastDraw<40)return;lastDraw=t;
  if(video.readyState<2||!video.videoWidth||!video.videoHeight||!ctx)return;
  const vw=video.videoWidth,vh=video.videoHeight,desired=9/16,ratio=vw/vh;
  const sw=ratio>desired?vh*desired:vw;
  const sh=ratio>desired?vh:vw/desired;
  const maxX=Math.max(0,vw-sw);
  const sx=maxX*(Number(crop.value)/100);
  const sy=Math.max(0,(vh-sh)/2);
  try{
   ctx.filter=pictureFilter();
   ctx.drawImage(video,sx,sy,sw,sh,0,0,preview.width,preview.height);
  }catch(e){feedback.textContent='Aperçu indisponible : '+(e?.name||'image non accessible')}
  finally{ctx.filter='none'}
 };
 function resetPanel(){
  enabled=false;cancelAnimationFrame(raf);panel.hidden=true;
  toggle.setAttribute('aria-pressed','false');toggle.textContent='✂ Short';
 }
 toggle.addEventListener('click',()=>{
  if(recorder?.state==='recording')return;
  enabled=!enabled;
  panel.hidden=!enabled;
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.textContent=enabled?'✂ Fermer Short':'✂ Short';
  if(enabled){feedback.textContent='';raf=requestAnimationFrame(draw)}
  else resetPanel();
 });
 const mimeTypes=[
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4',
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
  'video/webm'
 ];
 function mime(){return typeof MediaRecorder==='undefined'?'':mimeTypes.find(x=>MediaRecorder.isTypeSupported(x))||''}
 function resetCapture(){
  clearInterval(clock);clearTimeout(stopTimer);
  capture.disabled=false;capture.textContent='● Enregistrer 15 s';
  if(mixed){mixed.getTracks().forEach(t=>t.stop());mixed=null}
  recorder=null;
 }
 capture.addEventListener('click',()=>{
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!enabled||video.paused||video.readyState<2||!video.videoWidth){
   feedback.textContent='Démarre le direct avant de créer un Short.';return;
  }
  if(!preview.captureStream||!window.MediaRecorder){
   feedback.textContent='Création de clips non prise en charge dans ce navigateur.';return;
  }
  const selected=mime();
  if(!selected){feedback.textContent='Aucun format vidéo exportable disponible.';return;}
  try{
   const canvasStream=preview.captureStream(24);
   let audioTracks=[];
   try{const source=video.captureStream?.();audioTracks=source?.getAudioTracks()||[]}
   catch(_){}
   // Never access the microphone: reuse only the broadcast's existing audio.
   mixed=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks]);
   recorded=[];
   recorder=new MediaRecorder(mixed,{mimeType:selected,videoBitsPerSecond:2800000,audioBitsPerSecond:128000});
   const rec=recorder;
   rec.addEventListener('dataavailable',e=>{if(e.data?.size)recorded.push(e.data)});
   rec.addEventListener('error',()=>{feedback.textContent='Enregistrement interrompu.';resetCapture()});
   rec.addEventListener('stop',()=>{
    const parts=recorded.slice(),type=rec.mimeType||selected;
    resetCapture();
    if(!parts.length){feedback.textContent='Aucune image enregistrée.';return}
    const blob=new Blob(parts,{type});
    if(blob.size<10000){feedback.textContent='Clip incomplet, réessaie.';return}
    const ext=type.includes('mp4')?'mp4':'webm';
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='SWAPP-'+match[1]+'-short-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;
    a.textContent='Télécharger le clip '+ext.toUpperCase();
    feedback.replaceChildren(a);
    // The iframe sandbox needs allow-downloads; keep a manual link if the
    // browser blocks an automatic download triggered after the recording.
    setTimeout(()=>URL.revokeObjectURL(url),120000);
   },{once:true});
   rec.start(1000);
   const started=Date.now();
   capture.textContent='■ Arrêter le clip';
   feedback.textContent=audioTracks.length?'Enregistrement avec audio…':'Enregistrement vidéo (audio indisponible ici)…';
   clock=setInterval(()=>{
    if(rec.state!=='recording'){clearInterval(clock);return}
    const remaining=Math.max(0,Math.ceil((15000-(Date.now()-started))/1000));
    capture.textContent='■ Arrêter · '+remaining+' s';
   },300);
   stopTimer=setTimeout(()=>{if(rec.state==='recording')rec.stop()},15000);
  }catch(e){
   feedback.textContent='Clip impossible : '+String(e?.message||e).slice(0,100);
   resetCapture();
  }
 });
})();