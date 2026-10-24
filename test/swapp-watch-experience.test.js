'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('live theatre and chat controls keep the existing HLS and chat transports',()=>{
 const js=read('assets/swapp-watch-experience.js');
 new Function(js);
 assert.match(js,/data-channel-live="true"/);
 assert.match(js,/swapp-watch-theatre-btn/);
 assert.match(js,/swapp-watch-chat-btn/);
 assert.match(js,/aria-expanded/);
 assert.match(js,/sessionStorage/);
 assert.doesNotMatch(js,/new Hls\(|MediaSource|WebSocket|socket\.emit|innerHTML\s*=\s*.*iframe/);
});
test('live style puts video first and theatre hides chrome without removing chat messages',()=>{
 const css=read('assets/swapp-watch-experience.css');
 assert.match(css,/\.channelLiveLayout/);
 assert.match(css,/data-watch-theatre="on"/);
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/\.chatLog\s*\{display:none/);
});
test('creator route boot fallback checks active HLS before offering player',()=>{
 const js=read('assets/swapp-watch-experience.js');
 assert.match(js,/setTimeout\(async\(\)=>/);
 assert.match(js,/data\.active===true&&data\.segment_count>0/);
 assert.match(js,/\/api\/oryon\/local-relay\//);
 assert.match(js,/boot\.isConnected/);
 assert.match(js,/document\.getElementById\('channel'\)\?\.querySelector\('\.creatorRefine'\)/);
 assert.match(js,/Réessayer/);
});
test('channel loads watch refinements after original player and Pulse enhancements',()=>{
 const html=read('index.html');
 assert.match(html,/swapp-watch-experience\.css\?v=/);
 assert.match(html,/swapp-watch-experience\.js\?v=/);
 assert.ok(html.indexOf('/index_script.js')<html.indexOf('swapp-watch-experience.js'));
 assert.ok(html.indexOf('swapp-live-hearts.js')<html.indexOf('swapp-watch-experience.js'));
});
