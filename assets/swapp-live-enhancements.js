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
  try{ctx.drawImage(video,sx,sy,sw,sh,0,0,preview.width,preview.height)}
  catch(e){feedback.textContent='Aperçu indisponible : '+(e?.name||'image non accessible')}
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