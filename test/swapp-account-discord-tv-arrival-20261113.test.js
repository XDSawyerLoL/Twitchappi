'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Discord Connect is in logged-in /compte overview, never the homepage navigation',()=>{
 const js=read('assets/swapp-account-discord-link.js');
 const overview={nodes:[],append(n){this.nodes.push(n)}};
 const account={
  loggedIn:false,
  querySelector(selector){
   if(selector==='[data-account-panel="overview"]')return this.loggedIn?overview:null;
   if(selector==='#swapp-account-discord')return overview.nodes.find(n=>n.id==='swapp-account-discord')||null;
   return null;
  }
 };
 const doc={
  getElementById:id=>id==='settings'?account:null,
  readyState:'complete',addEventListener(){},
  createElement(tag){return {tag,children:[],setAttribute(name,value){this[name]=value},
   append(...nodes){this.children.push(...nodes)}}}
 };
 let rerender;
 class Observer{constructor(cb){rerender=cb}observe(){}}
 new Function('document','MutationObserver','queueMicrotask',js)(doc,Observer,fn=>fn());
 assert.equal(overview.nodes.length,0,'anonymous login must not render integrations');
 account.loggedIn=true;rerender();
 assert.equal(overview.nodes.length,1);
 assert.equal(overview.nodes[0].children[2].href,'/discord');
 rerender();
 assert.equal(overview.nodes.length,1,'no repeated cards after settings rerender');
 assert.doesNotMatch(read('assets/swapp-account-menu.js'),/discord\.href='\/discord'/);
 assert.doesNotMatch(read('modules/swapp-catalogue-lab.js'),/scl-side-link">Discord Connect/);
 assert.doesNotMatch(read('assets/swapp-creator-social-shortcuts.js'),/swapp-creator-discord-config/);
 assert.match(read('index.html'),/swapp-account-discord-link\.js\?v=20261113-compte-v1/);
 assert.match(read('assets/swapp-creator-workspace.css'),/#settings \.swapp-acct-discord-integration/);
});

test('SWAPP TV starts a real source on page arrival, muted, without restarting after Stop',()=>{
 const js=read('assets/swapp-tv-broadcast.js');
 const html=require('../modules/swapp-program').page('tv');
 assert.match(js,/autoStartPending:true/);
 assert.match(js,/if\(state\.autoStartPending&&valid&&document\.visibilityState!=='hidden'\)/);
 assert.match(js,/state\.autoStartPending=false;state\.playing=item\.login/);
 assert.match(js,/state\.autoAdvance=false;state\.autoStartPending=false/);
 assert.match(js,/muted:'true'/);
 assert.match(js,/x\.media_verified!==true/);
 assert.match(html,/swapp-tv-broadcast\.js\?v=20261113-arrival-autoplay-v2/);
 assert.match(js,/const editorial=api\('\/api\/actus'\)\.catch/);
 assert.ok(js.indexOf('await refreshQueue();')<js.indexOf('const data=await editorial;'),
  'initial native or on-air stream must start before slow articles response');
});
