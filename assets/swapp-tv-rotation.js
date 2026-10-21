'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SwappTvRotation=api;})(typeof window!=='undefined'?window:null,function(){
 const normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const valid=x=>/^[a-z0-9_]{2,25}$/.test(String(x||'').toLowerCase());
 function lineup(candidates,spotlights=[],now=Date.now()){
  const reservations=new Set(spotlights.filter(x=>x.live?.state==='live_verified'&&Date.parse(x.start_at)<=now&&now<Date.parse(x.end_at)).map(x=>String(x.twitch_login||'').toLowerCase()));
  const unique=new Map();
  for(const c of candidates){
   const login=String(c.login||'').toLowerCase(),platform=String(c.platform||'').toLowerCase();
   if(!valid(login)||!['twitch','oryon','swapp'].includes(platform)||!normalize(c.game))continue;
   if(normalize(c.game)!==normalize(c.game_name||c.category||c.game))continue;
   const key=platform+':'+login;if(unique.has(key))continue;
   unique.set(key,{...c,login,platform,key,spotlight:platform==='twitch'&&reservations.has(login)});
  }
  const all=[...unique.values()];
  // Interleave Spotlight and public discovery; never sort by viewer count.
  const priority=all.filter(x=>x.spotlight),others=all.filter(x=>!x.spotlight),out=[];
  while(priority.length||others.length){if(priority.length)out.push(priority.shift());if(others.length)out.push(others.shift())}
  return out;
 }
 return Object.freeze({lineup});
});
