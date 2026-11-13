/* SWAPP TV — Twitch's official interactive player, not an unobservable iframe.
 * No Twitch OAuth or paid API: the public embed SDK signals real playback.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappTwitchPlayback=api;
})(typeof window!=='undefined'?window:null,function(root){
 'use strict';
 const SCRIPT='https://player.twitch.tv/js/embed/v1.js';
 let loading=null,serial=0;
 function loadSdk(){
  if(root?.Twitch?.Player)return Promise.resolve(root.Twitch);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   if(!root?.document)return reject(Error('no_dom'));
   const script=root.document.createElement('script');
   script.src=SCRIPT;script.async=true;
   let finished=false;
   const settle=(error)=>{
    if(finished)return;finished=true;
    clearTimeout(timer);
    if(error)reject(error);
    else if(root?.Twitch?.Player)resolve(root.Twitch);
    else reject(Error('twitch_sdk_missing'));
   };
   const timer=setTimeout(()=>settle(Error('twitch_sdk_timeout')),8500);
   script.addEventListener('load',()=>settle());
   script.addEventListener('error',()=>settle(Error('twitch_sdk_blocked')));
   (root.document.head||root.document.body).append(script);
  }).catch(error=>{loading=null;throw error});
  return loading;
 }
 function mount({container,login,parent,onReady=()=>{},onPlaying=()=>{},
  onBlocked=()=>{},onOffline=()=>{},onUnavailable=()=>{}}={}){
  if(!container||!/^[a-z0-9_]{3,25}$/.test(String(login||''))||
     !/^[a-z0-9.-]+$/i.test(String(parent||'')))throw Error('twitch_embed_invalid');
  const id='stv-twitch-'+(++serial);
  const slot=root.document.createElement('div');
  slot.id=id;slot.className='stv-twitch-sdk-slot';
  container.append(slot);
  let stopped=false,player=null;
  const live=()=>!stopped&&slot.isConnected!==false;
  const safe=(cb)=>{if(live())try{cb()}catch(_){/* UI callback failures do not break player */}};
  const retry=()=>{
   if(!live()||!player)return false;
   try{
    // A real user click on SWAPP TV can retry after autoplay is denied.
    player.setMuted(true);
    player.play();
    return true;
   }catch{return false}
  };
  void loadSdk().then(Twitch=>{
   if(!live())return;
   player=new Twitch.Player(id,{
    channel:login,parent:[parent],
    autoplay:true,muted:true,width:'100%',height:'100%'
   });
   player.addEventListener(Twitch.Player.READY,()=>{
    if(!live())return;
    try{player.setMuted(true)}catch(_){}
    safe(onReady);
    // The SDK can load asynchronously after the initial autoplay attempt.
    // READY is the first moment a player.play() call is supported.
    if(!retry())safe(()=>onBlocked('ready_play_failed'));
   });
   player.addEventListener(Twitch.Player.PLAYING,()=>safe(onPlaying));
   player.addEventListener(Twitch.Player.PLAYBACK_BLOCKED,()=>safe(()=>onBlocked('playback_blocked')));
   player.addEventListener(Twitch.Player.OFFLINE,()=>safe(onOffline));
  }).catch(err=>safe(()=>onUnavailable(String(err?.message||'sdk_unavailable'))));
  return Object.freeze({
   resume:retry,
   destroy(){
    stopped=true;player=null;
    if(typeof slot.remove==='function')slot.remove();
   },
   hasSdk:()=>Boolean(player)&&!stopped
  });
 }
 return Object.freeze({mount,loadSdk,SCRIPT});
});
