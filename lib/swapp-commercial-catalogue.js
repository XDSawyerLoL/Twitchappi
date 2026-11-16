'use strict';
// Public commercial catalogue. This module does NOT grant premium rights,
// create a payment session, or insert advertisements into organic rankings.
const PLANS=Object.freeze([
 Object.freeze({id:'social_plus',category:'social',name:'SWAPP Social+',amountCents:599,currency:'EUR',interval:'month',badge:'glacier'}),
 Object.freeze({id:'social_premium',category:'social',name:'SWAPP Social Premium',amountCents:999,currency:'EUR',interval:'month',badge:'silver'}),
 Object.freeze({id:'creator_plus',category:'creator',name:'SWAPP Creator Plus',amountCents:1299,currency:'EUR',interval:'month'}),
 Object.freeze({id:'creator_studio',category:'creator',name:'SWAPP Creator Studio',amountCents:2499,currency:'EUR',interval:'month'}),
 Object.freeze({id:'server_discovery',category:'server_ad',name:'SERVEUR+ Découverte',amountCents:1490,currency:'EUR',durationDays:7}),
 Object.freeze({id:'server_visibility',category:'server_ad',name:'SERVEUR+ Visibilité',amountCents:3990,currency:'EUR',durationDays:30}),
 Object.freeze({id:'server_campaign',category:'server_ad',name:'SERVEUR+ Campagne',amountCents:7990,currency:'EUR',durationDays:30})
]);
function publicCatalogue(){
 return {status:'preview',checkoutEnabled:false,currency:'EUR',pricesIncludeTax:true,
  plans:PLANS.map(({id,category,name,amountCents,currency,interval,durationDays,badge})=>({
   id,category,name,amountCents,currency,...(interval?{interval}:{}),
   ...(durationDays?{durationDays}:{}),...(badge?{badge}:{}),
   available:false
  }))};
}
// A badge can only be derived from a trusted, server-side paid entitlement.
// No client-provided tier, localStorage flag or profile field is accepted.
function resolveSocialBadge(entitlement,now=Date.now()){
 if(!entitlement||typeof entitlement!=='object')return null;
 if(entitlement.source!=='verified_payment'||entitlement.status!=='active')return null;
 if(!Number.isSafeInteger(entitlement.expiresAt)||entitlement.expiresAt<=now)return null;
 if(entitlement.planId==='social_plus')return {variant:'glacier',label:'Abonné SWAPP Social+'};
 if(entitlement.planId==='social_premium')return {variant:'silver',label:'Abonné SWAPP Social Premium'};
 return null;
}
module.exports={PLANS,publicCatalogue,resolveSocialBadge};
