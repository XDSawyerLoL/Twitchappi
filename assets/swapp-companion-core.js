/* SWAPP companion shared rules: public data only, no fabricated activity. */
'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappCompanionCore=api;
})(typeof window!=='undefined'?window:null,function(){
 const clean=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,180);
 const normalize=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const loginOk=s=>/^[a-z0-9_]{2,40}$/i.test(String(s||''));
 function lives(data){
  if(!data||data.success===false||!Array.isArray(data.items))return [];
  const seen=new Set(),result=[];
  for(const raw of data.items.slice(0,60)){
   const login=clean(raw?.login||raw?.host_login||raw?.user_login).toLowerCase();
   if(!loginOk(login))continue;
   const platform=String(raw?.platform||'').toLowerCase();
   const native=platform==='swapp'||platform==='oryon';
   const id=(native?'swapp':'twitch')+':'+login;
   if(seen.has(id))continue;
   seen.add(id);
   const game=clean(raw?.game_name||raw?.game||raw?.category);
   result.push({id,kind:'live',title:clean(raw?.display_name||login)+' est en direct',detail:game||'Live en cours',
    game,href:native?'/'+encodeURIComponent(login):'/live/twitch/'+encodeURIComponent(login),login});
  }
  return result;
 }
 function news(data){
  if(!data||!Array.isArray(data.articles))return [];
  const seen=new Set(),result=[];
  for(const a of data.articles.slice(0,50)){
   const slug=String(a?.slug||'');
   if(!slugOk(slug)||seen.has(slug))continue;
   seen.add(slug);
   result.push({id:'news:'+slug,kind:'news',title:clean(a.title)||'Nouvelle actualité',detail:clean(a.game||a.category)||'Actualité',
    game:clean(a.game),href:'/actus/'+encodeURIComponent(slug),publishedAt:a.publishedAt||null});
  }
  return result;
 }
 function newlySeen(previous,current){
  if(!Array.isArray(previous))return [];
  const old=new Set(previous.map(item=>item.id));
  return current.filter(item=>!old.has(item.id)).slice(0,3);
 }
 function suggest(question,items,limit=3){
  const normalized=normalize(question);
  const filtered=items.filter(item=>{
   const game=normalize(item.game);
   return game.length>=3&&normalized.includes(game);
  });
  return (filtered.length?filtered:items).slice(0,limit);
 }
 function isWatching(path,activeView){
  return /^\/(?:live\/twitch\/|watch\/)/.test(path||'')||
   ['watch','channel','player'].includes(activeView);
 }
 return Object.freeze({clean,normalize,slugOk,lives,news,newlySeen,suggest,isWatching});
});
