'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const file=name=>fs.readFileSync(path.join(root,name),'utf8');
const interactions=file('assets/swapp-social-interactions.js');
const next=file('assets/swapp-social-next.js');
const sections=file('assets/swapp-social-sections.css');
const hubs=file('modules/swapp-hubs.js');

test('SOCIAL is composed of six semantic navigable sections without the old card grid',()=>{
 const m=interactions.match(/area\.innerHTML=\x60([\s\S]*?)\x60;/);
 assert.ok(m,'The interactive SOCIAL layout exists');
 const html=m[1];
 assert.match(html,/class="ssi-section-nav"/);
 assert.doesNotMatch(html,/class="ssi-grid"/);
 assert.equal((html.match(/<section class="ssi-panel/g)||[]).length,4);
 for(const id of ['ssi-match-panel','ssi-poll-panel','ssi-room-panel','ssi-chat-panel']){
  assert.ok(html.includes('id="'+id+'"'),'section '+id+' present');
  assert.ok(html.includes('href="#'+id+'"'),'navigation link for '+id);
 }
 for(const id of ['ssn-passport','ssn-universe']){
  assert.ok(next.includes('id="'+id+'"'),'next generation section '+id+' present');
  assert.ok(html.includes('href="#'+id+'"'),'navigation link for '+id);
 }
 assert.match(next,/querySelector\('\.ssi-sections'\)/);
});

test('SOCIAL loads the editorial styles last and busts previous asset URLs',()=>{
 assert.match(hubs,/swapp-social-sections\.css\?v=20261016-sections-v1/);
 assert.match(hubs,/swapp-social-interactions\.js\?v=20261016-sections-v1/);
 assert.match(hubs,/swapp-social-next\.js\?v=20261016-sections-v1/);
 assert.match(sections,/grid-template-columns:minmax\(165px,\.32fr\)/);
 assert.match(sections,/@media\(max-width:610px\)/);
 assert.match(sections,/border-radius:0!important/);
});

test('SOCIAL layout preserves the working MySQL feature and room handlers',()=>{
 assert.match(interactions,/req\('match2\/compatible'\)/);
 assert.match(interactions,/data-room/);
 assert.match(interactions,/ssi:open-room/);
 assert.match(next,/passport\/me/);
 assert.match(next,/game\/context/);
 assert.match(next,/ssi:room-game/);
 assert.match(next,/ssn-live-results/);
 assert.match(next,/data-message-user/);
 assert.doesNotThrow(()=>new vm.Script(interactions));
 assert.doesNotThrow(()=>new vm.Script(next));
});
