/* SWAPP native browser-only fallback: MediaRecorder -> same-origin HTTPS -> MediaSource.
   Used only when direct WebRTC cannot deliver decoded frames. No SaaS, TURN or VPS.
   Deliberately bounded bandwidth/retention; not a CDN or scalable SFU. */
(function(){
 'use strict';
 let publisher=null, viewer=null;
 const base=room=>'/api/native/browser-relay/'+encodeURIComponent(room);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 function supportedRecorderType(){
  if(typeof MediaRecorder==='undefined')return '';
  const types=[
   'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
   'video/mp4;codecs="avc1.42E01E"',
   'video/webm;codecs="vp8,opus"',
   'video/webm;codecs="vp8"',
   'video/webm'
  ];
  return types.find(t=>MediaRecorder.isTypeSupported(t))||'';
 }
 function stopPublisher(){
  const p=publisher;publisher=null;
  if(p?.recorder && p.recorder.state!=='inactive')try{p.recorder.stop()}catch(_){}
 }
 function startPublisher(room,stream){
  if(!room||!stream||publisher?.room===room&&publisher.stream===stream)return;
  stopPublisher();
  const mime=supportedRecorderType();
  if(!mime)return;
  try{
   const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1050000,audioBitsPerSecond:64000});
   const p={room,stream,recorder,seq:0,pending:0,queue:Promise.resolve(),failed:false};
   publisher=p;
   recorder.addEventListener('dataavailable',event=>{
    if(publisher!==p||!event.data?.size||p.failed)return;
    // HTTP ingestion is strictly sequential. Never queue unlimited video in memory.
    if(p.pending>=4){p.failed=true;stopPublisher();return}
    const seq=p.seq++,blob=event.data;
    p.pending++;
    p.queue=p.queue.then(async()=>{
     if(publisher!==p)return;
     const r=await fetch(base(room)+'/chunk',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/octet-stream','X-Swapp-Relay-Seq':String(seq),
       'X-Swapp-Relay-Mime':recorder.mimeType||mime},
      body:blob
     });
     if(!r.ok)throw Error('HTTP relay '+r.status);
    }).catch(err=>{
     console.warn('[SWAPP] HTTP relay stopped:',err?.message||err);
     p.failed=true;if(publisher===p)stopPublisher();
    }).finally(()=>{p.pending--});
   });
   recorder.addEventListener('error',()=>{if(publisher===p)stopPublisher()});
   recorder.start(1500);
  }catch(err){console.warn('[SWAPP] MediaRecorder fallback unavailable:',err?.message||err)}
 }
 function stopViewer(){
  const v=viewer;viewer=null;
  if(!v)return;
  v.stopped=true;
  if(v.objectUrl)URL.revokeObjectURL(v.objectUrl);
  if(v.video && v.video.src===v.objectUrl){
   v.video.pause?.();
   v.video.removeAttribute('src');v.video.load?.();
  }
  v.button?.remove();
 }
 function isViewing(room){return !!viewer&&!viewer.stopped&&viewer.room===room}
 function append(sourceBuffer,bytes,active){
  return new Promise((resolve,reject)=>{
   if(!active())return reject(Error('Stopped'));
   function done(){sourceBuffer.removeEventListener('error',failed);resolve()}
   function failed(){sourceBuffer.removeEventListener('updateend',done);reject(Error('SourceBuffer decoding failed'))}
   sourceBuffer.addEventListener('updateend',done,{once:true});
   sourceBuffer.addEventListener('error',failed,{once:true});
   try{sourceBuffer.appendBuffer(bytes)}catch(err){
    sourceBuffer.removeEventListener('updateend',done);
    sourceBuffer.removeEventListener('error',failed);reject(err);
   }
  });
 }
 async function getJson(url){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  return r.json();
 }
 async function segment(room,seq){
  const r=await fetch(base(room)+'/segment/'+seq,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('Media fragment '+seq+': '+r.status);
  return r.arrayBuffer();
 }
 async function startViewer(room,video,opts={}){
  if(!room||!video)return false;
  if(isViewing(room))return true;
  const MediaSourceImpl=window.MediaSource;
  if(!MediaSourceImpl)return false;
  let meta;
  try{meta=await getJson(base(room)+'/state')}catch(_){return false}
  if(!meta?.active||!meta.mime||!MediaSourceImpl.isTypeSupported(meta.mime))return false;
  stopViewer();
  const v={room,video,stopped:false,objectUrl:null,button:null,started:false};
  viewer=v;
  const active=()=>viewer===v&&!v.stopped&&(!opts.isActive||opts.isActive());
  const ms=new MediaSourceImpl();
  const u=URL.createObjectURL(ms);v.objectUrl=u;
  video.pause?.();video.srcObject=null;video.src=u;
  video.autoplay=true;video.playsInline=true;video.muted=true;
  video.classList.remove('hidden');video.style.display='block';
  const onTime=()=>{
   if(!active())return;
   if(video.videoWidth>0&&video.readyState>=2&&!v.started){
    v.started=true;
    const parent=video.parentElement;
    if(parent&&!parent.querySelector('[data-swapp-unmute]')){
     const button=document.createElement('button');
     button.type='button';button.className='btn swapp-unmute-stream';
     button.dataset.swappUnmute='1';button.textContent='Activer le son';
     button.onclick=()=>{video.muted=false;video.play?.().catch(()=>{});button.remove()};
     parent.appendChild(button);v.button=button;
    }
    opts.onPlayback?.();
   }
  };
  video.addEventListener('timeupdate',onTime);
  v.cleanup=()=>video.removeEventListener('timeupdate',onTime);
  ms.addEventListener('sourceopen',async()=>{
   let seq=0,failures=0;
   try{
    const sb=ms.addSourceBuffer(meta.mime);
    sb.mode='segments';
    await append(sb,await segment(room,0),active);
    while(active()){
     const state=await getJson(base(room)+'/state');
     if(!state.active || state.mime!==meta.mime)throw Error('Relay ended');
     if(seq===0)seq=Math.max(1,state.firstSeq);
     if(seq<state.firstSeq)throw Error('Relay lagged');
     while(seq<=state.lastSeq && active()){
      await append(sb,await segment(room,seq++),active);
      if(video.buffered?.length){
       const end=video.buffered.end(video.buffered.length-1);
       if(end-video.currentTime>7 && end>3)video.currentTime=end-2;
      }
      video.play?.().catch(()=>{});
     }
     onTime();
     failures=0;
     await wait(800);
    }
   }catch(err){
    if(active()){console.warn('[SWAPP] HTTP playback failed:',err?.message||err);opts.onError?.(err);stopViewer()}
   }
  },{once:true});
  // The MediaSource may exist but never decode on a particular browser/codec.
  setTimeout(()=>{
   if(active()&&!v.started){opts.onError?.(new Error('Aucune image HTTP décodée dans ce navigateur'));stopViewer()}
  },16000);
  return true;
 }
 const previousStop=stopViewer;
 function safeStopViewer(){if(viewer?.cleanup)viewer.cleanup();previousStop()}
 window.SwappBrowserRelay={startPublisher,stopPublisher,startViewer,stopViewer:safeStopViewer,isViewing};
})();
