'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DATA,classPlaybook}=require('../modules/swapp-aion2-playbooks');
const {CONTENT,chapterPlaybook}=require('../modules/swapp-aion2-chapter-clinics');
const {PUBLIC_PATHS,render}=require('../modules/swapp-aion2-guides');
test('eight class guides actually expose concrete skills, stigmas, PvE/PvP and training',()=>{
 assert.equal(Object.keys(DATA).length,8);
 for(const [slug,details] of Object.entries(DATA)){
  const page=render('/guides/aion-2/classes/'+slug);
  assert.ok(page.includes('data-ag-panel-select="pve"'),slug);
  assert.ok(page.includes('data-ag-panel-select="pvp"'),slug);
  assert.ok(page.includes(details.pve[0]),slug+' first PvE stigma');
  assert.ok(page.includes(details.pvp[0]),slug+' first PvP stigma');
  assert.ok(page.includes(details.skills[0][0]),slug+' first skill');
  assert.ok(page.includes(details.rotation[0][0]),slug+' rotation');
  assert.match(page,/EXERCICE PRATIQUE/,slug);
  assert.match(page,/Fiche technique|fiche technique|Atelier Gaming/,slug);
  assert.ok(classPlaybook(slug).length>3200,slug+' short content');
 }
});
test('six chapters show useable lessons, not just category cards',()=>{
 for(const [slug,items] of Object.entries(CONTENT)){
  const page=render('/guides/aion-2/'+slug);
  assert.ok(items.length>=5,slug);
  assert.ok(page.includes(items[0][0]),slug+' first lesson');
  assert.ok(page.includes(items.at(-1)[0]),slug+' last lesson');
  assert.ok(chapterPlaybook(slug).length>1800,slug+' empty practical content');
 }
});
test('content has correct known global breakpoints and distinguishes regions',()=>{
 const page=render('/guides/aion-2/progression');
 for(const milestone of ['niveau 16','22 / 27 / 32 / 37','45'])assert.ok(page.includes(milestone),milestone);
 const gear=render('/guides/aion-2/equipement');
 assert.ok(gear.includes('+10')&&gear.includes('Transfert'));
 const beginner=render('/guides/aion-2/debuter');
 assert.ok(beginner.includes('énergie d’Od')||beginner.includes('énergie d’Od'));
 const pvp=render('/guides/aion-2/pvp');
 assert.match(pvp,/Dissipation de choc/);
});
test('every published Aion 2 URL still renders',()=>{for(const path of PUBLIC_PATHS){const page=render(path);assert.ok(page&&page.includes('SWAPP'),path)}});
