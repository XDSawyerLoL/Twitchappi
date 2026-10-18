'use strict';
// Conservative aliases only: never infer a game from an unrelated article title.
const aliases=[
 ['The Witcher 3: Wild Hunt Remastered',['The Witcher 3 Remastered','Witcher 3 Remastered','The Witcher III Remastered','Witcher III Remastered','The Witcher 3 Wild Hunt Remastered','The Witcher III: Wild Hunt Remastered']],
 ['The Witcher 3: Wild Hunt',['The Witcher 3','Witcher 3','The Witcher III','The Witcher 3 Wild Hunt','Witcher 3 Wild Hunt']],
 ['Grand Theft Auto VI',['GTA 6','GTA6','GTA VI','Grand Theft Auto 6']],
 ['Planet Zoo 2',['Planet Zoo II']],
 ['007 First Light',['James Bond 007 First Light','007: First Light']],
 ['Assassin’s Creed Black Flag',['Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag','Assassin\'s Creed Black Flag']],
 ['Final Fantasy VII',['Final Fantasy 7','FF7']],
 ['MARVEL Tōkon: Fighting Souls',['Marvel Tokon Fighting Souls']],
 ['Divinity: Original Sin 3',['Divinity Original Sin III']],
 ['Road 96',['Road96']]
];
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const equivalent=(a,b)=>{const x=normalize(a),y=normalize(b);if(!x||!y)return false;if(x===y)return true;return aliases.some(group=>{const names=[group[0],...group[1]].map(normalize);return names.includes(x)&&names.includes(y)})};
const searchNames=game=>{const n=normalize(game);const group=aliases.find(g=>[g[0],...g[1]].some(x=>normalize(x)===n));return group?[group[0],...group[1]].filter((v,i,a)=>a.indexOf(v)===i):[String(game||'').trim()]};
module.exports={normalize,equivalent,searchNames};
