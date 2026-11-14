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
  Object.freeze({id:"mmorpg",label:"MMORPG",description:"Univers persistants et aventures en groupe"}),
  Object.freeze({id:"fps",label:"FPS",description:"Tir à la première personne"}),
  Object.freeze({id:"tps",label:"TPS",description:"Action et tir à la troisième personne"}),
  Object.freeze({id:"rpg",label:"RPG",description:"Récits, personnages et choix"}),
  Object.freeze({id:"arpg",label:"Action-RPG",description:"Butin, combats et progression"}),
  Object.freeze({id:"battle-royale",label:"Battle royale",description:"Affrontements jusqu’au dernier"}),
  Object.freeze({id:"moba",label:"MOBA",description:"Compétition en arène"}),
  Object.freeze({id:"survie",label:"Survie",description:"Construire, explorer, résister"}),
  Object.freeze({id:"sandbox",label:"Sandbox",description:"Mondes libres et création"}),
  Object.freeze({id:"strategie",label:"Stratégie",description:"Tactique, conquête et diplomatie"}),
  Object.freeze({id:"gestion",label:"Gestion",description:"Construire et administrer"}),
  Object.freeze({id:"simulation",label:"Simulation",description:"Reproduire et expérimenter"}),
  Object.freeze({id:"course",label:"Course",description:"Vitesse, circuits et pilotage"}),
  Object.freeze({id:"sport",label:"Sport",description:"Football, basket et compétitions"}),
  Object.freeze({id:"combat",label:"Combat",description:"Duels, combos et tournois"}),
  Object.freeze({id:"horreur",label:"Horreur",description:"Frissons, enquêtes et survie"}),
  Object.freeze({id:"plateforme",label:"Plateforme",description:"Précision, sauts et exploration"}),
  Object.freeze({id:"roguelike",label:"Roguelike",description:"Runs, risques et recommencements"}),
  Object.freeze({id:"puzzle",label:"Réflexion",description:"Énigmes et logique"}),
  Object.freeze({id:"coop",label:"Coopération",description:"Aventures à plusieurs"}),
  Object.freeze({id:"exploration",label:"Exploration",description:"Voyager vers l’inconnu"}),
  Object.freeze({id:"rythme",label:"Rythme & musique",description:"Jeux musicaux et performances"}),
  Object.freeze({id:"action",label:"Action & aventure",description:"Grandes histoires et univers"}),
  Object.freeze({id:"indie",label:"Jeux indépendants",description:"Créations originales"}),
  Object.freeze({id:"autres",label:"Autres jeux",description:"Tous les autres univers"})
 ]);
 const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const RULES=Object.freeze({
  'mmorpg':[/^world of warcraft\b/,/^the elder scrolls online\b/,/^final fantasy xiv\b/,/^guild wars 2\b/,/^guild wars\b/,/^aion\b/,/^lost ark\b/,/^black desert\b/,/^new world\b/,/^star wars the old republic\b/,/^throne and liberty\b/,/^runescape\b/,/^maplestory\b/,/^albion online\b/,/^blue protocol\b/,/^dofus\b/,/^wakfu\b/,/^never winter\b/,/^neverwinter\b/,/^blade and soul\b/,/^the lord of the rings online\b/,/^pax dei\b/,/^tarisland\b/,/^archeage\b/,/^eve online\b/,/^ashes of creation\b/,/^rift\b/,/^tera\b/,/^tower of fantasy\b/,/^pso2\b/,/^phantasy star online\b/,/^lineage\b/,/^perfect world\b/,/^elder scrolls online\b/,/^once human\b/],
  'battle-royale':[/^fortnite\b/,/^pubg\b/,/^apex legends\b/,/^call of duty warzone\b/,/^h1z1\b/,/^naraka bladepoint\b/,/^realm royale\b/,/^super animal royale\b/,/^spellbreak\b/,/^bloodhunt\b/],
  'moba':[/^league of legends\b/,/^dota 2\b/,/^smite\b/,/^heroes of the storm\b/,/^pokemon unite\b/,/^deadlock\b/,/^mobile legends\b/,/^arena of valor\b/],
  'horreur':[/^dead by daylight\b/,/^resident evil\b/,/^silent hill\b/,/^phasmophobia\b/,/^outlast\b/,/^alien isolation\b/,/^until dawn\b/,/^the quarry\b/,/^little nightmares\b/,/^amnesia\b/,/^the evil within\b/,/^lethal company\b/,/^content warning\b/,/^five nights at freddy s\b/,/^the mortuary assistant\b/,/^slender\b/],
  'course':[/^forza\b/,/^gran turismo\b/,/^need for speed\b/,/^assetto corsa\b/,/^iracing\b/,/^f1 20\b/,/^formula 1\b/,/^dirt rally\b/,/^the crew\b/,/^trackmania\b/,/^mario kart\b/,/^wrc\b/,/^beamng drive\b/,/^burnout\b/],
  'sport':[/^ea sports fc\b/,/^fifa\b/,/^efootball\b/,/^nba 2k\b/,/^madden nfl\b/,/^wwe 2k\b/,/^tony hawk\b/,/^pga tour\b/,/^football manager\b/,/^rocket league\b/,/^mlb the show\b/,/^nhl\b/],
  'combat':[/^street fighter\b/,/^tekken\b/,/^mortal kombat\b/,/^guilty gear\b/,/^dragon ball fighterz\b/,/^dragon ball sparking\b/,/^super smash bros\b/,/^brawlhalla\b/,/^naruto ultimate ninja storm\b/,/^king of fighters\b/],
  'strategie':[/^crusader kings\b/,/^civilization\b/,/^sid meier s civilization\b/,/^age of empires\b/,/^total war\b/,/^europa universalis\b/,/^hearts of iron\b/,/^stellaris\b/,/^manor lords\b/,/^age of mythology\b/,/^warhammer 40 000 dawn of war\b/,/^company of heroes\b/,/^starcraft\b/,/^warcraft iii\b/,/^command conquer\b/,/^xcom\b/,/^xcom 2\b/,/^frostpunk 2\b/],
  'gestion':[/^cities skylines\b/,/^planet zoo\b/,/^planet coaster\b/,/^two point\b/,/^frostpunk\b/,/^factorio\b/,/^satisfactory\b/,/^rimworld\b/,/^dwarf fortress\b/,/^prison architect\b/,/^anno\b/,/^timberborn\b/,/^oxygen not included\b/,/^tropico\b/,/^rollercoaster tycoon\b/,/^against the storm\b/],
  'survie':[/^minecraft\b/,/^rust\b/,/^dayz\b/,/^enshrouded\b/,/^valheim\b/,/^palworld\b/,/^terraria\b/,/^7 days to die\b/,/^sons of the forest\b/,/^ark survival\b/,/^the forest\b/,/^green hell\b/,/^subnautica\b/,/^project zomboid\b/,/^dont starve\b/,/^don t starve\b/,/^raft\b/,/^v rising\b/,/^conan exiles\b/,/^grounded\b/,/^icarus\b/],
  'sandbox':[/^roblox\b/,/^garry s mod\b/,/^teardown\b/,/^people playground\b/,/^space engineers\b/,/^creativerse\b/,/^scrap mechanic\b/,/^besiege\b/,/^trove\b/,/^lego fortnite\b/],
  'fps':[/^valorant\b/,/^counter strike\b/,/^call of duty\b/,/^overwatch\b/,/^rainbow six\b/,/^tom clancy s rainbow six\b/,/^destiny 2\b/,/^the finals\b/,/^arc raiders\b/,/^escape from tarkov\b/,/^marvel rivals\b/,/^battlefield\b/,/^halo\b/,/^doom\b/,/^quake\b/,/^team fortress\b/,/^delta force\b/,/^the division\b/,/^borderlands\b/,/^payday\b/,/^insurgency sandstorm\b/,/^titanfall\b/,/^hunt showdown\b/,/^warface\b/,/^metro exodus\b/,/^cs2\b/],
  'tps':[/^helldivers\b/,/^remnant\b/,/^gears of war\b/,/^warframe\b/,/^the first descendant\b/,/^outriders\b/,/^rogue company\b/,/^ghost recon\b/,/^uncharted\b/,/^control ultimate edition\b/,/^max payne\b/],
  'arpg':[/^diablo\b/,/^path of exile\b/,/^last epoch\b/,/^torchlight\b/,/^grim dawn\b/,/^wolcen\b/,/^titan quest\b/,/^hades ii\b/,/^hades 2\b/,/^monster hunter\b/,/^nioh\b/,/^lies of p\b/,/^sekiro\b/,/^dark souls\b/],
  'rpg':[/^cyberpunk 2077\b/,/^baldur s gate\b/,/^elden ring\b/,/^the witcher\b/,/^where winds meet\b/,/^kingdom come deliverance\b/,/^starfield\b/,/^clair obscur\b/,/^final fantasy vii\b/,/^skyrim\b/,/^dragon age\b/,/^mass effect\b/,/^persona\b/,/^metaphor refantazio\b/,/^hogwarts legacy\b/,/^fallout\b/,/^the outer worlds\b/,/^divinity original sin\b/,/^expedition 33\b/,/^avowed\b/,/^disco elysium\b/],
  'plateforme':[/^hollow knight\b/,/^celeste\b/,/^ori and the\b/,/^cuphead\b/,/^super mario bros\b/,/^donkey kong\b/,/^rayman\b/,/^sonic\b/,/^crash bandicoot\b/,/^spyro\b/,/^littlebigplanet\b/,/^astro bot\b/,/^shovel knight\b/,/^psychonauts\b/],
  'roguelike':[/^hades\b/,/^dead cells\b/,/^slay the spire\b/,/^the binding of isaac\b/,/^balatro\b/,/^vampire survivors\b/,/^risk of rain\b/,/^enter the gungeon\b/,/^rogue legacy\b/,/^noita\b/,/^returnal\b/],
  'puzzle':[/^portal\b/,/^the witness\b/,/^the talos principle\b/,/^baba is you\b/,/^tetris\b/,/^puzzle\b/,/^escape simulator\b/,/^monument valley\b/,/^humanity\b/,/^viewfinder\b/],
  'rythme':[/^just dance\b/,/^beat saber\b/,/^osu\b/,/^guitar hero\b/,/^rock band\b/,/^geometry dash\b/,/^friday night funkin\b/,/^taiko no tatsujin\b/],
  'coop':[/^it takes two\b/,/^a way out\b/,/^overcooked\b/,/^plateup\b/,/^deep rock galactic\b/,/^we were here\b/,/^split fiction\b/,/^keep talking and nobody explodes\b/,/^pico park\b/],
  'exploration':[/^no man s sky\b/,/^outer wilds\b/,/^journey\b/,/^abzu\b/,/^firewatch\b/,/^death stranding\b/,/^elite dangerous\b/,/^astroneer\b/],
  'action':[/^grand theft auto\b/,/^gta v\b/,/^red dead redemption\b/,/^sea of thieves\b/,/^assassin s creed\b/,/^marvel s spider man\b/,/^spider man\b/,/^god of war\b/,/^ghost of tsushima\b/,/^watch dogs\b/,/^uncharted legacy\b/,/^horizon forbidden west\b/,/^horizon zero dawn\b/,/^tomb raider\b/,/^the last of us\b/,/^zelda\b/,/^the legend of zelda\b/],
  'simulation':[/^the sims\b/,/^stardew valley\b/,/^microsoft flight simulator\b/,/^euro truck simulator\b/,/^american truck simulator\b/,/^farming simulator\b/,/^powerwash simulator\b/,/^house flipper\b/,/^car mechanic simulator\b/,/^train sim world\b/,/^bus simulator\b/,/^flight simulator\b/,/^the long drive\b/],
  'indie':[/^undertale\b/,/^deltarune\b/,/^omori\b/,/^inscryption\b/,/^neon white\b/,/^animal well\b/,/^cult of the lamb\b/,/^dave the diver\b/,/^chants of sennaar\b/,/^papers please\b/,/^squirrel with a gun\b/]
 });
 function genreForGame(game){
  const value=normal(game);
  if(!value||['just chatting','music','asmr','irl','sports','art','talk shows podcasts','special events'].includes(value))return '';
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
  // "Autres" is a fallback, not a named genre: keep it at the end even
  // when many unclassified games are live, so featured art stays meaningful.
  return [...map.values()].sort((a,b)=>
   (a.id==='autres'?1:0)-(b.id==='autres'?1:0)||
   b.liveCount-a.liveCount||
   (b.audience??-1)-(a.audience??-1)||b.gameCount-a.gameCount||
   GENRES.findIndex(x=>x.id===a.id)-GENRES.findIndex(x=>x.id===b.id));
 }
 // Current activity is ranked from real live inventory only. A game with no
 // confirmed live must not appear in a fabricated "top watched" leaderboard.
 function rankGames(games,lives){
  const candidates=new Map(),ordered=[];
  for(const game of Array.isArray(games)?games:[]){
   if(game?.kind!=='game')continue;
   const name=String(game.game||game.name||'').trim();
   const slug=String(game.gameSlug||'').toLowerCase();
   const genre=genreForGame(name);
   if(!name||!slug||!genre||candidates.has(slug))continue;
   const item={...game,game:name,gameSlug:slug,genre,
    liveCount:0,audience:null,audienceVerifiedCount:0,
    cover:game.image||'',coverSource:game.image?'game':''};
   candidates.set(slug,item);
   ordered.push(item);
  }
  const seenLives=new Set();
  for(const live of Array.isArray(lives)?lives:[]){
   if(live?.kind!=='live')continue;
   const slug=String(live.gameSlug||'').toLowerCase();
   const id=String(live.id||'');
   const item=candidates.get(slug);
   if(!item||!id||seenLives.has(id))continue;
   seenLives.add(id);
   item.liveCount++;
   if(live.audienceVerified===true&&Number.isSafeInteger(live.viewers)&&live.viewers>=0){
    item.audience=(item.audience??0)+live.viewers;
    item.audienceVerifiedCount++;
   }
   if(!item.cover&&live.image){item.cover=live.image;item.coverSource='live'}
  }
  return ordered.sort((a,b)=>
   b.liveCount-a.liveCount||
   (b.audience??-1)-(a.audience??-1)||
   a.game.localeCompare(b.game,'fr',{sensitivity:'base'}));
 }
 function groupGamesByGenre(games,lives){
  const ranked=rankGames(games,lives);
  const order=rankGenres(games,lives);
  return order.map(genre=>({
   ...genre,
   games:ranked.filter(game=>game.genre===genre.id)
  })).filter(group=>group.games.length>0);
 }
 return Object.freeze({GENRES,genreForGame,rankGenres,rankGames,groupGamesByGenre});
});
