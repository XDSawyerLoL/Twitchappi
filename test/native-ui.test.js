'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderNewsHome,renderNewsStory,markdown}=require('../modules/swapp-news/native-pages');
const {renderStudio,js}=require('../modules/swapp-news/editor-ui');
const {Script}=require('node:vm');
const article={slug:'mon-article',title:'Un <script>alert(1)</script> jeu',summary:'Le jeu arrive avec de nombreuses nouveautés',body:'## Notre analyse\n\nLe jeu propose **beaucoup** de nouveautés.\n\n- Une première\n- Une deuxième\n\n<script>alert(1)</script>',category:'Analyse',publishedAt:'2026-10-14T12:00:00Z',author:'SWAPP',sources:[{url:'https://example.org/news',label:'Site de l’éditeur'}]};
test('le magazine n’affiche aucun lien Fourthwall et garde le menu principal',()=>{
 const html=renderNewsHome([article],{baseUrl:'https://swapp.tv'});
 assert.match(html,/Lis l’actu/);assert.match(html,/id="en-direct"/);assert.match(html,/data-swapp-live-shelf/);assert.match(html,/SWAPP/);assert.match(html,/href="\/actus\/mon-article"/);
 assert.match(html,/href="\/categories"/);assert.doesNotMatch(html,/Archives JustPlayer|Lire sur JustPlayer|supporters\/posts/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
test('affiche les véritables références JustPlayer sans inventer de contenu complet',()=>{
 const html=renderNewsHome([]);
 assert.match(html,/Les publications JustPlayer/);
 assert.ok(html.includes('href="/actus/justplayer/266628"'));
 assert.doesNotMatch(html,/Lire sur JustPlayer|Archives JustPlayer/);
 assert.match(html,/id="userBtn"/);assert.match(html,/swapp-navigation.js/);
});
test('les catégories et la recherche sont filtrées, sans scripts dangereux',()=>{
 let html=renderNewsHome([article],{category:'Guides',query:'<script>'});
 assert.doesNotMatch(html,/<a class="story-card"/);assert.match(html,/Aucun article/);
 assert.doesNotMatch(html,/value="<script>"/);
});
test('le corps de l’article accepte du Markdown limité et échappe tout HTML',()=>{
 const parsed=markdown(article.body);
 assert.match(parsed,/<h2>Notre analyse<\/h2>/);assert.match(parsed,/<strong>beaucoup<\/strong>/);
 assert.match(parsed,/<li>Une première<\/li>/);assert.doesNotMatch(parsed,/<script>/);
 const html=renderNewsStory(article);
 assert.match(html,/application\/ld\+json/);assert.match(html,/rel="canonical"/);assert.match(html,/data-swapp-live-shelf/);
 assert.doesNotMatch(html,/Publié initialement|justplayer.fr\/supporters/);
});
test('le studio prévoit création, liste, révision, publication, dépublication et import sans JSON à coller',()=>{
 const html=renderStudio();
 for(const marker of ['id="ed-list"','id="ed-create"','id="ed-save"','id="ed-publish"','id="ed-unpublish"','id="ed-scan"','id="ed-import"','id="image-preview"'])assert.ok(html.includes(marker),marker);
 assert.doesNotMatch(html,/id="importJson"/);
 new Script(js);
});