'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {
 priceFor,membershipActive,periodEnd,originAllowed,createCreatorSubscriptions,GIFT_PRESETS
}=require('../modules/swapp-creator-subscriptions');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('presets 1/5/10/20/50/100 and server-side discount calculations',()=>{
 assert.deepEqual(GIFT_PRESETS,[1,5,10,20,50,100]);
 assert.deepEqual(priceFor(1,499),{quantity:1,unitCents:499,totalCents:499,savingsCents:0,discountPercent:0});
 assert.deepEqual(priceFor(5,499),{quantity:5,unitCents:474,totalCents:2370,savingsCents:125,discountPercent:5});
 assert.equal(priceFor(100,499).totalCents,37400);
 assert.equal(priceFor(7,499).discountPercent,5);
 for(const q of [0,-1,101,1.5,'nope'])assert.throws(()=>priceFor(q,499),/invalid_gift_price/);
});
test('an expired, canceled or payment-failed subscription grants no benefits',()=>{
 const time=1720000000000;
 for(const status of ['canceled','past_due','incomplete','refunded'])
  assert.equal(membershipActive({status,expires_at:time+10000},time),false);
 assert.equal(membershipActive({status:'active',expires_at:time-1},time),false);
 assert.equal(membershipActive({status:'cancel_pending',expires_at:time+1},time),true);
});
test('entitlements use Stripe supplied period end only',()=>{
 assert.equal(periodEnd({items:{data:[{current_period_end:1720000000}]}}),1720000000000);
 assert.equal(periodEnd({current_period_end:1730000000}),1730000000000);
 assert.equal(periodEnd({}),0);
});
test('authenticated payment mutation requires actual SWAPP origin',()=>{
 const req=(origin,host='swapp.tv')=>({get:key=>key==='origin'?origin:host});
 assert.equal(originAllowed(req('https://swapp.tv')),true);
 assert.equal(originAllowed(req('https://www.swapp.tv','www.swapp.tv')),true);
 assert.equal(originAllowed(req('https://evil.example')),false);
 assert.equal(originAllowed(req('http://swapp.tv')),false);
 assert.equal(originAllowed(req('https://swapp.tv.evil.example')),false);
 assert.equal(originAllowed(req('')),false);
});
test('all payment routes fail closed without pricing, signing secret and legal approval',()=>{
 const routes={};
 const app={
  get:(route,handler)=>{routes['GET '+route]=handler},
  post:(route,...handlers)=>{routes['POST '+route]=handlers.at(-1)}
 };
 const service=createCreatorSubscriptions({
  env:{NODE_ENV:'production',SWAPP_SUBS_ENABLED:'1',STRIPE_SECRET_KEY:'sk_test_dummy',
   SWAPP_MYSQL_URL:'mysql://user:password@localhost/swapp',
   SWAPP_SUBS_PRICE_CENTS:'499',SWAPP_SUBS_PLATFORM_PERCENT:'20',
   SWAPP_SUBS_ALLOWED_CREATORS:'sansahd'},
  stripeClient:{},
  users:()=>[{id:'owner',login:'sansahd'},{id:'viewer',login:'viewer'}]
 });
 service.register(app);
 assert.equal(service.enabled(),false);
 assert.ok(routes['GET /api/swapp/subscriptions/config']);
 assert.ok(routes['POST /api/swapp/subscriptions/stripe-webhook']);
 let httpCode=0,payload=null;
 const res={set(){return this},status(code){httpCode=code;return this},json(data){payload=data;return this}};
 return routes['POST /api/swapp/subscriptions/checkout']({
  get:key=>key==='origin'?'https://swapp.tv':key==='host'?'swapp.tv':'',
  session:{oryonUser:{id:'viewer',login:'viewer'}},
  body:{creator:'sansahd',kind:'gift',quantity:100,nonce:'0123456789abcdef'}
 },res).then(()=>{
  assert.equal(httpCode,503);
  assert.equal(payload.success,false);
 });
});
test('site mounts the storefront without replacing free follows or live alerts',()=>{
 const html=read('index.html'),server=read('server.js');
 assert.match(html,/assets\/swapp-channel-subscriptions\.js/);
 assert.match(html,/assets\/swapp-channel-subscriptions\.css/);
 assert.match(html,/assets\/swapp-channel-follow\.js/);
 assert.match(html,/assets\/swapp-live-alert-bell\.js/);
 assert.match(server,/swappCreatorSubscriptions\.register\(app,mutationLimiter\)/);
 assert.match(server,/req\.originalUrl === '\/api\/swapp\/subscriptions\/stripe-webhook'/);
 const ui=read('assets/swapp-channel-subscriptions.js');
 assert.match(ui,/crypto\.getRandomValues/);
 assert.match(ui,/swapp-subs-grid/);
 assert.doesNotMatch(ui,/localStorage/);
});

test('supporter badges and subscriber emote rights always come from the server',()=>{
 const server=read('server.js');
 const ui=read('assets/swapp-supporter-chat-badges.js');
 assert.match(server,/swappCreatorSubscriptions\.entitlement\(user\.id,room\)/);
 assert.match(server,/swappCreatorSubscriptions\.entitlement\(req\.session\?\.oryonUser\?\.id,login\)/);
 assert.match(server,/gate === 'subscriber' && hasSupporter/);
 assert.match(server,/chat-badges\/:room/);
 assert.match(server,/getNativeChat\(room\)\.slice\(-80\)/);
 assert.match(ui,/payload\.badges/);
 assert.match(ui,/swapp-supporter-chat-tag/);
 assert.match(ui,/option\.value='subscriber'/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage/);
});
