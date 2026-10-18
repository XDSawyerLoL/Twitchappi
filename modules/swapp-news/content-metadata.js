'use strict';
// Conservative, explainable game recognition. Editorial confirmation remains required.
const {normalize,searchNames,editorialGame}=require('./game-identity');
const TITLES=[
 'BioShock','Grand Theft Auto VI','CODE VEIN II','Battlestar Galactica: Scattered Hopes',
 'Crimson Desert','Planet Zoo 2','Solasta II','Teenage Mutant Ninja Turtles: The Last Ronin',
 '007 First Light','Road 96','Final Fantasy VII','MARVEL Tōkon: Fighting Souls',
 'Assassin’s Creed Black Flag','Minecraft','Elden Ring','Starfield',
 'Hades II','Fortnite','The Witcher 3: Wild Hunt Remastered','The Witcher 3','Cyberpunk 2077','Hollow Knight: Silksong',
 'Baldur’s Gate 3','Resident Evil Requiem','The Elder Scrolls VI','Fallout',
 'Diablo IV','Counter-Strike 2','League of Legends','Valorant','Overwatch 2',
 'World of Warcraft','Genshin Impact','The Legend of Zelda','Call of Duty'
];
const extraAliases={
 'BioShock':['Bioshock'],
 'CODE VEIN II':['CODE VEIN 2','Code Vein II'],
 'Solasta II':['Solasta 2'],
 'Planet Zoo 2':['Planet Zoo II'],
 'Battlestar Galactica: Scattered Hopes':['Scattered Hopes'],
 'Teenage Mutant Ninja Turtles: The Last Ronin':['TMNT The Last Ronin','TMNT: The Last Ronin'],
 'The Witcher 3: Wild Hunt Remastered':['The Witcher 3 Remastered','Witcher 3 Remastered','The Witcher III Remastered'],
 'Grand Theft Auto VI':['GTA VI','GTA 6','GTA6']
};
const safeWords=(v,length=90)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,length);
function detectGames(text,limit=6){
 const haystack=' '+normalize(String(text||'').slice(0,15000))+' ';
 const hits=[];
 for(const game of TITLES){
  const aliases=[game,...(extraAliases[game]||[]),...searchNames(game)];
  const names=[...new Set(aliases.map(normalize).filter(x=>x.length>=4))];
  // Prefer the exact remaster edition when mentioned; the classic category
  // is separate and must not be silently substituted for a live.
  if(game==='The Witcher 3'&&hits.includes('The Witcher 3: Wild Hunt Remastered'))continue;
  if(names.some(name=>haystack.includes(' '+name+' ')))hits.push(game);
  if(hits.length>=limit)break;
 }
 return hits;
}
function cleanTags(input){
 const items=Array.isArray(input)?input:String(input||'').split(',');
 return [...new Set(items.map(x=>safeWords(x,36).toLocaleLowerCase('fr')).filter(x=>x.length>=2))].slice(0,12);
}
function recommend({title='',summary='',body='',game='',tags=[]}={}){
 const games=detectGames([title,summary,body.slice(0,2500),game].join(' '));
 const existing=cleanTags(tags);
 const recommended=[...existing,...games.map(x=>x.toLocaleLowerCase('fr')),
  'jeu vidéo',...(games.length?['gaming']:[])];
 return {games,tags:cleanTags(recommended),primaryGame:safeWords(editorialGame({title,game}),120)||games[0]||null};
}
function cleanSEO(value={},fallback={}){
 const raw=(value&&typeof value==='object'&&!Array.isArray(value))?value:{};
 const title=safeWords(raw.title||fallback.title||'',70);
 const description=safeWords(raw.description||fallback.summary||'',160);
 return {title,description};
}
function contentType(value){
 const kind=String(value||'article').toLowerCase();
 if(!['article','post','video','trailer'].includes(kind))throw new Error('Type de publication invalide');
 return kind;
}
module.exports={TITLES,detectGames,cleanTags,recommend,cleanSEO,contentType};
