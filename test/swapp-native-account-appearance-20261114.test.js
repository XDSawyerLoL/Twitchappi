'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const lab=require('../modules/swapp-catalogue-lab');
const shell=require('../modules/swapp-news/site-shell');
test('home and native pages offer matching account, appearance and motion assets',()=>{
 const home=lab.page({publicHome:true});
 const news=shell.layout({title:'News',content:'<main>News</main>',active:'actus'});
 for(const [route,markup] of [['home',home],['news',news]]){
  assert.match(markup,/id="userLabel">Se connecter<\/span>/,route+' guest button');
  assert.match(markup,/swapp-nav-session\.js\?v=20261114-native-account-v1/,route+' account controller');
  assert.match(markup,/swapp-native-account\.css\?v=20261114-native-account-v1/,route+' shared CSS');
  assert.match(markup,/swapp-route-motion\.css\?v=20261114-film-cut-v19/,route+' same motion');
  assert.equal((markup.match(/id="userBtn"/g)||[]).length,1);
  assert.equal((markup.match(/id="userMenu"/g)||[]).length,1);
 }
 assert.match(home,/swapp-editorial-color\.js\?v=20261114-native-accent-v1/);
 assert.match(home,/swapp-visual-polish\.css\?v=20261016-mobile-swipe-40/);
 assert.match(home,/id="swapp-catalogue-lab"/);
 assert.match(home,/id="scl-live"/);
 assert.match(home,/id="scl-articles"/);
});
test('native account keeps existing SPA preference and session endpoint',()=>{
 const js=read('assets/swapp-nav-session.js'),css=read('assets/swapp-native-account.css');
 assert.match(js,/oryon_viewer_accent/);
 assert.match(js,/\/api\/oryon\/session/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/Se connecter/);
 assert.match(js,/Créer un compte SWAPP/);
 assert.match(js,/Mon espace SWAPP/);
 assert.match(js,/Apparence/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/localStorage\.setItem\(KEY,value\)/);
 assert.match(js,/localStorage\.removeItem\(KEY\)/);
 assert.match(js,/swapp:accent-change/);
 assert.match(css,/swapp-native-theme-colors/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('transitions use same accent/motion across SPA and native without click interception',()=>{
 const page=read('modules/swapp-page-shell.js');
 const spa=read('index.html'),motion=read('assets/swapp-route-motion.css');
 assert.match(page,/20261114-film-cut-v19/);
 assert.match(spa,/20261114-film-cut-v19/);
 assert.match(motion,/@view-transition\{navigation:auto\}/);
 assert.match(motion,/swapp-document-in/);
 assert.match(motion,/@supports not \(view-transition-name: swapp-masthead\)/);
 assert.match(motion,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(read('assets/swapp-nav-session.js'),/history\.pushState|location\.assign|document\.startViewTransition/);
});
