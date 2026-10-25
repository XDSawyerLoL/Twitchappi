'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=()=>fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/app.js'),'utf8');
const views=()=>fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/views.js'),'utf8');

test('first direct message opens its conversation rather than reverting to the inbox',()=>{
 const code=app();
 const start=code.indexOf("if(event.target.id==='new-message')");
 const end=code.indexOf("if(event.target.id==='conversation-form')",start);
 assert.ok(start>=0&&end>start,'both DM submission forms exist');
 const fragment=code.slice(start,end);
 assert.ok(fragment.includes("if(submit?.disabled)return"),'in-flight sends cannot be duplicated');
 assert.ok(fragment.includes("await loadConversation(handle)"),'recipient thread is shown after sending');
 assert.ok(!fragment.includes("await loadMessages()"),'do not return to the empty inbox');
});

test('private-message threads open at the latest reply and preserve drafts on polling',()=>{
 const source=views();
 const start=source.indexOf('export async function loadConversation(handle)');
 const end=source.indexOf('\nexport ',start+20);
 const fragment=source.slice(start,end>start?end:start+2300);
 assert.ok(fragment.includes("thread.scrollTop=thread.scrollHeight"),'newest messages are visible');
 assert.ok(source.includes("const list=document.querySelector('.social-dm-view .pulse-message-list')"));
 assert.ok(source.includes('list.innerHTML=renderDMMessages(messages,userId,lastNotes)'));
 assert.ok(!source.includes("document.querySelector('.social-dm-view').innerHTML="),'polling must not replace the composer');
});

test('the app and views are cache-busted together',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../modules/swapp-hubs.js'),'utf8');
 assert.match(app(),/views\.js\?v=20261025-dm-workspace-v1/);
 assert.match(server,/app\.js\?v=20261025-dm-workspace-v1/);
});

test('SOCIAL direct messages keep a side inbox while composing on desktop',()=>{
 const code=views();
 assert.match(code,/function renderDMConversationLinks\(conversations,currentHandle\)/);
 assert.match(code,/social-dm-workspace/);
 assert.match(code,/data-dm-conversations-list/);
 assert.match(code,/aria-current="true"/);
 assert.match(code,/threads\.innerHTML=html/);
 assert.match(code,/threads\?\.isConnected/);
 assert.match(code,/startDMRefresh\(handle,revision,state\.user\.id,data\.messages,notes\)/);
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-product-v3.css'),'utf8');
 assert.match(css,/\.social-dm-workspace\{/);
 assert.match(css,/grid-template-columns:minmax\(188px,29%\) minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:1120px\)/);
 assert.match(app(),/data-conversation/);
});
test('SOCIAL polling refuses concurrent stale requests and preserves draft input',()=>{
 const code=views();
 assert.match(code,/dmRefreshInFlight=false,dmRefreshGeneration=0/);
 assert.match(code,/if\(dmRefreshInFlight\|\|generation!==dmRefreshGeneration/);
 assert.match(code,/dmRefreshInFlight=true/);
 assert.match(code,/if\(generation===dmRefreshGeneration\)dmRefreshInFlight=false/);
 assert.match(code,/document\.visibilityState==='hidden'/);
 assert.match(code,/list\.innerHTML=renderDMMessages\(messages,userId,lastNotes\)/);
 assert.doesNotMatch(code,/document\.querySelector\('\.social-dm-view'\)\.innerHTML=/);
});
