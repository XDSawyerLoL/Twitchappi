'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {page}=require('../modules/swapp-program');
test('TV shows one conductor with integrated creator access, not a second product section',()=>{
 const html=page('tv');
 for(const key of ['id="stv-screen"','id="stv-now-name"','id="stv-next-list"','id="stv-creator-access"','id="stv-queue-status"','id="stv-immersive"','swapp-tv-broadcast.js'])
  assert.ok(html.includes(key),key);
 assert.match(html,/<aside class="stv-rail stv-dock"[\s\S]*?<div id="stv-pane-queue"[\s\S]*?<details id="stv-creator-access"[\s\S]*?<\/details>[\s\S]*?<\/aside>/);
 assert.match(html,/<summary>[\s\S]*?Je suis créateur/);
 assert.match(html,/id="stv-program-open"/);
 for(const id of ['stv-game','stv-join','stv-leave']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'exactly one control '+id);
 }
 assert.doesNotMatch(html,/id="stv-queue-list"|class="stv-bottom"|id="stv-queue"|stv-queue-tease|SWAPP TV \/ CREATOR ACCESS|ENTRE DANS|Retour à la TV|id="stv-dock-close"/);
 assert.doesNotMatch(html,/class="stv-footer"/);
});
test('public programme remains on the TV programme route and not inside broadcast screen',()=>{
 const html=page('agenda');
 assert.match(html,/id="swapp-calendar"/);
 assert.match(html,/id="scal-grid"/);
 assert.match(html,/swapp-calendar\.js/);
 assert.doesNotMatch(html,/id="stv-creator-access"|swapp-tv-broadcast\.js/);
});
test('existing SWAPP queue and player work without a second duplicate waiting list',()=>{
 const code=read('assets/swapp-tv-broadcast.js');
 for(const pattern of [/\/api\/swapp-tv\/queue\/status/,/\/api\/swapp-tv\/queue/,/data\.director_enabled\?data\.on_air:null/,/player\.twitch\.tv/,/muted:'true'/,/\$\('stv-watch'\)\.addEventListener\('click',play\)/,/\$\('stv-join'\)\.addEventListener/ ,/\$\('stv-leave'\)\.addEventListener/])
  assert.match(code,pattern);
 assert.match(code,/setText\('stv-next-title',enabled\?'CRÉATEURS EN ATTENTE'/);
 assert.match(code,/waiting\.length>=100\?'100\+ en attente'/);
 assert.doesNotMatch(code,/stv-queue-list|Math\.random/);
});
test('creator inline control follows SWAPP styling and supports mobile and keyboard',()=>{
 const css=read('assets/swapp-program.css');
 assert.match(css,/\.stv-creator-inline>summary/);
 assert.match(css,/\.stv-creator-content .stv-queue-buttons/);
 assert.match(css,/\.stv-creator-inline>summary:focus-visible/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(css,/\.stv-queue-tease|\.stv-bottom\{|\.stv-queue-grid|\.stv-queue-panel/);
});

test('TV uses mini programme tab and side-by-side desktop chat',()=>{
 const html=page('tv'),css=read('assets/swapp-program.css'),js=read('assets/swapp-tv-broadcast.js');
 const dockTop=html.indexOf('class="stv-dock-top"');
 const programme=html.indexOf('id="stv-program-open"');
 assert.ok(dockTop>0&&programme>dockTop&&programme<html.indexOf('id="stv-pane-queue"'));
 assert.match(html,/id="stv-program-open"[^>]*>Agenda<\/button>/);
 assert.doesNotMatch(html,/id="stv-dock-close"[^>]*>✕|id="stv-program-close"[^>]*>✕/);
 assert.match(html,/id="stv-dialog-title">Agenda de la chaîne<\/strong>/);
 assert.match(css,/\.stv \.stv-dock-top \.stv-programme-link\{flex:0 0 69px/);
 assert.equal((html.match(/id="stv-program-open"/g)||[]).length,1);
 assert.ok(css.includes('clamp(300px,27vw,365px)!important;align-items:stretch!important'));
 assert.ok(css.includes('align-self:stretch!important;grid-column:auto!important'));
 assert.ok(css.includes('@media (max-width:720px){'));
 assert.ok(!css.includes('@media (max-width:980px){'));
 assert.ok(js.includes("matchMedia('(max-width:720px)')"));
 assert.match(css,/\.stv-program-dialog\{width:min\(990px/);
 assert.match(css,/\.stv \.stv-dock-close\{display:none\}/);
 assert.match(js,/programme\?\.addEventListener\('close'/);
});
test('disabled queue keeps the conductor visible while blocking enrollment',()=>{
 const js=read('assets/swapp-tv-broadcast.js');
 assert.match(js,/access\.hidden=false/);
 assert.match(js,/Inscriptions fermées temporairement/);
 assert.match(js,/FILE D’ATTENTE · PAUSE/);
});

test('TV continues to the next verified creator only after a viewer starts the station',()=>{
 const script=read('assets/swapp-tv-broadcast.js');
 assert.match(script,/autoAdvance:false/);
 assert.match(script,/if\(state\.autoAdvance&&onAir&&valid&&!same\)play\(\)/);
 assert.match(script,/state\.autoAdvance=Boolean\(item\.onAir\)/);
 assert.match(script,/function stopPlayback\(\)/);
 assert.match(script,/state\.autoAdvance=false/);
 assert.match(script,/syncWatchButton\(\)/);
 assert.match(script,/muted:'true'/);
 assert.match(page('tv'),/id="stv-watch" type="button" aria-pressed="false" disabled/);
});
test('TV preserves viewer opt-in when an on-air session ends and restarts',()=>{
 const source=read('assets/swapp-tv-broadcast.js');
 const begin=source.indexOf('function renderScreen(');
 const end=source.indexOf('async function refreshQueue(',begin);
 assert.ok(begin>=0&&end>begin);
 const make=(tag,cls,text)=>({
  tag,cls,text,className:cls,children:[],removed:false,hidden:false,style:{},
  append(...children){this.children.push(...children)},
  remove(){this.removed=true},setAttribute(k,v){this[k]=v}
 });
 const watch=make('button'),inner=make('div'),stage=make('div'),screen=make('section');
 screen.querySelector=()=>screen.children.find(x=>x.cls==='stv-player-layer'&&!x.removed)||null;
 const nodes={'stv-screen':screen,'stv-screen-inner':inner,'stv-watch':watch,'stv-air-state':make('span'),
 'stv-now-name':make('span'),'stv-now-game':make('span'),'stv-screen-game':make('span'),'stv-stage-status':stage};
 const $=id=>nodes[id];
 const state={selection:null,playing:null,consent:false,autoAdvance:false};
 const URLSearchParams=class{constructor(obj){this.map=obj}toString(){return Object.entries(this.map).map(([k,v])=>k+'='+v).join('&')}};
 const run=new Function('state','$','by','setText','safeLogin','location','URLSearchParams','updateTwitchChat',
  source.slice(begin,end)+'return {renderScreen,play,stopPlayback};');
 const app=run(state,$,make,(id,value)=>{nodes[id].textContent=value},x=>/^[a-z0-9_]{3,25}$/.test(x),
  {hostname:'swapp.tv'},URLSearchParams,()=>{});
 const first={twitch_login:'creator_one',creator_login:'Un',game:'Fortnite'};
 const next={twitch_login:'creator_two',creator_login:'Deux',game:'Fortnite'};
 app.renderScreen(first,{onAir:true});
 assert.equal(state.playing,null,'initial selection must not autoplay without opt-in');
 app.play();
 assert.equal(state.playing,'creator_one');
 assert.equal(watch['aria-pressed'],'true');
 app.renderScreen(null);
 assert.equal(state.playing,null);
 assert.equal(state.autoAdvance,true,'temporary off-air transition preserves viewer TV consent');
 app.renderScreen(next,{onAir:true});
 assert.equal(state.playing,'creator_two','automatic handoff starts only verified on-air replacement');
 assert.match(String(screen.querySelector('.stv-player-layer')?.children[0]?.src),/creator_two/);
 app.stopPlayback();
 assert.equal(state.autoAdvance,false);
 assert.equal(watch['aria-pressed'],'false');
 app.renderScreen(first,{onAir:true});
 assert.equal(state.playing,null,'manual stop disables all subsequent automatic transitions');
 app.renderScreen({login:'discovery_live',game:'Aion 2',platform:'twitch'});
 assert.equal(state.playing,null,'discovery must never start automatically');
});

test('fallback TV discovery interleaves game communities rather than ranking by audience',()=>{
 const js=read('assets/swapp-tv-broadcast.js');
 const start=js.indexOf('function fairDiscovery('),end=js.indexOf('async function discovery(',start);
 assert.ok(start>=0&&end>start);
 const fair=new Function(js.slice(start,end)+'return fairDiscovery;')();
 const viewers=[
  {login:'huge_stream',game:'Fortnite',viewer_count:90000},
  {login:'small_stream',game:'Fortnite',viewer_count:20},
  {login:'fortnite_two',game:'Fortnite',viewer_count:5000},
  {login:'aion_stream1',game:'Aion 2',viewer_count:50},
  {login:'aion_stream2',game:'Aion 2',viewer_count:700}
 ];
 const a=fair(viewers,42),b=fair([...viewers].reverse(),42);
 assert.deepEqual(a.map(x=>x.login),b.map(x=>x.login),
  'Twitch provider ordering and size cannot determine SWAPP TV exposure');
 assert.equal(new Set(a.map(x=>x.login)).size,5);
 assert.notEqual(a[0].game,a[1].game,'alternate between game communities');
 assert.notEqual(a[1].game,a[2].game,'avoid one-game dominance');
});
test('automatic discovery refresh does not discard an already watched creator',async()=>{
 const source=read('assets/swapp-tv-broadcast.js');
 const helper=source.slice(source.indexOf('function fairDiscovery('),source.indexOf('async function discovery('));
 const body=source.slice(source.indexOf('async function discovery('),source.indexOf('async function mutate('));
 const fair=new Function(helper+'return fairDiscovery;')();
 const state={queueMode:false,discovery:[],index:0,games:['Fortnite'],
  selection:{login:'small_stream',onAir:false}};
 let renderCount=0,railCount=0,items=[
  {login:'huge_stream',game_name:'Fortnite',game:'Fortnite',platform:'twitch',viewer_count:12000},
  {login:'small_stream',game_name:'Fortnite',game:'Fortnite',platform:'twitch',viewer_count:30}
 ];
 const discovery=new Function('state','api','safeLogin','fairDiscovery','renderScreen','rail',
  body+'return discovery;')(state,async()=>({items}),
   x=>/^[a-z0-9_]{3,25}$/.test(x),fair,()=>{renderCount++},()=>{railCount++});
 await discovery();
 assert.equal(renderCount,0,'refresh must preserve a valid, manually selected Twitch stream');
 assert.equal(state.discovery[state.index].login,'small_stream');
 items=[{login:'new_stream',game_name:'Fortnite',game:'Fortnite',platform:'twitch'}];
 await discovery();
 assert.equal(renderCount,1,'an actual disappearance should select a new creator');
 assert.equal(railCount,2);
});

test('conductor clock measures the actual verified slot, not queue position estimates',()=>{
 const code=read('assets/swapp-tv-broadcast.js');
 const start=code.indexOf('const TV_SLOT_SECONDS=');
 const end=code.indexOf('const setText=',start);
 assert.ok(start>=0&&end>start);
 const nodes={'stv-slot-clock':{hidden:true,textContent:''}};
 const state={queue:{enabled:true,director_enabled:true,
  on_air:{started_at:'2026-10-25T18:00:00Z'}}};
 const make=new Function('state','$','Date',code.slice(start,end)+
  'return {updateSlotClock,tvTime,TV_SLOT_SECONDS};')(state,id=>nodes[id],Date);
 assert.equal(make.TV_SLOT_SECONDS,require('../modules/swapp-tv-director').MAX_AIR_SECONDS);
 make.updateSlotClock(Date.parse('2026-10-25T18:02:31Z'));
 assert.equal(nodes['stv-slot-clock'].textContent,'PROCHAIN RELAIS · 07:29');
 assert.equal(nodes['stv-slot-clock'].hidden,false);
 make.updateSlotClock(Date.parse('2026-10-25T18:10:01Z'));
 assert.equal(nodes['stv-slot-clock'].textContent,'RELAIS EN PRÉPARATION');
 state.queue.enabled=false;
 make.updateSlotClock(Date.parse('2026-10-25T18:10:03Z'));
 assert.equal(nodes['stv-slot-clock'].hidden,true);
 assert.match(page('tv'),/id="stv-slot-clock"[^>]*aria-live="off" hidden/);
 assert.match(read('assets/swapp-program.css'),/\.stv-slot-clock\[hidden\]/);
});
