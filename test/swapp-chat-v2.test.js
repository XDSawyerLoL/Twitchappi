'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
const script=read('assets/swapp-chat-v2.js');
const style=read('assets/swapp-chat-v2.css');
const html=read('index.html');

test('native panel grid, player sync and message DOM are never restructured',()=>{
 new Function(script);
 assert.match(script,/form\.appendChild\(picker\)/);
 assert.match(script,/DO NOT move any native author/);
 assert.match(script,/panel\.dataset\.swappChatUi='stable'/);
 assert.doesNotMatch(script,/picker\.appendChild\(custom\)/);
 assert.doesNotMatch(script,/message\.append\(avatar,body\)/);
 assert.doesNotMatch(script,/body\.appendChild\(child\)/);
 assert.doesNotMatch(style,/grid-template-rows/);
 assert.doesNotMatch(style,/\.channelLiveLayout\s*\{/);
 assert.doesNotMatch(style,/\.channelLiveSidebar\s*\{/);
 assert.match(style,/position:absolute!important/);
 assert.match(style,/\.swapp-chat-stable-picker\[hidden\]/);
 assert.match(style,/\.gifGrid\.hidden/);
});
test('standard emoji is inserted at cursor without gluing adjacent words',()=>{
 const start=script.indexOf(' function insert(');
 const end=script.indexOf('\n function enhance(',start);
 assert.ok(start>0&&end>start);
 const fn=new Function('Event',script.slice(start,end)+'return insert')(
  class Event{constructor(type){this.type=type}});
 let events=0;
 const input={value:'Salut monde',selectionStart:6,selectionEnd:6,
  setRangeText(str,start,end){this.value=this.value.slice(0,start)+str+this.value.slice(end)},
  dispatchEvent(e){if(e.type==='input')events++},focus(){}
 };
 fn(input,'😀');
 assert.equal(input.value,'Salut 😀 monde');
 assert.equal(events,1);
});
test('GIF provider and message transport remain original, channel emotes are copied not moved',()=>{
 assert.match(script,/panel\.querySelector\('#customEmoteShelf'\)/);
 assert.match(script,/window\.renderEmoteShelf/);
 assert.match(script,/grid\.innerHTML=original\?\.innerHTML/);
 assert.match(script,/button\[onclick\*="toggleGifs"\]/);
 assert.match(script,/button\[onclick\*="sendChat"\]/);
 assert.doesNotMatch(script,/send\.removeAttribute\('onclick'\)/);
 assert.doesNotMatch(script,/new WebSocket|socket\.emit|fetch\(/);
 assert.match(script,/data-swapp-avatar/);
 assert.match(style,/\.chatLog \.msg\.swapp-chat-fresh-message/);
});
test('mobile is constrained, no legacy chat v2 stylesheet cache can leak',()=>{
 assert.match(style,/@media\(max-width:680px\)/);
 assert.match(style,/grid-template-columns:minmax\(0,1fr\) 33px 29px 35px/);
 assert.match(html,/swapp-chat-v2\.css\?v=20261025-chat-stability-v3/);
 assert.match(html,/swapp-chat-v2\.js\?v=20261025-chat-stability-v3/);
 assert.match(html,/swapp-watch-experience\.css\?v=20261025-immersion-93-v2/);
});
