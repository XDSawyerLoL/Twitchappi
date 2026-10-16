'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');

test('SOCIAL ignores a delayed inbox response after switching to the game view',async()=>{
 const source=read('assets/swapp-social-native/views.js');
 const helper=source.slice(source.indexOf('let dmRefreshTimer=null'),source.indexOf('const NEWS_FEEDS=')).replace(/^export /gm,'');
 const inbox=source.slice(source.indexOf('export async function loadMessages(){'),source.indexOf('export async function loadConversation(')).replace(/^export /gm,'');
 assert.ok(helper.includes('const isCurrent='));
 let resolveReply;
 const response=new Promise(resolve=>{resolveReply=resolve});
 const social={dataset:{socialView:'home'}};
 const controls=['home','play','messages'].map(view=>({dataset:{view},classList:{toggle(){}}}));
 const dom={
  viewTitle:{textContent:''},feedTabs:{hidden:false},composer:{hidden:false},
  welcome:{hidden:false},feed:{innerHTML:''}
 };
 const state={view:'home',feed:'discover',user:{id:'u1',handle:'user'}};
 const document={
  getElementById:id=>id==='swappSocialNative'?social:
   id==='swapp-social-stories'?{hidden:false}:
   id==='swapp-social-stories-track'?{children:[]}:null,
  querySelectorAll:selector=>selector==='[data-view]'?controls:[]
 };
 const context={state,dom,document,
  api:async()=>response,requireAuth:()=>true,esc:x=>String(x),
  initials:()=>'',icon:()=>'',errorText:()=>'',setStatus:title=>{dom.feed.innerHTML=title},
  setInterval,clearInterval,Promise
 };
 vm.runInNewContext(helper+'\n'+inbox+'\nthis.runners={setView,loadMessages};',context);
 const loading=context.runners.loadMessages();
 context.runners.setView('play','Jouer');
 resolveReply({conversations:[{user:{handle:'player2',displayName:'Player'},lastMessage:{body:'bonjour'}}]});
 await loading;
 assert.equal(state.view,'play');
 assert.equal(social.dataset.socialView,'play');
 assert.ok(!dom.feed.innerHTML.includes('Messages privés'),'stale inbox must not appear on the game screen');
});

test('SOCIAL community links are delegated rather than only bound to initial DOM buttons',()=>{
 const app=read('assets/swapp-social-native/app.js');
 assert.ok(app.includes("const navigate=event.target.closest('button[data-view]')"));
 assert.ok(app.includes("else if(view==='circles')void loadCircles()"));
 assert.ok(!app.includes("document.querySelectorAll('[data-view]').forEach(function(button){"));
});

test('real game links, chats, passsports and accessibility stay connected',()=>{
 const game=read('assets/swapp-social-next.js');
 const root=read('assets/swapp-social-native/social-body.html');
 const views=read('assets/swapp-social-native/views.js');
 const css=read('assets/swapp-social-product-v3.css');
 assert.ok(game.includes("navigateTo('play');\n  void openGame"));
 assert.ok(game.includes("navigateTo('rooms');"));
 assert.ok(game.includes("navigateTo('play');void openGame(selectedGame)"));
 assert.ok(views.includes('startDMRefresh(handle,revision,state.user.id,data.messages)'));
 assert.ok(views.includes("actualPassport=(await response.json()).passport"));
 assert.ok(!views.includes('Jeux mentionnés dans les publications'));
 assert.ok(!root.includes('swapp-activities'));
 assert.ok(!root.includes('swapp-game-discovery'));
 assert.ok(css.includes('[data-social-view="messages"] .pulse-message-list'));
});

test('upstream health does not require an authenticated shadow SOCIAL user',async()=>{
 const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');
 let calls=0;
 const proxy=createSocialNativeProxy(async()=>{calls++;
  return {status:200,text:async()=>JSON.stringify({success:true})};
 },{production:true,restoreLocalSession:async()=>null,ssoSecret:''});
 let status=200,body=null;
 const res={set(){return this},status(n){status=n;return this},json(data){body=data;return this}};
 await proxy({method:'GET',path:'/health',headers:{},originalUrl:'/api/pulse/health',session:{}},res);
 assert.equal(status,200);assert.equal(calls,1);assert.deepEqual(body,{success:true});
});

test('guest read-only smoke uses the actual database readiness state',()=>{
 const smoke=read('tools/swapp-social-smoke.js');
 assert.ok(smoke.includes("database_read_ready"));
 assert.ok(smoke.includes("requires_login"));
 assert.ok(smoke.includes("upstream_social"));
 assert.ok(!smoke.includes('configured_not_verified'));
});
