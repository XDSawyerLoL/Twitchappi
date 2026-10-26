'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');

test('native player and chat remain aligned within a single surface',()=>{
 const css=read('assets/swapp-chat-social-glass.css');
 const previous=read('assets/swapp-watch-experience.js');
 assert.match(css,/\.channelLiveLayout\s*\{[\s\S]*?column-gap:0!important;row-gap:0!important/);
 assert.match(css,/\.channelLiveLayout > \.channelMainPlayer\s*\{[\s\S]*?grid-column:1!important;grid-row:2!important/);
 assert.match(css,/\.channelLiveLayout > \.channelLiveSidebar\s*\{[\s\S]*?grid-column:2!important;grid-row:2!important/);
 assert.match(previous,/const h=Math\.round\(width\*9\/16\)/);
 assert.doesNotMatch(css,/new Hls|MediaSource|new WebSocket|RTCPeerConnection/);
 assert.doesNotMatch(css,/aspect-ratio:4\/3|height:100vh!important/);
});

test('points are called pts de chaîne by default and spending remains real',()=>{
 const rewards=read('assets/swapp-chat-rewards.js');
 const audience=read('assets/swapp-channel-audience.js');
 const followers=read('assets/swapp-channel-followers.js');
 new Function(rewards);
 for(const source of [rewards,audience,followers])assert.match(source,/pts de chaîne/i);
 assert.match(rewards,/toLocaleString\('fr-FR'\)\+' pts de chaîne'/);
 assert.match(rewards,/api\/swapp\/channel-rewards/);
 assert.match(rewards,/\(assist\|\|form\)\.append\(container\)/);
 assert.doesNotMatch(rewards,/crypto\.randomUUID\(\).*fake|points:\s*99999/);
});

test('chat signalement and real moderation are grouped without breaking actions',()=>{
 const src=read('assets/swapp-chat-social.js');
 const css=read('assets/swapp-chat-social-glass.css');
 new Function(src);
 assert.match(src,/reportCandidate\(sidebar\)/);
 assert.match(src,/original\.click\(\)/);
 assert.match(src,/\.swapp-mod-open/);
 assert.match(src,/swapp-social-hidden-report/);
 assert.match(src,/Outils de modération/);
 assert.match(css,/\.swapp-social-hidden-report,/);
 assert.match(css,/\.swapp-mod-open\{\s*display:none!important/);
 assert.doesNotMatch(src,/\.remove\(\)|\.replaceChildren\(\)/);
});

test('expressive reactions compose text using native send, no ghost socket messages',()=>{
 const js=read('assets/swapp-chat-social.js');
 const css=read('assets/swapp-chat-social-glass.css');
 assert.match(js,/setRangeText\(value,a,b,'end'\)/);
 assert.match(js,/input\.dispatchEvent\(new Event\('input'/);
 assert.match(js,/Mes pts de chaîne|Outils de modération|Mode discret/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(js,/socket\.emit|innerHTML=|new WebSocket/);
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/data-watch-theatre="on"/);
 assert.match(css,/@media\(max-width:1080px\)/);
});

test('social glass style is the last channel stylesheet and JS runs after original modules',()=>{
 const html=read('index.html');
 assert.equal(html.split('swapp-chat-social-glass.css?v=20261026-attached-v1').length-1,1);
 assert.equal(html.split('swapp-chat-social.js?v=20261026-attached-v1').length-1,1);
 assert.ok(html.indexOf('swapp-chat-social-glass.css')>html.indexOf('swapp-channel-focus-20261026.css'));
 assert.ok(html.indexOf('swapp-chat-social.js')>html.indexOf('swapp-chat-rewards.js'));
 assert.ok(html.indexOf('swapp-chat-social.js')>html.indexOf('swapp-chat-moderation.js'));
});
