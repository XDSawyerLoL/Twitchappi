'use strict';

/**
 * SWAPP: verified genre catalogue.
 *
 * The Twitch "games/top" endpoint is a TRENDING list, not an exhaustive game
 * database. Query real, approved Twitch category records by genre only when
 * the relevant shelf is needed. No synthetic games, images or live sessions.
 * Results and in-flight requests are shared in memory to limit API pressure
 * on Hostinger; no paid third-party API, database or cron required.
 */
const {genreForGame}=require('../assets/swapp-genre-discovery');

const SEEDS=Object.freeze({
 mmorpg:['World of Warcraft','Final Fantasy XIV','Guild Wars','Elder Scrolls Online','Aion','Black Desert','Lost Ark','RuneScape'],
 fps:['Counter-Strike','Valorant','Call of Duty','Battlefield','Overwatch','Rainbow Six','Halo','DOOM'],
 tps:['Warframe','Helldivers','Gears of War','Ghost Recon','The First Descendant','Remnant'],
 rpg:['Baldur','The Witcher','Cyberpunk','Kingdom Come','Elden Ring','Dragon Age','Persona'],
 arpg:['Diablo','Path of Exile','Monster Hunter','Nioh','Dark Souls','Last Epoch'],
 'battle-royale':['Fortnite','PUBG','Apex Legends','Warzone','Naraka','Realm Royale'],
 moba:['League of Legends','Dota','SMITE','Heroes of the Storm','Pokémon Unite','Mobile Legends'],
 survie:['Minecraft','Rust','Ark','Valheim','Enshrouded','DayZ','7 Days to Die','Subnautica'],
 sandbox:['Roblox','Garry','Teardown','Space Engineers','Scrap Mechanic','Besiege'],
 strategie:['Civilization','Crusader Kings','Age of Empires','Total War','Europa Universalis','Stellaris','Hearts of Iron'],
 gestion:['Cities Skylines','Planet Zoo','Anno','Factorio','Satisfactory','RimWorld','Two Point'],
 simulation:['The Sims','Microsoft Flight Simulator','Euro Truck Simulator','Farming Simulator','House Flipper','Train Sim World'],
 course:['Forza','Need for Speed','F1 20','Gran Turismo','Assetto Corsa','Mario Kart','Trackmania','The Crew','iRacing','WRC','DiRT Rally','Burnout'],
 sport:['EA Sports FC','FIFA','NBA 2K','eFootball','Madden NFL','Football Manager','NHL'],
 combat:['Tekken','Street Fighter','Mortal Kombat','Dragon Ball Sparking','Guilty Gear','Super Smash Bros'],
 horreur:['Resident Evil','Silent Hill','Phasmophobia','Dead by Daylight','Outlast','Amnesia','Five Nights at Freddy'],
 plateforme:['Super Mario','Sonic','Hollow Knight','Ori and','Celeste','Rayman','Crash Bandicoot'],
 roguelike:['Hades','Dead Cells','Balatro','Slay the Spire','Binding of Isaac','Risk of Rain'],
 puzzle:['Portal','Tetris','The Witness','Baba Is You','The Talos Principle','Escape Simulator'],
 coop:['It Takes Two','Deep Rock Galactic','A Way Out','Overcooked','We Were Here','Split Fiction'],
 exploration:['No Man','Outer Wilds','Death Stranding','Journey','Elite Dangerous','Astroneer'],
 rythme:['Just Dance','Beat Saber','Guitar Hero','Rock Band','Geometry Dash','Taiko no Tatsujin'],
 action:['Grand Theft Auto','Red Dead Redemption','Assassin','God of War','Spider-Man','Tomb Raider','Watch Dogs'],
 indie:['Undertale','Deltarune','Cult of the Lamb','Inscryption','Animal Well','Dave the Diver']
});
for(const arr of Object.values(SEEDS))Object.freeze(arr);

function createGenreCatalogue(search,{ttlMs=30*60*1000,clock=()=>Date.now(),maxItems=48}={}){
 if(typeof search!=='function')throw new TypeError('Twitch category search function required');
 const cache=new Map(),inFlight=new Map();
 async function get(genre){
  if(typeof genre!=='string'||!Object.hasOwn(SEEDS,genre))return null;
  const existing=cache.get(genre);
  if(existing&&existing.expires>clock())return existing.items;
  if(inFlight.has(genre))return inFlight.get(genre);
  const task=(async()=>{
   const items=[],seen=new Set();
   let succeeded=0;
   // Two small parallel groups keep latency reasonable and avoid bursts.
   const seeds=SEEDS[genre];
   for(let i=0;i<seeds.length&&items.length<maxItems;i+=2){
    const current=await Promise.allSettled(seeds.slice(i,i+2).map(seed=>
     search('search/categories?query='+encodeURIComponent(seed)+'&first=30')));
    for(const result of current){
     if(result.status!=='fulfilled'||!Array.isArray(result.value?.data))continue;
     succeeded++;
     for(const raw of result.value.data){
      const name=String(raw?.name||'').trim();
      const id=String(raw?.id||'').trim();
      if(!name||!id||genreForGame(name)!==genre||seen.has(id))continue;
      const art=String(raw.box_art_url||'');
      if(!/^https:\/\/(?:[^/]+\.)?(?:jtvnw\.net|twitchcdn\.net)\//i.test(art))continue;
      seen.add(id);
      items.push({id,name,box_art_url:art.replaceAll('{width}','360').replaceAll('{height}','480')});
      if(items.length>=maxItems)break;
     }
    }
   }
   if(!succeeded)throw new Error('Twitch genre lookup unavailable');
   cache.set(genre,{items,expires:clock()+ttlMs});
   return items;
  })();
  inFlight.set(genre,task);
  try{return await task}finally{inFlight.delete(genre)}
 }
 return {get,SEEDS};
}
module.exports={SEEDS,createGenreCatalogue};
