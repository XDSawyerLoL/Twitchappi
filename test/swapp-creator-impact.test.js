'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {installCreatorImpact,summarizeCreatorImpact}=require('../modules/swapp-creator-impact');
function setup({user={id:'owner-1',login:'streamer'},enabled=true,pool=null}={}){
 let endpoint;
 const app={get(path,...middleware){assert.equal(path,'/api/creator/impact');endpoint=middleware.at(-1)}};
 const queries=[];
 const connection=pool||{async execute(query,params){
  queries.push({query,params});
  if(query.includes('FROM swapp_fair_opportunities_daily'))return [[{placement:'home',opportunities:26}]];
  if(query.includes('GROUP BY game_name'))return [[{game_name:'The Witcher 3',impressions:14,clicks:3}]];
  return [[{placement:'game',impressions:14,clicks:3},{placement:'home',impressions:10,clicks:1}]];
 }};
 installCreatorImpact({app,lookupUser:login=>login==='streamer'?user:null,getPool:()=>connection,
  isEnabled:()=>enabled,restoreSession:async()=>{}});
 const invoke=async({login='streamer',id='owner-1',days}={})=>{
  const req={session:{oryonUser:{login,id}},query:days===undefined?{}:{days}};
  const res={headers:{},statusCode:200,headersSent:false,set(k,v){this.headers[k]=v;return this},
   status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
  await endpoint(req,res);return res;
 };
 return {invoke,queries};
}
test('A creator can read own opt-in signals and separate server proposals',async()=>{
 const {invoke,queries}=setup();
 const response=await invoke();
 assert.equal(response.statusCode,200);
 assert.equal(response.body.scope,'own_swapp_channel_only');
 assert.equal(response.body.visible.total,24);
 assert.equal(response.body.visible.clicks,4);
 assert.equal(response.body.proposals.total,26);
 assert.equal(response.body.visible.placements.find(x=>x.placement==='home').value,10);
 assert.equal(response.body.games[0].name,'The Witcher 3');
 assert.ok(queries.every(q=>q.params.length===1&&q.params[0]==='streamer'));
 assert.ok(queries.every(q=>q.query.includes('creator_login=?')&&q.query.includes('platform IN')));
 assert.equal(response.headers['Cache-Control'],'private, no-store');
});
test('Another session cannot access owner metrics or issue SQL reads',async()=>{
 const instance=setup();
 assert.equal((await instance.invoke({id:'intruder'})).statusCode,403);
 assert.equal((await instance.invoke({login:'anonymous'})).statusCode,403);
 assert.equal((await instance.invoke({login:'',id:''})).statusCode,401);
 assert.equal(instance.queries.length,0);
});
test('Period is limited to 7/14 days, switch disables collection, no made-up zeros',async()=>{
 const instance=setup({enabled:false});
 assert.equal((await instance.invoke({days:'365'})).statusCode,400);
 const body=(await instance.invoke({days:'14'})).body;
 assert.equal(body.sample,'not_collected');
 assert.equal(body.visible.collected,false);
 assert.equal(body.visible.total,null);
 assert.equal(body.proposals.total,null);
 assert.equal(instance.queries.length,0);
});
test('Absent metrics tables are non-measurement, not zero impressions',async()=>{
 const conn={async execute(){const e=Error('missing');e.code='ER_NO_SUCH_TABLE';throw e}};
 const response=await setup({pool:conn}).invoke();
 assert.equal(response.statusCode,200);
 assert.equal(response.body.sample,'not_collected');
 assert.equal(response.body.visible.collected,false);
 assert.equal(response.body.visible.total,null);
 assert.equal(response.body.proposals.collected,false);
});
test('Database failures never return fabricated analytics',async()=>{
 const response=await setup({pool:{async execute(){throw Error('down')}}}).invoke();
 assert.equal(response.statusCode,503);
 assert.equal(response.body.success,false);
});
test('Summaries never compute conversion across unrelated measurement series',()=>{
 const data=summarizeCreatorImpact({login:'s',visibleRows:[{placement:'home',impressions:'12',clicks:'2'}],
  offerRows:[{placement:'home',opportunities:'700'}],days:14});
 assert.equal(data.visible.total,12);assert.equal(data.proposals.total,700);
 assert.equal('conversionRate' in data,false);
 assert.equal(data.days,14);
});
