'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFairMetrics}=require('../modules/swapp-fair-metrics');
const {createFairOffers}=require('../modules/swapp-fair-offers');
const {summarizeFairOffers}=require('../modules/swapp-fair-admin');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function fixture({enabled=true,fail=false}={}){
 let now=Date.UTC(2026,9,19,12),job=null;
 const SQL=[];
 const pool={
  async query(sql){SQL.push({sql,args:[]});if(fail)throw Error('db_unavailable');return [[]]},
  async execute(sql,args){SQL.push({sql,args});if(fail)throw Error('db_unavailable');
   if(sql.startsWith('SELECT audience_band'))return [[
    {audience_band:'small',creators:4,opportunities:56},
    {audience_band:'growing',creators:2,opportunities:22}
   ]];
   if(sql.startsWith('SELECT COUNT(DISTINCT'))return [[{creators:6}]];
   return [[]];
  }
 };
 const fair=createFairMetrics({getPool:()=>pool,isEnabled:()=>enabled,secret:'a stable secret at least 32 characters long yes',now:()=>now});
 const offers=createFairOffers({getPool:()=>pool,isEnabled:()=>enabled,verify:fair.verify,now:()=>now,
  schedule(fn,delay){job=fn;assert.equal(delay,15000);return 1},
  cancel(){job=null}
 });
 const card=(login,viewers=8)=>({
  platform:'twitch',login,game_name:'Fortnite',viewer_count:viewers
 });
 const signed=(login,placement='home',viewers=8)=>({...card(login,viewers),
  fairProof:fair.issue(card(login,viewers),{placement})});
 return {pool,SQL,fair,offers,signed,card,advance:ms=>{now+=ms},
  getJob:()=>job};
}
test('offers: only actual signed candidates in a finished-eligible response are accepted',async()=>{
 const x=fixture();
 const home=x.signed('creatorone');
 const other=x.signed('creatortwo','discover');
 assert.equal(x.offers.capture([home,home,other,{}, {fairProof:'untrusted'}],{placement:'home'}),1);
 assert.equal(x.offers.capture([home],{placement:'paid'}),0);
 assert.equal(x.offers.capture(null,{placement:'home'}),0);
 await x.offers.flush();
 const write=x.SQL.find(q=>q.sql.startsWith('INSERT INTO swapp_fair_opportunities_daily'));
 assert.ok(write);
 assert.equal(write.args.length,7);
 assert.deepEqual(write.args,['2026-10-19','home','twitch','creatorone','Fortnite','small',1]);
 assert.equal(x.SQL.filter(q=>q.sql.startsWith('INSERT INTO')).length,1);
});
test('offers: batches repeat server responses into a single bounded aggregate write',async()=>{
 const x=fixture(),items=[x.signed('creatorone'),x.signed('creatortwo')];
 assert.equal(x.offers.capture(items,{placement:'home'}),2);
 assert.equal(x.offers.capture(items,{placement:'home'}),2);
 assert.ok(x.getJob());
 const flushed=await x.offers.flush();
 assert.equal(flushed,2);
 assert.equal(x.getJob(),null);
 const insert=x.SQL.find(q=>q.sql.startsWith('INSERT INTO'));
 assert.equal(insert.args.length,14);
 assert.deepEqual([insert.args[6],insert.args[13]],[2,2]);
 assert.match(insert.sql,/ON DUPLICATE KEY UPDATE opportunities=opportunities\+VALUES\(opportunities\)/);
 assert.equal(x.SQL.filter(q=>q.sql.startsWith('DELETE FROM')).length,1);
});
test('offers: disabled feature has no writes, no schedule, no stored visitor data',async()=>{
 const x=fixture({enabled:false});
 assert.equal(x.offers.capture([x.card('creatorone')],{placement:'home'}),0);
 assert.equal(await x.offers.flush(),0);
 assert.equal(x.SQL.length,0);
 assert.equal(x.getJob(),null);
 assert.deepEqual(await x.offers.summary(),{enabled:false,sample:'not_collected'});
});
test('offers: scheduled flush is best-effort, not awaited by the API',async()=>{
 const x=fixture();
 x.offers.capture([x.signed('creatorone')],{placement:'home'});
 const fn=x.getJob();assert.equal(typeof fn,'function');
 fn();await x.offers.flush();
 assert.equal(x.SQL.filter(q=>q.sql.startsWith('INSERT INTO')).length,1);
});
test('offers: 7/14 day and placement filtering preserve server-side SQL parameters',async()=>{
 const x=fixture();
 const a=await x.offers.summary({days:7,placement:'home'});
 assert.equal(a.uniqueCreators,6);
 assert.equal(a.bands[0].opportunities,56);
 assert.ok(x.SQL.some(q=>q.sql.includes('INTERVAL 6 DAY')&&q.sql.includes('AND placement=?')&&q.args[0]==='home'));
 const b=await x.offers.summary({days:14,placement:'all'});
 assert.equal(b.uniqueCreators,6);
 assert.ok(x.SQL.some(q=>q.sql.includes('INTERVAL 13 DAY')&&!q.sql.includes('AND placement=?')&&q.args.length===0));
 await assert.rejects(()=>x.offers.summary({days:365}),/invalid_filters/);
 await assert.rejects(()=>x.offers.summary({placement:'x'}),/invalid_filters/);
});
test('offers: privacy threshold cannot leak sparse audiences or creators',()=>{
 const privateData=summarizeFairOffers({bands:[{audience_band:'small',creators:2,opportunities:100}],uniqueCreators:2});
 assert.equal(privateData.sample,'insufficient');
 assert.equal('totals' in privateData,false);
 assert.equal('bands' in privateData,false);
 const publicData=summarizeFairOffers({bands:[
  {audience_band:'small',creators:4,opportunities:56},
  {audience_band:'growing',creators:2,opportunities:22}
 ],uniqueCreators:6,placement:'discover',days:14});
 assert.equal(publicData.sample,'aggregate');
 assert.equal(publicData.totals.opportunities,78);
 assert.equal(publicData.bands.find(b=>b.name==='small').share,71.8);
 assert.equal(publicData.bands.find(b=>b.name==='growing').opportunities,null);
 assert.equal(publicData.comparableToOptIn,false);
 assert.equal(JSON.stringify(publicData).includes('creator_login'),false);
});
test('offers: existing API registers finish-only, never turn proposals into impressions',()=>{
 const s=read('server.js');
 const first=s.indexOf("app.get('/api/oryon/discover/find-live'");
 const home=s.indexOf("app.get('/api/discovery/home-lives'");
 const game=s.indexOf("app.get('/api/discovery/game-lives'");
 for(const [placement,start,end] of [['discover',first,s.indexOf('function getFirstSupportPayload(',first)],
  ['home',home,game],['game',game,s.indexOf('// Public Swapp channel directory',game)]]){
  assert.ok(start>0&&end>start);
  const route=s.slice(start,end);
  assert.match(route,/res\.once\('finish'/);
  assert.match(route,/res\.statusCode===200/);
  assert.match(route,new RegExp("fairOffers\\.capture\\(reportable,\\{placement:'"+placement+"'\\}\\)"));
  assert.doesNotMatch(route,/fairOffers\.capture\(items|fairOffers\.capture\(out/);
 }
 assert.match(s,/createFairOffers/);
 assert.doesNotMatch(read('modules/swapp-fair-offers.js'),/req\.|headers\.|session\.|ipAddress|localStorage|cookie|fetch\(/);
});
test('offers: dashboard separates samples and does not create a fake funnel',()=>{
 const server=read('server.js'),admin=read('modules/swapp-fair-admin.js'),
  client=read('assets/swapp-fair-admin.js'),css=read('assets/swapp-fair-admin.css');
 assert.match(server,/fairMetrics,fairOffers,getPool/);
 assert.match(admin,/fairOffers\.summary\(\{days,placement\}\)/);
 assert.match(admin,/return res\.json\(\{\.\.\.summarizeFairAdmin\(.+?,offers\}\)/);
 assert.match(admin,/id="fair-offers-title"/);
 assert.match(client,/renderOffers\(body\)/);
 assert.match(client,/offered\.sample!=='aggregate'/);
 assert.match(css,/#fair-offers-bands/);
 assert.doesNotMatch(client,/offered\.totals\.opportunities\s*\/\s*body\.totals\.impressions/);
});
test('offers: table is additive, 14-day retention, and shipping is fingerprinted',()=>{
 const schema=read('migrations/mysql/011_swapp_fair_opportunities_daily.sql');
 const release=read('tools/swapp-release.js');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS swapp_fair_opportunities_daily/);
 const columns=schema.split('\n').filter(line=>/^\s*[a-z_]+\s+(?:DATE|VARCHAR|INT)\b/i.test(line)).join('\n');
 assert.doesNotMatch(columns,/visitor|ip_address|session_id|user_id|email_address/i);
 assert.match(release,/migrations\/mysql\/011_swapp_fair_opportunities_daily\.sql/);
 assert.match(release,/modules\/swapp-fair-offers\.js/);
 assert.match(read('modules/swapp-fair-offers.js'),/const DAYS=14/);
 assert.match(read('modules/swapp-fair-offers.js'),/INTERVAL '\+DAYS\+' DAY/);
});
