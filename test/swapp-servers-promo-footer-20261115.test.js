'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {page,detailPage}=require('../modules/swapp-servers');
const {createPage}=require('../modules/swapp-servers-create');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');

test('free listing promotion is the first hero, before the community ranking and footer',()=>{
 for(const game of ['', 'Minecraft','Discord / Multigaming']){
  const html=page({game});
  for(const label of ['Référencement gratuit','Ajouter mon serveur','Publication automatique','Votes, avis et statistiques','100 % gratuit']){
   assert.ok(html.toLowerCase().includes(label.toLowerCase()),game+' '+label);
  }
  if(game){
   assert.ok(html.indexOf('ss-directory-intro')<html.indexOf('id="ss-results"'));
   assert.ok(html.indexOf('id="ss-results"')<html.indexOf('id="ss-grow-title"'),
    'category listings should be visible before the marketing banner');
  }else{
   assert.ok(html.indexOf('id="ss-grow-title"')<html.indexOf('ss-directory-intro'));
   assert.ok(html.indexOf('id="ss-grow-title"')<html.indexOf('id="ss-results"'));
   assert.ok(html.indexOf('ss-directory-intro')<html.indexOf('id="ss-results"'));
  }
  assert.ok(html.indexOf('id="ss-grow-title"')<html.indexOf('class="swapp-footer')||html.includes('swapp-footer.js'));
  assert.match(html,/href="\/serveurs\/creer(?:\?jeu=[^"]*)?"/);
  assert.doesNotMatch(html,/depuis 2012/i);
  assert.doesNotMatch(html,/10 000 votes|1000 avis|plus de \d+ serveurs/i);
 }
 assert.match(page({game:'Minecraft'}),/href="\/serveurs\/creer\?jeu=Minecraft"/);
});

test('all native pages use the existing SWAPP footer, including listing, creator and server profile',()=>{
 const samples=[
  page(),
  createPage({game:'Minecraft',games:['Minecraft','Discord / Multigaming']}),
  detailPage({id:'a'.repeat(32),slug:'test-serveur-aaaaaaa',name:'Une communauté',game:'Minecraft',
   description:'Communauté vérifiable',website:'https://example.org',tags:'PvP',region:'France'},2),
  renderPage({head:'<meta charset="utf-8">'+SHARED_HEAD_SLOT,content:'<main>Test natif</main>',active:'servers'})
 ];
 for(const html of samples){
  assert.match(html,/assets\/swapp-footer-native\.css/);
  assert.match(html,/assets\/swapp-footer\.js/);
  assert.match(html,/data-swapp-shell="shared-native-v2"/);
 }
 const footer=read('assets/swapp-footer.js');
 assert.match(footer,/if\(document\.querySelector\('\[data-swapp-footer\]'\)\)return/);
 for(const link of ['/contact','/mentions-legales','/confidentialite','/cookies','/cgu','/a-propos']){
  assert.ok(footer.includes('href="'+link+'"'),link);
 }
 assert.match(footer,/© \$\{new Date\(\)\.getFullYear\(\)\} SWAPP/);
 assert.doesNotMatch(footer,/depuis 2012/);
});

test('native footer has responsive visual rules without importing the unrelated ACTUS stylesheet',()=>{
 const css=read('assets/swapp-footer-native.css');
 assert.match(css,/\.swapp-footer-top\{display:grid/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/focus-visible/);
 const shell=read('modules/swapp-page-shell.js');
 assert.ok(!shell.includes("'/assets/swapp-media.css"));
 const pack=read('tools/swapp-hostinger-package.js');
 for(const resource of ['assets/swapp-footer-native.css','assets/swapp-footer.js']){
  assert.ok(pack.includes("'"+resource+"'"),resource+' must be included in Hostinger build');
 }
});
