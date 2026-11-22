'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sampleStreams,trendReport,createTrendCollector,INTERVAL_MS}=require('../modules/swapp-autonomy/live-trends');
const replayTitle = row => /rediffusion|replay|24\s*\/\s*7|\bafk\b/i.test([row.title,...(row.tags||[])].join(' '));
function streams(extra=0){return [
 {user_login:'creator1',game_name:'Star Citizen',game_id:'71375',viewer_count:99+extra,type:'live',language:'fr',title:'Live'},
 {user_login:'creator2',game_name:'Star Citizen',game_id:'71375',viewer_count:25,type:'live',language:'fr',title:'Live'},
 {user_login:'creator3',game_name:'Dofus',game_id:'20596',viewer_count:55,type:'live',language:'fr',title:'Live'}
];}
function fakeDb(){
 const rows=new Map(),calls=[];
 return {rows,calls,async execute(sql,args=[]){
  calls.push({sql,args});
  if(sql.startsWith('CREATE TABLE'))return [{warningStatus:0}];
  if(sql.startsWith('INSERT IGNORE')){if(rows.has(args[0]))return [{affectedRows:0}];rows.set(args[0],{bucket:args[0],state:'collecting',sample_json:null});return [{affectedRows:1}];}
  if(sql.includes("SET state='ready'")){const row=rows.get(args[1]);if(!row||row.state!=='collecting')return [{affectedRows:0}];Object.assign(row,{state:'ready',sample_json:args[0]});return [{affectedRows:1}];}
  if(sql.includes("SET state='failed'")){const row=rows.get(args[0]);if(row&&row.state==='collecting')row.state='failed';return [{affectedRows:1}];}
  if(sql.startsWith('SELECT')){return [[...rows.values()].filter(x=>x.state==='ready').sort((a,b)=>b.bucket-a.bucket).slice(0,2)];}
  if(sql.startsWith('DELETE')){for(const k of rows.keys())if(k<args[0])rows.delete(k);return [{affectedRows:1}];}
  throw Error('unexpected_sql: '+sql);
 }};
}
test('aggregate bounded French Twitch sample, no identifiers or replay entries',()=>{
 const sample=sampleStreams([...streams(),{user_login:'replay',game_name:'Dofus',viewer_count:30,tags:['Rediffusion'],language:'fr'},
  {user_login:'creator1',game_name:'Star Citizen',viewer_count:99,language:'fr'},
  {user_login:'english',game_name:'Star Citizen',viewer_count:30,language:'en'},
  {user_login:'chatter',game_name:'Just Chatting',viewer_count:300,language:'fr'}],{atMs:INTERVAL_MS,replayTitle});
 assert.equal(sample.observedStreams,3);
 assert.equal(sample.excludedReplays,1);
 assert.equal(sample.games.length,2);
 assert.equal(sample.games.find(g=>g.game==='Star Citizen').smallStreams,2);
 assert.ok(!JSON.stringify(sample).includes('creator1'));
 assert.ok(!JSON.stringify(sample).includes('replay'));
});
test('two distinct time slots produce comparable deltas without fake growth percentages',()=>{
 const first=sampleStreams(streams(),{atMs:INTERVAL_MS*100,replayTitle});
 const second=sampleStreams(streams(10),{atMs:INTERVAL_MS*101,replayTitle});
 const report=trendReport([{bucket:101,sample_json:JSON.stringify(second)},{bucket:100,sample_json:JSON.stringify(first)}], INTERVAL_MS*101+10000);
 assert.equal(report.state,'ready');
 assert.equal(report.comparable,true);
 assert.equal(report.games[0].deltaObservedViewers,10);
 assert.equal('growthPercent' in report.games[0],false);
});
test('one observation is warming, stale history cannot claim a trend',()=>{
 const a=sampleStreams(streams(),{atMs:INTERVAL_MS*10,replayTitle});
 assert.equal(trendReport([{bucket:10,sample_json:JSON.stringify(a)}],INTERVAL_MS*10).state,'warming');
 assert.equal(trendReport([{bucket:10,sample_json:JSON.stringify(a)}],INTERVAL_MS*15).state,'stale');
 assert.equal(trendReport([{bucket:20,sample_json:JSON.stringify(a)},{bucket:10,sample_json:JSON.stringify(a)}],INTERVAL_MS*20).comparable,false);
});
test('one MySQL claim permits only one fetch for a shared slot across instances',async()=>{
 const db=fakeDb();let fetches=0;let tickNow=INTERVAL_MS*350+123;
 const opts={db,replayTitle,now:()=>tickNow,fetchStreams:async()=>{fetches++;return streams() },enabled:true};
 const one=createTrendCollector(opts),two=createTrendCollector(opts);
 const a=await one.tick();const b=await two.tick();
 assert.equal(a.saved,true);assert.equal(b.skipped,'slot-claimed');assert.equal(fetches,1);
 assert.equal(db.rows.size,1);
 const report=await one.report();assert.equal(report.state,'warming');
 tickNow+=INTERVAL_MS;
 const c=await two.tick();assert.equal(c.saved,true);
 assert.equal(fetches,2);
 assert.equal((await two.report()).state,'ready');
});
test('failure cannot create fake observations and cooldown after repeated provider outages',async()=>{
 const db=fakeDb();let now=INTERVAL_MS*300;const problems=[];
 const collector=createTrendCollector({db,enabled:true,now:()=>now,replayTitle,log:v=>problems.push(v),fetchStreams:async()=>{throw Error('SECRET_TOKEN_123')}});
 for(let i=0;i<3;i++){const r=await collector.tick();assert.equal(r.failed,true);now+=INTERVAL_MS;}
 assert.equal((await collector.report()).state,'warming');
 assert.equal((await collector.tick()).skipped,'disabled-or-busy');
 assert.equal(db.rows.size,3);
 assert.equal(problems.length,3);
 assert.equal(problems.includes('SECRET_TOKEN_123'),false);
});
test('read API is cached and does not collect from Twitch',async()=>{
 const db=fakeDb();let now=INTERVAL_MS*50,reads=0;
 const original=db.execute.bind(db);
 db.execute=async (...args)=>{if(args[0].startsWith('SELECT'))reads++;return original(...args)};
 const collector=createTrendCollector({db,enabled:true,now:()=>now,fetchStreams:async()=>{throw Error('GET must not fetch')},replayTitle});
 assert.equal((await collector.report()).state,'warming');
 await collector.report();assert.equal(reads,1);
 now+=60001;await collector.report();assert.equal(reads,2);
});
test('startup, timeouts, stop and feature gate remain bounded',async()=>{
 const db=fakeDb();let scheduled,cancelled=0,deferred,unref=0;
 const collector=createTrendCollector({db,enabled:true,now:()=>INTERVAL_MS*51,replayTitle,fetchStreams:async()=>streams(),
  setTimer:(cb,ms)=>{scheduled={cb,ms,unref:()=>{unref++;}};return scheduled},clearTimer:()=>{cancelled++;},defer:cb=>{deferred=cb;}});
 assert.equal(collector.start(),true);assert.equal(collector.start(),false);
 assert.equal(scheduled.ms,60000);assert.equal(unref,1);
 await deferred();assert.equal(db.rows.size,1);collector.stop();assert.equal(cancelled,1);
 const disabled=createTrendCollector({db,enabled:false,replayTitle,fetchStreams:async()=>streams()});
 assert.equal(disabled.start(),false);assert.equal((await disabled.report()).state,'disabled');
});
test('malformed provider result, out-of-range samples and corrupt history are rejected',async()=>{
 assert.throws(()=>sampleStreams(null,{replayTitle}),/invalid_live_sample/);
 assert.throws(()=>sampleStreams(Array(101).fill({}),{replayTitle}),/invalid_live_sample/);
 assert.throws(()=>trendReport([{bucket:5,sample_json:'{}'}]),/invalid_trend_row/);
 const db=fakeDb();const collector=createTrendCollector({db,enabled:true,now:()=>INTERVAL_MS*99,replayTitle,fetchStreams:async()=>[]});
 assert.equal((await collector.tick()).failed,true);
 assert.equal(db.rows.get(99).state,'failed');
});

