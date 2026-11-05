'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','assets','swapp-obs-direct-dashboard.js'),'utf8');
const style=fs.readFileSync(path.join(__dirname,'..','assets','swapp-obs-direct-dashboard.css'),'utf8');

test('SWAPP SIGNAL renders a three-stage creator console without touching the HLS player',()=>{
 assert.doesNotThrow(()=>new Function(source));
 for(const label of ['01 / ENVOI','02 / HLS','03 / IMAGE'])
  assert.ok(source.includes(label),'missing signal stage: '+label);
 assert.match(source,/État du signal en trois vérifications/);
 assert.match(source,/setSignal\(panel,'video',readable\?'ready':'warning'/);
 assert.match(source,/probe\.media\?\.video_browser_compatible===true/);
 assert.doesNotMatch(source,/new Hls\(|\.srcObject\s*=|new WebSocket\(/);
});

test('creator channel sharing never includes the secret OBS key',()=>{
 assert.match(source,/channelUrl='\/'\+encodeURIComponent\(String\(user\.login\)\.toLowerCase\(\)\)/);
 assert.match(source,/navigator\.clipboard\.writeText\(location\.origin\+channelUrl\)/);
 assert.match(source,/Lien copié/);
 assert.match(source,/Copie indisponible/);
 assert.doesNotMatch(source,/clipboard\.writeText\(hidden\.value\).*channelUrl/s);
});

test('responsive cockpit remains separate from public channel layout',()=>{
 assert.match(style,/#manager \.swapp-obs-signal\{/);
 assert.match(style,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(style,/@media\(max-width:760px\)/);
 assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(style,/#channel\s+\.swapp-obs-signal/);
});
