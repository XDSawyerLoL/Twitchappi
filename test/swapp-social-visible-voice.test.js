'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Vocal lives in the Discord-style sidebar dock and compact mobile navigation',()=>{
 const html=read('assets/swapp-social-native/social-body.html');
 const topbar=html.split('<header class="pulse-topbar">')[1]?.split('</header>')[0]||'';
 assert.doesNotMatch(topbar,/swapp-social-voice-shortcut/);
 const sidebar=html.split('<aside class="pulse-sidebar">')[1]?.split('</aside>')[0]||'';
 assert.match(sidebar,/class="swapp-social-voice-dock"/);
 assert.match(sidebar,/class="swapp-social-voice-shortcut"/);
 assert.match(sidebar,/data-view="rooms"/);
 const side=html.split('<nav class="pulse-nav"')[1]?.split('</nav>')[0]||'';
 const mobile=html.split('<nav class="pulse-mobile-nav"')[1]?.split('</nav>')[0]||'';
 assert.equal((side.match(/data-view="/g)||[]).length,6);
 assert.equal((mobile.match(/data-view="/g)||[]).length,6);
 assert.match(side,/data-view="rooms"/);
 assert.match(mobile,/data-view="rooms"/);
});

test('real vocal controls render above the room results, not hidden beneath discussion',()=>{
 const code=read('assets/swapp-social-voice.js');
 assert.match(code,/querySelector\('#ssi-chat-panel \.ssi-panel-inner'\)/);
 assert.match(code,/container\.insertBefore\(section,container\.querySelector\('\.ssi-panel-head'\)\)/);
 assert.match(code,/id="swapp-voice-join"/);
 assert.match(code,/Rejoindre le salon/);
 assert.match(code,/getUserMedia/);
 assert.match(code,/joinButton\.addEventListener\('click'/);
 assert.doesNotMatch(code,/getUserMedia\(\).then/);
});
test('Vocal button navigates through existing SOCIAL room view and works on mobile',()=>{
 const app=read('assets/swapp-social-native/app.js');
 const views=read('assets/swapp-social-native/views.js');
 const hub=read('modules/swapp-hubs.js');
 const css=read('assets/swapp-social-appearance.css');
 assert.match(app,/closest\('button\[data-view\]'\)/);
 assert.match(views,/dataset\.socialView=view/);
 assert.match(app,/setView\('rooms','Communautés'\)/);
 assert.match(css,/\.swapp-social-voice-shortcut/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(hub,/app\.js\?v=20261021-rss-media-community-v2/);
 assert.match(hub,/swapp-social-voice\.js\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-appearance\.css\?v=20261019-no-top-gap-v3/);
});
