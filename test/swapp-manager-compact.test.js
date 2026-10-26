'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('manager header is compact and two cards become small same-page jump controls',()=>{
 const css=src('assets/swapp-manager-compact.css');
 assert.match(css,/#manager \.pageHead h1/);
 assert.match(css,/font-size:clamp\(23px,2\.5vw,32px\)!important/);
 assert.match(css,/#manager \.streamModeGrid\.section/);
 assert.match(css,/min-height:36px!important/);
 assert.match(css,/nth-child\(2\)/);
 assert.match(css,/\.modeCard>p\{display:none!important\}/);
});
test('OBS and browser cards retain correct names and keyboard-accessible jumps',()=>{
 const obs=src('assets/swapp-obs-direct-dashboard.js');
 const studio=src('assets/swapp-browser-studio.js');
 new Function(obs);new Function(studio);
 assert.match(obs,/name:'Capture navigateur',tag:'Navigateur',target:hero/);
 assert.match(obs,/name:'OBS direct',tag:'OBS',target:panel/);
 assert.match(obs,/mode\.setAttribute\('role','button'\)/);
 assert.match(obs,/mode\.addEventListener\('keydown'/);
 assert.match(studio,/if\(h\)h\.textContent='Capture navigateur'/);
 assert.match(studio,/if\(h\)h\.textContent='OBS direct'/);
 assert.doesNotMatch(obs,/heading\.textContent='OBS → SWAPP \(direct\)'/);
});
test('cache keys point at updated compact assets while HLS remains untouched',()=>{
 const html=src('index.html');
 assert.match(html,/swapp-manager-compact\.css\?v=20261026-v1/);
 assert.match(html,/swapp-obs-direct-dashboard\.js\?v=20261026-compact-manager-v1/);
 assert.match(html,/swapp-browser-studio\.js\?v=20261026-compact-manager-v1/);
 assert.match(html,/index_script\.js\?v=20261026-hls-direct-channel-v8/);
});
