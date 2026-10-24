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
 // MediaRecorder chunks retain their original timeline. After late joining,
 // initial MP4/WebM metadata may start at t=0 while current media is at t=60+.
 // Seeking to end-2 without checking buffered ranges can land inside a hole
 // and leave a black / stalled player indefinitely.
 function latestBufferedRange(video){
  const r=video?.buffered;
  if(!r?.length)return null;
  try{
   const n=r.length-1, start=Number(r.start(n)),end=Number(r.end(n));
   return Number.isFinite(start)&&Number.isFinite(end)&&end>start?{start,end}:null;
  }catch(_){return null}
 }
 function seekToLiveEdge(video){
  const range=latestBufferedRange(video);
  if(!range)return false;
  const now=Number(video.currentTime)||0;
  const inRange=now>=range.start-0.08&&now<range.end;
  if(inRange && range.end-now<=4)return false;
  const target=Math.max(range.start,range.end-Math.min(.6,(range.end-range.start)*.5));
  if(Math.abs(now-target)<.15)return false;
  try{video.currentTime=target;return true}catch(_){return false}
 }
 function stopViewer(){
  const v=viewer;viewer=null;
  if(!v)return;
  v.stopped=true;
  v.cleanup?.();
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
  const markPlayback=()=>{
   if(!active()||v.started||video.videoWidth<=0)return;
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
  };
  const hasFrameCallback=typeof video.requestVideoFrameCallback==='function';
  if(hasFrameCallback){
   try{video.requestVideoFrameCallback((_now,frame)=>{
    if(active()&&Number(frame?.presentedFrames||0)>0)markPlayback();
   })}catch(_){}
  }
  const onTime=()=>{
   if(!active())return;
   const quality=video.getVideoPlaybackQuality?.();
   if(Number(quality?.totalVideoFrames||0)>0)markPlayback();
   else if(!hasFrameCallback && video.videoWidth>0 && video.readyState>=2 && video.currentTime>.1)markPlayback();
  };
  let lastRecover=0;
  const onStall=()=>{
   if(!active()||Date.now()-lastRecover<1300)return;
   if(seekToLiveEdge(video))lastRecover=Date.now();
   video.play?.().catch(()=>{});
  };
  video.addEventListener('timeupdate',onTime);
  video.addEventListener('waiting',onStall);
  video.addEventListener('stalled',onStall);
  v.cleanup=()=>{
   video.removeEventListener('timeupdate',onTime);
   video.removeEventListener('waiting',onStall);
   video.removeEventListener('stalled',onStall);
  };
  ms.addEventListener('sourceopen',async()=>{
   let seq=0;
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
      // Seek only to a time actually covered by the latest buffered range.
      seekToLiveEdge(video);
      video.play?.().catch(()=>{});
     }
     seekToLiveEdge(video);
     onTime();
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
 window.SwappBrowserRelay={startPublisher,stopPublisher,startViewer,stopViewer,isViewing,seekToLiveEdge};
})();
