'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('stream title occupies common first grid row; video and chat share second',()=>{
 const js=read('assets/swapp-watch-experience.js');
 const css=read('assets/swapp-channel-focus-20261026.css');
 new Function(js);
 assert.match(js,/layout\.insertBefore\(header,main\)/);
 assert.match(css,/channelLiveLayout > \.swapp-watch-headline\s*\{[\s\S]*?grid-column:1\/-1!important;grid-row:1!important/);
 assert.match(css,/channelLiveLayout > \.channelMainPlayer\s*\{[\s\S]*?grid-column:1!important;grid-row:2!important/);
 assert.match(css,/channelLiveLayout > \.channelLiveSidebar\s*\{[\s\S]*?grid-column:2!important;grid-row:2!important/);
 assert.match(js,/const h=Math\.round\(width\*9\/16\)/);
 assert.doesNotMatch(js,/chat\.style\.setProperty\('translate'/);
});

test('chat points are a genuine chat quick action, not an overlay on the input',()=>{
 const js=read('assets/swapp-chat-rewards.js');
 const css=read('assets/swapp-channel-focus-20261026.css');
 new Function(js);
 assert.match(js,/const assist=pane\.querySelector\('\.chatAssist'\)/);
 assert.match(js,/\(assist\|\|form\)\.append\(container\)/);
 assert.doesNotMatch(js,/form\.append\(container\)/);
 assert.match(css,/\.swapp-rewards-anchor\s*\{[\s\S]*?position:relative!important/);
 assert.match(css,/\.swapp-rewards-drawer\s*\{[\s\S]*?bottom:calc\(100% \+ 7px\)!important/);
 assert.match(js,/swapp:channel:redeemed/);
 assert.doesNotMatch(js,/◇ 0 pts/);
});

test('hide-chat, mobile, theatre and actual 16:9 playback remain preserved',()=>{
 const css=read('assets/swapp-channel-focus-20261026.css');
 const watch=read('assets/swapp-watch-experience.css');
 const js=read('assets/swapp-watch-experience.js');
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/data-watch-theatre="on"/);
 assert.match(css,/@media\(max-width:1080px\)/);
 assert.match(watch,/aspect-ratio:16\s*\/\s*9!important/);
 assert.match(js,/data\.watchImmersion|dataset\.watchImmersion/);
 assert.doesNotMatch(css,/\.player[^{]*\{[^}]*height:\d+px!important/);
});

test('new finishing stylesheet loads last after prior channel styles',()=>{
 const html=read('index.html');
 const stylesheet='/assets/swapp-channel-focus-20261026.css?v=20261026-layout-v1';
 assert.equal(html.split(stylesheet).length-1,1);
 assert.ok(html.indexOf(stylesheet)>html.indexOf('swapp-channel-showcase.css'));
 assert.ok(html.indexOf(stylesheet)<html.indexOf('</head>'));
 assert.match(html,/swapp-watch-experience\.js\?v=20261026-grid-header-v5/);
 assert.match(html,/swapp-chat-rewards\.js\?v=20261026-social-v3/);
});
