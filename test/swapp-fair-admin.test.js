'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarizeFairAdmin,registerFairAdmin,fairAdminPage}=require('../modules/swapp-fair-admin');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const bands=[
 {audience_band:'small',creators:3,impressions:38,clicks:5},
 {audience_band:'growing',creators:3,impressions:20,clicks:3},
 {audience_band:'established',creators:1,impressions:3,clicks:1}
];
test('fair admin: disabled or sparse samples disclose no group, day or game data',()=>{
 const off=summarizeFairAdmin({enabled:false});
 assert.equal(off.enabled,false);
 assert.equal(off.sample,'not_collected');
 assert.equal('totals' in off,false);
 const few=summarizeFairAdmin({bands,uniqueCreators:4,games:[{game_name:'Fortnite',impressions:200,creators:9}]});
 assert.equal(few.sample,'insufficient');
 for(const forbidden of ['totals','bands','trend','games'])assert.equal(forbidden in few,false);
 const impressionsLow=summarizeFairAdmin({bands:[{audience_band:'small',impressions:49,creators:10}],uniqueCreators:10});
 assert.equal(impressionsLow.sample,'insufficient');
});
test('fair admin: aggregate summary, min-volume groups and real unique creators',()=>{
 const result=summarizeFairAdmin({bands,uniqueCreators:6,days:7,
  daily:[
   {day:'2026-10-17',audience_band:'small',impressions:5,clicks:1},
   {day:'2026-10-18',audience_band:'small',impressions:24,clicks:2},
   {day:'2026-10-18',audience_band:'growing',impressions:20,clicks:3}
  ],
  dailyCreators:[{day:'2026-10-17',creators:2},{day:'2026-10-18',creators:5}],
  games:[{game_name:'Fortnite',impressions:40,clicks:8,creators:4},
   {game_name:'Hades',impressions:19,clicks:5,creators:9},
   {game_name:'Game low creators',impressions:80,clicks:20,creators:2}]
 });
 assert.equal(result.sample,'limited-voluntary');
 assert.equal(result.totals.impressions,61);
 assert.equal(result.totals.clicks,9);
 assert.equal(result.totals.creators,6);
 assert.equal(result.totals.clickRate,14.8);
 assert.equal(result.bands.find(x=>x.name==='small').share,62.3);
 assert.equal(result.bands.find(x=>x.name==='established').sample,'insufficient');
 assert.equal(result.bands.find(x=>x.name==='established').impressions,null);
 assert.equal(result.trend.find(x=>x.day==='2026-10-17').impressions,null);
 assert.equal(result.trend.find(x=>x.day==='2026-10-18').impressions,44);
 assert.deepEqual(result.games.map(x=>x.name),['Fortnite']);
 assert.equal(JSON.stringify(result).includes('creator_login'),false);
});
test('fair admin: period is restricted to 7 or 14 days and duplicate groups do not leak creators',()=>{
 const x=summarizeFairAdmin({days:365,bands,uniqueCreators:2});
 assert.equal(x.periodDays,7);assert.equal(x.sample,'insufficient');
 const y=summarizeFairAdmin({days:14,bands,uniqueCreators:10});
 assert.equal(y.periodDays,14);
 assert.equal(y.sample,'limited-voluntary');
 assert.equal(y.bands.every(x=>x.sample!=='limited-voluntary'||x.creators>=3),true);
});
function appFixture({enabled=true,fail=false}={}){
 const routes=new Map(),middlewares=[],executions=[],restored=[];
 const responses=[
  [{audience_band:'small',creators:4,impressions:42,clicks:8},{audience_band:'growing',creators:2,impressions:21,clicks:2}],
  [{creators:6}],
  [{day:'2026-10-19',audience_band:'small',impressions:42,clicks:8},{day:'2026-10-19',audience_band:'growing',impressions:21,clicks:2}],
  [{day:'2026-10-19',creators:6}],
  [{game_name:'Fortnite',creators:6,impressions:63,clicks:10}]
 ];
 const pool={async execute(sql,args){executions.push({sql,args});if(fail)throw Error('db failure');return [responses[executions.length-1]||[],[]]}};
 const app={
  use(paths,...handlers){middlewares.push({paths,handlers})},
  get(route,...handlers){routes.set(route,handlers)}
 };
 const guard=(req,res,next)=>req.admin?next():res.status(403).json({error:'editor_forbidden'});
 const restoreSession=async(req,res,opts)=>{restored.push(opts);return false};
 const fairMetrics={summary:async()=>({enabled})};
 registerFairAdmin({app,guard,restoreSession,fairMetrics,getPool:()=>pool});
 async function call(route,{admin=false,days}={}){
  const req={admin,query:days===undefined?{}:{days},session:{}},res={
   code:200,payload:null,headers:{},set(k,v){this.headers[k]=v;return this},
   type(k){this.typeName=k;return this},send(x){this.payload=x;return this},
   status(x){this.code=x;return this},json(x){this.payload=x;return this}
  };
  const list=[...middlewares.filter(m=>m.paths.includes(route)).flatMap(m=>m.handlers),...(routes.get(route)||[])];
  let i=0;async function next(){if(i>=list.length)return;const fn=list[i++];await fn(req,res,next);}
  await next();
  return res;
 }
 return {routes,middlewares,executions,restored,call};
}
test('fair admin: private HTML and API are inaccessible without existing admin guard',async()=>{
 const x=appFixture();
 assert.equal(x.routes.has('/admin/fair-discovery'),true);
 assert.equal(x.routes.has('/api/editor/fair-discovery'),true);
 const deniedPage=await x.call('/admin/fair-discovery');
 const deniedData=await x.call('/api/editor/fair-discovery');
 assert.equal(deniedPage.code,403);
 assert.equal(deniedData.code,403);
 assert.equal(x.executions.length,0);
 assert.equal(deniedData.headers['Cache-Control'],'private, no-store');
 assert.equal(deniedPage.headers['X-Robots-Tag'],'noindex, nofollow');
 assert.equal(x.restored.every(o=>o.allowUserRecovery===false),true);
});
test('fair admin: authorized route is read-only and MySQL returns only aggregated queries',async()=>{
 const x=appFixture();
 const page=await x.call('/admin/fair-discovery',{admin:true});
 assert.equal(page.code,200);
 assert.match(page.payload,/SWAPP \/ INTELLIGENCE ÉDITORIALE/);
 assert.match(page.payload,/robots" content="noindex,nofollow,noarchive/);
 const res=await x.call('/api/editor/fair-discovery',{admin:true,days:'14'});
 assert.equal(res.code,200);
 assert.equal(res.payload.periodDays,14);
 assert.equal(res.payload.totals.impressions,63);
 assert.equal(res.payload.games[0].name,'Fortnite');
 assert.equal(x.executions.length,5);
 assert.ok(x.executions.every(e=>/SELECT/.test(e.sql)&&/GROUP BY|COUNT\(DISTINCT/.test(e.sql)));
 assert.ok(x.executions.every(e=>e.args.length===1&&e.args[0]==='game'));
 assert.ok(x.executions.every(e=>!e.sql.includes('SELECT *')));
 assert.equal(res.headers['Cache-Control'],'private, no-store');
 assert.doesNotMatch(JSON.stringify(res.payload),/session|visitor|ip_address|creator_login|user_id/i);
});
test('fair admin: bad period/DB failure/disabled mode never expose SQL errors',async()=>{
 const x=appFixture();
 const invalid=await x.call('/api/editor/fair-discovery',{admin:true,days:'365'});
 assert.equal(invalid.code,400);assert.equal(x.executions.length,0);
 const fail=appFixture({fail:true});
 const unavailable=await fail.call('/api/editor/fair-discovery',{admin:true});
 assert.equal(unavailable.code,503);assert.deepEqual(unavailable.payload,{error:'metrics_unavailable'});
 const off=appFixture({enabled:false});
 const empty=await off.call('/api/editor/fair-discovery',{admin:true});
 assert.equal(empty.payload.sample,'not_collected');assert.equal(off.executions.length,0);
});
test('fair admin: responsive visuals, no external charts and admin-only SWAPP entrypoints',()=>{
 const ui=read('assets/swapp-fair-admin.js');
 const css=read('assets/swapp-fair-admin.css');
 const server=read('server.js');
 const navigation=read('assets/swapp-editor-nav.js');
 const studio=read('modules/swapp-news/editor-ui.js');
 const shop=read('modules/swapp-hubs.js');
 const release=read('tools/swapp-release.js');
 assert.match(ui,/credentials:'same-origin',cache:'no-store'/);
 assert.match(ui,/textContent/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=|google|firebase|chart\.js|sendBeacon/i);
 assert.match(css,/@media\(max-width:780px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(server,/registerFairAdmin/);
 assert.match(server,/guard:shopEditorGuard/);
 assert.match(navigation,/if\(!allowed\).*?if\(fair\)fair\.remove\(\)/);
 assert.match(studio,/\/admin\/fair-discovery/);
 assert.match(shop,/\/admin\/fair-discovery/);
 assert.match(release,/modules\/swapp-fair-admin\.js/);
 assert.match(release,/assets\/swapp-fair-admin\.css/);
 assert.doesNotMatch(fairAdminPage(),/https:\/\/(?:cdn|chart)/i);
});
