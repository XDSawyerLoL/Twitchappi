'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {page}=require('../modules/swapp-program');
test('agenda and TV are distinct native experiences',()=>{
 const agenda=page('agenda'),tv=page('tv');
 assert.match(agenda,/id="swapp-calendar"/);
 assert.match(agenda,/id="scal-grid"/);
 assert.match(agenda,/swapp-calendar\.js/);
 assert.match(tv,/id="swapp-tv"/);
 assert.match(tv,/swapp-tv-broadcast\.js/);
 for(const html of [agenda,tv])assert.match(html,/swapp-program\.css/);
});
test('agenda reads real Spotlight entries; SWAPP TV uses verified antenna with voluntary Twitch playback',()=>{
 const calendar=read('assets/swapp-calendar.js');
 const broadcast=read('assets/swapp-tv-broadcast.js');
 const server=read('server.js');
 assert.match(calendar,/\/api\/creator\/spotlight\?game=/);
 assert.match(broadcast,/\/api\/swapp-tv\/queue\/status/);
 assert.match(broadcast,/data\.director_enabled\?data\.on_air:null/);
 assert.match(broadcast,/\$\('stv-watch'\)\.addEventListener\('click',play\)/);
 assert.match(broadcast,/player\.twitch\.tv/);
 assert.match(broadcast,/muted:'true'/);
 assert.match(server,/app\.get\('\/agenda'/);
 assert.match(server,/app\.get\('\/tv'/);
});
