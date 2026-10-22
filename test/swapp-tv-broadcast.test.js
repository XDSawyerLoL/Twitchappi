'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {page}=require('../modules/swapp-program');
test('TV shows one conductor with integrated creator access, not a second product section',()=>{
 const html=page('tv');
 for(const key of ['id="stv-screen"','id="stv-now-name"','id="stv-next-list"','id="stv-creator-access"','id="stv-queue-status"','id="stv-immersive"','swapp-tv-broadcast.js'])
  assert.ok(html.includes(key),key);
 assert.match(html,/<aside class="stv-rail"[\s\S]*?<details id="stv-creator-access"[\s\S]*?<\/details>[\s\S]*?<\/aside>/);
 assert.match(html,/<summary>[\s\S]*?Je suis créateur/);
 assert.match(html,/href="\/tv\/programme"/);
 for(const id of ['stv-game','stv-join','stv-leave']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'exactly one control '+id);
 }
 assert.doesNotMatch(html,/id="stv-queue-list"|class="stv-bottom"|id="stv-queue"|stv-queue-tease|SWAPP TV \/ CREATOR ACCESS|ENTRE DANS/);
 assert.doesNotMatch(html,/class="stv-footer"/);
});
test('public programme remains on the TV programme route and not inside broadcast screen',()=>{
 const html=page('agenda');
 assert.match(html,/id="swapp-calendar"/);
 assert.match(html,/id="scal-grid"/);
 assert.match(html,/swapp-calendar\.js/);
 assert.doesNotMatch(html,/id="stv-creator-access"|swapp-tv-broadcast\.js/);
});
test('existing SWAPP queue and player work without a second duplicate waiting list',()=>{
 const code=read('assets/swapp-tv-broadcast.js');
 for(const pattern of [/\/api\/swapp-tv\/queue\/status/,/\/api\/swapp-tv\/queue/,/data\.director_enabled\?data\.on_air:null/,/player\.twitch\.tv/,/muted:'true'/,/\$\('stv-watch'\)\.addEventListener\('click',play\)/,/\$\('stv-join'\)\.addEventListener/ ,/\$\('stv-leave'\)\.addEventListener/])
  assert.match(code,pattern);
 assert.match(code,/setText\('stv-next-title',enabled\?'CRÉATEURS EN ATTENTE'/);
 assert.match(code,/waiting\.length>=100\?'100\+ en attente'/);
 assert.doesNotMatch(code,/stv-queue-list|Math\.random/);
});
test('creator inline control follows SWAPP styling and supports mobile and keyboard',()=>{
 const css=read('assets/swapp-program.css');
 assert.match(css,/\.stv-creator-inline>summary/);
 assert.match(css,/\.stv-creator-content .stv-queue-buttons/);
 assert.match(css,/\.stv-creator-inline>summary:focus-visible/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(css,/\.stv-queue-tease|\.stv-bottom\{|\.stv-queue-grid|\.stv-queue-panel/);
});
