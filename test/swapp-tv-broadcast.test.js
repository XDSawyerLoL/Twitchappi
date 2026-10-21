'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {page}=require('../modules/swapp-program');
test('TV arrives on the broadcast stage rather than streamer cards',()=>{
 const html=page('tv');
 for(const key of ['id="stv-screen"','id="stv-now-name"','id="stv-next-list"','id="stv-queue-list"','id="stv-immersive"','swapp-tv-broadcast.js'])assert.ok(html.includes(key),key);
 assert.doesNotMatch(html,/id="swapp-program"/);
});
test('public agenda remains separate',()=>{
 const html=page('agenda');assert.match(html,/id="swapp-program"/);assert.doesNotMatch(html,/swapp-tv-broadcast\.js/);
});
test('broadcast uses verified API-backed antenna and click-to-play with muted audio',()=>{
 const code=read('assets/swapp-tv-broadcast.js');
 assert.match(code,/\/api\/swapp-tv\/queue\/status/);
 assert.match(code,/data\.director_enabled\?data\.on_air:null/);
 assert.match(code,/play\)\s*;/);
 assert.match(code,/player\.twitch\.tv/);
 assert.match(code,/muted:'true'/);
 assert.match(code,/\$\('stv-watch'\)\.addEventListener\('click',play\)/);
 assert.doesNotMatch(code,/Math\.random/);
});
