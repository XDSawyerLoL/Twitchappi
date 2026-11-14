'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const nav=require('../assets/swapp-navigation');
const {renderPage,hydrateSpaNavigation,SHARED_CSS,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const lab=require('../modules/swapp-catalogue-lab');
const editorial=require('../modules/swapp-news/site-shell');
const COMMON=['swapp-unified-nav.css?v=20261113-nav-simple-v2',
 'swapp-route-motion.css?v=20261114-cinematic-route-v18',
 'data-swapp-shell="shared-native-v2"','<header class="top"',
 'id="nav" class="mainNav"','id="mobileNav" class="mobileNav"'];

test('home, lab and native pages all use exactly one shared HTML shell',()=>{
 const pages=[
  ['home',lab.page({publicHome:true})],
  ['lab',lab.page()],
  ['native article',editorial.layout({title:'Article',content:'<main id="article">Lecture</main>',active:'actus'})],
  ['native TV',editorial.layout({title:'SWAPP TV',content:'<main id="tv">Direct</main>',active:'tv'})]
 ];
 for(const [name,html] of pages){
  assert.match(html,/^<!doctype html><html lang="fr"><head>/,name);
  assert.match(html,/<\/head><body class="[^"]+" data-swapp-shell="shared-native-v2">/,name);
  for(const fragment of COMMON)assert.ok(html.includes(fragment),name+': '+fragment);
  assert.equal((html.match(/swapp-route-motion\.css\?v=/g)||[]).length,1,name+' one motion stylesheet');
  assert.equal((html.match(/swapp-unified-nav\.css\?v=/g)||[]).length,1,name+' one nav stylesheet');
  assert.equal((html.match(/<header class="top">/g)||[]).length,1,name+' one header');
  assert.equal((html.match(/id="mobileNav"/g)||[]).length,1,name+' one mobile nav');
  assert.match(html,/<\/body><\/html>$/,name);
 }
 assert.match(pages[0][1],/rel="canonical" href="https:\/\/swapp\.tv\/"/);
 assert.match(pages[0][1],/id="swapp-catalogue-lab"/);
 assert.match(pages[1][1],/noindex,nofollow,noarchive/);
 assert.match(pages[2][1],/<main id="article">Lecture<\/main>/);
 assert.match(pages[3][1],/<main id="tv">Direct<\/main>/);
});
test('shared renderer preserves the same markup for desktop and mobile navigation',()=>{
 const home=lab.page({publicHome:true});
 const native=editorial.layout({content:'<main>Test</main>',active:'home'});
 assert.ok(home.includes(nav.serverHeader('home')));
 assert.ok(home.includes(nav.serverMobile('home')));
 assert.ok(native.includes(nav.serverHeader('home')));
 assert.ok(native.includes(nav.serverMobile('home')));
 assert.ok(!home.includes('Ancien accueil'));
});
test('SPA menu is server-populated before JavaScript; no first-paint empty header',()=>{
 const html=read('index.html');
 assert.match(html,/<nav id="nav" class="mainNav"><\/nav>/);
 const routes={
  '/categories':['Découvrir','/categories'],
  '/actus':['Actualité','/actus'],
  '/compte':['Compte','/compte'],
  '/tv':['SWAPP TV','/tv']
 };
 for(const [route,[label,link]] of Object.entries(routes)){
  const output=hydrateSpaNavigation(html,route);
  assert.match(output,/<nav id="nav" class="mainNav" aria-label="Navigation principale"><div class="navGroup">/);
  assert.match(output,/<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile"><a /);
  assert.ok(output.includes(nav.desktopNavigation(route==='/compte'?'settings':route==='/categories'?'categories':route==='/actus'?'actus':'tv')));
  assert.ok(output.includes('href="'+link+'"'),label);
  assert.ok(output.includes('aria-current="page"'),route+' active navigation');
  assert.equal((output.match(/class="navGroup"/g)||[]).length,1);
  assert.equal((output.match(/id="mobileNav"/g)||[]).length,1);
 }
 assert.match(read('server.js'),/renderIntoSpa\(seo\)/);
 assert.match(read('server.js'),/hydrateSpaNavigation\(integrated,res\.req\?\.path\|\|'\/'\)/);
 const populated=hydrateSpaNavigation(html,'/actus');
 assert.equal(hydrateSpaNavigation(populated,'/actus'),populated,'idempotent on already rendered headers');
});
test('shared native motion matches the existing SPA motion without new navigation interceptors',()=>{
 const css=read('assets/swapp-route-motion.css'),html=read('index.html');
 assert.match(html,/swapp-route-motion\.css\?v=20261114-cinematic-route-v18/);
 assert.match(css,/@view-transition\{navigation:auto\}/);
 assert.match(css,/header\.top\{view-transition-name:swapp-masthead\}/);
 assert.match(css,/#mobileNav\.mobileNav\{view-transition-name:swapp-mobile-masthead\}/);
 assert.match(css,/main\.app > \.view\.active\.swapp-route-enter/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(read('modules/swapp-page-shell.js'),/history\.pushState|window\.location|document\.startViewTransition|setTimeout/);
});
test('shell rejects missing CSS insertion marker rather than producing a divergent page',()=>{
 assert.throws(()=>renderPage({head:'<title>Missing</title>'}),/swapp_shell_styles_placeholder_missing/);
 const sample=renderPage({head:'<meta charset="utf-8">'+SHARED_HEAD_SLOT,content:'<main>OK</main>'});
 assert.ok(SHARED_CSS.every(url=>sample.includes(url)));
 assert.match(sample,/data-swapp-shell="shared-native-v2"/);
});
