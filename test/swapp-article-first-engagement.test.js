'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderNewsStory,renderArticleEngagement}=require('../modules/swapp-news/native-pages');
const {sitemapXml}=require('../modules/swapp-seo');
function article(overrides={}){
 return {slug:'baldurs-gate-news',title:"Baldur's Gate 3 : nouveautés & communauté",
  body:'## Le jeu\nLa rédaction présente les nouveautés vérifiées.',summary:'Un tour des annonces.',
  game:"Baldur’s Gate 3",category:'Actualité',status:'published',author:'SWAPP',
  publishedAt:'2026-10-21T19:00:00Z',sources:[],...overrides};
}
test('game article automatically exposes follow, wishlist and four community links without a hub',()=>{
 const html=renderNewsStory(article());
 for(const name of ['data-swapp-follow-game','data-swapp-wishlist-game','Partager ce jeu sur X','Discuter sur SWAPP SOCIAL','Partager sur Bluesky','Rejoindre le Discord SWAPP'])
  assert.match(html,new RegExp(name),name);
 assert.match(html,/data-game-slug="baldur-s-gate-3"/);
 assert.match(html,/https:\/\/discord\.gg\/AYKJYYJrTJ/);
 assert.match(html,/https:\/\/x\.com\/intent\/tweet/);
 assert.match(html,/https:\/\/bsky\.app\/intent\/compose/);
 assert.match(html,/\/social\?game=Baldur/);
 assert.match(html,/swapp-article-engagement/);
 assert.doesNotMatch(html,/Dossier du jeu ↗/);
 assert.ok(html.indexOf('class="swapp-article-engagement"')>html.indexOf('id="article-content"'));
 assert.ok(html.indexOf('class="swapp-article-engagement"')<html.indexOf('swapp-reader-next'));
});
test('articles with no identified game still share the article without follow/wishlist actions',()=>{
 const html=renderArticleEngagement(article({game:''}));
 assert.match(html,/Partager l’article sur X/);
 assert.match(html,/Discuter sur SWAPP SOCIAL/);
 assert.match(html,/Partager sur Bluesky/);
 assert.doesNotMatch(html,/data-swapp-follow-game|data-swapp-wishlist-game/);
});
test('sharing points to the article URL, not retired game pages, with escaped titles',()=>{
 const html=renderArticleEngagement(article({title:'Jeu & <script>alert(1)</script>'}));
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/swapp\.tv%2Factus%2Fbaldurs-gate-news/);
 assert.doesNotMatch(html,/href="\/jeux\//);
});
test('retired game index and detail pages do not appear in new sitemaps',()=>{
 const xml=sitemapXml([article()]);
 assert.match(xml,/\/actus\/baldurs-gate-news/);
 assert.doesNotMatch(xml,/\/jeux(?:\/|<)/);
});