test('cold GET never creates schema, inserts slots, or calls Twitch',async()=>{
 const db=fakeDb();let externalCalls=0;
 const collector=createTrendCollector({db,enabled:true,now:()=>INTERVAL_MS*70,
  replayTitle,fetchStreams:async()=>{externalCalls++;return streams()}});
 const a=await collector.report();
 assert.equal(a.state,'warming');
 assert.equal(externalCalls,0);
 assert.equal(db.calls.length,1);
 assert.match(db.calls[0].sql,/^SELECT /);
 assert.equal(db.calls.some(c=>/CREATE|INSERT|UPDATE|DELETE/i.test(c.sql)),false);
});
test('cold GET on absent schema fails closed without attempting repair',async()=>{
 let calls=0;
 const db={async execute(sql){calls++;assert.match(sql,/^SELECT /);
  const error=new Error('missing');error.code='ER_NO_SUCH_TABLE';throw error;}};
 const collector=createTrendCollector({db,enabled:true,replayTitle,
  fetchStreams:async()=>{throw Error('GET must not collect')}});
 const report=await collector.report();
 assert.equal(report.state,'unavailable');
 assert.equal(calls,1);
});
test('first autonomous tick initializes table, subsequent GET remains SELECT only',async()=>{
 const db=fakeDb(),collector=createTrendCollector({db,enabled:true,
  now:()=>INTERVAL_MS*72,replayTitle,fetchStreams:async()=>streams()});
 assert.equal((await collector.tick()).saved,true);
 db.calls.length=0;
 assert.equal((await collector.report()).state,'warming');
 assert.deepEqual(db.calls.map(c=>c.sql.split(' ')[0]),['SELECT']);
});
