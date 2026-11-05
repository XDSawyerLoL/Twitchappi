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
 const relay=()=>other?[
  {login:'creatortwo',media_verified:true,player_url:'/api/oryon/local-relay/creatortwo/player'},
  {login:'wronggame',media_verified:true,player_url:'/api/oryon/local-relay/wronggame/player'}
 ]:[];
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

test('destination live is rechecked after cache and never advertised when it ended',async()=>{
 let currentTime=100000,available=true;
 const calls=[];
 const service=createHandoff({
  now:()=>currentTime,twitchEnabled:()=>true,users:()=>[],nativeStreams:()=>[],
  twitchAPI:async endpoint=>{
   calls.push(endpoint);
   if(endpoint.startsWith('streams?user_login=alpha'))return {data:[]};
   if(endpoint.startsWith('streams?user_login=beta'))
    return {data:available?[{user_login:'beta',game_name:'Hades'}]:[]};
   if(endpoint.startsWith('games?name='))return {data:[{id:'111',name:'Hades'}]};
   if(endpoint.startsWith('streams?first=100&game_id=111'))
    return {data:[{user_login:'beta',user_name:'Beta',game_id:'111',game_name:'Hades'}]};
   throw Error('unexpected '+endpoint);
  }
 });
 const first=await service.check({platform:'twitch',login:'alpha',game:'Hades'});
 assert.equal(first.next?.login,'beta');
 available=false;currentTime+=9000;
 const second=await service.check({platform:'twitch',login:'alpha',game:'Hades'});
 assert.equal(second.next,null,'stale game listing cannot recommend a now-offline destination');
 assert.ok(calls.filter(x=>x.startsWith('streams?user_login=beta')).length>=2);
});

test('TV player still starts one native or Twitch frame and retains deliberate play/stop',()=>{
 const js=read('assets/swapp-tv-broadcast.js');
 const source=js.slice(js.indexOf('function renderScreen('),js.indexOf('function mapNativeLives('));
 const make=(tag,cls,txt)=>({
  tag,cls,textContent:txt||'',children:[],hidden:false,style:{},removed:false,
  append(...nodes){this.children.push(...nodes)},
  remove(){this.removed=true},setAttribute(key,val){this[key]=val},
  querySelector(selector){return selector==='.stv-player-layer'?
   this.children.find(n=>n.cls==='stv-player-layer'&&!n.removed):null}
 });
 const nodes={'stv-screen':make('section'),'stv-watch':make('button'),
  'stv-screen-inner':make('div')};
 for(const id of ['stv-air-state','stv-now-name','stv-now-game','stv-screen-game','stv-stage-status'])
  nodes[id]=make('span');
 const state={consent:false,selection:null,playing:null,playingPlatform:null,playingBroadcastId:null,
  autoAdvance:false,autoSource:null,playStartedAt:0};
 const FakeParams=class{constructor(o){this.value=o}toString(){return Object.entries(this.value)
  .map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')}};
 const app=new Function('state','$','by','setText','safeLogin','safeNativeLogin','location',
  'URLSearchParams','updateTwitchChat','api','document',source+'return {renderScreen,play,stopPlayback};')(
  state,id=>nodes[id]||null,make,(id,value)=>{nodes[id].textContent=value},
  login=>/^[a-z0-9_]{3,25}$/.test(login),login=>/^[a-z0-9_-]{2,32}$/.test(login),
  {hostname:'swapp.tv'},FakeParams,()=>{},async()=>({}),{visibilityState:'visible'});
 app.renderScreen({login:'vnhz',platform:'swapp',game:'Hades',broadcast_id:'br1'},{onAir:true});
 app.play();
 assert.equal(state.playing,'vnhz');
 assert.match(nodes['stv-screen'].querySelector('.stv-player-layer').children[0].src,
  /^\/api\/oryon\/local-relay\/vnhz\/player$/);
 app.stopPlayback();
 assert.equal(state.consent,false);
 assert.equal(nodes['stv-screen'].querySelector('.stv-player-layer'),undefined);
 app.renderScreen({login:'other_twitch',platform:'twitch',game:'Hades'},{onAir:false});
 app.play();
 assert.match(nodes['stv-screen'].querySelector('.stv-player-layer').children[0].src,
  /^https:\/\/player\.twitch\.tv\//);
});
