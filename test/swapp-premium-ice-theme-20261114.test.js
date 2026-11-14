'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const THEME='swapp-obsidian-ice.css?v=20261114-smoked-glass-v20';
test('one premium theme is loaded for SPA and native routes, last in the head',()=>{
 const spa=renderIntoSpa(read('index.html'));
 const native=renderPage({head:'<meta charset="utf-8">'+SHARED_HEAD_SLOT,content:'<main>ACTUS</main>'});
 for(const html of [spa,native]){
  assert.equal(html.split(THEME).length-1,1,'missing or duplicate theme asset');
  assert.ok(html.indexOf(THEME)<html.indexOf('</head>'),'must render before body paint');
  assert.ok(html.indexOf(THEME)>html.indexOf('swapp-unified-nav.css'),'premium palette must follow navigation defaults');
 }
 assert.ok(spa.indexOf(THEME)>spa.indexOf('swapp-presentation-polish.css'),'premium must follow the legacy presentation CSS');
});
test('the chosen hue affects only low-strength aura and selected typography',()=>{
 const css=read('assets/swapp-obsidian-ice.css');
 for(const varName of ['--swapp-ice-bg:#030405','--swapp-ice-top:#050607','--swapp-ice-panel:rgba(10,12,14,.90)',
  '--swapp-ice-choice:var(--viewer-accent,var(--swapp-page-accent']){
  assert.ok(css.includes(varName),varName);
 }
 assert.match(css,/--swapp-ice-glow:color-mix\(in srgb,var\(--swapp-ice-choice\) 4%,transparent\)/);
 assert.match(css,/--swapp-ice-type:color-mix\(in srgb,var\(--swapp-ice-choice\) 52%,#edf1f4\)/);
 assert.match(css,/--brand:#aac0cf!important/);
 assert.match(css,/--accent:#aac0cf!important/);
 assert.match(css,/#home :is\(\.scl-kicker,\.scl-rail-eyebrow,\.scl-feature-kicker\)/);
 assert.match(css,/#actus :is\(\.swapp-actus-head small/);
 assert.match(css,/swapp-editorial-route \.article-wrap/);
 assert.match(css,/\.scl-card-media:not\(:has\(img\)\)/);
 assert.doesNotMatch(css,/img\{[^}]*filter|video\{[^}]*filter/i);
});
test('palette is deployable and all local picker keys remain untouched',()=>{
 const pack=read('tools/swapp-hostinger-package.js');
 const release=read('tools/swapp-release.js');
 for(const s of [pack,release])assert.ok(s.includes('assets/swapp-obsidian-ice.css'));
 assert.match(read('assets/swapp-editorial-color.js'),/oryon_viewer_accent/);
 assert.match(read('assets/swapp-nav-session.js'),/oryon_viewer_accent/);
 assert.match(read('index.html'),/swapp-account-menu\.js/);
});
