'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const tv=fs.readFileSync(path.join(repo,'assets/swapp-tv-broadcast.js'),'utf8');
const page=require('../modules/swapp-program').page('tv');

function bootHarness(){
 const a=tv.indexOf('async function init(){'),b=tv.indexOf('void init().catch(',a);
 assert.ok(a>0&&b>a,'TV needs a discoverable init function');
 const events=[],element={replaceChildren(){},append(){}};
 let releaseQueue,releaseEditor;
 const queue=new Promise(done=>{releaseQueue=done});
 const editorial=new Promise(done=>{releaseEditor=done});
 const state={selection:null,consent:false,queueMode:false,autoStartPending:true,games:[],queue:null};
 const start=new Function('api','refreshQueue','discovery','setInterval','state',
  'updateRotationBar','explainEmptyStation','gamesFrom','$','by','renderQueue',
  tv.slice(a,b)+'return init;')(
  ()=>editorial,()=>{events.push('native+queue request');return queue},
  ()=>{events.push('real live discovery');state.consent=true;return Promise.resolve()},
  ()=>{events.push('retry timer installed')},state,()=>{},()=>{},
  data=>data.articles||[],()=>element,()=>({value:''}),()=>{});
 return {start,state,events,releaseQueue,releaseEditor};
}
test('first stream discovery begins before slow database queue and ACTUS responses',async()=>{
 const harness=bootHarness();
 const run=harness.start();
 assert.deepEqual(harness.events.slice(0,2),['native+queue request','real live discovery']);
 assert.ok(harness.events.includes('retry timer installed'),'retry cannot depend on APIs');
 assert.equal(harness.state.consent,true,'confirmed source starts despite pending endpoints');
 harness.releaseQueue({enabled:false,waiting:[]});
 harness.releaseEditor({articles:[]});
 await run;
 assert.equal(harness.state.consent,true);
});
test('editorial API outages cannot disable autoplay, manual stop does not self-restart',async()=>{
 const harness=bootHarness();
 const running=harness.start();
 harness.releaseQueue({});
 harness.releaseEditor({articles:[]});
 await running;
 assert.ok(harness.events.includes('real live discovery'));
 assert.match(tv,/if\(state\.autoStartPending&&valid&&document\.visibilityState!=='hidden'\)/);
 assert.match(tv,/state\.autoAdvance=false;state\.autoStartPending=false/);
});
test('no-stream condition is displayed instead of a perpetual loading message',()=>{
 const a=tv.indexOf('function explainEmptyStation(){'),b=tv.indexOf('let stationRefreshing=false;',a);
 assert.ok(a>0&&b>a);
 const state={autoStartPending:true,selection:null,consent:false};
 let status='';
 const explain=new Function('state','setText',tv.slice(a,b)+'return explainEmptyStation;')(
  state,(_,text)=>{status=text});
 explain();
 assert.match(status,/Aucun direct disponible/);
 state.autoStartPending=false;status='';explain();
 assert.equal(status,'','manual Stop must not restart discovery state');
});
test('every TV player control referenced in client script exists in server markup',()=>{
 const ids=[...new Set([...tv.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m=>m[1]))];
 const missing=ids.filter(id=>id!=='stv-passage'&&!page.includes('id="'+id+'"'));
 assert.deepEqual(missing,[]);
});
test('deployed page reveals the correct v11 script revision for cache busting',()=>{
 assert.match(page,/data-tv-build="20261113-liveboot-v11"/);
 assert.match(page,/swapp-tv-broadcast\.js\?v=20261113-liveboot-v11/);
 assert.match(tv,/const bootDiscovery=discovery\(\)/);
});
