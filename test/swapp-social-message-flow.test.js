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
 assert.match(app(),/views\.js\?v=20261018-channel-ux-v1/);
 assert.match(server,/app\.js\?v=20261019-service-health-v1/);
});
