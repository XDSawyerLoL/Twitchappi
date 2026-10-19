/* SWAPP — ambient WoW trailer: full-bleed, silent, starts at 00:10.
   No Google/AdSense consent UI belongs to this decorative player.
   The website's advertising consent mechanism is separate. */
(()=>{'use strict';
 if(window.SwappTrailerHero)return;
 const valid=id=>/^[a-zA-Z0-9_-]{11}$/.test(id);
 const mounted=new WeakSet();
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 function mount(scene){
  if(!scene||mounted.has(scene))return;
  const id=scene.getAttribute('data-swapp-trailer-id')||'';
  const hero=scene.parentElement?.querySelector('.swapp-immersive-hero .swapp-immersive-content');
  if(!valid(id)||!hero)return;
  const gameLabel=String(scene.getAttribute('data-swapp-trailer-title')||'jeu vidéo').trim().slice(0,140);
  mounted.add(scene);
  const control=document.createElement('button');
  control.type='button';
  control.className='swapp-trailer-hero-toggle';
  control.textContent='Ⅱ Mettre la vidéo en pause';
  control.setAttribute('aria-pressed','false');
  control.setAttribute('aria-label','Mettre en pause ou relancer la bande-annonce muette');
  const actions=document.createElement('div');
  actions.className='swapp-trailer-hero-actions';
  actions.append(control);
  hero.append(actions);
  const poster=scene.querySelector('.swapp-article-trailer-poster');
  let frame=null,paused=false,visible=true;
  let observer=null;
  // YouTube sometimes normalizes the URL and ignores an initial start value.
  // Request 00:10 again when its IFrame API reports the player is ready.
  const youtubeOrigins=new Set(['https://www.youtube-nocookie.com','https://www.youtube.com']);
  function onYouTubeMessage(event){
   if(!frame||event.source!==frame.contentWindow||!youtubeOrigins.has(event.origin))return;
   let data=event.data;
   if(typeof data==='string'){try{data=JSON.parse(data)}catch(_){return}}
   if(data?.event!=='onReady')return;
   const player=frame.contentWindow;
   try{
    player.postMessage(JSON.stringify({event:'command',func:'seekTo',args:[10,true]}),event.origin);
    player.postMessage(JSON.stringify({event:'command',func:'mute',args:[]}),event.origin);
    player.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}),event.origin);
   }catch(_){}
  }
  window.addEventListener('message',onYouTubeMessage);
  function stop(){
   if(frame){frame.remove();frame=null}
   scene.classList.remove('is-trailer-playing');
   control.textContent='▶ Reprendre la vidéo';
   control.setAttribute('aria-pressed','false');
   if(poster)poster.hidden=false;
  }
  function play(force=false){
   if(frame||paused||!scene.isConnected||document.hidden||!visible)return;
   // Honour users who explicitly disable motion at the OS/browser level.
   if(!force&&reduced())return;
   const iframe=document.createElement('iframe');
   iframe.className='swapp-article-trailer-frame';
   iframe.title=gameLabel+' — bande-annonce muette en fond d’article';
   iframe.setAttribute('aria-hidden','true');
   iframe.setAttribute('tabindex','-1');
   iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
   iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
   iframe.setAttribute('loading','eager');
   iframe.addEventListener('load',()=>{
    if(frame!==iframe)return;
    scene.classList.add('is-trailer-playing');
    control.textContent='Ⅱ Mettre la vidéo en pause';
    control.setAttribute('aria-pressed','true');
    // Register YouTube's official postMessage listening protocol.
    try{iframe.contentWindow?.postMessage(JSON.stringify({event:'listening',id:'swapp-hero'}),
      'https://www.youtube-nocookie.com')}catch(_){}
   },{once:true});
   iframe.addEventListener('error',()=>{if(frame===iframe)stop()},{once:true});
   iframe.src='https://www.youtube-nocookie.com/embed/'+id+
    '?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist='+id+
    '&start=10&rel=0&fs=0&disablekb=1&enablejsapi=1&origin='+encodeURIComponent(window.location?.origin||'https://swapp.tv');
   scene.append(iframe);
   frame=iframe;
  }
  control.addEventListener('click',()=>{
   if(frame){paused=true;stop();return}
   paused=false;play(true);
  });
  function onVisibility(){
   if(!scene.isConnected){
    stop();document.removeEventListener('visibilitychange',onVisibility);
    window.removeEventListener('message',onYouTubeMessage);
    if(observer)observer.disconnect();
    return;
   }
   if(document.hidden)stop();else play();
  }
  document.addEventListener('visibilitychange',onVisibility);
  if(typeof IntersectionObserver==='function'){
   observer=new IntersectionObserver(entries=>{
    if(!scene.isConnected){onVisibility();return}
    visible=entries.some(entry=>entry.isIntersecting);
    if(visible)play();else stop();
   },{rootMargin:'120px 0px'});
   observer.observe(scene);
  }
  // Start as soon as the article hero is mounted; no click, dialog or CMP wait.
  play();
 }
 function scan(){document.querySelectorAll('.swapp-article-scene[data-swapp-trailer-id]').forEach(mount)}
 window.SwappTrailerHero={mount,scan};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 window.addEventListener('swapp:trailer:ready',event=>mount(event.detail?.scene));
})();