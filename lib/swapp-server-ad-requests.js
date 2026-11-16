'use strict';
/* Pre-payment ad request validation. Never grants an advertising placement. */
const {AD_PLANS,ALLOWED_SLOTS}=require('./swapp-server-ads');
const VALID_SERVER=/^[a-zA-Z0-9_-]{1,80}$/;
const VALID_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeCampaignRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_campaign_request');
 const planId=typeof input.planId==='string'?input.planId:'';
 if(!AD_PLANS.has(planId))throw Error('invalid_ad_plan');
 const serverId=typeof input.serverId==='string'?input.serverId.trim():'';
 if(!VALID_SERVER.test(serverId))throw Error('invalid_server_id');
 const slot=typeof input.slot==='string'?input.slot:'';
 if(!ALLOWED_SLOTS.has(slot))throw Error('invalid_ad_slot');
 const contact=typeof input.contactEmail==='string'?input.contactEmail.trim().toLowerCase():'';
 if(contact.length>254||!VALID_EMAIL.test(contact))throw Error('invalid_contact_email');
 const message=typeof input.message==='string'?input.message.trim():'';
 if(message.length>500)throw Error('invalid_campaign_message');
 return Object.freeze({planId,serverId,slot,contactEmail:contact,message,
  amountCents:AD_PLANS.get(planId).amountCents,
  durationDays:AD_PLANS.get(planId).durationDays,
  status:'pending_review',paymentVerified:false});
}
module.exports={normalizeCampaignRequest};
