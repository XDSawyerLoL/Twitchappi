/* SWAPP - immersive article trailer. Uses the existing editorial scene, no extra hero. */
(()=>{'use strict';
 if(window.SwappTrailerHero)return;
 const valid=id=>/^[A-Za-z0-9_-]{11}$/.test(id);
 const installed=new WeakSet();
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const saveData=()=>!!navigator.connection?.saveData;
 const allowed=tc=>tc?.gdprApplies===false||(tc?.gdprApplies===true&&typeof tc.tcString==='string'&&tc.tcString.length>0&&tc.purpose?.consents?.['1']===true&&tc.vendor?.consents?.['755']===true);
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
  note.textContent='YouTube chargé après accord · sans son';
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
   if(frame||!scene.isConnected||document.hidden||!visible)return;
   if(!force&&(paused||!enabled||reduced()||saveData()))return;
   const iframe=document.createElement('iframe');
   iframe.className='swapp-article-trailer-frame';
   iframe.title='Bande-annonce officielle de World of Warcraft: Forever, arrière-plan muet';
   iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;
   iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
   iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
   iframe.setAttribute('loading','lazy');
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
   if(cmp===false){
    if(typeof window.googlefc?.showRevocationMessage==='function')
     window.googlefc.showRevocationMessage();
    else note.textContent='Consentement refusé : modifier vos préférences pour lire la vidéo';
    return;
   }
   paused=false;enabled=true;
   play(true);
   note.textContent='Vidéo YouTube chargée à votre demande · sans son';
  });
  if(typeof IntersectionObserver==='function'){
   const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    if(!scene.isConnected){stop();observer.disconnect();return}
    if(!visible)stop();else play();
   },{rootMargin:'120px 0px'});
   observer.observe(scene);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else play()});
  function listen(){
   if(typeof window.__tcfapi!=='function')return;
   try{window.__tcfapi('addEventListener',0,(tc,success)=>{
    if(!success||!tc)return;
    if(tc.eventStatus!=='tcloaded'&&tc.eventStatus!=='useractioncomplete')return;
    cmp=allowed(tc);
    if(!cmp){enabled=false;stop();return}
    enabled=true;play();
   })}catch(_){}
  }
  if(typeof window.__tcfapi==='function')listen();
  else{
   window.googlefc=window.googlefc||{};
   window.googlefc.callbackQueue=window.googlefc.callbackQueue||[];
   window.googlefc.callbackQueue.push({CONSENT_API_READY:listen});
  }
 }
 function scan(){document.querySelectorAll('.swapp-article-scene[data-swapp-trailer-id]').forEach(mount)}
 window.SwappTrailerHero={mount,scan};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 window.addEventListener('swapp:trailer:ready',event=>mount(event.detail?.scene));
})();