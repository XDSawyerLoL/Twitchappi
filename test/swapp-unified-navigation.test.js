'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {items,account,serverHeader,serverMobile}=require('../assets/swapp-navigation');
const {layout}=require('../modules/swapp-news/site-shell');
const {renderNewsHome,renderNewsStory}=require('../modules/swapp-news/native-pages');
const {renderTwitchWatch}=require('../modules/swapp-news/watch');
const ROOT=path.resolve(__dirname,'..');
const expected=['Accueil','Découvrir','Actualité','Social','Boutique','SWAPP TV'];
test('même contrat de menu pour toutes les pages SWAPP',()=>{
 assert.deepEqual(items.map(x=>x.label),expected);
 assert.equal(account.label,'Compte');
 const header=serverHeader('actus');
 const mobile=serverMobile('actus');
 for(const label of expected){
   assert.ok(header.includes(label),'desktop '+label);
   assert.ok(mobile.includes(label),'mobile '+label);
 }
 assert.ok(header.includes('id="userBtn" class="userBtn"'));assert.ok(header.includes('id="userMenu"'));
 assert.match(header,/href="\/actus"[^>]*aria-current="page"/);
 assert.doesNotMatch(header,/swappIntegratedNewsNav/);
 assert.doesNotMatch(mobile,/swappIntegratedNewsNav/);
 assert.match(mobile,/href="\/compte"/);
});
test('le serveur utilise la barre et les identifiants exacts du site de lives',()=>{
 const article=layout({content:'<main id="content">TEST</main>'});
 const home=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 for(const marker of ['class="top"','class="topbar"','class="brand"','class="mainNav"','class="navGroup"','class="userArea"','class="userBtn"','id="mobileNav"']){
   assert.ok(article.includes(marker),marker+' missing in ACTUS');
   assert.ok(home.includes(marker),marker+' missing in SPA');
 }
 assert.match(article,/href="\/equipes"/);
 assert.match(article,/href="\/decouvrir"/);
 assert.match(article,/href="\/compte"/);
});
test('le site client charge le même contrat avant le script SPA',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const script=fs.readFileSync(path.join(ROOT,'index_script.js'),'utf8');
 assert.ok(html.indexOf('src="/assets/swapp-navigation.js?v=20261022-one-account-menu-v2"') < html.indexOf('src="/index_script.js'));
 assert.match(script,/window\.SwappNavigation/);
 assert.match(html,/href="\/assets\/swapp-unified-nav\.css\?v=20261022-tvnav-v1"/);
 assert.match(layout({content:''}),/href="\/assets\/swapp-unified-nav\.css\?v=20261022-tvnav-v1"/);
});
test('pages article, actualités et live partagent le même menu et SWAPP reste SWAPP',()=>{
 const story={slug:'jeu-2026',title:'Un jeu annoncé',body:'Une analyse assez complète pour découvrir cette actualité.',summary:'Un résumé de l’article',category:'ACTUS',author:'SWAPP',game:'Fortnite',sources:[],publishedAt:'2026-10-14T20:00:00Z'};
 for(const html of [renderNewsHome([]),renderNewsStory(story)]){
   assert.match(html,/class="top"/);
   assert.match(html,/aria-current="page">Actualité<\/a>/);
   assert.match(html,/id="mobileNav"/);
   assert.match(html,/href="\/decouvrir"/);
   assert.doesNotMatch(html,/<header class="site-header">/);
   assert.doesNotMatch(html,/>ACTUS × LIVE<\/a>/);
 }
});
test('le lecteur live conserve le menu et sélectionne Découvrir',()=>{const page=renderTwitchWatch('streamer2026',{game:'Fortnite'});assert.ok(page.includes('id="userBtn"'));assert.ok(page.includes('aria-current="page">Découvrir</a>'));});
test('l’ancien CSS éditorial n’altère plus la nouvelle barre commune',()=>{
 const css=fs.readFileSync(path.join(ROOT,'assets/swapp-media.css'),'utf8');
 const shared=fs.readFileSync(path.join(ROOT,'assets/swapp-unified-nav.css'),'utf8');
 assert.doesNotMatch(css,/body>header:not\(\.site-header\)(?!:not\(\.top\))/);
 assert.match(shared,/header\.top \.mainNav/);
 assert.match(shared,/#mobileNav/);
});

// All public routes stay reachable in one mobile row, with a More menu.
test('navigation mobile compacte sans défilement horizontal',()=>{
 const shared=fs.readFileSync(path.join(ROOT,'assets/swapp-unified-nav.css'),'utf8');
 assert.match(shared,/@media\(max-width:389px\)/);
 assert.match(shared,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(shared,/min-height:44px/);
 assert.match(shared,/env\(safe-area-inset-bottom\)/);
 assert.match(shared,/swapp-mobile-more-links/);
});

test('SOCIAL, videos and shop remain in the shared mobile menu',()=>{
 const menu=serverMobile('community');
 assert.match(menu,/class="swapp-mobile-more"/);
 assert.match(menu,/href="\/social"[^>]*aria-current="page"/);
 assert.match(menu,/href="\/bandes-annonces"/);
 assert.match(menu,/href="\/boutique"/);
 const home=require('../assets/swapp-navigation').serverHeader('shop');
 assert.match(home,/href="\/boutique"[^>]*aria-current="page"/);
});


test('Social, Vidéos et Boutique partagent exactement les dimensions du logo et de la navigation',()=>{
 const {community,trailers,shop}=require('../modules/swapp-hubs');
 const spa=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const navCss=fs.readFileSync(path.join(ROOT,'assets/swapp-unified-nav.css'),'utf8');
 const pages=[community(),trailers(),shop()];
 const brand=/<a class="brand" href="\/"[^>]*><span class="swapp-wordmark-text">SWAPP<span class="swapp-wordmark-dot"/;
 for(const html of [spa,...pages]){
  assert.match(html,brand);
  assert.match(html,/swapp-unified-nav\.css\?v=20261022-tvnav-v1/);
  assert.match(html,/class="topbar"/);
  assert.match(html,/id="nav" class="mainNav"/);
  assert.match(html,/id="userBtn" class="userBtn"|id="userBtn" class="userBtn"/);
 }
 assert.match(navCss,/header\.top a\.brand\{[\s\S]*?font-size:25px!important/);
 assert.match(navCss,/header\.top \.topbar\{[\s\S]*?height:68px!important/);
 assert.match(navCss,/header\.top #nav\.mainNav :is\(a,button\)\{/);
 assert.match(navCss,/@media\(max-width:1080px\)\{[\s\S]*?font-size:24px!important/);
 assert.doesNotMatch(navCss,/#nav\.swapp-nav-consistent/);
});

test('SWAPP TV is a highlighted top-level destination; videos stay inside Actualité',()=>{
 const nav=require('../assets/swapp-navigation');
 const header=nav.serverHeader('tv'),news=nav.serverHeader('trailers'),mobile=nav.serverMobile('tv');
 assert.match(header,/href="\/tv" class="active swapp-tv-nav-cta" aria-current="page"/);
 assert.match(header,/class="swapp-news-more"/);
 assert.match(header,/href="\/bandes-annonces"/);
 assert.doesNotMatch(nav.items.map(x=>x.label).join(','),/Vidéos/);
 assert.match(news,/href="\/bandes-annonces" aria-current="page"/);
 assert.match(mobile,/class="swapp-tv-nav-cta"/);
 assert.match(mobile,/swapp-mobile-menu-title">ACTUALITÉ/);
 assert.match(mobile,/Vidéos et bandes-annonces/);
 const programme=nav.serverHeader('agenda');
 assert.match(programme,/swapp-tv-nav-cta/);
 assert.doesNotMatch(programme,/href="\/tv"[^>]*aria-current="page"/);
});
