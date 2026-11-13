'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {hydrateSpaNavigation}=require('../modules/swapp-page-shell');
const {page,catalogueContent}=require('../modules/swapp-catalogue-lab');
test('Accueil and Découvrir share one real index.html app, header, account and appearance',()=>{
 const index=read('index.html');
 const home=hydrateSpaNavigation(renderIntoSpa(index),'/');
 const discovery=hydrateSpaNavigation(renderIntoSpa(index),'/categories');
 for(const html of [home,discovery]){
  for(const fragment of ['<main class="app">','data-swapp-home-spa="v16"','id="swapp-catalogue-lab"',
    'id="scl-articles"','id="scl-live"','id="scl-games"','id="scl-small"',
    'id="scl-favorites"','swapp-account-menu.js','swapp-catalogue-spa.js?v=20261114-real-spa-v16']){
    assert.ok(html.includes(fragment),fragment);
  }
  assert.equal((html.match(/<header class="top">/g)||[]).length,1);
  assert.equal((html.match(/id="userMenu"/g)||[]).length,1);
  assert.equal((html.match(/<main class="app">/g)||[]).length,1);
  assert.doesNotMatch(html,/class="scl-side"/);
 }
 assert.match(home,/href="\/" class="active" aria-current="page"/);
 assert.match(discovery,/href="\/categories" class="active" aria-current="page"/);
 assert.equal(renderIntoSpa(home),home);
 assert.doesNotMatch(catalogueContent({publicHome:true}),/scl-side-brand/);
 assert.match(page(),/class="scl-side"/);
});
test('same-document navigation is real SPA navigation, not a fake transition',()=>{
 const js=read('assets/swapp-catalogue-spa.js');
 assert.match(js,/window\.renderHome=stableHome/);
 assert.match(js,/window\.renderNav=permanentNav/);
 assert.match(js,/window\.setView\(view\)/);
 assert.match(js,/document\.startViewTransition/);
 assert.match(js,/prefers-reduced-motion/);
 assert.doesNotMatch(js,/location\.assign|location\.reload|innerHTML|outerHTML/);
 assert.match(read('assets/swapp-hub-nav.js'),/window\.setView\('home'\)/);
 const client=read('assets/swapp-catalogue-lab.js');
 assert.match(client,/spaHome=root\.closest\?\.\('#home\.view'\)/);
 assert.match(client,/refreshWhenVisible/);
});
test('release packaging and production checks require the SPA homepage files',()=>{
 const server=read('server.js'),smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(server,/renderIntoSpa\(seo\)/);
 assert.match(smoke,/data-swapp-home-spa/);
 assert.match(smoke,/!publicHome\.body\.includes\('class="scl-side"'\)/);
 for(const target of ['modules/swapp-catalogue-spa.js','assets/swapp-catalogue-spa.js','assets/swapp-catalogue-spa.css']){
  assert.ok(read('tools/swapp-release.js').includes(target));
  assert.ok(read('tools/swapp-hostinger-package.js').includes(target));
 }
 assert.match(read('assets/swapp-catalogue-spa.css'),/@media\(prefers-reduced-motion:reduce\)/);
});