'use strict';
/* Verified Instant Gaming product URLs, no prices or background tracking.
 * Confirm direct-link referral attribution in the partner dashboard. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappInstantGaming=api;
})(typeof window!=='undefined'?window:null,function(){
 const REF='SANSAHD';
 const BASE='https://www.instant-gaming.com/fr/';
 const catalog=Object.freeze([
  Object.freeze({id:'valor-mortis',game:'Valor Mortis',aliases:['valor mortis'],path:'20157-acheter-valor-mortis-pc-steam/',platform:'PC · Steam'}),
  Object.freeze({id:'planet-zoo-2',game:'Planet Zoo 2',aliases:['planet zoo 2'],path:'21064-acheter-planet-zoo-2-pc-steam/',platform:'PC · Steam'}),
  Object.freeze({id:'007-first-light',game:'007 First Light',aliases:['007 first light'],path:'22735-acheter-007-first-light-pc-steam/',platform:'PC · Steam'}),
  Object.freeze({id:'code-vein-ii',game:'CODE VEIN II',aliases:['code vein ii','code vein 2'],path:'19500-acheter-code-vein-ii-pc-steam/',platform:'PC · Steam · Europe'})
 ]);
 const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 function offer(item){
  if(!/^\d+-acheter-[a-z0-9-]+\/$/.test(item.path))return null;
  return Object.freeze({id:item.id,game:item.game,platform:item.platform,
   merchant:'Instant Gaming',url:BASE+item.path+'?igr='+encodeURIComponent(REF),affiliate:true});
 }
 function findByGame(game){
  const v=normalize(game);
  const item=catalog.find(p=>p.aliases.some(a=>a===v));
  return item?offer(item):null;
 }
 function forArticle(article){
  if(!article)return null;
  const exact=normalize(article.game);
  if(exact)return findByGame(exact);
  const title=' '+normalize(article.title)+' ';
  const matches=catalog.filter(p=>p.aliases.some(a=>title.includes(' '+a+' ')));
  return matches.length===1?offer(matches[0]):null;
 }
 return Object.freeze({forArticle,findByGame,catalog,referralHome:BASE+'?igr='+REF});
});
