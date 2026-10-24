'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('live Pulse is a player overlay with the original server-side reaction pipeline',()=>{
 const js=read('assets/swapp-live-hearts.js');
 new Function(js);
 assert.match(js,/\.premiumPlayer/);
 assert.match(js,/window\.sendPulseLive\(type,origin\)/);
 assert.doesNotMatch(js,/fetch\(|\/api\/pulse\/live/,'do not duplicate the existing Pulse API');
 assert.match(js,/data-pulse-count/,'preserve legacy and server-updated counter');
 assert.match(js,/aria-label','Envoyer un cœur/);
 assert.match(js,/document\.createElement\('button'\)|create\('button'/);
 assert.match(js,/data-swapp-heart-ui/);
});
test('Pulse dock disappears only when integrated control has mounted',()=>{
 const css=read('assets/swapp-live-hearts.css');
 assert.match(css,/\[data-swapp-heart-ui="1"\] \+ \.pulseDock/);
 assert.match(css,/\.swapp-heart-picker\[hidden\]/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:680px/);
});
test('player reactions load after original channel and Pulse scripts without changing HLS player',()=>{
 const html=read('index.html');
 assert.match(html,/swapp-live-hearts\.css\?v=/);
 assert.match(html,/swapp-live-hearts\.js\?v=/);
 assert.ok(html.indexOf('/index_script.js')<html.indexOf('swapp-live-hearts.js'));
 assert.ok(html.indexOf('swapp-channel-mosaic.js')<html.indexOf('swapp-live-hearts.js'));
});
