'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderCommunityPanels}=require('../modules/swapp-servers-community');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');
const server={id:'a'.repeat(32),slug:'swapp-fr',name:'SWAPP Français',
  game:'Discord / Multigaming',region:'France',twitch_url:'https://www.twitch.tv/vnhz'};
const markup=()=>renderCommunityPanels(server);

test('the matchmaking form uses distinct, associated labels and aligned field containers',()=>{
 const html=markup();
 assert.match(html,/id="ss-lfg-form" class="ss-community-form ss-lfg-composer"/);
 assert.match(html,/class="ss-lfg-fields"/);
 assert.match(html,/for="ss-lfg-message"/);
 assert.match(html,/id="ss-lfg-message" name="message" maxlength="160"/);
 assert.match(html,/for="ss-lfg-voice"/);
 assert.match(html,/id="ss-lfg-voice" name="voice"/);
 assert.match(html,/value="yes"/);
 assert.match(html,/value="no"/);
 assert.match(html,/value="either"/);
 assert.ok(html.indexOf('class="ss-lfg-fields"')<html.indexOf('class="ss-community-actions ss-lfg-actions"'));
 assert.ok(html.indexOf('class="ss-lfg-fields"')<html.indexOf('</form>'));
});
test('primary action is visible and withdrawal cannot appear before publication',()=>{
 const html=markup();
 assert.match(html,/class="ss-lfg-primary"/);
 assert.match(html,/type="submit" class="ss-lfg-primary"/);
 assert.match(html,/id="ss-lfg-remove" hidden/);
 const stylesheet=read('assets/swapp-servers-community.css');
 assert.match(stylesheet,/\.ss-lfg-secondary\[hidden\]\{display:none!important\}/);
 assert.match(stylesheet,/\.ss-lfg-actions>\.ss-lfg-primary/);
 assert.match(stylesheet,/\.ss-lfg-primary:hover/);
});
test('the presence display is initially unknown and must be backed by fetched entries',()=>{
 const html=markup();
 assert.match(html,/id="ss-lfg-count">—<\/strong>/);
 assert.match(html,/id="ss-lfg-count-label">Vérification en cours/);
 assert.match(html,/id="ss-lfg-list"[^>]*aria-busy="true"/);
 const js=read('assets/swapp-servers-community.js');
 assert.match(js,/const entries=Array\.isArray\(current\.players\)\?current\.players:\[\]/);
 assert.match(js,/availableCount\.textContent=entries\.length>=30\?'30\+':String\(entries\.length\)/);
 assert.match(js,/availableCount\.textContent='—'/);
 assert.doesNotMatch(js,/\bMath\.random\(/);
});
test('empty state is an invitation to publish, with a focusable action',()=>{
 const script=read('assets/swapp-servers-community.js');
 assert.match(script,/La prochaine équipe commence avec toi/);
 assert.match(script,/Publier ma disponibilité/);
 assert.match(script,/form\?\.elements\?\.message\?\.focus\(\)/);
 assert.match(script,/make\('article','ss-community-player ss-lfg-player'\)/);
 assert.match(script,/ss-lfg-voice-badge/);
 assert.match(script,/Date\.parse/);
});
test('the layout is responsive and never overlaps the voice selector',()=>{
 const css=read('assets/swapp-servers-community.css');
 assert.match(css,/form\.ss-lfg-composer\{[\s\S]*?display:block!important/);
 assert.match(css,/\.ss-lfg-fields\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(175px,215px\)/);
 assert.match(css,/\.ss-lfg-fields :is\(input,select\)\{[\s\S]*?box-sizing:border-box!important/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/\.ss-lfg-fields\{grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('matchmaking refresh and live feeds have separate polling rates',()=>{
 const script=read('assets/swapp-servers-community.js');
 assert.match(script,/const presenceTicker=setInterval/);
 assert.match(script,/},60\*1000\)/);
 assert.match(script,/const liveTicker=setInterval/);
 assert.match(script,/},5\*60\*1000\)/);
 assert.match(script,/document\.visibilityState!=='visible'/);
 assert.match(script,/clearInterval\(presenceTicker\);clearInterval\(liveTicker\)/);
});
test('server routes, affiliation moderation and vote actions are preserved',()=>{
 const backend=read('modules/swapp-servers-community.js');
 for(const route of ['/api/swapp/serveurs/:id/community','/api/swapp/serveurs/:id/lfg',
  '/api/swapp/serveurs/:id/lfg/remove','/api/swapp/serveurs/:id/creators',
  '/api/swapp/serveurs/:id/creators/:creatorId/moderate']){
  assert.ok(backend.includes(route),route);
 }
 const html=markup();
 assert.match(html,/id="ss-creator-actions"/);
 assert.match(html,/id="ss-creator-moderation" hidden/);
 assert.match(html,/id="ss-community-lives"/);
 const page=read('modules/swapp-servers.js');
 assert.ok((page.match(/20261116-lfg-premium-v4/g)||[]).length>=4);
});
