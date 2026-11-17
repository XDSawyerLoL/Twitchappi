'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {hubPage,civitasPage,register,PLAY,V40PARTS}=require('../modules/swapp-devgames');
const nav=require('../assets/swapp-navigation');
test('DevGames appears once in the shared desktop and mobile navigation',()=>{
 const desk=nav.desktopNavigation('devgames');
 const mobile=nav.mobileNavigation('devgames');
 assert.equal((desk.match(/href="\/devgames"/g)||[]).length,1);
 assert.match(desk,/href="\/devgames" class="active" aria-current="page">DevGames/);
 assert.match(mobile,/swapp-mobile-more-links[\s\S]*href="\/devgames" class="active" aria-current="page">DevGames/);
});
test('DevGames and CIVITAS pages use the native SWAPP shell and real playable destination',()=>{
 const hub=hubPage(),detail=civitasPage();
 assert.match(hub,/data-swapp-shell="shared-native-v2"/);
 assert.match(hub,/href="\/devgames\/civitas"/);
 assert.match(detail,/id="dg-start-button"/);
 assert.match(detail,/\/devgames\/civitas\/jeu/);
 assert.doesNotMatch(detail,/<iframe\b/i);
 assert.match(detail,/DevGames/);
});
test('CIVITAS V40 is present as 11 ordered UTF-8 parts',()=>{
 assert.equal(V40PARTS.length,11);
 const sizes=V40PARTS.map(p=>fs.statSync(p).size);
 assert.ok(sizes.every(n=>n>1000000),'No missing or empty chunk');
 assert.ok(sizes.reduce((a,b)=>a+b,0)>19000000,'Full V40 binary expected');
 assert.match(fs.readFileSync(V40PARTS[0],'utf8').slice(0,100),/^<!doctype html>/i);
 assert.match(fs.readFileSync(V40PARTS.at(-1),'utf8').slice(-100),/<\/body><\/html>\s*$/);
});
test('DevGames routes register before the creator catch-all without modifying existing routes',()=>{
 const routes=[];
 register({get:(url,handler)=>{routes.push({url,handler});}});
 assert.deepEqual(routes.map(r=>r.url),['/devgames','/devgames/civitas',PLAY,PLAY+'.html']);
});
test('Standalone game only streams existing local parts and does not touch the SWAPP databases',()=>{
 const src=fs.readFileSync(require.resolve('../modules/swapp-devgames'),'utf8');
 assert.doesNotMatch(src,/mysql2|firebase|fetch\(|http\.request|https\.request|sql/i);
 assert.match(src,/fs\.createReadStream/);
});
