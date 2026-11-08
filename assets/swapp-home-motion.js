/* SWAPP V25 — one hero canvas, no poster flash during trailer startup.
 * Only eligible desktops autoplay a matched muted trailer from 0:10.
 * Show the static cover only when video is unavailable or blocked.
 */
(() => {
 'use strict';
 let apiPromise;
 const VIDEO_READY_TIMEOUT=10000;
 const TRAILER_START_SECONDS=10; // 0:10, not the first frame.
 function trailerId(article){
  const validate=window.SwappArticleExtras?.trailerId;
  const parsed=typeof validate==='function'?validate(article?.trailerUrl):null;
  if(parsed)return parsed;
  try{const u=new URL(String(article?.trailerUrl||''));const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v');return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null}catch{return null}
 }
 function eligible(){
  try{
   return document.visibilityState==='visible'&&
    !navigator.connection?.saveData&&
    window.matchMedia('(min-width: 980px) and (pointer: fine)').matches&&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }catch{return false}
 }
 function loadAPI(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
   const old=window.onYouTubeIframeAPIReady;
   let done=false;
   const timeout=setTimeout(()=>finish(new Error('YouTube player timeout')),VIDEO_READY_TIMEOUT);
   function finish(error){
    if(done)return;
    done=true;clearTimeout(timeout);
    if(error){apiPromise=null;reject(error)}
    else resolve(window.YT);
   }
   window.onYouTubeIframeAPIReady=()=>{
    try{if(typeof old==='function')old()}catch{}
    if(window.YT?.Player)finish();else finish(new Error('Player API missing'));
   };
   const script=document.createElement('script');
   script.src='https://www.youtube.com/iframe_api';
   script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';
   script.onerror=()=>finish(new Error('Player API unavailable'));
   document.head.appendChild(script);
  });
  return apiPromise;
 }
 function attach(tile,article){
  const id=trailerId(article);
  if(!id||!tile||!eligible())return false;
  const poster=tile.querySelector('img');
  if(!poster)return false;
  let removed=false,player=null,observer=null,rootObserver=null,delay=null,watchdog=null,watching=false,wasPlaying=false;
  const wrap=document.createElement('span');
  wrap.className='swapp-home-motion';
  wrap.setAttribute('aria-hidden','true');
  const host=document.createElement('span');
  host.className='swapp-home-motion-host';
  // The YouTube API replaces its target with an iframe. The sizing
  // container must be the PARENT of that target, not the target itself.
  const mount=document.createElement('span');
  host.append(mount);
  wrap.append(host);
  // Poster stays as fallback, never painted under a loading trailer.
  tile.classList.add('swapp-home-motion-loading');
  poster.after(wrap);
  function active(){return !removed&&tile.isConnected&&eligible()&&
   !!(tile.closest('#home.view.active')||tile.closest('#home'))}
  function removeMotion(){
   tile.classList.remove('swapp-home-motion-playing','swapp-home-motion-loading');
   wrap.remove();
   if(player){try{player.destroy()}catch{}player=null}
  }
  function cleanup(){
   if(removed)return;
   removed=true;
   clearTimeout(delay);
   clearTimeout(watchdog);
   observer?.disconnect();
   rootObserver?.disconnect();
   document.removeEventListener('visibilitychange',onVisibility);
   window.removeEventListener('pagehide',cleanup);
   removeMotion();
  }
  function onVisibility(){
   if(!active()){
    tile.classList.remove('swapp-home-motion-playing');
    try{player?.pauseVideo()}catch{}
   }else if(player&&wasPlaying){
    try{player.playVideo()}catch{}
   }
  }
  function state(event){
   if(removed)return;
   if(event.data===window.YT?.PlayerState?.PLAYING&&active()){
    wasPlaying=true;clearTimeout(watchdog);
    tile.classList.add('swapp-home-motion-playing');
    tile.classList.remove('swapp-home-motion-loading');
    // A loop is silent, so there is no audio or start/stop UI.
    try{event.target.mute()}catch{}
   }else if(event.data===window.YT?.PlayerState?.ENDED){
    try{event.target.seekTo(TRAILER_START_SECONDS,true);event.target.playVideo()}catch{}
   }else if(event.data===window.YT?.PlayerState?.PAUSED){
    tile.classList.remove('swapp-home-motion-playing');
   }
  }
  function directEmbedFallback(){
   if(removed||!active())return cleanup();
   // Browser CSP or extensions may block the iframe API while allowing an embed.
   // Keep the poster visible until the iframe has actually loaded.
   host.replaceChildren();
   const frame=document.createElement('iframe');
   frame.title='Bande-annonce officielle de '+String(article?.game||'ce jeu');
   frame.allow='autoplay; encrypted-media; picture-in-picture';
   frame.referrerPolicy='strict-origin-when-cross-origin';
   frame.setAttribute('tabindex','-1');
   frame.setAttribute('aria-hidden','true');
   let loaded=false;
   frame.onload=()=>{
    if(!active())return;
    loaded=true;
    clearTimeout(watchdog);
    tile.classList.add('swapp-home-motion-playing');
    tile.classList.remove('swapp-home-motion-loading');
   };
   frame.onerror=()=>cleanup();
   host.append(frame);
   watchdog=setTimeout(()=>{if(!loaded)cleanup()},10000);
   frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist='+encodeURIComponent(id)+'&start='+TRAILER_START_SECONDS+'&rel=0';
  }
  async function begin(){
   if(!active())return cleanup();
   try{
    const YT=await loadAPI();
    if(!active())return cleanup();
    player=new YT.Player(mount,{
     host:'https://www.youtube-nocookie.com',
     videoId:id,width:'100%',height:'100%',
     playerVars:{
      autoplay:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,
      loop:1,playlist:id,playsinline:1,rel:0,mute:1,start:TRAILER_START_SECONDS,origin:location.origin
     },
     events:{
      onReady(e){
       if(!active()){cleanup();return}
       watchdog=setTimeout(()=>{if(!wasPlaying)cleanup()},8000);
       try{e.target.mute();e.target.seekTo(TRAILER_START_SECONDS,true);e.target.playVideo()}catch{cleanup()}
      },
      onStateChange:state,
      onError:()=>cleanup()
     }
    });
   }catch{directEmbedFallback()}
  }
  function startMotion(){
   if(watching)return;
   watching=true;
   // Start the muted official trailer in the actual home hero; preserve the poster on failure.
   delay=setTimeout(begin,0);
  }
  // Never keep a background video playing when its SWAPP page leaves the DOM.
  const home=document.getElementById('home');
  if(home&&window.MutationObserver){
   rootObserver=new MutationObserver(()=>{if(!tile.isConnected)cleanup();else onVisibility()});
   rootObserver.observe(home,{childList:true,attributes:true,attributeFilter:['class']});
  }
  if(window.IntersectionObserver){
   observer=new IntersectionObserver(entries=>{
    const visible=entries.some(e=>e.isIntersecting);
    if(!visible){tile.classList.remove('swapp-home-motion-playing');try{player?.pauseVideo()}catch{}}
    else if(active()&&wasPlaying)try{player?.playVideo()}catch{}
   },{rootMargin:'80px'});
   observer.observe(tile);
  }
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',cleanup,{once:true});
  startMotion();
  return true;
 }
 window.SwappHomeMotion=Object.freeze({attach});
})();
