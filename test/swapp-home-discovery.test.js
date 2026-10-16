'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {rankHomeLives}=require('../modules/swapp-home-discovery');
const root=path.resolve(__dirname,'..');
const make=(platform,login,game,viewers=40,title='En direct')=>({
 platform,login,game_name:game,viewer_count:viewers,title
});
test('native SWAPP creators receive bounded visible spots even when Twitch has higher viewer scores',()=>{
 const twitch=Array.from({length:20},(_,i)=>make('twitch','twitch'+i,['Minecraft','Fortnite','Valorant'][i%3],65));
 const natives=[
  make('oryon','creator01','Outer Wilds',2),
  make('oryon','creator02','Balatro',5)
 ];
 const input=[...twitch,...natives],snapshot=JSON.stringify(input);
 const picks=rankHomeLives(input,{limit:12});
 assert.equal(picks.length,12);
 assert.equal(picks.filter(x=>x.platform==='oryon').length,2);
 assert.deepEqual(new Set(picks.map(x=>x.login)).size,12);
 assert.equal(JSON.stringify(input),snapshot,'ranking must not mutate server data');
});
test('empty native inventory leaves all homepage places available for real Twitch lives',()=>{
 const input=Array.from({length:12},(_,i)=>make('twitch','viewer'+i,'Minecraft',50+i));
 assert.equal(rankHomeLives(input,{limit:12}).length,12);
 assert.ok(rankHomeLives(input,{limit:12}).every(x=>x.platform==='twitch'));
});
test('home ranking avoids five identical games on the first screen when alternatives already exist',()=>{
 const input=[
  ...Array.from({length:7},(_,i)=>make('twitch','minecraft'+i,'Minecraft',60+i)),
  make('twitch','fortnite01','Fortnite',49),
  make('twitch','fortnite02','Fortnite',48),
  make('twitch','balatro01','Balatro',42),
  make('twitch','balatro02','Balatro',41),
  make('twitch','hades01','Hades II',38)
 ];
 const ranked=rankHomeLives(input,{limit:10});
 assert.equal(ranked.length,10);
 assert.ok(new Set(ranked.slice(0,6).map(x=>x.game_name)).size>=3);
 assert.ok(ranked.slice(0,6).filter(x=>x.game_name==='Minecraft').length<=2);
 assert.ok(ranked.every(x=>input.includes(x)),
  'diversity cannot invent streams or replace a selected creator');
});
test('login deduplication is platform-aware and excludes labelled replays',()=>{
 const input=[
  make('oryon','same','Balatro',5),
  make('oryon','same','Balatro',6),
  make('twitch','same','Balatro',38),
  make('twitch','replay123','Minecraft',58,'Rediffusion de la finale'),
  make('twitch','live123','Minecraft',51,'Une partie en direct')
 ];
 const ranked=rankHomeLives(input,{limit:12});
 assert.equal(ranked.length,3);
 assert.ok(ranked.some(x=>x.platform==='oryon'&&x.login==='same'));
 assert.ok(ranked.some(x=>x.platform==='twitch'&&x.login==='same'));
 assert.ok(!ranked.some(x=>x.login==='replay123'));
});
test('small first-page limits and empty pools stay bounded',()=>{
 const rows=[make('oryon','nativea','Balatro',1),make('twitch','otherb','Minecraft',80)];
 assert.equal(rankHomeLives(rows,{limit:1}).length,1);
 assert.equal(rankHomeLives(rows,{limit:1})[0].login,'nativea');
 assert.deepEqual(rankHomeLives([]),[]);
 assert.deepEqual(rankHomeLives(null),[]);
});
test('homepage uses the new pure module without changing the public endpoint or requesting more providers',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const start=server.indexOf("app.get('/api/discovery/home-lives'");
 const end=server.indexOf('// Exact game discovery for ACTUS',start);
 assert.ok(start>0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/swapp-home-discovery'\)\.rankHomeLives\(out,\{limit\}\)/);
 assert.match(route,/res\.json\(\{ success:true, items: ranked/);
 assert.equal((route.match(/twitchAPI\(/g)||[]).length,1);
 assert.doesNotMatch(route,/paid|gemini|openai|localStorage|sendBeacon|fetch\(/i);
 const module=fs.readFileSync(path.join(root,'modules/swapp-home-discovery.js'),'utf8');
 assert.doesNotMatch(module,/fetch\(|XMLHttpRequest|axios|localStorage|sendBeacon/);
});
