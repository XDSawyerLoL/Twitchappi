'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServerAdsStore}=require('../modules/swapp-server-ads-store');
const now=1763251200000;
test('MySQL sponsored inventory filters unpaid and unreviewed campaigns',async()=>{
 const rows=[
  {id:'a',server_id:'community-a',plan_id:'server_discovery',status:'active',payment_verified:1,review_status:'approved',starts_at:now-1000,ends_at:now+86400000,slots_json:'["server_category"]'},
  {id:'b',server_id:'community-b',plan_id:'server_discovery',status:'active',payment_verified:0,review_status:'approved',starts_at:now-1000,ends_at:now+86400000,slots_json:'["server_category"]'},
  {id:'c',server_id:'community-c',plan_id:'server_discovery',status:'active',payment_verified:1,review_status:'approved',starts_at:now-1000,ends_at:now+86400000,slots_json:'not-json'}
 ];
 const calls=[];
 const store=createServerAdsStore({uri:'mysql://example',clock:()=>now,mysqlFactory:{createPool:()=>({
  query:async sql=>{calls.push(sql);return[]},
  execute:async(sql,args)=>{calls.push([sql,args]);return[rows]}
 })}});
 assert.deepEqual((await store.eligible('server_category')).map(c=>c.id),['a']);
 assert.equal((await store.pick('server_category')).serverId,'community-a');
 assert.equal(await store.pick('organic_rank'),null);
 assert.equal(calls[0].includes('CREATE TABLE IF NOT EXISTS'),true);
});
test('missing database config fails closed',()=>{
 assert.throws(()=>createServerAdsStore({uri:''}),/not_configured/);
});
