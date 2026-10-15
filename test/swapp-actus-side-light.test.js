'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Actualité uses the same user-selected side light as every SWAPP page',()=>{
 const js=read('index_script.js');
 const css=read('assets/swapp-art-direction.css');
 const runtime=js.slice(js.indexOf('(function swappSideLightOnlyAccent(){'),js.indexOf('/* ===========================\n   Swapp hotfix — home background',js.indexOf('(function swappSideLightOnlyAccent(){')));
 assert.match(runtime,/root\.style\.setProperty\('--swapp-side-light', c\)/);
 assert.match(runtime,/body\.swappSideLightOnly #actus\.view\.active/);
 assert.match(runtime,/var\(--swapp-side-light,#22d3ee\) 43%/);
 assert.match(css,/#actus\.view\.active\s*\{[\s\S]*?var\(--swapp-side-light,var\(--brand,#22d3ee\)\)/);
 assert.match(css,/body:not\(\.swappSideLightOnly\):has\(#actus\.view\.active\)/);
 assert.doesNotMatch(css,/^body:has\(#actus\.view\.active\)\{/m);
});

test('Actualité shares its responsive background on both the list and article view',()=>{
 const app=read('assets/swapp-actus-app.js');
 const runtime=read('index_script.js');
 assert.match(app,/window\.SwappActus=Object\.freeze\(\{render,open,home\}\)/);
 assert.match(app,/node\.classList\.add\('swapp-actus-reading'\)/);
 assert.match(runtime,/body\.swappSideLightOnly #actus\.view\.active\{\s*min-height/);
 // Theme changes must update the side-light token without requiring a reload.
 assert.match(runtime,/window\.setViewerThemeColor = function swappSetSideLightColorOnly\(color\)/);
 assert.match(runtime,/applySideLight\(c\)/);
});

test('new CSS and runtime versions are loaded by the SPA and the editorial shell',()=>{
 const html=read('index.html');
 const shell=read('modules/swapp-news/site-shell.js');
 assert.match(html,/swapp-art-direction\.css\?v=20261015-player-39/);
 assert.match(html,/index_script\.js\?v=20261015-cinematic-38/);
 assert.match(shell,/swapp-art-direction\.css\?v=20261015-player-39/);
});
