'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const program=require('../modules/swapp-program');
test('agenda and TV pages provide distinct real-data views',()=>{
 const agenda=program.page('agenda'),tv=program.page('tv');
 assert.match(agenda,/data-mode="agenda"/);
 assert.match(tv,/data-mode="tv"/);
 assert.match(agenda,/SWAPP/);
 assert.match(tv,/SWAPP TV/);
 for(const html of [agenda,tv]){
  assert.match(html,/swapp-program\.js/);
  assert.match(html,/swapp-program\.css/);
 }
});
test('the programme uses public APIs and embeds Twitch only after a click',()=>{
 const code=read('assets/swapp-program.js'),server=read('server.js');
 assert.match(code,/\/api\/actus/);
 assert.match(code,/\/api\/creator\/spotlight\?game=/);
 assert.match(code,/\/api\/discovery\/game-lives\?game=/);
 assert.match(code,/live_verified/);
 assert.match(code,/coverage==='partial'/);
 assert.match(code,/play\.addEventListener\('click'/);
 assert.match(code,/player\.twitch\.tv/);
 assert.match(code,/muted:'true'/);
 assert.match(code,/data\.on_air\?\.twitch_login/);
 assert.doesNotMatch(code,/document\.createElement\('iframe'\)\s*;\s*document\.body\.append/);
 assert.match(server,/app\.get\('\/agenda'/);
 assert.match(server,/app\.get\('\/tv'/);
});
