'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=load('assets/swapp-chat-v2.js');
const css=load('assets/swapp-chat-v2.css');
const html=load('index.html');

test('emoji UI preserves native chat send, the existing GIF provider and creator emotes',()=>{
 new Function(js);
 assert.match(js,/swapp-chat-emoji-picker/);
 assert.match(js,/Sourires/);
 assert.match(js,/Réactions/);
 assert.match(js,/Cœurs/);
 assert.match(js,/Gaming/);
 assert.match(js,/renderEmoteShelf\(\)/);
 assert.match(js,/\.emoteBtn:not\(\.locked\)/);
 assert.match(js,/\.gifGrid|#gifGrid/);
 assert.match(js,/sendButton\.classList\.add/);
 assert.doesNotMatch(js,/sendButton\.removeAttribute\('onclick'\)/);
 assert.doesNotMatch(js,/new WebSocket|socket\.emit|\/api\/gifs\/search|fetch\(/,
  'UI enhancement must never replace the existing chat or GIF service');
});

test('emoji insertion respects the current selection and separates surrounding words',()=>{
 const start=js.indexOf(' function appendEmoji(');
 const end=js.indexOf('\n function enhance(',start);
 assert.ok(start>=0&&end>start,'cursor insertion helper missing');
 const insert=new Function('Event',js.slice(start,end)+'return appendEmoji')(
  class Event{constructor(type){this.type=type}});
 let fired=0,focused=0;
 const input={
  value:'Bonjour monde',selectionStart:8,selectionEnd:8,
  setRangeText(word,start,end){this.value=this.value.slice(0,start)+word+this.value.slice(end)},
  dispatchEvent(event){if(event.type==='input')fired++},
  focus(){focused++}
 };
 insert(input,'😀');
 assert.equal(input.value,'Bonjour 😀 monde');
 assert.equal(fired,1);
 assert.equal(focused,1);
 input.value='';input.selectionStart=0;input.selectionEnd=0;
 insert(input,'❤️');
 assert.equal(input.value,'❤️','empty input has no unwanted spaces');
});

test('messages retain original author, timestamp, media and native event lifecycle',()=>{
 assert.match(js,/for\(const child of Array\.from\(message\.childNodes\)\)body\.appendChild\(child\)/);
 assert.match(js,/message\.append\(avatar,body\)/);
 assert.match(js,/dataset\.swappChatMessage='v2'/);
 assert.match(js,/MutationObserver\(queue\)/);
 assert.match(css,/\.swapp-chat-message-body/);
 assert.match(css,/--swapp-message-accent/);
 assert.match(css,/\.chatLog \.msg\.swapp-chat-message/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('compact GIF button and emoji picker fit alongside the native chat input on mobile',()=>{
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 33px 33px 35px/);
 assert.match(css,/\.swapp-chat-gif-button/);
 assert.match(css,/\.swapp-chat-gif-tray/);
 assert.match(css,/\.swapp-chat-emoji-picker\[hidden\]/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(js,/setAttribute\('aria-expanded'/);
 assert.match(html,/swapp-chat-v2\.css\?v=/);
 assert.match(html,/swapp-chat-v2\.js\?v=/);
 assert.ok(html.indexOf('swapp-watch-experience.js')<html.indexOf('swapp-chat-v2.js'));
});
