'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandoff,choose}=require('../modules/swapp-live-handoff');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function fixture({twitch=true,native=false,streamOnline=true}={}){
 let time=Date.parse('2026-11-05T14:00:00Z'),calls=[],on=streamOnline,other=native;
 const users=[
  {login:'creatorone',display_name:'Créateur One',channel_public:true,current_live_category:'Hades'},
  {login:'creatortwo',display_name:'Créateur Two',channel_public:true,current_live_category:'Hades'},
  {login:'wronggame',display_name:'Autre titre',channel_public:true,current_live_category:'Hades II'}
 ];
 const upstream=async ep=>{
  calls.push(ep);
  if(ep.includes('streams?user_login='))return {data:on?[{user_login:'alpha',game_name:'Hades'}]:[]};
  if(ep.includes('games?name='))return {data:[{id:'111',name:'Hades'},{id:'222',name:'Hades II'}]};
  if(ep.includes('streams?first=100&game_id=111'))return {data:[
   {user_login:'beta',user_name:'Beta',game_id:'111',game_name:'Hades'},
   {user_login:'alpha',user_name:'Alpha',game_id:'111',game_name:'Hades'}
  ]};
  throw Error('Unexpected Twitch API: '+ep);
 };
 const relay=()=>other?[{login:'creatortwo',media_verified:true},{login:'wronggame',media_verified:true}]:[];
 const service=createHandoff({twitchAPI:upstream,twitchEnabled:()=>twitch,users:()=>users,
  nativeStreams:relay,nativeLive:login=>login==='creatorone'&&on,now:()=>time});
 return {service,calls,offline(){on=false;time+=13000},advance(){time+=26000},setNative(v){other=v}};
}
test('same game: Hades can transfer to Hades, NEVER Hades II',async()=>{
 const h=fixture({native:true});
 const first=await h.service.check({platform:'twitch',login:'alpha'});
 assert.equal(first.current.live,true);
 assert.equal(first.current.game,'Hades');
 assert.equal(first.next,null);
 h.offline();
 const result=await h.service.check({platform:'twitch',login:'alpha',game:first.current.game});
 assert.equal(result.current.live,false);
 assert.ok(result.next,'verified candidate required');
 assert.equal(result.next.game,'Hades');
 assert.notEqual(result.next.login,'alpha');
 assert.notEqual(result.next.login,'wronggame');
 assert.match(result.next.url,/^\/(?:live\/twitch\/)?[a-z0-9_-]+/);
});
test('no fallback to another category, no fabricated live',async()=>{
 const h=fixture({native:false,streamOnline:false});
 const result=await h.service.check({platform:'swapp',login:'creatorone',game:'Hades II'});
 assert.equal(result.current.live,false);
 assert.equal(result.next,null);
 assert.equal(result.reason,'no_same_game_live');
});
test('native browser/OBS live signal prevents a false handoff even if HLS absent',async()=>{
 const h=fixture({native:false});
 const first=await h.service.check({platform:'swapp',login:'creatorone'});
 assert.equal(first.current.live,true);
 assert.equal(first.reason,'still_live');
 assert.equal(first.next,null);
 h.offline();
 const second=await h.service.check({platform:'swapp',login:'creatorone',game:'Hades'});
 assert.equal(second.current.live,false);
});
test('Twitch unavailable fails closed instead of guessing offline',async()=>{
 const h=fixture({twitch:false,native:true});
 const result=await h.service.check({platform:'twitch',login:'alpha',game:'Hades'});
 assert.equal(result.success,false);
 assert.equal(result.status,503);
 assert.equal(result.next,undefined);
});
test('Twitch source checks are cached across viewers for rate limits',async()=>{
 const h=fixture({native:true});
 await Promise.all(Array.from({length:15},()=>h.service.check({platform:'twitch',login:'alpha',game:'Hades'})));
 assert.equal(h.calls.filter(x=>x.includes('streams?user_login=alpha')).length,1);
 h.advance();
 await h.service.check({platform:'twitch',login:'alpha',game:'Hades'});
 assert.equal(h.calls.filter(x=>x.includes('streams?user_login=alpha')).length,2);
});
test('invalid identities and forged candidates fail closed',async()=>{
 const h=fixture();
 assert.equal((await h.service.check({platform:'twitch',login:'../wrong'})).status,400);
 assert.equal((await h.service.check({platform:'swapp',login:'missing'})).status,404);
 assert.equal(choose([{platform:'twitch',login:'alpha',game:'Hades II'}],
  {platform:'twitch',login:'beta',game:'Hades'}),null);
});
test('consumer pages and station expose PASSAGE without new player transport',()=>{
 const js=read('assets/swapp-live-handoff.js'),tv=read('assets/swapp-tv-broadcast.js');
 const watch=read('modules/swapp-news/watch.js'),router=read('modules/swapp-news/router.js');
 const index=read('index.html'),server=read('server.js');
 for(const token of ['offline>=2','seenLive','clearStatus()','Rester sur cette chaîne','location.assign(check.next.url)'])
  assert.ok(js.includes(token),token);
 assert.match(tv,/function passageOffer\(/);
 assert.match(tv,/function maybePassage\(/);
 assert.match(tv,/renderScreen\(\{platform:next.platform/);
 assert.match(tv,/if\(!active&&!state.consent\)renderScreen/);
 assert.match(watch,/data-swapp-handoff-platform="twitch"/);
 assert.match(router,/handoff:req.query\?\.handoff==='1'/);
 assert.match(index,/swapp-live-handoff\.js/);
 assert.match(server,/app\.get\('\/api\/swapp\/live-handoff',heavyLimiter/);
 assert.doesNotMatch(js,/new Hls\(|new WebSocket\(|\.srcObject\s*=/);
});
