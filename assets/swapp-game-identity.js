/* Exact game identity for public SWAPP article -> live journeys, no fuzzy sequel matching. */
(function(root,factory){
 const identity=factory();
 if(typeof module==='object'&&module.exports)module.exports=identity;
 if(root)root.SwappGameIdentity=identity;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const normal=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const groups=[
  ['The Witcher 3: Wild Hunt Remastered','The Witcher 3 Remastered','Witcher 3 Remastered','The Witcher III Remastered','The Witcher 3 Wild Hunt Remastered','The Witcher III: Wild Hunt Remastered'],
  ['The Witcher 3: Wild Hunt','The Witcher 3','Witcher 3','The Witcher III','The Witcher 3 Wild Hunt','Witcher 3 Wild Hunt'],
  ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
  ['Planet Zoo 2','Planet Zoo II'],
  ['007 First Light','James Bond 007 First Light','007: First Light'],
  ['Assassin’s Creed Black Flag','Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag',"Assassin's Creed Black Flag"],
  ['Final Fantasy VII','Final Fantasy 7','FF7'],
  ['MARVEL Tōkon: Fighting Souls','Marvel Tokon Fighting Souls'],
  ['Divinity: Original Sin 3','Divinity Original Sin III'],
  ['Road 96','Road96']
 ].map(group=>group.map(normal));
 function sameGame(a,b){
  const x=normal(a),y=normal(b);
  return !!x&&!!y&&(x===y||groups.some(group=>group.includes(x)&&group.includes(y)));
 }
 function editorialGame(article){
  const game=String(article?.game||'').trim(),title=normal(article?.title);
  const old=['the witcher 3','witcher 3','the witcher iii','the witcher 3 wild hunt'];
  if(/(?:the )?witcher (?:3|iii)(?: wild hunt)? remaster(?:ed)?/.test(title)&&
     (!game||old.includes(normal(game))||sameGame(game,'The Witcher 3: Wild Hunt Remastered')))
   return 'The Witcher 3: Wild Hunt Remastered';
  return game;
 }
 return Object.freeze({sameGame,editorialGame});
});
