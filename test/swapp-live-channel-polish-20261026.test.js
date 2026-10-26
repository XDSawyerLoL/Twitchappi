'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('creator broadcast has one heading with game and owner edit',()=>{
 const watch=read('assets/swapp-watch-experience.js');
 const studio=read('assets/swapp-browser-studio.js');
 new Function(watch);new Function(studio);
 assert.match(watch,/swapp-watch-live-category/);
 assert.match(watch,/swapp-watch-edit/);
 assert.match(studio,/editLive:\(\)=>openEditor\(\)/);
 assert.match(studio,/obsolete\.remove\(\)/);
 assert.match(studio,/swapp-watch-live-title/);
 assert.match(studio,/swapp-watch-live-category/);
});
test('SWAPP metadata category suggests official Twitch names using existing server search',()=>{
 const studio=read('assets/swapp-browser-studio.js');
 assert.match(studio,/\/api\/categories\/search\?q=/);
 assert.match(studio,/document\.createElement\('datalist'\)/);
 assert.match(studio,/bindTwitchCategories\(category\)/);
 assert.match(studio,/bindTwitchCategories\(catField\)/);
});
test('Pulse is placed where visible and only attached to a live channel',()=>{
 const js=read('assets/swapp-live-hearts.js');
 const css=read('assets/swapp-live-hearts.css');
 assert.match(js,/iframe\[src\*="\/api\/oryon\/local-relay\/"\]/);
 assert.match(css,/top:62px!important;bottom:auto!important/);
 assert.match(css,/z-index:90!important/);
});
test('no scroll-dependent dimensions or chat translations',()=>{
 const watch=read('assets/swapp-watch-experience.js');
 const css=read('assets/swapp-watch-experience.css');
 assert.doesNotMatch(watch,/chat\.style\.setProperty\('translate'/);
 assert.doesNotMatch(watch,/const baselineTop=/);
 assert.match(css,/aspect-ratio:16\/9!important/);
 assert.match(css,/transform:none!important;translate:none!important/);
});
test('French HLS captions toggle only appears when a real French track exists',()=>{
 const html=read('local-agent/player.html');
 assert.match(html,/id="captions"[^>]+hidden/);
 assert.match(html,/v\.textTracks/);
 assert.match(html,/french\.length===0/);
 assert.match(html,/frenchCaptionsEnabled/);
 assert.doesNotMatch(html,/SpeechRecognition|webkitSpeechRecognition/);
});
