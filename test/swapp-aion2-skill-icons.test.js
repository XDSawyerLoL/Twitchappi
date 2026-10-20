'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {FILES,skillIconUrl}=require('../modules/swapp-aion2-skill-icons');
const {DATA,classPlaybook}=require('../modules/swapp-aion2-playbooks');
const {render}=require('../modules/swapp-aion2-guides');
test('all eight classes have genuine, explicitly listed skill image URLs',()=>{
 assert.equal(Object.keys(FILES).length,8);
 for(const [slug,mapping] of Object.entries(FILES)){
  assert.ok(Object.keys(mapping).length>=6,slug);
  for(const [name,filename] of Object.entries(mapping)){
   assert.match(skillIconUrl(slug,name),/^https:\/\/www\.ateliergaming\.fr\/wp-content\/uploads\/2026\/09\//);
   assert.ok(skillIconUrl(slug,name).endsWith(filename));
  }
  assert.ok((classPlaybook(slug).match(/data-ag-skill-icon/g)||[]).length>=3,slug);
 }
 assert.equal(skillIconUrl('templier','Inconnu'),'');
 assert.equal(skillIconUrl('inconnue','Jugement'),'');
 assert.equal(skillIconUrl('templier','https://evil.example/a.png'),'');
});
test('Templier guide renders four supplied actual images inline, not image name links',()=>{
 const html=render('/guides/aion-2/classes/templier');
 for(const filename of ['te-shield-smite.png','te-judgment.png','te-vicious-strike.png','te-warding-strike.png']){
  assert.ok(html.includes('src="https://www.ateliergaming.fr/wp-content/uploads/2026/09/'+filename+'"'),filename);
 }
 for(const label of ['Un coup de bouclier','Jugement','Frappe féroce','Le bouclier suivant'])assert.ok(html.includes(label),label);
 assert.ok(html.includes('ag-icon-combo-grid'));
 assert.match(html,/referrerpolicy="no-referrer"/);
 assert.doesNotMatch(html,/>Icône Jugement</);
});
test('class detail includes Stigma icons and mobile fallback behavior assets',()=>{
 const templar=render('/guides/aion-2/classes/templier');
 assert.ok(templar.includes('te-taunt.png'));
 assert.ok(templar.includes('te-shield-of-protection.png'));
 assert.ok(templar.includes('te-battlefield-banner.png'));
 assert.ok(templar.includes('te-doom-shield.png'));
 assert.match(templar,/swapp-aion2-expert.css\?v=20261021-icons-v2/);
 assert.match(templar,/swapp-aion2-expert.js\?v=20261021-icons-v2/);
});
