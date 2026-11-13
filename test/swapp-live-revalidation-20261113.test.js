'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const catalogue=require('../assets/swapp-catalogue-lab');
const file=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-catalogue-lab.js'),'utf8');

function refreshHarness({home=[],top=[],errors=[],hidden=false,offline=false}={}){
 const begin=file.indexOf('async function refreshLiveInventory(){');
 const end=file.indexOf('let liveRefreshTimer=0;',begin);
 assert.ok(begin>=0&&end>begin,'refresh source boundaries');
 const body=file.slice(begin,end);
 const old=catalogue.normalizeLive({login:'old_stream',platform:'twitch',viewer_count:42});
 const state={loading:false,liveRefreshing:false,liveLastCheck:0,liveEpoch:0,
  lives:[old],games:[],baseCategories:[{name:'Cyberpunk 2077'}],failed:['games']};
 const document={hidden};
 const navigator={onLine:!offline};
 const calls={feeds:[],render:0,hero:0,rotation:0,small:0,status:0};
 const fetchLiveInventory=async url=>{
  calls.feeds.push(url);
  if(errors.includes(url))throw Error('Unreachable live API');
  return url===catalogue.API.home?home:top;
 };
 const make=new Function('state','document','navigator','LIVE_RECHECK_MS','API',
  'fetchLiveInventory','mergeLives','mergeGames','setHeroItems','render',
  'startHeroRotation','loadSmallCommunities','updateCatalogueStatus',
  body+';return refreshLiveInventory;');
 const refresh=make(state,document,navigator,catalogue.LIVE_RECHECK_MS,catalogue.API,
  fetchLiveInventory,catalogue.mergeLives,catalogue.mergeGames,
  ()=>{calls.hero++},()=>{calls.render++},()=>{calls.rotation++},
  async()=>{calls.small++},()=>{calls.status++});
 return {state,document,navigator,calls,refresh};
}

test('viewers must be an actual finite nonnegative integer, never a fabricated 0',()=>{
 for(const [input,want] of [[0,0],[2,2],['0',0],['25',25],[153,153]]){
  assert.equal(catalogue.parseAudience(input),want,String(input));
 }
 for(const input of [null,undefined,'',' ',' 0','0 ','00','0.0','5.5','1e2',
  true,false,[],{},-1,2.8,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'9007199254740992']){
  assert.equal(catalogue.parseAudience(input),null,'reject '+String(input));
 }
 const unknown=catalogue.normalizeLive({login:'stream_1',viewer_count:' '});
 assert.equal(unknown.audienceVerified,false);
 assert.equal(unknown.viewers,null);
 assert.equal(catalogue.chooseSmallCommunities([unknown],[],[]).items.length,0);
 assert.equal(catalogue.normalizeLive({login:'stream_1',viewer_count:'0'}).viewers,0);
});

test('rechecks changed live feeds, drops stale streams, never waits for ACTUS',async()=>{
 const source={login:'still_live',platform:'twitch',viewer_count:21,game_name:'Cyberpunk 2077'};
 const h=refreshHarness({home:[source],errors:[catalogue.API.top]});
 await h.refresh();
 assert.deepEqual(h.state.lives.map(x=>x.login),['still_live']);
 assert.ok(h.state.games.some(x=>x.gameSlug==='cyberpunk-2077'));
 assert.deepEqual(h.state.failed,['games','top']);
 assert.equal(h.state.liveRefreshing,false);
 assert.deepEqual([h.calls.hero,h.calls.render,h.calls.rotation,h.calls.small,h.calls.status],[1,1,1,1,1]);
 assert.equal(h.calls.feeds.length,2);
 await h.refresh();
 assert.equal(h.calls.feeds.length,2,'throttled until the next five-minute window');
});

test('failed live discovery removes unconfirmed old streams instead of advertising an offline creator',async()=>{
 const h=refreshHarness({errors:[catalogue.API.home,catalogue.API.top]});
 await h.refresh();
 assert.deepEqual(h.state.lives,[]);
 assert.deepEqual(h.state.failed,['games','home','top']);
 assert.equal(h.calls.render,1);
 assert.ok(h.state.games.some(x=>x.gameSlug==='cyberpunk-2077'),'the games rail is retained');
});

test('the foreground/online guard skips hidden and disconnected pages',async()=>{
 const h=refreshHarness({hidden:true});
 await h.refresh();
 assert.equal(h.calls.feeds.length,0);
 h.document.hidden=false;
 h.navigator.onLine=false;
 await h.refresh();
 assert.equal(h.calls.feeds.length,0);
 h.navigator.onLine=true;
 await h.refresh();
 assert.equal(h.calls.feeds.length,2);
});

test('a manual retry invalidates in-flight refresh replies',async()=>{
 const begin=file.indexOf('async function refreshLiveInventory(){');
 const end=file.indexOf('let liveRefreshTimer=0;',begin);
 const state={loading:false,liveRefreshing:false,liveLastCheck:0,liveEpoch:0,
  lives:[catalogue.normalizeLive({login:'current_live',viewer_count:3})],
  games:[],baseCategories:[],failed:[]};
 let resolveHome;
 const delayed=new Promise(resolve=>{resolveHome=resolve});
 const make=new Function('state','document','navigator','LIVE_RECHECK_MS','API',
  'fetchLiveInventory','mergeLives','mergeGames','setHeroItems','render',
  'startHeroRotation','loadSmallCommunities','updateCatalogueStatus',
  file.slice(begin,end)+';return refreshLiveInventory;');
 const refresh=make(state,{hidden:false},{onLine:true},catalogue.LIVE_RECHECK_MS,
  catalogue.API,url=>url===catalogue.API.home?delayed:Promise.resolve([]),
  catalogue.mergeLives,catalogue.mergeGames,()=>assert.fail('stale hero'),
  ()=>assert.fail('stale render'),()=>assert.fail('stale rotation'),
  ()=>assert.fail('stale small rail'),()=>assert.fail('stale status'));
 const pending=refresh();
 state.liveEpoch++; // Manual load begins while an old verification is in flight.
 resolveHome([{login:'outdated',viewer_count:9}]);
 await pending;
 assert.deepEqual(state.lives.map(x=>x.login),['current_live']);
 assert.equal(state.liveRefreshing,false);
});

test('background timer pauses on pagehide and revalidates when visible again',()=>{
 assert.match(file,/const LIVE_RECHECK_MS=5\*60\*1000;/);
 assert.match(file,/document\.addEventListener\('visibilitychange'/);
 assert.match(file,/window\.addEventListener\('online'/);
 assert.match(file,/window\.addEventListener\('pageshow'/);
 assert.match(file,/window\.addEventListener\('pagehide'/);
 assert.match(file,/if\(state\.loading\|\|state\.liveRefreshing\|\|document\.hidden/);
 assert.match(file,/installLiveRecheck\(\);\s*void load\(\);/);
});
