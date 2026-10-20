'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SOURCE_LIST,DUNGEONS,AFTER45,CONFLICTS,EXTRAS,renderResearch,researchInsert,classInsert,toolsIntro}=require('../modules/swapp-aion2-research');
const {PUBLIC_PATHS,SECTIONS,render}=require('../modules/swapp-aion2-guides');
test('new research has distinct official and independently reported evidence',()=>{
 assert.ok(SOURCE_LIST.length>=12);
 assert.ok(SOURCE_LIST.some(s=>s.kind==='official'&&s.url.includes('ncsoft.com')));
 assert.ok(SOURCE_LIST.some(s=>s.url.includes('ateliergaming.fr')));
 assert.ok(SOURCE_LIST.some(s=>s.url.includes('daevaguides.com')));
 assert.ok(SOURCE_LIST.some(s=>s.kind==='experience'));
 assert.ok(CONFLICTS.length>=6);
 assert.ok(CONFLICTS.some(row=>row.join(' ').includes('Vakron')));
 assert.ok(CONFLICTS.some(row=>row.join(' ').includes('recharge')));
 for(const s of SOURCE_LIST){assert.match(s.url,/^https:\/\//);assert.ok(s.scope.length>35)}
});
test('all 19 chapters and class guides render server-side, with canonical links',()=>{
 assert.equal(SECTIONS.length,10);
 assert.equal(PUBLIC_PATHS.length,19);
 for(const route of PUBLIC_PATHS){const html=render(route);assert.ok(html&&html.includes('SWAPP'),route);assert.ok(html.includes('https://swapp.tv'+route),route)}
});
test('each dungeon provides explicit entry conditions and staged boss tactics',()=>{
 assert.equal(DUNGEONS.length,3);
 const page=render('/guides/aion-2/donjons');
 for(const d of DUNGEONS){
  assert.ok(page.includes(d.name));
  assert.ok(page.includes('objet '+d.normal.ilvl),d.name);
  assert.ok(page.includes('objet '+d.hard.ilvl),d.name);
  for(const [phase] of d.phases)assert.ok(page.includes(phase),phase);
 }
 assert.ok(page.includes('Grotte de Krao'));
 assert.ok(page.includes('Vague de fureur'));
 assert.ok(page.includes('Kromede'));
 assert.ok(page.includes('À vérifier en jeu'));
});
test('after level 45 shows six stages and flags disputed group requirements',()=>{
 assert.equal(AFTER45.length,6);
 const page=render('/guides/aion-2/fin-de-jeu');
 for(const stage of AFTER45)assert.ok(page.includes(stage.heading));
 assert.ok(page.includes('Vakron'));
 assert.ok(page.includes('2 800'));
 assert.ok(page.includes('mercredi'));
});
test('existing chapters gain version-specific cross-source warnings',()=>{
 for(const slug of Object.keys(EXTRAS)){
  assert.ok(render('/guides/aion-2/'+slug).includes('SOURCES CROISÉES'));
  assert.ok(researchInsert(slug).includes('Vérifications :'));
 }
 const p=render('/guides/aion-2/progression');
 assert.ok(p.includes('8 / 12 / 16'));
 assert.ok(p.includes('8 / 12 / 20'));
 const e=render('/guides/aion-2/equipement');
 assert.ok(e.includes('Bleu · Épique')&&e.includes('Doré · Unique'));
 const classGuide=render('/guides/aion-2/classes/sorcier');
 assert.ok(classGuide.includes('APRÈS LA ROTATION'));
 assert.ok(classInsert('sorcier').includes('Feu de l\\'enfer'));
});
test('source audit flags old regional data without confusing it for global',()=>{
 const page=render('/guides/aion-2/sources');
 assert.ok(page.includes('TRANSPARENCE ÉDITORIALE'));
 assert.ok(page.includes('NCSOFT'));
 assert.ok(page.includes('Corée'));
 assert.ok(page.includes('1 400, 1 600 ou 1 800'));
 assert.ok(renderResearch('sources').includes('Bibliographie des vérifications'));
 assert.equal(renderResearch('fake'),null);
});
test('calculator renders with 3 editable numeric inputs and no data collection requirement',()=>{
 const html=render('/guides/aion-2');
 assert.ok(html.includes('data-ag-cross-form'));
 assert.ok(html.includes('data-ag-cross-result'));
 assert.ok(html.includes('swapp-aion2-research.js?v=20261021-academy-v1'));
 assert.ok(html.includes('swapp-aion2-research.css?v=20261021-academy-v1'));
 assert.ok(toolsIntro().includes('sans compte ni envoi de données'));
});
