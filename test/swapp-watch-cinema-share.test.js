'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('assets/swapp-watch-experience.js');
const css=read('assets/swapp-watch-experience.css');

test('SWAPP CINEMA controls do not replace HLS frames or open extra transport',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/swapp-watch-share-btn/);
 assert.match(js,/navigator\.share\(/);
 assert.match(js,/navigator\.clipboard\?\.writeText\(url\)/);
 assert.match(js,/location\.origin\+'\/'\+encodeURIComponent\(login\)/);
 assert.doesNotMatch(js,/new Hls\(|new WebSocket\(|\.srcObject\s*=/);
});

test('keyboard shortcuts respect input focus and browser/system modifiers',()=>{
 assert.match(js,/event\.ctrlKey\|\|event\.metaKey\|\|event\.altKey/);
 assert.match(js,/target\?\.isContentEditable/);
 assert.match(js,/\[role="textbox"\]/);
 assert.match(js,/root\.classList\.contains\('active'\)/);
 assert.match(js,/control\.click\(\)/);
 assert.match(js,/key==='i'\?/);
 assert.match(js,/key==='c'\?/);
 assert.match(js,/key==='s'\?/);
});

test('a different channel always shows chat by default',()=>{
 assert.match(js,/mode\.immersion='off';mode\.chat='shown';/);
 assert.match(js,/page\.dataset\.watchChat='shown'/);
 assert.doesNotMatch(js,/sessionStorage/);
});

test('share controls stay responsive and limited to creator page',()=>{
 assert.match(css,/#channel \.swapp-watch-share-feedback:empty\{display:none\}/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/swapp-watch-share-btn/);
 assert.match(css,/swapp-watch-shortcuts/);
});
