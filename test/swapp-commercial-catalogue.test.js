'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicCatalogue,resolveSocialBadge}=require('../lib/swapp-commercial-catalogue');
test('commercial offers remain previews with checkout disabled',()=>{
 const data=publicCatalogue();
 assert.equal(data.checkoutEnabled,false);
 assert.equal(data.plans.length,7);
 assert.ok(data.plans.every(p=>p.available===false));
 assert.equal(data.plans.find(p=>p.id==='social_premium').amountCents,999);
 assert.equal(data.plans.find(p=>p.id==='server_campaign').durationDays,30);
});
test('premium badges cannot be fabricated with profile values',()=>{
 const now=1763251200000;
 assert.equal(resolveSocialBadge({planId:'social_premium',status:'active',expiresAt:now+1000},now),null);
 assert.equal(resolveSocialBadge({source:'verified_payment',planId:'social_premium',status:'past_due',expiresAt:now+1000},now),null);
 assert.equal(resolveSocialBadge({source:'verified_payment',planId:'social_premium',status:'active',expiresAt:now},now),null);
 assert.equal(resolveSocialBadge({source:'verified_payment',planId:'creator_studio',status:'active',expiresAt:now+1000},now),null);
 assert.equal(resolveSocialBadge({source:'verified_payment',planId:'social_premium',status:'active',expiresAt:now+1000},now).variant,'silver');
});
