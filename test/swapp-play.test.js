'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-play.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

test('SWAPP Play loads once from the existing single-page shell',()=>{
 assert.match(html,/<script defer src="\/assets\/swapp-play\.js\?/);
 assert.match(script,/__swappPlayInstalled/);
 assert.match(script,/\.swapp-play-toolbar/);
 assert.doesNotMatch(script,/createElement\('section'\)/);
});

test('Live Pulse relies on explicit markers, not words in descriptions',()=>{
 assert.match(script,/function markLive\(/);
 assert.match(script,/data-live="true"/);
 assert.match(script,/data-is-live="true"/);
 assert.doesNotMatch(script,/textContent\|\|''\)\.slice\(0,350\)/);
 assert.match(script,/classList\.toggle\('swapp-pulse-live',confirmed\)/);
});

test('Surf visits existing live cards only and skips editorial links',()=>{
 assert.match(script,/\.homeLiveCard1014/);
 assert.match(script,/\.closest\('\.homeLiveCard1014/);
 assert.ok(script.includes('actus'));
 assert.match(script,/Aucun live disponible/);
});

test('Controller mode is optional and supports reduced motion',()=>{
 assert.match(script,/navigator\.getGamepads/);
 assert.match(script,/aria-pressed/);
 assert.match(script,/prefers-reduced-motion:no-preference/);
 assert.match(script,/document\.addEventListener\('keydown'/);
});

test('DOM observer coalesces callbacks to avoid work per mutation',()=>{
 assert.match(script,/let scheduled=false/);
 assert.match(script,/if\(scheduled\)return/);
 assert.match(script,/requestAnimationFrame\(\(\)=>\{scheduled=false/);
});
