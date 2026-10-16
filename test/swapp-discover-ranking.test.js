'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {diversifyDiscovery,gameKey,replayTitle}=require('../modules/swapp-discovery-diversity');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const make=(game,idx,score=100)=>({
 platform:'twitch',login:game.toLowerCase().replace(/[^a-z]/g,'')+idx,
 title:'En direct',game_name:game,viewer_count:15+idx,score
});

test('broad Discover presents several relevant games rather than one-game repetition',()=>{
 const initial=[
  ...Array.from({length:8},(_,i)=>make('Fortnite',i,120-i)),
  ...Array.from({length:5},(_,i)=>make('Elden Ring',i,115-i)),
  ...Array.from({length:4},(_,i)=>make('Valorant',i,110-i)),
  ...Array.from({length:4},(_,i)=>make('Minecraft',i,105-i))
 ].sort((a,b)=>b.score-a.score);
 const before=initial.map(x=>x.login);
 const picked=diversifyDiscovery(initial,{limit:15,firstScreen:6,perGame:2});
 assert.equal(picked.length,15);
 assert.ok(new Set(picked.slice(0,6).map(x=>x.game_name)).size>=3);
 assert.ok(picked.slice(0,6).filter(x=>x.game_name==='Fortnite').length<=2);
 assert.equal(new Set(picked.map(x=>x.login)).size,15);
 assert.deepEqual(initial.map(x=>x.login),before);
});

test('named game or creator search preserves relevance order',()=>{
 const rows=[
  make('Fortnite',1,100),make('Fortnite',2,90),
  make('Elden Ring',1,87),make('Fortnite',3,86),
  make('Minecraft',1,85)
 ];
 for(const query of ['Fortnite','my_creator','  Elden Ring  ']){
  assert.deepEqual(diversifyDiscovery(rows,{query,limit:5}),rows);
 }
});

test('a rejected low-relevance candidate is not promoted into the first screen',()=>{
 const sorted=[
  ...Array.from({length:12},(_,i)=>make('Fortnite',i,120-i)),
  make('Elden Ring',1,-60),make('Valorant',1,-70),make('Minecraft',1,-80)
 ];
 const output=diversifyDiscovery(sorted,{limit:15,firstScreen:6,perGame:2});
 assert.equal(output.length,15);
 assert.ok(output.slice(0,6).every(x=>x.score>0));
 assert.deepEqual(output.slice(0,6),sorted.slice(0,6));
});

test('explicit reruns are excluded without removing genuine current streams',()=>{
 assert.equal(replayTitle({title:'Rediffusion de la finale'}),true);
 assert.equal(replayTitle({title:'Replay en boucle'}),true);
 assert.equal(replayTitle({title:'Live sur Elden Ring'}),false);
 const output=diversifyDiscovery([
  {...make('Elden Ring',0),title:'Best-of en boucle'},
  {...make('Elden Ring',1),title:'Nouvelle partie en direct'}
 ]);
 assert.equal(output.length,1);
 assert.equal(output[0].login,'eldenring1');
});

test('generic or unspecified games do not suppress unrelated creators',()=>{
 const a={...make('Just Chatting',1),game_name:'Just Chatting'};
 const b={...make('Just Chatting',2),game_name:'Just Chatting'};
 assert.notEqual(gameKey(a),gameKey(b));
 assert.equal(gameKey(make('Baldur’s Gate 3',1)),gameKey(make("Baldur's Gate 3",2)));
});

test('available Twitch language survives normalizing and deduping before scoring',()=>{
 const server=read('server.js');
 const start=server.indexOf('function discoveryNormCandidate(x){');
 const end=server.indexOf('function scoreDiscoveryCandidate(',start);
 assert.ok(start>=0&&end>start);
 const normalize=new Function('swappChannelPathForLogin',server.slice(start,end)+'\nreturn discoveryNormCandidate;')(()=>'/');
 const candidate=normalize({platform:'twitch',user_login:'creator',game_name:'Elden Ring',language:'fr',viewer_count:50});
 assert.equal(candidate.language,'fr');
 assert.equal(candidate.login,'creator');
 assert.equal(candidate.viewer_count,50);
 const english=normalize({platform:'twitch',login:'other',language:'en'});
 assert.equal(english.language,'en');
 assert.match(server,/String\(raw\.language \|\| ''\)/);
});

test('production Discover integrates diversity without extra APIs, telemetry or workflows',()=>{
 const server=read('server.js');
 const start=server.indexOf("app.get('/api/oryon/discover/find-live'");
 const end=server.indexOf('function getFirstSupportPayload(',start);
 assert.ok(start>0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/scoreDiscoveryCandidate/);
 assert.match(route,/require\('\.\/modules\/swapp-discovery-diversity'\)\.diversifyDiscovery\(scored,/);
 assert.match(route,/firstScreen:12,perGame:2/);
 assert.match(route,/query:q/);
 assert.match(route,/source_detail: top.length/);
 const sorter=read('modules/swapp-discovery-diversity.js');
 assert.doesNotMatch(sorter,/fetch\(|axios|XMLHttpRequest|sendBeacon|localStorage|firebase|gemini/i);
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/swapp-quality.yml')),false);
});
