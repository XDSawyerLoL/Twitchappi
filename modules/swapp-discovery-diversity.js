'use strict';
/*
 * SWAPP Fair Discovery v1 — pure ranking, no tracking or paid boost.
 * - An explicit search always keeps the existing relevance order.
 * - Broad discovery mixes relevance, small live audiences and game diversity.
 * - Rotation within relevant candidates avoids fixed first-position winners.
 * - Verified game-lives are ranked only AFTER exact game-ID matching upstream.
 *
 * A low live viewer count is a proxy for a small audience, NOT an exposure
 * measure. True exposure parity requires opt-in aggregated impression metrics.
 */
const {normalize:normalizeGame,searchNames}=require('./swapp-news/game-identity');
const generic=new Set(['live','oryon live','swapp live','gaming','jeux video','jeu video','just chatting','discussion','unknown']);
const ROTATION_MS=15*60*1000;
function gameKey(row){
 const raw=normalizeGame(row?.game_name||row?.category||'');
 if(!raw||generic.has(raw))return 'unknown:'+String(row?.platform||'')+':'+String(row?.login||'');
 return normalizeGame(searchNames(raw)[0]||raw);
}
function replayTitle(row){
 const title=String(row?.title||'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /\b(rediffusions?|replays?|reruns?|vods?|best[ -]?of)\b|en\s+boucle/.test(title);
}
function audience(row){
 const value=Number(row?.viewer_count??row?.viewers);
 return Number.isFinite(value)?Math.max(0,value):Infinity;
}
function creatorKey(row){
 return String(row?.platform||'')+':'+String(row?.login||row?.user_login||'');
}
// FNV-style deterministic rotation: no viewer identity, cookie or persistence.
function rotationRank(row,slot){
 const text=creatorKey(row)+':'+gameKey(row)+':'+slot;
 let hash=2166136261;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
 return hash>>>0;
}
function rotationSlot(value){
 return value!==null&&value!==undefined&&Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):Math.floor(Date.now()/ROTATION_MS);
}
function diversifyDiscovery(scored,{limit=60,query='',firstScreen=12,perGame=2,rotation=null}={}){
 const list=Array.isArray(scored)?scored:[];
 const max=Math.max(1,Math.min(60,Number(limit)||60));
 const candidates=list.filter(row=>row&&typeof row==='object'&&!replayTitle(row));
 // The visitor's explicit request wins over all editorial quotas.
 if(String(query||'').trim())return candidates.slice(0,max);
 if(!candidates.length)return [];
 const first=Math.min(max,Math.max(1,Math.min(12,Number(firstScreen)||12)),candidates.length);
 const cap=Math.max(1,Math.min(4,Number(perGame)||2));
 const pool=candidates.slice(0,Math.max(36,first*6));
 const baseline=Number(candidates[first-1]?.score);
 const floor=Number.isFinite(baseline)?baseline-30:-Infinity;
 const eligible=pool.map((item,index)=>({item,index})).filter(({item})=>
  !Number.isFinite(Number(item.score))||Number(item.score)>=floor);
 // No real cross-game alternatives: never shuffle a user's relevant results
 // just to fill a fairness/diversity quota with copies of the same category.
 if(new Set(eligible.map(({item})=>gameKey(item))).size<3)return candidates.slice(0,max);
 const slot=rotationSlot(rotation);
 const chosen=[],used=new Set(),counts=new Map();
 const take=(entry,{enforceCap=true}={})=>{
  if(!entry||used.has(entry.index)||chosen.length>=first)return false;
  const key=gameKey(entry.item);
  if(enforceCap&&(counts.get(key)||0)>=cap)return false;
  chosen.push(entry);
  used.add(entry.index);
  counts.set(key,(counts.get(key)||0)+1);
  return true;
 };
 // A minimum share of relevant results always leads the page.
 const relevanceSlots=Math.ceil(first*.5);
 for(const entry of eligible){if(chosen.length>=relevanceSlots)break;take(entry)}
 // Reserve opportunities for creators with small *current live audiences*.
 const smallSlots=Math.ceil(first*.3);
 const lowAudience=eligible.filter(({item})=>audience(item)<=25)
  .sort((a,b)=>{
   // Coarse relevance tiers protect quality without freezing positions.
   const at=Math.floor((Number(a.item.score)||0)/15);
   const bt=Math.floor((Number(b.item.score)||0)/15);
   return bt-at||rotationRank(a.item,slot)-rotationRank(b.item,slot)||a.index-b.index;
  });
 let smallAdded=0;
 for(const entry of lowAudience){
  if(chosen.length>=first||smallAdded>=smallSlots)break;
  if(take(entry))smallAdded++;
 }
 // The per-game cap is a diversity preference, not a veto on the small
 // creator allocation. Relax it only when the relevant low-audience pool
 // otherwise cannot fill its reserved opportunities.
 for(const entry of lowAudience){
  if(chosen.length>=first||smallAdded>=smallSlots)break;
  if(take(entry,{enforceCap:false}))smallAdded++;
 }
 // Explore games not yet visible before repeating the same category.
 const diverse=eligible.filter(entry=>!counts.has(gameKey(entry.item)))
  .sort((a,b)=>Number(b.item.score||0)-Number(a.item.score||0)||
   rotationRank(a.item,slot)-rotationRank(b.item,slot));
 for(const entry of diverse){if(chosen.length>=first)break;take(entry)}
 for(const entry of eligible){if(chosen.length>=first)break;take(entry)}
 // With a one-game pool, never fake diversity: simply fill by relevance.
 for(const entry of pool.map((item,index)=>({item,index}))){
  if(chosen.length>=first)break;
  if(!used.has(entry.index))take(entry,{enforceCap:false});
 }
 const output=chosen.map(entry=>entry.item);
 // Beyond the first screen, keep the existing personalized score order.
 for(let i=0;i<candidates.length&&output.length<max;i++){
  if(!used.has(i))output.push(candidates[i]);
 }
 return output;
}
function rankGameLives(items,{limit=12,rotation=null}={}){
 const max=Math.max(1,Math.min(24,Number(limit)||12));
 const list=Array.isArray(items)?items.filter(x=>x&&typeof x==='object'&&!replayTitle(x)):[];
 const picked=[],seen=new Set(),slot=rotationSlot(rotation);
 const append=item=>{
  const key=creatorKey(item).toLowerCase();
  if(!key||seen.has(key)||picked.length>=max)return false;
  picked.push(item);seen.add(key);return true;
 };
 // A real native SWAPP live gets a chance, but does not monopolize the shelf.
 const native=list.find(x=>['oryon','swapp'].includes(String(x.platform||'').toLowerCase()));
 if(native)append(native);
 // Balance each exact-game shelf: at least roughly half of visible entries
 // can be small creators when sufficiently many verified small lives exist.
 const small=list.filter(x=>audience(x)<=25).sort((a,b)=>
  rotationRank(a,slot)-rotationRank(b,slot)||creatorKey(a).localeCompare(creatorKey(b)));
 let lowCount=picked.filter(x=>audience(x)<=25).length;
 const target=Math.ceil(max*.5);
 for(const item of small){if(lowCount>=target)break;if(append(item))lowCount++}
 // Fill remaining slots from the server's verified relevance order.
 for(const item of list)append(item);
 return picked;
}
module.exports={diversifyDiscovery,rankGameLives,gameKey,replayTitle,rotationRank};