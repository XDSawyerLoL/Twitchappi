/* SWAPP — Surprise me with a genuinely confirmed live, never a synthetic stream.
 * Pick a random game first so one popular game's hundred channels can't
 * monopolize the discovery experience. Then pick a real creator in that game.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappLiveSurprise=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function pickSurprise(lives,{recentIds=[],genre='',genreForGame=null,random=Math.random}={}){
  const excluded=new Set(Array.isArray(recentIds)?recentIds:[]);
  const candidates=(Array.isArray(lives)?lives:[]).filter(item=>
   item?.kind==='live'&&typeof item.id==='string'&&item.id.length>0&&
   typeof item.watchUrl==='string'&&item.watchUrl.startsWith('/')&&
   !item.watchUrl.startsWith('//')&&
   (!genre||typeof genreForGame==='function'&&genreForGame(item.game)===genre));
  if(!candidates.length)return null;
  const fresh=candidates.filter(item=>!excluded.has(item.id));
  const pool=fresh.length?fresh:candidates;
  const groups=new Map();
  for(const item of pool){
   const game=String(item.gameSlug||item.game||item.id).toLowerCase();
   if(!groups.has(game))groups.set(game,[]);
   groups.get(game).push(item);
  }
  const games=Array.from(groups.values());
  const index=length=>{
   let value=Number(random());
   if(!Number.isFinite(value))value=0;
   return Math.min(length-1,Math.max(0,Math.floor(value*length)));
  };
  const group=games[index(games.length)];
  return group[index(group.length)]||null;
 }
 return Object.freeze({pickSurprise});
});
