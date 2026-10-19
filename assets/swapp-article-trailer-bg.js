/* SWAPP - immersive article trailer. Uses the existing editorial scene, no extra hero. */
(()=>{'use strict';
 if(window.SwappTrailerHero)return;
 const valid=id=>/^[A-Za-z0-9_-]{11}$/.test(id);
 const installed=new WeakSet();
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const saveData=()=>!!navigator.connection?.saveData;
 // Only certified TCF decisions may authorize the background player.
 const allowed=tc=>tc?.cmpStatus!=='error'&&(tc?.gdprApplies===false||(tc?.gdprApplies===true&&typeof tc.tcString==='string'&&tc.tcString.length>0&&tc.purpose?.consents?.['1']===true&&tc.vendor?.consents?.['755']===true));
 function mount(scene){
  if(!scene||installed.has(scene))return;
  const id=scene.getAttribute('data-swapp-trailer-id')||'';
  const content=scene.parentElement?.querySelector('.swapp-immersive-hero .swapp-immersive-content');
  if(!valid(id)||!content)return;
  installed.add(scene);
  const actions=document.createElement('div');
  actions.className='swapp-trailer-hero-actions';
  const button=document.createElement('button');
  button.type='button';button.className='swapp-trailer-hero-toggle';
  button.setAttribute('aria-pressed','false');
  button.textContent='▶ Animer avec le trailer';
  const note=document.createElement('small');
  note.className='swapp-trailer-hero-note';
  note.textContent='Lecture automatique à 10 s après consentement · sans son';
  actions.append(button,note);content.append(actions);
  let frame=null,enabled=false,paused=false,cmp=null,visible=true;
  const poster=scene.querySelector('.swapp-article-trailer-poster');
  function stop(){
   if(frame){frame.remove();frame=null}
   scene.classList.remove('is-trailer-playing');
   button.textContent='▶ Animer avec le trailer';
   button.setAttribute('aria-pressed','false');
   if(poster)poster.hidden=false;
  }
  function play(force=false){
   if(frame||cmp!==true||!scene.isConnected||document.hidden||!visible)return;
   if(!force&&(paused||!enabled||reduced()||saveData()))return;
   const iframe=document.createElement('iframe');
   iframe.className='swapp-article-trailer-frame';
   iframe.title='Bande-annonce officielle de World of Warcraft: Forever, arrière-plan muet';
   iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;
   iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
   iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
   iframe.setAttribute('loading','eager');
   iframe.addEventListener('load',()=>{
    if(frame!==iframe)return;
    scene.classList.add('is-trailer-playing');
    button.textContent='Ⅱ Arrêter l’animation';
    button.setAttribute('aria-pressed','true');
   },{once:true});
   iframe.addEventListener('error',()=>{if(frame===iframe)stop()},{once:true});
   iframe.src='https://www.youtube-nocookie.com/embed/'+id+
    '?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist='+id+
    '&start=10&rel=0&fs=0&disablekb=1';
   scene.append(iframe);frame=iframe;
  }
  button.addEventListener('click',()=>{
   if(frame){paused=true;stop();return}
   if(cmp!==true){
    // Never bypass the official Google/IAB consent message on a manual click.
    if(typeof window.googlefc?.showRevocationMessage==='function')
     window.googlefc.showRevocationMessage();
    else note.textContent='Le consentement Google doit être configuré pour démarrer la vidéo';
    return;
   }
   paused=false;enabled=true;
   play(true);
   note.textContent='Bande-annonce muette · lecture depuis 10 secondes';
  });
  if(typeof IntersectionObserver==='function'){
   const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    if(!scene.isConnected){
     stop();observer.disconnect();
     document.removeEventListener('visibilitychange',onVisibility);
     return;
    }
    if(!visible)stop();else play();
   },{rootMargin:'120px 0px'});
   observer.observe(scene);
  }
  function onVisibility(){
   if(!scene.isConnected){
    document.removeEventListener('visibilitychange',onVisibility);
    stop();return;
   }
   if(document.hidden)stop();else play();
  }
  document.addEventListener('visibilitychange',onVisibility);
  let registered=false;
  function listen(){
   if(registered||typeof window.__tcfapi!=='function')return false;
   try{window.__tcfapi('addEventListener',2,(tc,success)=>{
    if(!success||!tc)return;
    if(tc.eventStatus!=='tcloaded'&&tc.eventStatus!=='useractioncomplete')return;
    const previouslyGranted=cmp===true;
    cmp=allowed(tc);
    if(!cmp){
     enabled=false;stop();
     note.textContent='Consentement requis pour animer la bande-annonce';
     return;
    }
    enabled=true;
    if(!previouslyGranted)paused=false;
    note.textContent='Lecture automatique à 10 s · sans son';
    play();
   });registered=true;return true}catch(_){return false}
  }
  // A certified CMP may load after the article renderer. The version is TCF v2.
  if(!listen()){
   const googlefc=window.googlefc=window.googlefc||{};
   googlefc.callbackQueue=googlefc.callbackQueue||[];
   googlefc.callbackQueue.push({CONSENT_API_READY:listen});
   let attempts=0;
   const ticker=setInterval(()=>{
    if(!scene.isConnected||listen()||++attempts>=45)clearInterval(ticker);
   },1000);
  }
 }
 function scan(){document.querySelectorAll('.swapp-article-scene[data-swapp-trailer-id]').forEach(mount)}
 window.SwappTrailerHero={mount,scan};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 window.addEventListener('swapp:trailer:ready',event=>mount(event.detail?.scene));
})();