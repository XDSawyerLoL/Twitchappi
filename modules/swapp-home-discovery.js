'use strict';
// SWAPP homepage: keep genuinely live native creators discoverable without
// replacing Twitch variety, tracking viewers or issuing an extra API call.
// The incoming array is already restricted to live data by the server.
const {gameKey,replayTitle}=require('./swapp-discovery-diversity');
function rankHomeLives(items,{limit=12}={}){
 const max=Math.max(1,Math.min(12,Number(limit)||12));
 const seen=new Set(),candidates=[];
 for(const item of Array.isArray(items)?items:[]){
  if(!item||typeof item!=='object'||replayTitle(item))continue;
  const platform=String(item.platform||'').toLowerCase();
  const login=String(item.login||item.user_login||item.host_login||'').trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_-]{2,40}$/.test(login))continue;
  const key=platform+':'+login;
  if(seen.has(key))continue;
  seen.add(key);
  candidates.push(item);
 }
 const native=item=>['oryon','swapp'].includes(String(item.platform||'').toLowerCase());
 const relevance=item=>{
  const viewers=Math.max(0,Number(item.viewer_count??item.viewers??0)||0);
  return (viewers>=30&&viewers<=100?1000:0)+
   (viewers>=15&&viewers<=300?300:0)-Math.abs(viewers-60);
 };
 // Preserve the previous audience-size score as the baseline. Stable ties.
 const scored=candidates.map((item,index)=>({item,index,score:relevance(item)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index);
 const availableNative=scored.filter(x=>native(x.item));
 // Reserve up to a third of the visible grid for *real* SWAPP lives. If no
 // native creators are live, the full space remains available to Twitch.
 const reserved=availableNative.slice(0,Math.min(availableNative.length,Math.ceil(max/3)));
 const included=new Set(reserved.map(x=>x.index));
 const selected=[...reserved,...scored.filter(x=>!included.has(x.index))].slice(0,max)
  .map(x=>x.item);
 // Reorder ONLY within the selected set: never replace relevant live entries
 // with unknown long-tail results simply to satisfy a diversity metric.
 const first=Math.min(6,selected.length);
 const distinct=new Set(selected.map(gameKey)).size;
 if(first<=2||distinct<3)return selected;
 const head=[],used=new Set(),perGame=new Map();
 for(let i=0;i<selected.length&&head.length<first;i++){
  const key=gameKey(selected[i]);
  if((perGame.get(key)||0)>=2)continue;
  head.push(selected[i]);used.add(i);perGame.set(key,(perGame.get(key)||0)+1);
 }
 for(let i=0;i<selected.length&&head.length<first;i++){
  if(used.has(i))continue;
  head.push(selected[i]);used.add(i);
 }
 return [...head,...selected.filter((_,i)=>!used.has(i))];
}
module.exports={rankHomeLives};
