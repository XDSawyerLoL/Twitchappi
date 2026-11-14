'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {latestSnapshot,isNewer}=require('../assets/swapp-nav-utility');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const {catalogueContent}=require('../modules/swapp-catalogue-lab');

const old=[{slug:'article-deja-lu',publishedAt:'2026-11-13T12:00:00Z'}];
const fresh=[...old,{slug:'nouvelle-actualite',publishedAt:'2026-11-14T12:00:00Z'}];

test('une nouvelle publication réelle déclenche le témoin',()=>{
 assert.equal(isNewer(latestSnapshot(fresh),latestSnapshot(old)),true);
});
test('un même catalogue ou un article retiré ne provoque aucune fausse alerte',()=>{
 assert.equal(isNewer(latestSnapshot(old),latestSnapshot(old)),false);
 assert.equal(isNewer(latestSnapshot(old),latestSnapshot(fresh)),false);
 assert.equal(latestSnapshot([{slug:'manque-date'}]),null);
});
test('une seconde publication au même instant est détectée par son slug',()=>{
 const t='2026-11-14T12:00:00Z';
 assert.equal(isNewer(latestSnapshot([{slug:'article-deja-lu',publishedAt:t},{slug:'nouvelle-actualite',publishedAt:t}]),
   latestSnapshot([{slug:'article-deja-lu',publishedAt:t}])),true);
});
test('la navigation serveur inclut loupe, témoin et CSS commun',()=>{
 const html=renderPage({head:SHARED_HEAD_SLOT,content:'<main>SWAPP</main>'});
 assert.match(html,/swapp-nav-utility\.js/);
 assert.match(html,/swapp-nav-utility\.css/);
 assert.match(html,/id="nav"/);
});
test('la SPA inclut les contrôles et le catalogue conserve son filtrage natif',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'..','assets','swapp-catalogue-lab.js'),'utf8');
 assert.match(html,/swapp-nav-utility\.js/);
 assert.match(html,/swapp-nav-utility\.css/);
 assert.match(catalogueContent({publicHome:true}),/id="scl-search"/);
 assert.match(script,/const initialSearch=new URLSearchParams\(window\.location\.search\)\.get\('q'\)/);
});
