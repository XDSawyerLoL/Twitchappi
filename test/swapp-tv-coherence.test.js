'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('SWAPP TV director overrides browser-only rotation and queue remains live',()=>{
 const ui=read('assets/swapp-program.js'),server=read('server.js');
 assert.match(ui,/if\(queue\.enabled\)\{await showAntenna\(\)/);
 assert.match(ui,/setInterval\(showAntenna,60000\)/);
 assert.match(ui,/data-swapp-tv-waiting|dataset\.swappTvWaiting/);
 assert.match(ui,/existing\.dataset\.onAir===String/);
 assert.match(server,/SWAPP_SPOTLIGHT_ENABLED\|\|SWAPP_TV_QUEUE_ENABLED/);
});
