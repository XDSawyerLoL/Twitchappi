'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {diversifyDiscovery,rankGameLives}=require('../modules/swapp-discovery-diversity');
const {rankHomeLives}=require('../modules/swapp-home-discovery');
const {equivalent}=require('../modules/swapp-news/game-identity');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function live(login,game,viewers,score=100,platform='twitch'){
 return {login,platform,game_name:game,viewer_count:viewers,score,title:'En direct'};
}
test('general discovery reserves relevant first-screen opportunities for small creators',()=>{
 const mainstream=Array.from({length:14},(_,i)=>live('major'+i,['Fortnite','Minecraft','Valorant'][i%3],250,140-i));
 const small=Array.from({length:12},(_,i)=>live('small'+i,['Fortnite','Minecraft','Valorant','Balatro'][i%4],20+(i%6),127-i));
 const input=[...mainstream,...small].sort((a,b)=>b.score-a.score);
 const snapshot=JSON.stringify(input);
 const result=diversifyDiscovery(input,{firstScreen:12,limit:24,perGame:2,rotation:100});
 assert.equal(result.length,24);
 assert.ok(result.slice(0,12).filter(x=>x.viewer_count<=25).length>=3);
 assert.ok(new Set(result.slice(0,12).map(x=>x.game_name)).size>=3);
 assert.equal(new Set(result.map(x=>x.login)).size,24);
 assert.equal(JSON.stringify(input),snapshot);
 assert.ok(result.every(x=>x.viewer_count>=20));
});
test('explicit searches and negative relevance floor are respected',()=>{
 const base=[
  ...Array.from({length:12},(_,i)=>live('major'+i,'Fortnite',60,120-i)),
  live('excluded','Hades II',2,-80)
 ];
 assert.deepEqual(diversifyDiscovery(base,{query:'Fortnite'}),base);
 const broad=diversifyDiscovery(base,{firstScreen:6,limit:13,rotation:0});
 assert.deepEqual(broad.slice(0,6),base.slice(0,6));
});
test('same-game shelves include small creators without relying on popularity alone',()=>{
 const pool=[live('native','Elden Ring',20,0,'oryon'),
  ...Array.from({length:8},(_,i)=>live('large'+i,'Elden Ring',200+i)),
  ...Array.from({length:8},(_,i)=>live('small'+i,'Elden Ring',20+(i%6)))];
 const ranked=rankGameLives(pool,{limit:8,rotation:0});
 assert.equal(ranked.length,8);
 assert.equal(ranked[0].login,'native');
 assert.ok(ranked.filter(x=>x.viewer_count<=25).length>=4);
 assert.equal(new Set(ranked.map(x=>x.login)).size,8);
 assert.ok(ranked.every(x=>pool.includes(x)));
});
test('rotating qualified creators changes priority without tracking visitors',()=>{
 const pool=Array.from({length:18},(_,i)=>live('streamer'+i,'Hades II',20+(i%6)));
 const a=rankGameLives(pool,{limit:5,rotation:10});
 const b=rankGameLives(pool,{limit:5,rotation:10});
 const c=rankGameLives(pool,{limit:5,rotation:24});
 assert.deepEqual(a,b);
 assert.notDeepEqual(a.map(x=>x.login),c.map(x=>x.login));
});
test('small creators can reach the existing homepage shelf',()=>{
 const all=[
  ...Array.from({length:16},(_,i)=>live('mid'+i,['Fortnite','Minecraft','Valorant'][i%3],60+i)),
  ...Array.from({length:7},(_,i)=>live('micro'+i,['Balatro','Hades II','Outer Wilds'][i%3],20+(i%6)))
 ];
 const ranked=rankHomeLives(all,{limit:12});
 assert.equal(ranked.length,12);
 assert.ok(ranked.some(x=>x.viewer_count>=20&&x.viewer_count<=25));
 assert.equal(new Set(ranked.map(x=>x.login)).size,12);
});
test('game identity remains exact and sequel-safe across article and community',()=>{
 assert.equal(equivalent('Hades','Hades II'),false);
 assert.equal(equivalent('Planet Zoo','Planet Zoo II'),false);
 assert.equal(equivalent('GTA 6','Grand Theft Auto VI'),true);
 const app=read('assets/swapp-social-native/app.js');
 const views=read('assets/swapp-social-native/views.js');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(app,/if\(gameRooms\)setView\('rooms','Salons · '\+requestedGame\)/);
 assert.match(app,/gameJump\.dataset\.nextGame/);
 assert.match(views,/window\.SwappGameIdentity\?\.sameGame/);
 assert.match(views,/const game=String\(item\.game\|\|''\)/);
 assert.match(hubs,/swapp-game-identity\.js\?v=20261019-game-synergy-v1/);
});
test('game-live endpoint matches verified categories before applying fair ranking',()=>{
 const server=read('server.js');
 const start=server.indexOf("app.get('/api/discovery/game-lives'");
 const end=server.indexOf('// Public Swapp channel directory',start);
 assert.ok(start>=0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/!same\(game,x\.game_name\|\|x\.category\|\|x\.game\)/);
 assert.match(route,/rankGameLives\(items,\{limit\}\)/);
 assert.match(route,/totalCandidates:items.length/);
 assert.match(route,/paidBoost:false/);
 const module=read('modules/swapp-discovery-diversity.js');
 assert.doesNotMatch(module,/fetch\(|axios|XMLHttpRequest|sendBeacon|localStorage|firestore|gemini/i);
});
