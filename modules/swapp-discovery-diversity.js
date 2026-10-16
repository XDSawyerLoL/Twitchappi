'use strict';
/*
 * SWAPP Discover: a small editorial diversity guard on top of the existing
 * mood/personalization score. No service, network request, tracking or storage.
 *
 * User searches keep their exact score order. For broad discovery, avoid
 * filling the first screen with creators from one game when alternatives exist.
 * Never invent "live" status, change scores, or replace a user's dislikes.
 */
const {normalize:normalizeGame,searchNames}=require('./swapp-news/game-identity');
const generic=new Set(['live','oryon live','swapp live','gaming','jeux video','jeu video','just chatting','discussion','unknown']);
function gameKey(row){
 const raw=normalizeGame(row?.game_name||row?.category||'');
 // Unknown games are NOT considered the same game: one generic category must
 // not crowd out unrelated creators lacking precise metadata.
 if(!raw||generic.has(raw))return 'unknown:'+String(row?.platform||'')+':'+String(row?.login||'');
 // Reuse the editorial game's canonical aliases (GTA VI / GTA 6 etc.)
 // so two names for one game never falsely increase category diversity.
 return normalizeGame(searchNames(raw)[0]||raw);
}
function replayTitle(row){
 const title=String(row?.title||'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /\b(rediffusions?|replays?|reruns?|vods?|best[ -]?of)\b|en\s+boucle/.test(title);
}
function diversifyDiscovery(scored,{limit=60,query='',firstScreen=12,perGame=2}={}){
 const list=Array.isArray(scored)?scored:[];
 const max=Math.max(1,Math.min(60,Number(limit)||60));
 const candidates=list.filter(row=>row&&typeof row==='object'&&!replayTitle(row));
 // An explicit search is a request for relevance, not general exploration.
 if(String(query||'').trim())return candidates.slice(0,max);
 const first=Math.min(max,Math.max(1,Math.min(12,Number(firstScreen)||12)));
 const cap=Math.max(1,Math.min(4,Number(perGame)||2));
 const pool=candidates.slice(0,Math.max(first*3,first));
 const baseline=Number(candidates[Math.min(first-1,candidates.length-1)]?.score);
 const relevanceFloor=Number.isFinite(baseline)?baseline-30:-Infinity;
 const distinct=new Set(pool.map(gameKey)).size;
 if(distinct<3)return candidates.slice(0,max);
 const used=new Set(),counts=new Map(),result=[];
 const add=(entry,index)=>{
  result.push(entry);used.add(index);
  const key=gameKey(entry);
  counts.set(key,(counts.get(key)||0)+1);
 };
 // Honor the existing score order whenever the diversity cap permits.
 for(let i=0;i<pool.length&&result.length<first;i++){
  // Do not promote markedly irrelevant/disliked streams from the long tail.
  const score=Number(pool[i].score);
  if(Number.isFinite(score)&&score<relevanceFloor)continue;
  const key=gameKey(pool[i]);
  if((counts.get(key)||0)>=cap)continue;
  add(pool[i],i);
 }
 // If there are too few games, fill remaining slots with relevant creators.
 for(let i=0;i<pool.length&&result.length<first;i++){
  if(!used.has(i))add(pool[i],i);
 }
 // The remaining results preserve original relevance order.
 for(let i=0;i<candidates.length&&result.length<max;i++){
  if(i<pool.length&&used.has(i))continue;
  result.push(candidates[i]);
 }
 return result;
}
module.exports={diversifyDiscovery,gameKey,replayTitle};
