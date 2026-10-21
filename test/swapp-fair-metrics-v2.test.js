'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFairMetrics,canonicalGame,band}=require('../modules/swapp-fair-metrics');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const SECRET='server-side-secret-which-is-never-sent-to-browser-012345';
const game={platform:'twitch',login:'example_streamer',game_name:'GTA 6',viewer_count:8};
function mockMetrics({enabled=true,rows=[],uniqueCreators=null}={}){
 const logs={query:[],execute:[]};
 const pool={
  async query(sql){logs.query.push(sql);return [[],[]]},
  async execute(sql,args){
   logs.execute.push({sql,args});
   if(sql.startsWith('SELECT COUNT(DISTINCT'))return [[{creators:uniqueCreators??rows.reduce((sum,row)=>sum+Number(row.creators||0),0)}],[]];
   return [sql.startsWith('SELECT')?rows:[],[]];
  }
 };
 let timestamp=Date.UTC(2026,9,19,14,0,0);
 const fair=createFairMetrics({getPool:()=>pool,isEnabled:()=>enabled,secret:SECRET,now:()=>timestamp});
 return {fair,logs,pool,setTime:x=>{timestamp=x}};
}
test('off by default means no token and no SQL',async()=>{
 const {fair,logs}=mockMetrics({enabled:false});
 assert.equal(fair.enabled(),false);
 assert.equal(fair.issue(game),'');
 assert.deepEqual(await fair.record('irrelevant','impression'),{ok:false,status:503});
 assert.deepEqual(await fair.summary(),{enabled:false,scope:'game-card-aggregate',sample:'not_collected'});
 assert.equal(logs.query.length+logs.execute.length,0);
 const noSecret=createFairMetrics({getPool:()=>({}),isEnabled:()=>true,secret:'short'});
 assert.equal(noSecret.enabled(),false);
});
test('server proof is canonical, signed, short-lived, and never identifies a visitor',()=>{
 const {fair,setTime}=mockMetrics();
 const proof=fair.issue(game);
 assert.match(proof,/^[A-Za-z0-9_-]{30,500}\.[a-f0-9]{64}$/);
 const payload=fair.verify(proof);
 assert.equal(payload.c,'example_streamer');
 assert.equal(payload.g,'Grand Theft Auto VI');
 assert.equal(payload.b,'small');
 assert.equal(payload.p,'game');
 const raw=Buffer.from(proof.split('.')[0],'base64url').toString('utf8');
 for(const forbidden of ['ip','cookie','viewer_id','session','email','visitor','userId','url']){
  assert.ok(!raw.includes('"'+forbidden+'"'));
 }
 assert.equal(fair.verify(proof.slice(0,-1)+(proof.at(-1)==='0'?'1':'0')),null);
 assert.equal(fair.issue({...game,viewer_count:-10}),'');
 assert.equal(fair.issue({...game,login:'../wrong'}),'');
 assert.equal(fair.issue({...game,platform:'fake'}),'');
 setTime(Date.UTC(2026,9,19,14,46,0));
 assert.equal(fair.verify(proof),null,'expired signed proof must be rejected');
});
test('signed proofs keep sequel/remaster variants separate',()=>{
 assert.equal(canonicalGame('GTA VI'),'Grand Theft Auto VI');
 assert.notEqual(canonicalGame('Hades'),canonicalGame('Hades II'));
 assert.notEqual(canonicalGame('The Witcher 3'),canonicalGame('The Witcher 3 Remastered'));
 assert.equal(band(25),'small');
 assert.equal(band(26),'growing');
 assert.equal(band(101),'established');
 assert.equal(band(-1),'');
});
test('a real opted-in card increments only daily aggregate counts in MySQL',async()=>{
 const {fair,logs}=mockMetrics();
 const proof=fair.issue(game);
 assert.deepEqual(await fair.record(proof,'impression'),{ok:true,status:202});
 assert.deepEqual(await fair.record(proof,'click'),{ok:true,status:202});
 assert.equal(logs.execute.length,2);
 assert.equal(logs.query.length,2,'one CREATE and one retention purge');
 assert.match(logs.query[0],/CREATE TABLE IF NOT EXISTS swapp_fair_exposure_daily/i);
 assert.match(logs.query[1],/INTERVAL 14 DAY/);
 assert.deepEqual(logs.execute[0].args,['game','twitch','example_streamer','Grand Theft Auto VI','small',1,0]);
 assert.deepEqual(logs.execute[1].args,['game','twitch','example_streamer','Grand Theft Auto VI','small',0,1]);
 assert.ok(logs.execute.every(x=>/ON DUPLICATE KEY UPDATE/.test(x.sql)));
 assert.deepEqual(await fair.record(proof,'watchtime'),{ok:false,status:400});
 assert.deepEqual(await fair.record('spoof','impression'),{ok:false,status:400});
 assert.equal(logs.execute.length,2);
});
test('public reporting suppresses sparse samples and marks opt-in selection bias',async()=>{
 const insufficient=mockMetrics({rows:[{audience_band:'small',creators:4,impressions:49,clicks:3}]});
 const a=await insufficient.fair.summary();
 assert.equal(a.sample,'insufficient');
 assert.equal('smallAudienceImpressionShare' in a,false);
 const enough=mockMetrics({rows:[
  {audience_band:'small',creators:3,impressions:25,clicks:4},
  {audience_band:'growing',creators:2,impressions:35,clicks:2},
  {audience_band:'established',creators:1,impressions:20,clicks:1}
 ]});
 const b=await enough.fair.summary();
 assert.equal(b.sample,'limited-aggregate');
 assert.equal(b.impressions,80);
 assert.equal(b.smallAudienceImpressionShare,31.3);
 assert.equal(b.uniqueCreatorsRepresented,6);
 assert.match(b.caveat,/Échantillon volontaire/);
 const changingAudience=mockMetrics({uniqueCreators:2,rows:[
  {audience_band:'small',creators:2,impressions:55},
  {audience_band:'growing',creators:2,impressions:50},
  {audience_band:'established',creators:2,impressions:45}
 ]});
 assert.equal((await changingAudience.fair.summary()).sample,'insufficient','two unique creators must never count as six');
 assert.equal('creatorLogin' in b,false);
});
test('API requires explicit enablement, same-origin writes, bounded rate and no personal data',()=>{
 const server=read('server.js');
 const module=read('modules/swapp-fair-metrics.js');
 const ddl=read('migrations/mysql/010_swapp_fair_exposure_daily.sql');
 assert.match(server,/SWAPP_FAIR_METRICS_ENABLED==='1'/);
 assert.match(server,/secret:configuredSessionSecret/);
 assert.match(server,/max:12,standardHeaders:false/);
 assert.match(server,/approved\.includes\(origin\)/);
 assert.match(server,/fairMetrics\.record\(req\.body\?\.proof,req\.body\?\.event\)/);
 assert.match(server,/fairMetrics\.issue\(item\)/);
 assert.match(server,/fairMetrics:\{enabled:fairMetrics\.enabled\(\),scope:'anonymous-game-cards'\}/);
 assert.match(module,/MIN_IMPRESSIONS=50/);
 assert.match(module,/MIN_CREATORS=5/);
 assert.match(ddl,/PRIMARY KEY \(event_day,placement,platform,creator_login,game_name,audience_band\)/);
 assert.doesNotMatch(ddl,/\b(ip_address|user_id|visitor_id|session_id|device_id|cookie)\b/i);
});
test('browser only observes after consent, supports opt-out and records no visitor ID',()=>{
 const js=read('assets/swapp-media-live.js');
 const shell=read('modules/swapp-news/site-shell.js');
 assert.match(js,/active:false/);
 assert.match(js,/button\.addEventListener\('click'/);
 assert.match(js,/threshold:\[0,\.5,1\]/);
 assert.match(js,/},1250\)/);
 assert.match(js,/credentials:'omit',keepalive:true/);
 assert.match(js,/body:JSON\.stringify\(\{proof,event\}\)/);
 assert.match(js,/new WeakMap\(\)/);
 assert.match(js,/if\(pilot\.active\)start\(\);else stop\(\)/);
 assert.match(js,/Volontaire · cartes visibles et clics uniquement/);
 assert.match(shell,/swapp-media-live\.js\?v=20261021-game-universe-v1/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|sendBeacon|visitorId/i);
});
