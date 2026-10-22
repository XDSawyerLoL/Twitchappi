'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const html=read('assets/swapp-social-native/social-body.html');
const css=read('assets/swapp-social-editorial-air.css');

test('GIF and Emotes actions each have an accessible label, substantial icon and shared action style',()=>{
 const toolbar=html.slice(html.indexOf('class="pulse-toolset"'),html.indexOf('class="pulse-compose-right"'));
 for(const kind of ['gif','emoji']){
  const selector=kind==='gif'?'data-tool="gif"':'data-emoji-toggle';
  const fragment=toolbar.slice(toolbar.indexOf(selector)-80,toolbar.indexOf(selector)+600);
  assert.ok(toolbar.includes(selector));
  assert.match(fragment,/pulse-compose-action/);
  assert.match(fragment,/pulse-compose-action-icon/);
  assert.match(fragment,/pulse-compose-action-label/);
  assert.match(fragment,/<svg viewBox="0 0 24 24"/);
  assert.match(fragment,/aria-expanded="false"/);
 }
 assert.match(toolbar,/>GIFs<\/span>/);
 assert.match(toolbar,/>Emotes<\/span>/);
 assert.equal((toolbar.match(/pulse-compose-action-icon/g)||[]).length,2);
});

test('both controls are at least 47px tall with readable labels on mobile',()=>{
 const rules=css.slice(css.indexOf('/* Composer actions · two deliberate'));
 assert.match(rules,/#swappSocialNative \.pulse-toolset button\.pulse-compose-action\{/);
 assert.match(rules,/height:49px!important/);
 assert.match(rules,/min-height:49px!important/);
 assert.match(rules,/#swappSocialNative \.pulse-toolset button\.pulse-compose-action \.pulse-compose-action-label\{/);
 assert.match(rules,/display:inline!important/);
 assert.match(rules,/@media\(max-width:650px\)/);
 assert.match(rules,/height:47px!important;min-height:47px!important/);
 assert.match(rules,/#swappSocialNative \.pulse-compose-right\{/);
 assert.match(rules,/justify-content:flex-end!important/);
 assert.match(rules,/@media\(max-width:365px\)/);
});

test('visual emphasis uses one global site color and keeps the third tool understated',()=>{
 const rules=css.slice(css.indexOf('/* Composer actions · two deliberate'));
 assert.match(css,/--social-air-accent:var\(--swapp-page-accent/);
 assert.match(rules,/var\(--social-air-accent\)/);
 assert.match(rules,/border-radius:999px!important/);
 assert.match(rules,/\[data-tool="news"\]/);
 assert.match(rules,/background:transparent!important/);
 assert.match(rules,/focus-visible/);
 assert.match(rules,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(rules,/position:fixed|window\.open|@import|url\(https?:\/\//);
});

test('GIFs/Emotes picker functionality and the publish action remain wired unchanged',()=>{
 const app=read('assets/swapp-social-native/app.js');
 const gifs=read('assets/swapp-social-native/gif-picker.js');
 const emotes=read('assets/swapp-social-native/emotes.js');
 assert.match(app,/setupSocialGifPicker\(\{requireAuth,state,dom,updateMediaPreview\}\)/);
 assert.match(app,/setupSocialEmotes\(\{requireAuth,dom\}\)/);
 assert.match(gifs,/querySelector\('\[data-tool="gif"\]'\)/);
 assert.match(emotes,/closest\?\.\('\[data-emoji-toggle\]'\)/);
 assert.match(html,/id="pulse-publish"/);
 assert.match(html,/data-tool="news"/);
});

test('CSS version is cache-busted and regression/deploy checks expect the same one',()=>{
 const version='swapp-social-editorial-air.css?v=20261022-large-tools-v1';
 assert.ok(read('modules/swapp-hubs.js').includes(version));
 assert.ok(read('tools/swapp-deploy-smoke.js').includes(version));
 assert.ok(read('test/swapp-social-editorial-air.test.js').includes('20261022-large-tools-v1'));
 assert.ok(read('test/swapp-social-responsive-gifs.test.js').includes('20261022-large-tools-v1'));
 const hub=read('modules/swapp-hubs.js');
 assert.ok(hub.indexOf('/assets/swapp-social-timeline.css?v=')<hub.indexOf(version));
});
