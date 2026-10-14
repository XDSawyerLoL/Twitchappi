'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderNewsHome,renderNewsStory}=require('../modules/swapp-news/native-pages');
const {isTwitchLogin,renderTwitchWatch}=require('../modules/swapp-news/watch');

const story={slug:'fortnite-derniere-saison',title:'Fortnite : une saison pleine de nouveautés',
  body:'## Actualités\n\nUn article complet et vérifié.',summary:'Le résumé de la nouvelle saison',
  game:'Fortnite',category:'Jeux vidéo',author:'SWAPP',publishedAt:'2026-10-14T12:00:00.000Z',sources:[{url:'https://example.org',label:'Source'}]};

test('le média mêle naturellement infos et lives dans la même page',()=>{
 const html=renderNewsHome([story]);
 assert.match(html,/Lis l’actu/);
 assert.match(html,/Vis le jeu/);
 assert.match(html,/data-swapp-live-shelf/);
 assert.match(html,/href="\/actus\/fortnite-derniere-saison"/);
 assert.doesNotMatch(html,/Archives JustPlayer|Lire sur JustPlayer/);
});
test('un article de jeu propose les lives liés plutôt que des streams arbitraires',()=>{
 const html=renderNewsStory(story);
 assert.match(html,/data-game="Fortnite"/);
 assert.match(html,/data-swapp-live-shelf/);
 assert.match(html,/application\/ld\+json/);
});
test('lecteur Twitch interne utilise les deux parents autorisés',()=>{
 const html=renderTwitchWatch('streamer_2026',{game:'Fortnite'});
 assert.match(html,/player.twitch.tv/);
 assert.match(html,/parent=swapp.tv&parent=www.swapp.tv/);
 assert.match(html,/data-articles-for-game="Fortnite"/);
 assert.match(html,/swapp-media-live.js/);
 assert.equal(isTwitchLogin('streamer_2026'),true);
 assert.equal(isTwitchLogin('../secret'),false);
});
test('un nom de jeu malveillant reste échappé côté serveur',()=>{
 const html=renderTwitchWatch('streamer_2026',{game:'"><script>alert(1)</script>'});
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('les scripts d’association articles/lives sont du JavaScript valide',()=>{
 for(const name of ['swapp-media-live.js','swapp-home-news.js']){
   const code=fs.readFileSync(path.join(__dirname,'../assets',name),'utf8');
   assert.doesNotThrow(()=>new vm.Script(code));
 }
});
