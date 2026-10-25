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
 assert.doesNotMatch(script,/new WebSocket|socket\.emit/);
 assert.match(script,/\/api\/gifs\/search\?q=/);
 assert.match(script,/\/api\/gifs\/trending\?limit=/);
 assert.match(script,/data-swapp-avatar/);
 assert.match(style,/\.chatLog \.msg\.swapp-chat-fresh-message/);
});
test('mobile is constrained, no legacy chat v2 stylesheet cache can leak',()=>{
 assert.match(style,/@media\(max-width:680px\)/);
 assert.match(style,/grid-template-columns:minmax\(0,1fr\) 33px 29px 35px/);
 assert.match(html,/swapp-chat-v2\.css\?v=20261025-gif-grid-v2/);
 assert.match(html,/swapp-chat-v2\.js\?v=20261025-gif-grid-v2/);
 assert.match(html,/swapp-watch-experience\.css\?v=20261025-offline-title-v1/);
});

test('French moods and accents map to useful GIF search queries',()=>{
 const start=script.indexOf(' const synonyms=[');
 const end=script.indexOf('\n function initGifSearch(',start);
 assert.ok(start>0&&end>start);
 const normalize=new Function(script.slice(start,end)+'return gifQuery')();
 for(const [input,expected] of [
  ['fâché','angry'],['FACHÉ','angry'],['en colère','angry'],
  ['fâchée','angry'],['MDR','laughing'],['rire','laughing'],
  ['Bravo','applause'],['triste','crying'],['cœur','love'],
  ['surpris','shocked'],['cyberpunk','cyberpunk']
 ])assert.equal(normalize(input),expected,input);
});
test('GIF picker searches existing backend and does not affect player or chat layout',()=>{
 assert.match(script,/function initGifSearch\(panel,trigger,hideEmoji\)/);
 assert.match(script,/fetch\(url,\{cache:'no-store',signal:abort\?\.signal\}\)/);
 assert.match(script,/320\)/,'debounced typing should avoid a request per keystroke');
 assert.match(script,/seq!==sequence/,'stale requests must be discarded');
 assert.match(script,/cache\.set\(url/,'repeat terms should be cached');
 assert.match(script,/state\.selectedGif=url/,'selection uses the original native sendChat state');
 assert.match(script,/catalogue GIF non configuré/,'lack of provider must be explained');
 assert.match(script,/tray\.replaceChildren\(content\)/);
 assert.doesNotMatch(script,/new WebSocket|socket\.emit/);
 assert.doesNotMatch(style,/\.channelLiveLayout\s*\{/);
 assert.doesNotMatch(style,/grid-template-rows/);
 assert.match(style,/\.gifGrid\[data-swapp-gif-search="v1"\]/);
 assert.match(style,/max-height:min\(330px,calc\(100% - 68px\)\)/);
});

test('GIF results have fixed rows, bounded image boxes and their own scroll area',()=>{
 assert.match(style,/grid-auto-rows:112px!important/);
 assert.match(style,/grid-auto-rows:96px!important/);
 assert.match(style,/\.swapp-chat-gif-results > \.swapp-chat-gif-item/);
 assert.match(style,/max-height:112px!important/);
 assert.match(style,/position:absolute!important;inset:0!important/);
 assert.match(style,/overscroll-behavior:contain/);
});
