'use strict';
/* SWAPP homepage: one editorial list, SWAPP creators first, Twitch fills remaining slots.
 * Works in the browser and in Node tests. No extra homepage widgets.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappLiveCuration=api;
})(typeof window!=='undefined'?window:null,function(){
 function loginOf(item){
  const x=item||{};
  return String(x.host_login||x.login||x.room||x.channel||x.user_login||x.broadcaster_login||x.user_name||'')
   .trim().toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_-]/g,'').slice(0,64);
 }
 function isLoopReplay(item){
  const title=String(item?.title||item?.live_title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\b(rediffusions?|replays?|reruns?|vods?|best[ -]?of)\b|en\s+boucle/.test(title);
 }
 function curateHomeLives(swappItems,twitchItems,limit=12){
  const out=[],seen=new Set();
  let nativeCount=0,twitchCount=0,skippedReplay=0;
  const add=(item,platform)=>{
   const login=loginOf(item);
   if(!login||seen.has(login)||out.length>=limit)return;
   seen.add(login);
   out.push({...item,platform});
   if(platform==='swapp')nativeCount++;
   else twitchCount++;
  };
  for(const item of Array.isArray(swappItems)?swappItems:[])add(item,'swapp');
  for(const item of Array.isArray(twitchItems)?twitchItems:[]){
   if(isLoopReplay(item)){skippedReplay++;continue;}
   add(item,'twitch');
  }
  return {items:out,nativeCount,twitchCount,skippedReplay};
 }
 return Object.freeze({curateHomeLives,isLoopReplay,loginOf});
});
