'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function navigationHarness(){
 const source=read('assets/swapp-social-native/views.js');
 const from=source.indexOf('export function setView(');
 const end=source.indexOf('const NEWS_FEEDS',from);
 assert.ok(from>=0&&end>from,'The view controller is present');
 const setViewSource=source.slice(from,end).replace('export function','function');
 const active=new Set();
 const nodes=['home','play','rooms','explore','circles','notifications','messages','saved','profile'].map(view=>({
  dataset:{view},
  classList:{toggle(name,on){assert.equal(name,'active');if(on)active.add(view);else active.delete(view)}}
 }));
 const tabNodes=['following','discover','news'].map(feed=>({
  dataset:{feed},classList:{toggle(){}},setAttribute(){}
 }));
 const social={dataset:{socialView:'home'}};
 const dom={viewTitle:{textContent:''},feedTabs:{hidden:false},composer:{hidden:false},welcome:{hidden:false}};
 const state={view:'home',feed:'discover',user:{id:'u1'}};
 const stories={hidden:false};
 const document={
  getElementById:id=>({
   swappSocialNative:social,'swapp-social-stories':stories,
   'swapp-social-stories-track':{children:[{}]}
  })[id],
  querySelectorAll:sel=>sel==='[data-view]'?nodes:sel==='.pulse-tab'?tabNodes:[]
 };
 const sandbox={state,dom,document};
 vm.runInNewContext(setViewSource+'\nthis.setView=setView;',sandbox);
 return {setView:sandbox.setView,state,dom,social,active};
}

test('SOCIAL messages and other views never keep the home feature dashboard selected',()=>{
 const t=navigationHarness();
 for(const name of ['messages','explore','play','rooms','profile','home']){
  t.setView(name,name);
  assert.equal(t.social.dataset.socialView,name);
  assert.deepEqual([...t.active],[name]);
  assert.equal(t.dom.feedTabs.hidden,name!=='home');
  assert.equal(t.dom.composer.hidden,name!=='home');
 }
});

test('SOCIAL main, play, rooms and messages are independent navigable destinations',()=>{
 const html=read('assets/swapp-social-native/social-body.html');
 const css=read('assets/swapp-social-product-v3.css');
 const app=read('assets/swapp-social-native/app.js');
 for(const name of ['play','rooms']){
  assert.match(read('assets/swapp-social-native/views.js'),new RegExp('data-view="'+name+'"'));
  assert.ok(app.includes("setView('"+name+"'"));
  assert.ok(css.includes('[data-social-view="'+name+'"] .swapp-interactive:not([hidden])'));
 }
 assert.match(css,/#swappSocialNative \.swapp-interactive\{display:none!important\}/);
 assert.match(css,/\[data-social-view="play"\] :is\(#ssi-room-panel,#ssi-chat-panel\)/);
 assert.match(css,/\[data-social-view="rooms"\] :is\(#ssn-passport,#ssn-universe,#ssi-match-panel,#ssi-poll-panel\)/);
 assert.match(css,/\[data-social-view="messages"\] \.pulse-message-list/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('SOCIAL messenger back navigation, production CSS order and no new auth flow',()=>{
 const views=read('assets/swapp-social-native/views.js');
 const app=read('assets/swapp-social-native/app.js');
 const hub=read('modules/swapp-hubs.js');
 assert.match(views,/data-social-back-messages/);
 assert.match(app,/if\(event.target.closest\('\[data-social-back-messages\]'\)\)\{loadMessages\(\);return;\}/);
 assert.match(hub,/swapp-social-product-v3\.css\?v=20261018-direct-audio-v3/);
 assert.match(hub,/app\.js\?v=20261018-direct-audio-v1/);
 assert.ok(hub.indexOf('swapp-social-product-v3.css')>hub.indexOf('swapp-social-next.css'),'newest design loaded last');
 assert.ok(!htmlRegexNewAuth(hub),'No added SOCIAL login form or separate authentication');
});
function htmlRegexNewAuth(hub){return /<form[^>]+social-v3-auth/.test(hub)}
