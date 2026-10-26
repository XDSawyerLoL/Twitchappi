'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-chat-social-glass.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const watch=fs.readFileSync(path.join(__dirname,'../assets/swapp-watch-experience.js'),'utf8');
test('single attached live-player and chat frame defaults to neutral premium black',()=>{
 const section=css.slice(css.indexOf('.channelLiveLayout{'),css.indexOf('.channelLiveLayout > .swapp-watch-headline{'));
 assert.match(section,/--swapp-stage-black:#050607/);
 assert.match(section,/border:1px solid var\(--swapp-stage-border\)!important/);
 assert.match(section,/background:linear-gradient\(145deg,#0b0c0e 0%,var\(--swapp-stage-black\) 52%,#090a0d 100%\)!important/);
 assert.doesNotMatch(section,/border:1px solid color-mix\(in srgb,var\(--social-glow\)/);
 assert.doesNotMatch(section,/0 0 35px color-mix/);
});
test('stage headline, player and chat surfaces stay black regardless of creator accent',()=>{
 assert.match(css,/background:linear-gradient\(90deg,#0d0e11,#08090b 74%,#0b0c0e\)!important/);
 assert.match(css,/background:#000!important/);
 assert.match(css,/background:linear-gradient\(180deg,#0d0e11 0%,#08090b 45%,#090a0c 100%\)!important/);
 assert.match(css,/border-left:1px solid rgba\(232,236,246,.15\)!important/);
 assert.match(css,/background:linear-gradient\(90deg,#111216,#0c0d10\)!important/);
});
test('accent stays on interactive controls, not on stage outline',()=>{
 assert.match(css,/--social-glow:var\(--swapp-focus-accent/);
 assert.match(css,/border-color:var\(--social-glow\)!important/);
 assert.match(css,/background:linear-gradient\(135deg,var\(--social-glow,#8c5cf6\),#6544d5\)!important/);
 assert.match(css,/\.swapp-rewards-trigger\{/);
 assert.match(css,/background:linear-gradient\(110deg,#202126,#15161a\)!important/);
});
test('16:9 player and chat alignment, cinema, hide-chat, mobile remain unchanged',()=>{
 assert.match(watch,/const h=Math.round\(width\*9\/16\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) clamp\(320px,27vw,430px\)!important/);
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/data-watch-theatre="on"/);
 assert.match(css,/@media\(max-width:1080px\)/);
 assert.doesNotMatch(css,/\.chatPanel\s*\{[^}]*height:\s*\d+px/i);
});
test('browser loads the new stage palette, not stale cached CSS',()=>{
 const updated='swapp-chat-social-glass.css?v=20261026-flat-chat-v3';
 assert.equal(html.split(updated).length-1,1);
 assert.ok(html.indexOf(updated)>html.indexOf('swapp-channel-focus-20261026.css'));
});
