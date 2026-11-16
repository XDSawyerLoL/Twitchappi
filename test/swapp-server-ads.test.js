'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validCampaign,selectSponsored,organicResults}=require('../lib/swapp-server-ads');
const now=1763251200000;
const campaign={id:'campaign-1',serverId:'community-7',planId:'server_discovery',
 status:'active',paymentVerified:true,reviewStatus:'approved',
 startsAt:now-1000,endsAt:now+86400000,slots:['server_category']};
test('paid ads require verified payment, approval, valid dates and inventory',()=>{
 assert.equal(validCampaign(campaign,now),true);
 for(const patch of [{paymentVerified:false},{reviewStatus:'pending'},{status:'pending'},{endsAt:now},{planId:'social_plus'},{slots:['organic_rank']},{serverId:'<script>'}]){
  assert.equal(validCampaign({...campaign,...patch},now),false,JSON.stringify(patch));
 }
});
test('frequency cap and explicit sponsored labelling',()=>{
 assert.equal(selectSponsored([campaign],{slot:'server_category',now,impressionsToday:{'campaign-1':3}}),null);
 assert.deepEqual(selectSponsored([campaign],{slot:'server_category',now,seed:0}),
  {id:'campaign-1',serverId:'community-7',label:'Publicité',sponsored:true,slot:'server_category'});
 assert.equal(selectSponsored([campaign],{slot:'organic_rank',now}),null);
});
test('organic results never include sponsored entries',()=>{
 const list=[{id:'a',rank:1},{id:'ad',sponsored:true,rank:0},{id:'b',rank:2}];
 assert.deepEqual(organicResults(list).map(x=>x.id),['a','b']);
});
