'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/swapp-tv-broadcast.js');

function timerHarness(){
 const nodes={};
 for(const id of ['stv-rotation','stv-rotation-track','stv-rotation-fill','stv-rotation-clock','stv-rotation-label'])
  nodes[id]={hidden:true,textContent:'',style:{},attrs:{},
   setAttribute(k,v){this.attrs[k]=v}};
 const state={consent:true,selection:{login:'creator_a'},playing:'creator_a',
  playStartedAt:1000,autoSource:'discovery',discovery:[{login:'creator_a'},{login:'creator_b'}],
  native:[],queue:null};
 const a=source.indexOf('function updateRotationBar(');
 const b=source.indexOf('async function init()',a);
 assert.ok(a>0&&b>a);
 const update=new Function('state','$','tvTime','DISCOVERY_SLOT_MS','TV_SLOT_SECONDS',
  source.slice(a,b)+'return updateRotationBar;')(
   state,id=>nodes[id],value=>Date.parse(value),300000,300);
 return {update,state,nodes};
}
test('five-minute progress bar displays 05:00, then 02:30, then 00:00',()=>{
 const {update,nodes}=timerHarness();
 update(1000);
 assert.equal(nodes['stv-rotation'].hidden,false);
 assert.equal(nodes['stv-rotation-clock'].textContent,'05:00');
 assert.equal(nodes['stv-rotation-track'].attrs['aria-valuenow'],'0');
 update(151000);
 assert.equal(nodes['stv-rotation-clock'].textContent,'02:30');
 assert.equal(nodes['stv-rotation-fill'].style.width,'50.0%');
 update(301000);
 assert.equal(nodes['stv-rotation-clock'].textContent,'00:00');
 assert.equal(nodes['stv-rotation-fill'].style.width,'100.0%');
 assert.equal(nodes['stv-rotation-label'].textContent,'RELAIS EN COURS');
});
test('global queued TV uses real director slot start, not a fake local timer',()=>{
 const {update,state,nodes}=timerHarness();
 state.autoSource='queue';
 state.queue={director_enabled:true,
  on_air:{started_at:'2026-11-13T20:00:00Z'},waiting:[{twitch_login:'creator_b'}]};
 update(Date.parse('2026-11-13T20:02:00Z'));
 assert.equal(nodes['stv-rotation-clock'].textContent,'03:00');
 assert.equal(nodes['stv-rotation-fill'].style.width,'40.0%');
});
test('manual stop hides timer and does not trigger a fake streamer',()=>{
 const {update,state,nodes}=timerHarness();
 state.consent=false;update(301000);
 assert.equal(nodes['stv-rotation'].hidden,true);
 const css=read('assets/swapp-program.css');
 assert.match(css,/\.stv \.stv-rotation\[hidden\]\{display:none!important\}/);
 const markup=require('../modules/swapp-program').page('tv');
 assert.match(markup,/id="stv-rotation-track"[^>]*role="progressbar"/);
 assert.match(markup,/aria-valuemax="300"/);
});
test('open registration without active director does not block Twitch discovery',async()=>{
 const a=source.indexOf('async function refreshQueue()');
 const b=source.indexOf('// Rotate discovery',a);
 assert.ok(a>0&&b>a);
 const state={queue:null,selection:null,playing:null,consent:false,
  native:[],nativeFetchedAt:0,nativeIndex:0,autoAdvance:false};
 const refresh=new Function('api','state','mapNativeLives','Date','renderScreen',
  'safeLogin','renderQueue','updateSlotClock','rail',
  source.slice(a,b)+'return refreshQueue;')(
  async url=>url.includes('native-lineup')?{success:true,items:[]}:
   {enabled:true,director_enabled:false,on_air:null,waiting:[]},
  state,()=>[],Date,()=>{},
  name=>/^[a-z0-9_]{3,25}$/.test(String(name||'')),()=>{},()=>{},()=>{});
 await refresh();
 assert.equal(state.queueMode,false);
});
test('new confirmed queued streamer replaces current on-air streamer mid-playback',async()=>{
 const a=source.indexOf('async function refreshQueue()');
 const b=source.indexOf('// Rotate discovery',a);
 const state={queue:null,selection:{login:'creator_old',platform:'twitch',onAir:true},
  playing:'creator_old',playingPlatform:'twitch',autoSource:'queue',
  autoAdvance:true,consent:true,native:[],nativeFetchedAt:0,nativeIndex:0};
 let change=null;
 const refresh=new Function('api','state','mapNativeLives','Date','renderScreen',
  'safeLogin','renderQueue','updateSlotClock','rail',
  source.slice(a,b)+'return refreshQueue;')(
  async url=>url.includes('native-lineup')?{success:true,items:[]}:
   {enabled:true,director_enabled:true,on_air:{twitch_login:'creator_new',game:'Aion'},waiting:[]},
  state,()=>[],Date,(item,opts)=>{change={item,opts}},
  name=>/^[a-z0-9_]{3,25}$/.test(String(name||'')),()=>{},()=>{},()=>{});
 await refresh();
 assert.equal(change.item.twitch_login,'creator_new');
 assert.equal(change.opts.onAir,true);
 assert.equal(state.autoSource,'queue');
});
test('ACTUS hero starts flush under the global menu',()=>{
 const css=read('assets/swapp-actus-app.css');
 assert.match(css,/#actus\.view\.active:has\(\.swapp-actus-featured-mount\)\{[^}]*padding-top:0!important/s);
 assert.match(css,/#actus \.swapp-actus-native:has\(> \.swapp-actus-featured-mount\)\{[^}]*padding-top:0!important/s);
 assert.match(css,/#actus \.swapp-actus-featured-mount\{[^}]*margin-top:0!important/s);
 assert.match(read('index.html'),/swapp-actus-app\.css\?v=20261113-flush-hero-v10/);
});
