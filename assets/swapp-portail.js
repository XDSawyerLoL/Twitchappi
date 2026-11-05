/* SWAPP PORTAIL — verified, game-first live discovery without personal profiling. */
(function(){
 'use strict';
 const LOGIN=/^[a-z0-9_-]{2,32}$/;
 function clean(value,max){return String(value??'').trim().slice(0,max)}
 function candidate(row){
  if(!row||typeof row!=='object'||row.platform!=='swapp'||row.media!=='hls'||row.media_verified!==true)return null;
  const login=clean(row.login,50).toLowerCase();
  if(!LOGIN.test(login)||row.player_url!=='/api/oryon/local-relay/'+encodeURIComponent(login)+'/player')return null;
  const game=clean(row.game,100)||'Jeu non renseigné';
  return {login,game,title:clean(row.title,140)||'Direct SWAPP',
   name:clean(row.display_name,70)||login,href:'/'+encodeURIComponent(login)};
 }
 function candidates(payload){
  if(payload?.success!==true||payload?.verified!==true||payload?.source!=='swapp-direct-hls'||!Array.isArray(payload.items))return [];
  const used=new Set(),result=[];
  for(const row of payload.items.slice(0,400)){
   const item=candidate(row);
   if(!item||used.has(item.login))continue;
   used.add(item.login);result.push(item);
  }
  return result;
 }
 // Fair order rotated by public 15-minute time slot; no viewer ID, IP, history or popularity.
 function hash(value){
  let n=2166136261;
  for(const c of String(value)){n=Math.imul(n^c.charCodeAt(0),16777619)}
  return n>>>0;
 }
 function rank(items,slot){
  const key=Number.isSafeInteger(slot)&&slot>=0?slot:0;
  return [...items].sort((a,b)=>hash(a.login+':'+key)-hash(b.login+':'+key)||a.login.localeCompare(b.login));
 }
 function gameOptions(items){
  const map=new Map();
  for(const item of items){map.set(item.game,(map.get(item.game)||0)+1)}
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],'fr')).slice(0,80);
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={candidate,candidates,rank,hash,gameOptions};return}
 const $=id=>document.getElementById(id);
 let all=[],current='',steps=0,requestedGame='';
 const button=$('sp-next'),select=$('sp-game'),watch=$('sp-watch'),status=$('sp-status');
 const name=$('sp-name'),title=$('sp-title'),category=$('sp-category'),count=$('sp-count');
 const glyph=$('sp-glyph'),suggestion=$('sp-suggestion'),reload=$('sp-refresh');
 if(!button||!select||!watch||!status||!name||!title||!category||!count||!glyph||!suggestion||!reload)return;
 function state(message){status.textContent=message}
 function clear(){
  current='';
  name.textContent='LA PROCHAINE RENCONTRE';
  title.textContent='Un direct que tu n’aurais peut-être jamais découvert.';
  category.textContent='SWAPP / CRÉATEURS';
  glyph.textContent='S';
  suggestion.textContent='';
  watch.hidden=true;
 }
 function showNext(){
  const pool=all.filter(x=>!select.value||x.game===select.value);
  if(!pool.length){
   clear();button.disabled=true;
   state(all.length?'Aucun créateur ne diffuse actuellement ce jeu.':'Aucun direct SWAPP vérifié pour le moment.');
   return;
  }
  const order=rank(pool,Math.floor(Date.now()/900000));
  let next=order[steps%order.length];
  if(next.login===current&&order.length>1){steps++;next=order[steps%order.length]}
  steps++;current=next.login;
  name.textContent=next.name;
  title.textContent=next.title;
  category.textContent=next.game;
  glyph.textContent=(next.name[0]||'S').toUpperCase();
  suggestion.textContent=order.length>1
   ?'Encore '+(order.length-1)+' direct'+(order.length>2?'s':'')+' à explorer dans cette sélection.'
   :'Un seul direct disponible dans cette sélection.';
  watch.href=next.href;watch.hidden=false;button.disabled=false;
  button.textContent=order.length>1?'Découvrir un autre créateur':'Revoir cette chaîne';
  state('Vidéo annoncée en direct par le serveur SWAPP. La lecture démarre uniquement si tu ouvres sa chaîne.');
 }
 function populate(){
  const previous=select.value;
  select.replaceChildren();
  const any=document.createElement('option');any.value='';any.textContent='Tous les jeux';select.append(any);
  for(const [game,total] of gameOptions(all)){
   const option=document.createElement('option');option.value=game;option.textContent=game+' ('+total+')';select.append(option);
  }
  select.value=[...select.options].some(o=>o.value===requestedGame)?requestedGame:
   [...select.options].some(o=>o.value===previous)?previous:'';
 }
 async function refresh(){
  reload.disabled=true;button.disabled=true;clear();state('Vérification des directs disponibles…');
  try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),8000);
   let response;
   try{response=await fetch('/api/swapp-tv/native-lineup',{
    cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}
   })}finally{clearTimeout(timeout)}
   if(!response.ok)throw Error('http_'+response.status);
   const payload=await response.json();
   if(payload?.success!==true||payload?.verified!==true||payload?.source!=='swapp-direct-hls')
    throw Error('source_non_verifiee');
   all=candidates(payload);steps=0;current='';
   populate();
   count.textContent=all.length+' direct'+(all.length>1?'s':'')+' vérifié'+(all.length>1?'s':'')+' sur SWAPP';
   showNext();
  }catch(_){
   all=[];count.textContent='Données indisponibles';
   state('Impossible de confirmer les directs pour le moment. Réessaie ou consulte SWAPP TV.');
   clear();
  }finally{reload.disabled=false}
 }
 button.addEventListener('click',showNext);
 reload.addEventListener('click',refresh);
 select.addEventListener('change',()=>{steps=0;current='';showNext()});
 try{requestedGame=new URLSearchParams(location.search).get('game')||''}catch(_){}
 void refresh();
})();