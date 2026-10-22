'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ENDPOINTS,assertOrigin,evaluate,collect}=require('../tools/swapp-p0-audit');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clean={
 release:{service:'swapp',complete:true,fingerprint:'a'.repeat(64)},
 accounts:{mysql:true,persistence:'mysql:swapp_oryon_accounts',users:2},
 social:{active_backend:'mysql',mysql_reachable:true,snapshot_present:true,snapshot_type:'fresh',fresh_auto_init_requested:false,fresh_start_approved:false,writes_frozen:false},
 tv:{enabled:true,director_enabled:true,waiting:[]},
 spotlight:{enabled:true,accounts_mysql:true},
 editorial:{releaseCount:6,editableCount:6},
 fairness:{enabled:true,sample:'limited-aggregate'}
};
test('safe P0 pilot technical preflight requires each critical verified service',()=>{
 const all=evaluate(clean);
 assert.equal(all.ready_for_pilot,true);
 assert.deepEqual(all.blockers,[]);
 assert.match(all.note,/deux comptes/);
 assert.equal(all.statuses.length,7);
});
test('real production-like Firestore and paused TV + Spotlight are blocked',()=>{
 const r=evaluate({...clean,
  accounts:{persistence:'firestore:write-ok',users:5},
  tv:{enabled:false,director_enabled:false},
  spotlight:{enabled:false,accounts_mysql:false}
 });
 assert.equal(r.ready_for_pilot,false);
 assert.ok(r.blockers.includes('accounts'));
 assert.ok(r.blockers.includes('tv'));
 assert.ok(r.blockers.includes('spotlight'));
 assert.match(r.statuses.find(s=>s.key==='accounts').detail,/Firestore/);
 assert.match(r.statuses.find(s=>s.key==='spotlight').action,/SWAPP_SPOTLIGHT_ENABLED/);
});
test('SOCIAL can be live while temporary bootstrap permissions still need disabling',()=>{
 const r=evaluate({...clean,social:{...clean.social,fresh_auto_init_requested:true,fresh_start_approved:true}});
 const social=r.statuses.find(s=>s.key==='social');
 assert.equal(social.ok,false);
 assert.equal(social.live,true);
 assert.match(social.detail,/drapeaux bootstrap/);
 assert.match(social.action,/SWAPP_SOCIAL_FRESH_AUTO_INIT/);
 assert.ok(r.blockers.includes('social'));
});
test('TV queue enabled but no director is not called ready',()=>{
 const r=evaluate({...clean,tv:{enabled:true,director_enabled:false}});
 assert.equal(r.ready_for_pilot,false);
 assert.ok(r.blockers.includes('tv'));
 assert.match(r.statuses.find(s=>s.key==='tv').detail,/régie inactive/);
});
test('unknown and failed status endpoints are never considered green',()=>{
 const r=evaluate({...clean,accounts:{error:'HTTP 503'},spotlight:null});
 assert.equal(r.ready_for_pilot,false);
 assert.equal(r.statuses.find(s=>s.key==='accounts').ok,null);
 assert.equal(r.statuses.find(s=>s.key==='spotlight').ok,null);
});
test('P1 editorial or fair flags warn without claiming pilot performance',()=>{
 const r=evaluate({...clean,editorial:{releaseCount:6,editableCount:0},fairness:{enabled:false}});
 assert.equal(r.ready_for_pilot,true);
 assert.deepEqual(r.warnings,['editorial','fairness']);
});
test('restrict origin to SWAPP and localhost to avoid arbitrary admin probing',()=>{
 for(const origin of ['https://evil.example','http://swapp.tv','https://swapp.tv:444','https://swapp.tv/steal','https://user:pass@swapp.tv/']){
  assert.throws(()=>assertOrigin(origin));
 }
 assert.equal(assertOrigin('https://swapp.tv'),'https://swapp.tv');
 assert.equal(assertOrigin('http://localhost/'),'http://localhost');
});
test('collector makes only public bounded GET requests with no credentials',async()=>{
 const calls=[];
 const paths=Object.fromEntries(Object.entries(ENDPOINTS).map(([key,p])=>[p,clean[key]]));
 const fetchImpl=async(uri,options)=>{
  calls.push({uri,options});
  return {ok:true,headers:{get:()=> 'application/json; charset=utf-8'},json:async()=>paths[new URL(uri).pathname]};
 };
 const report=await collect({origin:'https://swapp.tv',fetchImpl,timeoutMs:2000});
 assert.equal(report.ready_for_pilot,true);
 assert.equal(calls.length,7);
 assert.ok(calls.every(c=>c.options.method==='GET'));
 assert.ok(calls.every(c=>!c.options.credentials&&!c.options.body));
});
test('existing admin operations panel visibly includes all critical gates',()=>{
 const ui=read('assets/swapp-ops-status.js');
 assert.match(ui,/name:'Comptes SWAPP'/);
 assert.match(ui,/name:'SOCIAL'/);
 assert.match(ui,/name:'SWAPP TV'/);
 assert.match(ui,/name:'Spotlight'/);
 assert.match(ui,/Lancement P0 bloqué/);
 assert.match(ui,/role','status/);
 assert.match(ui,/SWAPP_SOCIAL_FRESH_START_APPROVED|autorisations d’initialisation temporaire/);
 assert.doesNotMatch(ui,/method:'POST'|localStorage|sessionStorage/);
});
test('command is manual, with no CI, new cron or user account mutation',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts['audit:p0'],'node tools/swapp-p0-audit.js');
 const source=read('tools/swapp-p0-audit.js');
 assert.doesNotMatch(source,/\.post\(|method:'POST'|app\.use\(/);
 assert.doesNotMatch(source,/\/register/);
 assert.match(source,/require\.main===module/);
});
