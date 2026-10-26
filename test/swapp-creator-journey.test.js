'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Creator impact route restricts access and never writes discovery counts',()=>{
 const server=read('server.js');
 assert.match(server,/installCreatorImpact\(\{/);
 const src=read('modules/swapp-creator-impact.js');
 assert.match(src,/app\.get\('\/api\/creator\/impact'/);
 assert.match(src,/creator_login=\?/);
 assert.doesNotMatch(src,/INSERT INTO|UPDATE swapp_fair|DELETE FROM swapp_fair/);
});
test('Creator interface loads once and does not resize the player',()=>{
 const html=read('index.html'),script=read('assets/swapp-creator-impact.js');
 assert.equal((html.match(/swapp-creator-impact\.js\?v=/g)||[]).length,1);
 assert.equal((html.match(/swapp-creator-impact\.css\?v=/g)||[]).length,1);
 assert.match(script,/data-swapp-creator-impact/);
 assert.doesNotMatch(script,/channelMainPlayer|chatPanel|ResizeObserver|setInterval/);
});
test('Game Universe shows live shelf before editorial cards',()=>{
 const src=read('modules/swapp-game-pages.js');
 const start=src.indexOf('function renderGamePage(');
 const end=src.indexOf('function renderMyGames(',start);
 assert.ok(start>0&&end>start);
 const body=src.slice(start,end);
 assert.ok(body.indexOf("'<section id=\"game-live\"")<body.indexOf("'<section id=\"game-actus\""));
 assert.match(body,/href="#game-live"/);
 assert.match(body,/href="#game-actus"/);
 assert.match(body,/data-swapp-live-shelf/);
 assert.match(body,/data-spotlight-game/);
 assert.match(body,/data-swapp-follow-game/);
});
