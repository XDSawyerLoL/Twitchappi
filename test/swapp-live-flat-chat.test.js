'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-chat-social-glass.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const chat=fs.readFileSync(path.join(__dirname,'../assets/swapp-chat-v2.js'),'utf8');
const key='#channel#channel .creatorRefine.swapp-channel-polish[data-channel-live="true"] .nativeFixedChat[data-chat="oryon"] .chatLog .msg.swapp-chat-fresh-message';
const slice=(a,b)=>css.slice(css.indexOf(a),css.indexOf(b,css.indexOf(a)+a.length));
test('ordinary native messages have no bubbles, shadows or tinted backgrounds',()=>{
 const style=slice(key+'{',key+':hover,');
 assert.match(style,/border:0!important/);
 assert.match(style,/border-radius:0!important/);
 assert.match(style,/background:transparent!important/);
 assert.match(style,/box-shadow:none!important/);
 assert.match(style,/padding:5px 5px 5px 31px!important/);
 assert.doesNotMatch(style,/linear-gradient|color-mix|border:1px/);
});
test('hover and keyboard focus do not bring message bubbles back',()=>{
 const section=slice(key+':hover,',key+'::before{');
 assert.match(section,/:focus-within/);
 assert.match(section,/border:0!important/);
 assert.match(section,/background:transparent!important/);
 assert.match(section,/border-radius:0!important/);
});
test('author initial is compact and unframed, name and badges stay native',()=>{
 const avatar=slice(key+'::before{',key+' :is(');
 assert.match(avatar,/width:19px!important/);
 assert.match(avatar,/height:19px!important/);
 assert.match(avatar,/border:0!important/);
 assert.match(avatar,/background:transparent!important/);
 assert.match(chat,/el\.classList\.add\('swapp-chat-fresh-message'\)/);
 assert.match(chat,/DO NOT move any native author, badge, message, image or socket DOM/);
});
test('special redeemed chat notices, player/chat grid and live controls remain untouched',()=>{
 assert.match(css,/\.swapp-rewards-drawer/);
 assert.match(css,/\.channelLiveLayout\{/);
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/data-watch-theatre="on"/);
 assert.doesNotMatch(css,/\.chatLog \.msg\.swapp-chat-fresh-message\{[^}]*\bheight:\s*\d+px!important/);
});
test('browser loads the flat-message CSS version, not the cached bubble style',()=>{
 assert.equal(html.split('swapp-chat-social-glass.css?v=20261026-flat-chat-v3').length-1,1);
});
