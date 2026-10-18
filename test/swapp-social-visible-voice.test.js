'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Vocal shortcut is always present in the sticky SOCIAL topbar',()=>{
 const html=read('assets/swapp-social-native/social-body.html');
 const topbar=html.split('<header class="pulse-topbar">')[1]?.split('</header>')[0]||'';
 assert.match(topbar,/class="swapp-social-voice-shortcut"/);
 assert.match(topbar,/data-view="rooms"/);
 assert.match(topbar,/>Vocal<\/span>/);
 assert.match(topbar,/aria-label="Accéder aux salons vocaux de SOCIAL"/);
 // Preserves five primary navigation destinations, not a new menu item.
 const side=html.split('<nav class="pulse-nav"')[1]?.split('</nav>')[0]||'';
 const mobile=html.split('<nav class="pulse-mobile-nav"')[1]?.split('</nav>')[0]||'';
 for(const menu of [side,mobile]){
  assert.equal((menu.match(/data-view="/g)||[]).length,5);
  assert.doesNotMatch(menu,/data-view="rooms"/);
 }
});
test('real vocal controls render above the room results, not hidden beneath discussion',()=>{
 const code=read('assets/swapp-social-voice.js');
 assert.match(code,/querySelector\('#ssi-chat-panel \.ssi-panel-inner'\)/);
 assert.match(code,/container\.insertBefore\(section,container\.querySelector\('\.ssi-panel-head'\)\)/);
 assert.match(code,/id="swapp-voice-join"/);
 assert.match(code,/Rejoindre le vocal/);
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
 assert.match(views,/Salons vocaux/);
 assert.match(css,/\.swapp-social-voice-shortcut/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(hub,/app\.js\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-voice\.js\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-appearance\.css\?v=20261018-voice-visible-v2/);
});
