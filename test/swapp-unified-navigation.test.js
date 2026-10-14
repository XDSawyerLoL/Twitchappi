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
const expected=['Accueil','Découvrir','Catégories','Équipes','ACTUS'];
test('même contrat de menu pour toutes les pages SWAPP',()=>{
 assert.deepEqual(items.map(x=>x.label),expected);
 assert.equal(account.label,'Compte');
 const header=serverHeader('actus');
 const mobile=serverMobile('actus');
 for(const label of expected){
   assert.match(header,new RegExp('>'+label+'<'));
   assert.match(mobile,new RegExp('>'+label+'<'));
 }
 assert.match(header,/class="userBtn" href="\/compte"/);
 assert.match(header,/href="\/actus"[^>]*aria-current="page"/);
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
 assert.ok(html.indexOf('src="/assets/swapp-navigation.js"') < html.indexOf('src="/index_script.js'));
 assert.match(script,/window\.SwappNavigation/);
 assert.match(html,/href="\/assets\/swapp-unified-nav\.css"/);
 assert.match(layout({content:''}),/href="\/assets\/swapp-unified-nav\.css"/);
});
test('pages article, actualités et live partagent le même menu et SWAPP reste SWAPP',()=>{
 const story={slug:'jeu-2026',title:'Un jeu annoncé',body:'Une analyse assez complète pour découvrir cette actualité.',summary:'Un résumé de l’article',category:'ACTUS',author:'SWAPP',game:'Fortnite',sources:[],publishedAt:'2026-10-14T20:00:00Z'};
 for(const html of [renderNewsHome([]),renderNewsStory(story),renderTwitchWatch('streamer2026',{game:'Fortnite'})]){
   assert.match(html,/class="top"/);
   assert.match(html,/aria-current="page">ACTUS<\/a>/);
   assert.match(html,/id="mobileNav"/);
   assert.match(html,/href="\/decouvrir"/);
   assert.doesNotMatch(html,/<header class="site-header">/);
   assert.doesNotMatch(html,/>ACTUS × LIVE<\/a>/);
 }
});
test('l’ancien CSS éditorial n’altère plus la nouvelle barre commune',()=>{
 const css=fs.readFileSync(path.join(ROOT,'assets/swapp-media.css'),'utf8');
 const shared=fs.readFileSync(path.join(ROOT,'assets/swapp-unified-nav.css'),'utf8');
 assert.doesNotMatch(css,/body>header:not\(\.site-header\)(?!:not\(\.top\))/);
 assert.match(shared,/header\.top \.mainNav/);
 assert.match(shared,/#mobileNav/);
});
