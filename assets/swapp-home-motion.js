/* SWAPP V22 — article-matched, muted cinematic hero. Poster first, optional motion.
 * YouTube is requested only on capable desktop when the selected article has
 * its own validated trailer URL. No autoplay on mobile, Save-Data or low-motion.
 * Playback failure, iframe ads/loading, or a missing trailer never hide art.
 */
(() => {
 'use strict';
 let apiPromise;
 const VIDEO_READY_TIMEOUT=10000;
 function trailerId(article){
  const validate=window.SwappArticleExtras?.trailerId;
  return typeof validate==='function'?validate(article?.trailerUrl):null;
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
  let removed=false,player=null,observer=null,rootObserver=null,delay=null,watching=false,wasPlaying=false;
  const wrap=document.createElement('span');
  wrap.className='swapp-home-motion';
  wrap.setAttribute('aria-hidden','true');
  const host=document.createElement('span');
  host.className='swapp-home-motion-host';
  wrap.append(host);
  // The poster stays present for first paint, aria text and video failure.
  poster.after(wrap);
  function active(){return !removed&&tile.isConnected&&eligible()&&
   !!tile.closest('#home.view.active')}
  function removeMotion(){
   tile.classList.remove('swapp-home-motion-playing');
   wrap.remove();
   if(player){try{player.destroy()}catch{}player=null}
  }
  function cleanup(){
   if(removed)return;
   removed=true;
   clearTimeout(delay);
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
    wasPlaying=true;tile.classList.add('swapp-home-motion-playing');
    // A loop is silent, so there is no audio or start/stop UI.
    try{event.target.mute()}catch{}
   }else if(event.data===window.YT?.PlayerState?.ENDED){
    try{event.target.seekTo(0);event.target.playVideo()}catch{}
   }else if(event.data===window.YT?.PlayerState?.PAUSED){
    tile.classList.remove('swapp-home-motion-playing');
   }
  }
  async function begin(){
   if(!active())return cleanup();
   try{
    const YT=await loadAPI();
    if(!active())return cleanup();
    player=new YT.Player(host,{
     host:'https://www.youtube-nocookie.com',
     videoId:id,width:'100%',height:'100%',
     playerVars:{
      autoplay:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,
      loop:1,playlist:id,playsinline:1,rel:0,mute:1,origin:location.origin
     },
     events:{
      onReady(e){
       if(!active()){cleanup();return}
       try{e.target.mute();e.target.playVideo()}catch{removeMotion()}
      },
      onStateChange:state,
      onError:()=>removeMotion()
     }
    });
   }catch{removeMotion()}
  }
  function startAfterPoster(){
   if(watching)return;
   watching=true;
   if(poster.complete&&poster.naturalWidth>0){delay=setTimeout(begin,1100);return}
   if(poster.complete&&!poster.naturalWidth)return cleanup();
   poster.addEventListener('load',()=>{if(!removed)delay=setTimeout(begin,1100)},{once:true});
   poster.addEventListener('error',cleanup,{once:true});
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
  startAfterPoster();
  return true;
 }
 window.SwappHomeMotion=Object.freeze({attach});
})();
