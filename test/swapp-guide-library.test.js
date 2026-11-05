'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isGuide,guideArticles,guideLinksForGame,renderGuideIndex}=require('../modules/swapp-guide-library');
const {gameHubs,renderGamePage}=require('../modules/swapp-game-pages');
const {sitemapXml}=require('../modules/swapp-seo');
const good={slug:'hades-ii-build-guide',status:'published',title:'Hades II : guide de progression',
 summary:'Un guide documenté pour comprendre les mécanismes de progression.',
 category:'Guides',game:'Hades II',sources:[{url:'https://example.org/patches',label:'Patch officiel'}],
 updatedAt:'2026-11-06T08:00:00Z'};
test('guide library accepts only sourced published guides and never duplicates',()=>{
 const records=[good,{...good},{...good,slug:'secret',status:'draft'},
  {...good,slug:'unsourced',sources:[]},
  {...good,slug:'news',category:'Actualités',tags:[]},
  {...good,slug:'bad/link',category:'Guides'}];
 assert.equal(isGuide(good),true);
 assert.deepEqual(guideArticles(records).map(a=>a.slug),[good.slug]);
});
test('guide home exposes Aion 2 and only real eligible editorial guides',()=>{
 const page=renderGuideIndex([good,{...good,slug:'hidden',status:'draft'}]);
 assert.match(page,/href="\/guides\/aion-2"/);
 assert.match(page,/href="\/actus\/hades-ii-build-guide"/);
 assert.doesNotMatch(page,/href="\/actus\/hidden"/);
 assert.match(page,/canonical" href="https:\/\/swapp.tv\/guides"/);
 assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
 assert.match(sitemapXml([]),/https:\/\/swapp.tv\/guides/);
});
test('game page links to relevant guides but not drafts or other games',()=>{
 const source=[good,{...good,slug:'hades-news',title:'Actualité du jour',category:'Actualités'}];
 const group=gameHubs(source)[0];
 const html=renderGamePage(group);
 assert.match(html,/Guides et stratégies/);
 assert.match(html,/href="\/actus\/hades-ii-build-guide"/);
 assert.match(html,/data-swapp-game-score/);
 assert.match(html,/data-game-slug="hades-ii"/);
 const noGuides=gameHubs([{...good,category:'Actualités'}])[0];
 assert.equal(guideLinksForGame(noGuides),'');
});
test('guide content is escaped before HTML rendering',()=>{
 const attack={...good,slug:'evil-guide',title:'Comment <img src=x onerror=alert(1)>',summary:'Une présentation & des exemples sûrs.'};
 const page=renderGuideIndex([attack]);
 assert.doesNotMatch(page,/<img src=x onerror/);
 assert.match(page,/&lt;img src=x onerror=alert/);
 assert.match(page,/&amp; des exemples/);
});