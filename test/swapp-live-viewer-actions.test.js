'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const source=read('assets/swapp-live-viewer-actions.js');
const css=read('assets/swapp-live-viewer-actions.css');
const html=read('index.html');
const follow=read('assets/swapp-channel-follow.js');
const bell=read('assets/swapp-live-alert-bell.js');
const server=read('server.js');
const {subscriptionState,installChannelSubscriptionStatus}=require('../modules/swapp-channel-subscription-status');

test('Suivre, cloche and S abonner live next to the actual live player headline, not in a new card',()=>{
 new Function(source);
 assert.match(source,/\.channelLiveLayout > \.swapp-watch-headline/);
 assert.match(source,/\.swapp-live-viewer-actions/);
 assert.match(source,/toolbar\.prepend\(follow\)/);
 assert.match(source,/toolbar\.append\(bell\)/);
 assert.match(source,/toolbar\.append\(subscribe\)/);
 assert.match(source,/follow\?\.dataset\.swappFollowBound==='true'/);
 assert.doesNotMatch(source,/cloneNode\(|\.innerHTML\s*=|\.channelMainPlayer\.append/);
 assert.match(css,/\.swapp-live-viewer-actions/);
 assert.match(css,/@media\(max-width:740px\)/);
});
test('Native follow and Push scanning remain valid once buttons leave the hero',()=>{
 assert.match(follow,/\.channelActionDock button\[onclick\*="followOryon"\],\.swapp-channel-follow-btn/);
 assert.match(follow,/request\(path,following\?'DELETE':'POST'\)/);
 assert.match(bell,/page\.querySelector\('\.swapp-channel-follow-btn'\)/);
 assert.match(bell,/Notification\.requestPermission\(\)/);
 assert.match(bell,/swapp\/live-alerts\/enable/);
});
test('Paid subscribe button is visible but never claims an unverified transaction',()=>{
 const state=subscriptionState('vnhz');
 assert.equal(state.creator,'vnhz');
 assert.equal(state.available,false);
 assert.equal(state.checkout_enabled,false);
 assert.equal(state.active_subscription,false);
 assert.equal(state.monthly_price_eur,null);
 assert.equal(state.public_stream_free,true);
 assert.match(source,/S'abonner/);
 assert.match(source,/Bientôt/);
 assert.match(source,/api\/swapp\/channel-subscriptions/);
 assert.doesNotMatch(source,/checkout\.redirectToCheckout|window\.Stripe|paymentIntent|localStorage\.setItem/);
 const app={routes:{},get(route,fn){this.routes[route]=fn}};
 installChannelSubscriptionStatus({app});
 const req={params:{login:'VNHZ'}};
 const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},
  status(n){this.statusCode=n;return this},json(result){this.body=result;return this}};
 app.routes['/api/swapp/channel-subscriptions/:login/status'](req,res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.checkout_enabled,false);
 assert.equal(res.headers['Cache-Control'],'no-store');
 assert.match(server,/installChannelSubscriptionStatus\(\{app\}\)/);
 const bad={params:{login:'@bad!'}};
 app.routes['/api/swapp/channel-subscriptions/:login/status'](bad,res);
 assert.equal(res.statusCode,400);
});
test('Assets load with separate versions, and only a single subscription button is produced per page',()=>{
 assert.match(html,/swapp-live-viewer-actions\.css\?v=20261026-viewer-actions-v1/);
 assert.match(html,/swapp-live-viewer-actions\.js\?v=20261026-viewer-actions-v1/);
 assert.match(html,/swapp-channel-follow\.js\?v=20261026-follow-near-player-v2/);
 assert.match(html,/swapp-live-alert-bell\.js\?v=20261026-push-near-player-v2/);
 assert.ok(html.indexOf('swapp-live-viewer-actions.js')>html.indexOf('swapp-live-alert-bell.js'));
 assert.ok(html.indexOf('swapp-live-viewer-actions.css')>html.indexOf('swapp-channel-atmosphere.css'));
 assert.match(source,/page\.querySelector\('\.swapp-live-subscribe-button'\)/);
 assert.match(source,/if\(button\)return button/);
});
test('No player, chat or OBS sizing/pipeline is altered by this patch',()=>{
 assert.doesNotMatch(css,/\.channelMainPlayer[^{]*\{[^}]*height:|\.chatPanel[^{]*\{[^}]*height:/);
 assert.doesNotMatch(source,/new Hls|MediaSource|RTCPeerConnection|new WebSocket/);
 assert.match(css,/flex-wrap:wrap!important/);
 assert.match(css,/background:var\(--channel-accent/);
});
