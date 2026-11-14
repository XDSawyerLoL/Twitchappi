'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderNewsHome}=require('../modules/swapp-news/native-pages');

test('GEO: le catalogue des actualités rend les articles dans le HTML sans JavaScript',()=>{
 const html=renderNewsHome([{slug:'guide-test-geo',title:'Guide de progression vérifié',summary:'Conseils de progression vérifiés et datés',category:'Guides',publishedAt:'2026-11-14T10:00:00Z'}]);
 assert.match(html,/<h1[^>]*>/);
 assert.match(html,/Guide de progression vérifié/);
 assert.match(html,/Conseils de progression vérifiés et datés/);
 assert.match(html,/href="\/actus\/guide-test-geo"/);
 assert.match(html,/rel="canonical" href="https:\/\/swapp.tv\/actus"/);
});

test('GEO: la recherche ne conserve pas un article hors filtre',()=>{
 const html=renderNewsHome([{slug:'guide-test-geo',title:'Guide vérifié',summary:'Progression',category:'Guides'}],{query:'introuvable'});
 assert.doesNotMatch(html,/href="\/actus\/guide-test-geo"/);
 assert.match(html,/Aucun article pour cette recherche/);
});
