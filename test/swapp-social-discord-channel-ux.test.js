'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('a single voice area sits in the same main pane as chat, not inside the room sidebar',()=>{
 const ui=read('assets/swapp-social-voice.js');
 assert.match(ui,/querySelector\('#ssi-chat-panel \.ssi-panel-inner'\)/);
 assert.match(ui,/container\.insertBefore\(section,container\.querySelector\('\.ssi-panel-head'\)\)/);
 assert.doesNotMatch(ui,/querySelector\('#ssi-room-panel \.ssi-panel-inner'\)/);
 assert.match(ui,/id="swapp-voice-peers"/);
 assert.match(ui,/id="swapp-voice-join"/);
});
test('rooms are clearly selectable audio channels with text attached, not duplicate networks',()=>{
 const interactions=read('assets/swapp-social-interactions.js');
 assert.match(interactions,/id="ssi-room-results"/);
 assert.match(interactions,/id="ssi-chat-body"/);
 assert.match(interactions,/class="ssi-room-voice-icon"/);
 assert.match(interactions,/Vocal et texte/);
 assert.match(interactions,/aria-pressed="\$\{r\.id===activeRoom\}"/);
 assert.match(interactions,/Discussion écrite/);
 assert.match(interactions,/detail:\{id,name:item\.name,game:item\.game\}/);
 assert.doesNotMatch(interactions,/Math\.random\(/);
});
test('the member must explicitly join before the microphone is requested',()=>{
 const ui=read('assets/swapp-social-voice.js');
 assert.match(ui,/joinButton\.addEventListener\('click',\(\)=>\{void join\(\)\}\)/);
 assert.match(ui,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(ui,/joinButton\.disabled=busy\|\|!selectedRoom/);
 assert.match(ui,/Réactiver le micro/);
 assert.match(ui,/Couper le son/);
 assert.match(ui,/Rétablir le son/);
});
test('mobile channels scroll horizontally and selection jumps into the voice pane',()=>{
 const ui=read('assets/swapp-social-interactions.js');
 const css=read('assets/swapp-social-voice-premium.css');
 assert.match(ui,/event\.isTrusted/);
 assert.match(ui,/scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
 assert.match(css,/grid-template-columns:minmax\(195px,230px\) minmax\(0,1fr\)/);
 assert.match(css,/overflow-x:auto;overflow-y:hidden/);
 assert.match(css,/scroll-margin-top:120px/);
 assert.match(css,/\.ssi-room-voice-icon/);
});
test('CSS and JS cache keys are updated coherently without paid workflows',()=>{
 const hub=read('modules/swapp-hubs.js');
 const app=read('assets/swapp-social-native/app.js');
 assert.match(hub,/swapp-social-voice\.js\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-interactions\.js\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-voice-premium\.css\?v=20261018-channel-ux-v1/);
 assert.match(hub,/swapp-social-native\/app\.js\?v=20261019-service-health-v1/);
 assert.match(app,/views\.js\?v=20261018-channel-ux-v1/);
});
