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
 assert.doesNotMatch(js,/sessionStorage/,'a previous hidden chat preference must not survive a fresh watch session');
 assert.match(js,/const mode=\{theatre:'off',chat:'shown'\}/);
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

test('main creator viewer is the only active player on its own channel',()=>{
 const script=read('index_script.js');
 assert.match(script,/if\(state\.view==='channel'\)\{host\?\.remove\(\);return\}/,
  'mini player must be removed rather than covering the active channel');
 assert.match(script,/player\.style\.setProperty\('aspect-ratio','16\/9','important'\)/);
 assert.doesNotMatch(script,/const h = clamp\(420, Math\.min\(natural, available\), 760\)/,
  'remove forced height which distorts the player');
});
test('one stable grid and unhidden chat are the default on a live channel',()=>{
 const css=read('assets/swapp-watch-experience.css');
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(286px,336px\)/);
 assert.match(css,/#oryonMiniPlayer\{display:none!important\}/);
 assert.match(css,/aspect-ratio:16\/9!important/);
 const js=read('assets/swapp-watch-experience.js');
 assert.match(js,/chat:'shown'/);
 assert.doesNotMatch(js,/sessionStorage/);
});

test('public channel has early recovery independent from the large application script',()=>{
 const html=read('index.html');
 const early=read('assets/swapp-watch-early-recovery.js');
 new Function(early);
 assert.ok(html.indexOf('/assets/swapp-watch-early-recovery.js')>0);
 assert.ok(html.indexOf('/assets/swapp-watch-early-recovery.js')<html.indexOf('/index_script.js'));
 assert.match(early,/segment_count/);
 assert.match(early,/boot\.replaceChildren\(outer\)/);
 assert.match(early,/controller\.abort\(\)/);
 assert.match(early,/Ouvrir le direct/);
});
