'use strict';
/** SERVEUR+ advertising safety and delivery rules.
 * No sponsored entry can alter organic server rank or votes.
 * Payments must be verified by a separate signed webhook before status=active.
 */
const {PLANS}=require('./swapp-commercial-catalogue');
const AD_PLANS=new Map(PLANS.filter(p=>p.category==='server_ad').map(p=>[p.id,p]));
const ALLOWED_SLOTS=new Set(['server_category','server_discovery','site_editorial']);
const MAX_FREQUENCY_PER_DAY=3;
function validCampaign(c,now=Date.now()){
 if(!c||typeof c!=='object')return false;
 if(!AD_PLANS.has(c.planId)||c.status!=='active'||c.paymentVerified!==true||c.reviewStatus!=='approved')return false;
 if(!Number.isSafeInteger(c.startsAt)||!Number.isSafeInteger(c.endsAt)||c.startsAt>now||c.endsAt<=now)return false;
 if(c.endsAt-c.startsAt>AD_PLANS.get(c.planId).durationDays*86400000)return false;
 if(!Array.isArray(c.slots)||!c.slots.every(slot=>ALLOWED_SLOTS.has(slot)))return false;
 if(typeof c.serverId!=='string'||!/^[-_a-zA-Z0-9]{1,80}$/.test(c.serverId))return false;
 return true;
}
function selectSponsored(campaigns,{slot,now=Date.now(),impressionsToday={},seed=0}={}){
 if(!ALLOWED_SLOTS.has(slot)||!Array.isArray(campaigns))return null;
 const eligible=campaigns.filter(c=>validCampaign(c,now)&&c.slots.includes(slot)&&
  Number(impressionsToday[c.id]||0)<MAX_FREQUENCY_PER_DAY);
 if(!eligible.length)return null;
 // Deterministic rotation; no hidden pay-to-rank influence.
 const n=Number.isSafeInteger(seed)?Math.abs(seed):0;
 const chosen=eligible[n%eligible.length];
 return {id:chosen.id,serverId:chosen.serverId,label:'Publicité',sponsored:true,slot};
}
function organicResults(results){return Array.isArray(results)?results.filter(item=>!item?.sponsored):[]}
module.exports={AD_PLANS,ALLOWED_SLOTS,MAX_FREQUENCY_PER_DAY,validCampaign,selectSponsored,organicResults};
