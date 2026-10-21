'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {page}=require('../modules/swapp-program');
test('Agenda is a true calendar and SWAPP TV remains separate',()=>{
 const html=page('agenda');
 for(const key of ['id="swapp-calendar"','id="scal-grid"','id="scal-prev"','id="scal-next"','id="scal-game"','id="scal-day-events"','swapp-calendar.js'])assert.ok(html.includes(key),key);
 assert.doesNotMatch(html,/id="swapp-program"/);
 assert.match(page('tv'),/id="swapp-tv"/);
});
test('calendar loads only backed Spotlight reservations and never fills fake events',()=>{
 const src=read('assets/swapp-calendar.js');
 assert.match(src,/\/api\/creator\/spotlight\?game=/);
 assert.match(src,/x\.status!=='reserved'/);
 assert.match(src,/Date\.parse\(x\.end\)<=Date\.now\(\)/);
 assert.match(src,/Aucun rendez-vous confirmé/);
 assert.doesNotMatch(src,/Math\.random|mockEvent|demoEvent/);
});

test('calendar CSS is embedded in the delivered HTML, independent of browser cache',()=>{
 const html=page('agenda');
 const inline=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
 assert.match(inline,/\.scal\{/);
 assert.match(inline,/\.scal-grid\{display:grid;grid-template-columns:repeat\(7/);
 assert.match(inline,/\.scal-workspace\{display:grid/);
 assert.match(inline,/@media\(max-width:670px\)/);
 assert.match(html,/swapp-program\.css\?v=20261021-calendar-cssfix-v2/);
});
