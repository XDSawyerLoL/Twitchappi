'use strict';
/* SWAPP private discovery — an aggregate of game interests stored ONLY on this browser.
 * No identity, channel name, article URL, browsing history, cookie or network request.
 * Records only deliberate clicks. Expires within 30 days, limited to 8 games.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappLocalTastes=api.createStore((()=>{
  try{return root.localStorage}catch(_){return null}
 })());
})(typeof window!=='undefined'?window:null,function(){
 const KEY='swapp:private-game-interests:v1';
 const OFF='swapp:private-discovery-off:v1';
 const DAY=86400000,TTL=30,MAX=8;
 const generic=new Set(['actus','actualite','actualites','gaming','jeu video','jeux video','twitch','swapp','just chatting','discussion','musique','music','art','pc','xbox','playstation','nintendo','categorie','categories','live']);
 function normalize(value){
  const s=typeof value==='string'?value:typeof value?.name==='string'?value.name:'';
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ').slice(0,64);
 }
 function validGame(game){
  return game.length>=4&&game.length<=64&&!generic.has(game)&&!/^\d+$/.test(game);
 }
 function createStore(storage,clock=()=>Date.now()){
  const readKey=key=>{try{return storage?.getItem(key)}catch(_){return null}};
  const setKey=(key,value)=>{try{storage?.setItem(key,value);return !!storage}catch(_){return false}};
  const dropKey=key=>{try{storage?.removeItem(key)}catch(_){}};
  const today=()=>Math.floor(clock()/DAY);
  function isEnabled(){return readKey(OFF)!=='1'}
  function load(){
   if(!isEnabled())return [];
   let decoded;
   try{decoded=JSON.parse(readKey(KEY)||'[]')}catch(_){return []}
   const day=today();
   if(!Array.isArray(decoded))return [];
   const dedupe=new Map();
   for(const entry of decoded.slice(0,MAX*2)){
    const game=typeof entry?.g==='string'?entry.g:'';
    const age=day-Number(entry?.d);
    const points=Number(entry?.p);
    if(!validGame(game)||normalize(game)!==game||!Number.isInteger(age)||age<0||age>=TTL||!Number.isInteger(points)||points<1||points>5)continue;
    if(!dedupe.has(game))dedupe.set(game,{g:game,p:points,d:day-age});
   }
   return [...dedupe.values()].slice(0,MAX);
  }
  function getScores(){
   const day=today(),scores={};
   for(const item of load()){
    const age=day-item.d;
    const weight=age<7?1:age<14?.7:age<22?.4:.2;
    scores[item.g]=Math.round(item.p*weight*10)/10;
   }
   return scores;
  }
  function record(gameName){
   if(!isEnabled())return false;
   const game=normalize(gameName);
   if(!validGame(game))return false;
   const day=today();
   const entries=load();
   const existing=entries.find(e=>e.g===game);
   if(existing){existing.p=Math.min(5,existing.p+1);existing.d=day}
   else entries.push({g:game,p:1,d:day});
   entries.sort((a,b)=>b.d-a.d||b.p-a.p);
   return setKey(KEY,JSON.stringify(entries.slice(0,MAX)));
  }
  function clear(){dropKey(KEY)}
  function setEnabled(enabled){
   if(enabled){dropKey(OFF)}
   else{clear();setKey(OFF,'1')}
  }
  return Object.freeze({getScores,record,clear,isEnabled,setEnabled});
 }
 return Object.freeze({createStore,normalize,validGame,KEY,OFF,TTL,MAX});
});
