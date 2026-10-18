'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('salon vocal has one integrated stage with actual room and member status',()=>{
 const source=read('assets/swapp-social-voice.js');
 for(const id of ['swapp-voice-room-name','swapp-voice-room-game','swapp-voice-count',
   'swapp-voice-peers','swapp-voice-member-caption','swapp-voice-live']){
  assert.match(source,new RegExp(id));
 }
 assert.match(source,/profiles\.entries\(\)/);
 assert.match(source,/area\.dataset\.activeSocialRoom/);
 assert.match(source,/node\.querySelector\('strong'\)\.textContent=name/);
 assert.match(source,/data-voice-state|dataset\.voiceState/);
 assert.doesNotMatch(source,/Math\.random\(\)/);
});
test('microphone and speaker have independent controls and real waveform activity',()=>{
 const source=read('assets/swapp-social-voice.js');
 assert.match(source,/id="swapp-voice-mute"/);
 assert.match(source,/id="swapp-voice-deafen"/);
 assert.match(source,/deafened=!deafened/);
 assert.match(source,/participant\.audio\.muted=deafened/);
 assert.match(source,/getByteTimeDomainData/);
 assert.match(source,/Math\.sqrt\(energy\/entry\.values\.length\)/);
 assert.match(source,/member|is-speaking/);
 assert.match(source,/stopAllMeters\(\)/);
 assert.match(source,/getUserMedia/);
 assert.match(source,/navigator\.mediaDevices\.getUserMedia/);
 assert.doesNotMatch(source,/MediaRecorder/);
});
test('voice status uses the actual room selection event from the same MySQL module',()=>{
 const interactions=read('assets/swapp-social-interactions.js');
 const voice=read('assets/swapp-social-voice.js');
 assert.match(interactions,/detail:\{id,name:item\.name,game:item\.game\}/);
 assert.match(voice,/event\.detail\?\.name/);
 assert.match(voice,/event\.detail\?\.game/);
 assert.match(voice,/leave\(\).*selectedRoom=id/s);
});
test('private audio composer shows live recorder duration and preview',()=>{
 const composer=read('assets/swapp-social-native/views.js');
 const recorder=read('assets/swapp-social-native/dm-audio.js');
 assert.match(composer,/data-voice-timer/);
 assert.match(composer,/data-voice-preview/);
 assert.match(composer,/data-voice-send/);
 assert.match(recorder,/setInterval\(\(\)=>show\(/);
 assert.match(recorder,/clearInterval\(timerInterval\)/);
 assert.match(recorder,/box\.dataset\.audioState=/);
 assert.match(recorder,/MAX_SECONDS=30/);
});
test('private calls show the actual caller, not a generic browser notification',()=>{
 const calls=read('assets/swapp-social-native/dm-calls.js');
 const styles=read('assets/swapp-social-voice-premium.css');
 const app=read('assets/swapp-social-native/app.js');
 assert.match(calls,/data-call-name/);
 assert.match(calls,/data-call-avatar/);
 assert.match(calls,/tray\.dataset\.callPhase/);
 assert.match(calls,/call\?\.handle/);
 assert.match(styles,/\.pulse-call-person/);
 assert.match(app,/dm-calls\.js\?v=20261018-audio-stage-v1/);
});
test('audio styles load after page appearance and support mobile and reduced motion',()=>{
 const css=read('assets/swapp-social-voice-premium.css');
 const hub=read('modules/swapp-hubs.js');
 assert.ok(hub.indexOf('swapp-social-appearance.css')<hub.indexOf('swapp-social-voice-premium.css'));
 assert.match(hub,/swapp-social-voice\.js\?v=20261018-channel-ux-v1/);
 assert.match(css,/\.swapp-voice-participant\.is-speaking/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.pulse-dm-audio-controls/);
 assert.match(css,/\.pulse-call-panel/);
});
