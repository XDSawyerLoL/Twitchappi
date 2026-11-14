/* SWAPP — same live catalogue, organized by editorial game genres.
 * A genre count is based on confirmed live/game inventories, never fabricated.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappGenreDiscovery=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const GENRES=Object.freeze([
  Object.freeze({id:'mmorpg',label:'MMORPG',description:'Mondes persistants et aventures en groupe'}),
  Object.freeze({id:'fps',label:'FPS',description:'Tir, tactique et affrontements en ligne'}),
  Object.freeze({id:'rpg',label:'RPG',description:'Personnages, récits et choix'}),
  Object.freeze({id:'survie',label:'Survie',description:'Explorer, construire et résister'}),
  Object.freeze({id:'strategie',label:'Stratégie',description:'Gestion, conquête et tactique'}),
  Object.freeze({id:'battle-royale',label:'Battle royale',description:'Une partie, une équipe, des survivants'}),
  Object.freeze({id:'moba',label:'MOBA',description:'Arènes et compétition en équipe'}),
  Object.freeze({id:'simulation',label:'Simulation',description:'Conduite, vie et création'}),
  Object.freeze({id:'action',label:'Action & aventure',description:'Exploration et grands univers'}),
  Object.freeze({id:'autres',label:'Autres jeux',description:'Découvrir de nouveaux univers'})
 ]);
 const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const RULES=Object.freeze({
  'mmorpg':[
   /^world of warcraft\b/,/^the elder scrolls online\b/,/^final fantasy xiv\b/,/^guild wars 2\b/,
   /^aion(?: 2| classic)?\b/,/^lost ark\b/,/^black desert\b/,/^new world\b/,/^star wars the old republic\b/,
   /^throne and liberty\b/,/^runescape\b/,/^maplestory\b/,/^albion online\b/
  ],
  'battle-royale':[/^fortnite\b/,/^pubg\b/,/^apex legends\b/,/^call of duty warzone\b/,/^h1z1\b/,/^naraka bladepoint\b/],
  'fps':[
   /^valorant\b/,/^counter strike\b/,/^call of duty\b/,/^overwatch\b/,/^rainbow six\b/,
   /^tom clancy s rainbow six\b/,/^destiny 2\b/,/^the finals\b/,/^arc raiders\b/,
   /^escape from tarkov\b/,/^marvel rivals\b/,/^battlefield\b/,/^halo\b/
  ],
  'rpg':[
   /^cyberpunk 2077\b/,/^baldur s gate\b/,/^elden ring\b/,/^the witcher\b/,
   /^where winds meet\b/,/^diablo\b/,/^path of exile\b/,/^kingdom come deliverance\b/,
   /^starfield\b/,/^clair obscur\b/,/^final fantasy vii\b/,/^skyrim\b/
  ],
  'survie':[
   /^minecraft\b/,/^rust\b/,/^dayz\b/,/^enshrouded\b/,/^valheim\b/,
   /^palworld\b/,/^terraria\b/,/^7 days to die\b/,/^sons of the forest\b/,
   /^ark survival\b/,/^the forest\b/
  ],
  'strategie':[
   /^crusader kings\b/,/^civilization\b/,/^sid meier s civilization\b/,
   /^age of empires\b/,/^total war\b/,/^europa universalis\b/,
   /^hearts of iron\b/,/^stellaris\b/,/^manor lords\b/
  ],
  'moba':[/^league of legends\b/,/^dota 2\b/,/^smite\b/,/^heroes of the storm\b/],
  'simulation':[
   /^the sims\b/,/^stardew valley\b/,/^microsoft flight simulator\b/,/^euro truck simulator\b/,
   /^american truck simulator\b/,/^farming simulator\b/,/^planet coaster\b/
  ],
  'action':[
   /^grand theft auto\b/,/^gta v\b/,/^red dead redemption\b/,/^sea of thieves\b/,
   /^assassin s creed\b/,/^marvel s spider man\b/,/^spider man\b/,
   /^hollow knight\b/,/^god of war\b/,/^ghost of tsushima\b/,/^rocket league\b/
  ]
 });
 function genreForGame(game){
  const value=normal(game);
  if(!value)return '';
  for(const genre of GENRES){
   if(genre.id==='autres')continue;
   if(RULES[genre.id]?.some(pattern=>pattern.test(value)))return genre.id;
  }
  return 'autres';
 }
 function rankGenres(games,lives){
  const map=new Map(GENRES.map(item=>[item.id,{...item,liveCount:0,gameCount:0,audience:null,image:''}]));
  const seenGames=new Set();
  for(const game of Array.isArray(games)?games:[]){
   if(!game||game.kind!=='game')continue;
   const id=genreForGame(game.game||game.name);
   if(!id)continue;
   const entry=map.get(id),slug=String(game.gameSlug||game.game||game.name).toLowerCase();
   if(seenGames.has(slug))continue;
   seenGames.add(slug);
   entry.gameCount++;
   if(!entry.image&&game.image)entry.image=game.image;
  }
  const seenLives=new Set();
  for(const live of Array.isArray(lives)?lives:[]){
   if(!live||live.kind!=='live')continue;
   const id=genreForGame(live.game);
   if(!id||!map.has(id)||seenLives.has(live.id))continue;
   seenLives.add(live.id);
   const entry=map.get(id);
   entry.liveCount++;
   if(live.audienceVerified===true&&Number.isSafeInteger(live.viewers)&&live.viewers>=0)
    entry.audience=(entry.audience||0)+live.viewers;
   if(!entry.image&&live.image)entry.image=live.image;
  }
  return [...map.values()].sort((a,b)=>b.liveCount-a.liveCount||
   (b.audience??-1)-(a.audience??-1)||b.gameCount-a.gameCount||
   GENRES.findIndex(x=>x.id===a.id)-GENRES.findIndex(x=>x.id===b.id));
 }
 return Object.freeze({GENRES,genreForGame,rankGenres});
});
