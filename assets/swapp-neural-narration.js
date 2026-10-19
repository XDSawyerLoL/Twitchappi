/* SWAPP Narration Studio: cached, same-origin neural audio. Never fake a Mairy voice. */
(()=>{'use strict';
 if(window.SwappNeuralNarration)return;
 const validSlug=s=>/^[a-z0-9](?:[a-z0-9-]{1,108})[a-z0-9]$/.test(String(s||''));
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 function articleBlocks(content){
  return [...content.querySelectorAll('h2,h3,p,li,blockquote')]
   .filter(node=>!node.closest('aside,nav,footer,button,[aria-hidden="true"]'))
   .map(node=>({node,text:clean(node.textContent)})).filter(x=>x.text);
 }
 function validManifest(data,slug,blocks){
  if(!data||data.version!==1||data.slug!==slug||data.language!=='fr-FR'||
     !((data.engine==='gemini-tts'&&data.voice==='mairaiy-gemini-aoede'&&
        data.engine_voice==='Aoede'&&data.model==='gemini-3.1-flash-tts-preview'&&
        data.historical_profile==='aura-live-2.0.7-natural')||
       (/^kokoro-82m/.test(String(data.engine||''))&&data.voice==='ff_siwis'))||
     !/^audio\.(mp3|wav)$/.test(String(data.audio||''))||
     !Array.isArray(data.blocks)||!data.blocks.length||data.blocks.length!==blocks.length||
     blocks.length>300)return false;
  let last=0;
  for(let i=0;i<blocks.length;i++){
   const part=data.blocks[i];
   if(clean(part.text)!==blocks[i].text||!Number.isFinite(part.start)||
      !Number.isFinite(part.end)||part.start<last-.015||part.end<=part.start||
      part.end>18000)return false;
   last=part.end;
  }
  return true;
 }
 let active=null;
 function pauseActive(){if(active&&!active.paused)active.pause()}
 function stopActive(){if(active){active.pause();active.currentTime=0;active=null}}
 function attach({studio,content,root,onAvailability=()=>{},onPlaybackState=()=>{}}){
  if(!studio||!content||!root)return;
  const host=root.closest('[data-swapp-article-slug]');
  const slug=host?.getAttribute('data-swapp-article-slug')||
   (location.pathname.match(/^\/actus\/([a-z0-9-]{3,110})\/?$/)||[])[1];
  if(!validSlug(slug))return;
  const toggle=studio.querySelector('[data-reader-audio-toggle]');
  const panel=studio.querySelector('[data-reader-panel]');
  if(!toggle||!panel)return;
  const blocks=articleBlocks(content);
  if(!blocks.length)return;
  let loaded=false,loading=false,closed=false,marked=null,manifest=null,sourceIsMairaiy=false;
  const container=document.createElement('section');
  container.className='swapp-neural-narration';
  container.setAttribute('aria-label','Narration studio de cet article');
  container.hidden=true;
  const title=document.createElement('h3');title.textContent='Narration studio · Français';
  const label=document.createElement('p');label.textContent='Lecture audio préenregistrée, voix identifiée à la publication.';
  const audio=document.createElement('audio');
  audio.controls=true;audio.preload='none';audio.setAttribute('playsinline','');
  audio.setAttribute('aria-label','Écouter la narration studio');
  const controls=document.createElement('div');controls.className='swapp-neural-controls';
  const before=document.createElement('button');before.type='button';before.textContent='← Passage précédent';
  const after=document.createElement('button');after.type='button';after.textContent='Passage suivant →';
  const counter=document.createElement('span');counter.setAttribute('aria-live','off');
  controls.append(before,after,counter);
  container.append(title,label,audio,controls);
  panel.prepend(container);
  function mark(i){
   if(marked)marked.classList.remove('swapp-narration-current');
   marked=blocks[i]?.node||null;
   if(marked){
    marked.classList.add('swapp-narration-current');
    const r=marked.getBoundingClientRect();
    if(r.top<105||r.bottom>innerHeight-110)marked.scrollIntoView({block:'center',behavior:'auto'});
   }
   counter.textContent=(i+1)+' / '+blocks.length;
   report();
  }
  const report=()=>{if(sourceIsMairaiy&&manifest)onPlaybackState({
   playing:!audio.paused&&!audio.ended,paused:audio.paused&&!audio.ended&&audio.currentTime>0,
   index:chapter(),total:manifest.blocks.length
  })};
  function chapter(){
   if(!manifest)return 0;
   let i=0;
   for(let j=1;j<manifest.blocks.length;j++){
    if(audio.currentTime>=manifest.blocks[j].start)i=j;else break;
   }
   return i;
  }
  function jump(delta){
   if(!manifest)return;
   const i=Math.max(0,Math.min(blocks.length-1,chapter()+delta));
   audio.currentTime=manifest.blocks[i].start;
   mark(i);
  }
  before.addEventListener('click',()=>jump(-1));
  after.addEventListener('click',()=>jump(1));
  audio.addEventListener('timeupdate',()=>{if(manifest)mark(chapter())});
  audio.addEventListener('play',()=>{
   if(active&&active!==audio)active.pause();
   active=audio;
   window.SwappReaderStudio?.stopBrowserAudio?.();
   report();
  });
  audio.addEventListener('pause',()=>{if(active===audio)active=null;report()});
  audio.addEventListener('ended',()=>{if(active===audio)active=null;report()});
  function dispose(){
   if(closed)return;
   closed=true;audio.pause();audio.removeAttribute('src');audio.load();
   if(active===audio)active=null;
   if(marked)marked.classList.remove('swapp-narration-current');
   onAvailability(false);
   container.remove();
  }
  const observer=new MutationObserver(()=>{
   if(!studio.isConnected||!root.isConnected){observer.disconnect();dispose()}
  });
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',dispose,{once:true});
  async function discover(){
   if(closed||loaded||loading)return;
   loading=true;
   try{
    // Only a same-origin static manifest is fetched; no article text is transmitted.
    const endpoint='/assets/swapp-narrations/'+encodeURIComponent(slug)+'/manifest.json';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6000);
    let response;
    try{response=await fetch(endpoint,{credentials:'omit',cache:'no-store',signal:controller.signal})}
    finally{clearTimeout(timeout)}
    if(!response.ok||Number(response.headers.get('content-length'))>100000)return;
    const data=await response.json();
    if(closed||!studio.isConnected||!validManifest(data,slug,blocks))return;
    manifest=data;
    const mairaiy=data.engine==='gemini-tts'&&data.voice==='mairaiy-gemini-aoede';
    sourceIsMairaiy=mairaiy;
    title.textContent=mairaiy?'Mairaiy · Narration officielle':'Narration alternative · Français';
    label.textContent=mairaiy?'Voix historique Aoede de Quantic Studio, préenregistrée pour cet article.':'Voix Kokoro ff_siwis distincte de Mairaiy.';
    audio.src='/assets/swapp-narrations/'+encodeURIComponent(slug)+'/'+data.audio;
    container.hidden=mairaiy;loaded=true;
    onAvailability(mairaiy);
    const status=studio.querySelector('[data-reader-audio-status]');
    if(status)status.textContent=mairaiy?'Mairaiy est disponible dans la liste des voix.':'Narration alternative disponible au-dessus des commandes.';
   }catch(_){/* Use the unchanged system voice when no recording exists. */}
   finally{loading=false}
  }
  toggle.addEventListener('click',()=>{if(!panel.hidden)discover()});
  const stopMairaiy=()=>{
   if(!sourceIsMairaiy||!manifest)return;
   audio.pause();
   audio.currentTime=0;
   if(marked){marked.classList.remove('swapp-narration-current');marked=null;}
   report();
  };
  return {
   discover,
   isMairaiyAvailable:()=>!!(sourceIsMairaiy&&manifest&&!closed),
   toggleMairaiy:async()=>{
    if(!sourceIsMairaiy||!manifest||closed)return false;
    if(!audio.paused){audio.pause();report();return true;}
    try{
     await audio.play();report();return true;
    }catch(_){return false;}
   },
   stopMairaiy,
   jumpMairaiy:delta=>{if(sourceIsMairaiy&&manifest)jump(delta)},
   setSpeed:rate=>{audio.playbackRate=Math.max(.8,Math.min(1.25,Number(rate)||1))}
  };
 }
 window.SwappNeuralNarration={attach,pauseActive,stopActive,validManifest,articleBlocks};
})();