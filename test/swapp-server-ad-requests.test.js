'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeCampaignRequest}=require('../lib/swapp-server-ad-requests');
const request={planId:'server_visibility',serverId:'123',slot:'server_discovery',contactEmail:' Example@Example.org ',message:'Notre serveur'};
test('request uses server-side price and cannot grant payment or approval',()=>{
 const result=normalizeCampaignRequest({...request,amountCents:1,paymentVerified:true,status:'active'});
 assert.equal(result.amountCents,3990);
 assert.equal(result.durationDays,30);
 assert.equal(result.status,'pending_review');
 assert.equal(result.paymentVerified,false);
 assert.equal(result.contactEmail,'example@example.org');
});
test('invalid plans, slots, identities and excessive copy are rejected',()=>{
 for(const change of [{planId:'social_plus'},{serverId:'../x'},{slot:'organic_rank'},{contactEmail:'invalid'},{message:'x'.repeat(501)}]){
  assert.throws(()=>normalizeCampaignRequest({...request,...change}),/invalid_/);
 }
});
