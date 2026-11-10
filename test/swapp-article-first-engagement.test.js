'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderNewsStory,renderArticleEngagement}=require('../modules/swapp-news/native-pages');
const fs=require('node:fs'),path=require('node:path');
const {sitemapXml}=require('../modules/swapp-seo');
function article(overrides={}){
 return {slug:'baldurs-gate-news',title:"Baldur's Gate 3 : nouveautés & communauté",
  body:'## Le jeu\nLa rédaction présente les nouveautés vérifiées.',summary:'Un tour des annonces.',
  game:"Baldur’s Gate 3",category:'Actualité',status:'published',author:'SWAPP',
  publishedAt:'2026-10-21T19:00:00Z',sources:[],...overrides};
}
test('article shows premium sharing near the start and game engagement after reading',()=>{
 const html=renderNewsStory(article());
 for(const name of ['data-swapp-follow-game','data-swapp-wishlist-game',
  'Partager cet article sur X','Discuter de cet article sur SWAPP Social',
  'Partager cet article sur Bluesky','Rejoins les échanges sur Discord',
  'data-swapp-share-copy','Copier le lien'])
  assert.match(html,new RegExp(name),name);
 assert.match(html,/data-game-slug="baldur-s-gate-3"/);
 assert.match(html,/https:\/\/discord\.gg\/AYKJYYJrTJ/);
 assert.match(html,/https:\/\/x\.com\/intent\/tweet/);
 assert.match(html,/https:\/\/bsky\.app\/intent\/compose/);
 assert.match(html,/\/social\?game=Baldur/);
 assert.match(html,/swapp-article-engagement/);
 assert.ok(html.indexOf('class="swapp-article-share"')>html.indexOf('id="swapp-article-hero"'));
 assert.ok(html.indexOf('id="swapp-article-share"')<html.indexOf('id="article-content"'));
 assert.ok(html.indexOf('class="swapp-article-engagement"')>html.indexOf('id="article-content"'));
 assert.doesNotMatch(html,/class="sae-sharebar"/,'remove old cramped sharing footer');
});
test('game-less articles still share and have a tidy engagement ending',()=>{
 const html=renderNewsStory(article({game:''}));
 assert.match(html,/Partager cet article sur X/);
 assert.match(html,/Discuter de cet article sur SWAPP Social/);
 assert.match(html,/Partager cet article sur Bluesky/);
 assert.match(html,/La conversation/);
 assert.doesNotMatch(html,/data-swapp-follow-game|data-swapp-wishlist-game/);
 const endcap=renderArticleEngagement(article({game:''}));
 assert.match(endcap,/Fais-la découvrir à tes amis/);
 assert.doesNotMatch(endcap,/class="sae-controls"|class="sae-sharebar"/);
});
test('sharing uses the canonical article URL; article title is escaped',()=>{
 const html=renderNewsStory(article({title:'Jeu & <script>alert(1)</script>'}));
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/data-article-url="https:\/\/swapp\.tv\/actus\/baldurs-gate-news"/);
 assert.match(html,/swapp\.tv%2Factus%2Fbaldurs-gate-news/);
 assert.doesNotMatch(html,/href="\/jeux\//);
});
test('retired game index and detail pages do not appear in new sitemaps',()=>{
 const xml=sitemapXml([article()]);
 assert.match(xml,/\/actus\/baldurs-gate-news/);
 assert.doesNotMatch(xml,/\/jeux(?:\/|<)/);
});
test('share component is keyboard accessible, responsive and avoids multiple links',()=>{
 const html=renderNewsStory(article());
 assert.match(html,/id="swapp-share-title"/);
 assert.match(html,/class="sash-actions"/);
 assert.match(html,/class="sash-action sash-primary"/);
 assert.match(html,/class="sash-notice"[^>]*role="status" aria-live="polite"/);
 assert.match(html,/data-swapp-share-copy data-article-url=/);
 assert.match(html,/aria-label="Copier le lien de cet article"/);
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-share.css'),'utf8');
 assert.match(css,/@media\(max-width:860px\)/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/var\(--swapp-page-accent/);
 assert.match(html,/href="\/assets\/swapp-article-share\.css/);
 assert.match(html,/src="\/assets\/swapp-article-share\.js/);
 assert.match(html,/class="sae-invite"/);
 assert.match(html,/href="#swapp-article-share"/);
 const primary=html.indexOf('id="swapp-article-share"');
 const story=html.indexOf('id="article-content"');
 const footer=html.indexOf('class="swapp-article-engagement"');
 assert.ok(primary<story&&story<footer);
 const content=html.slice(primary,story);
 assert.equal((content.match(/class="sash-action(?:\s|\")/g)||[]).length,4,'four useful sharing actions');
});
test('game endcap keeps follow and wishlist, without repeating external sharing nav',()=>{
 const html=renderArticleEngagement(article());
 assert.match(html,/class="sae-main"/);
 assert.match(html,/class="sae-controls"/);
 assert.match(html,/class="sae-invite"/);
 assert.match(html,/data-swapp-follow-game[^>]*aria-pressed="false"/);
 assert.match(html,/data-swapp-wishlist-game[^>]*aria-pressed="false"/);
 assert.doesNotMatch(html,/class="sae-sharebar"|class="sae-links"|intent\/tweet/);
});

test('SPA bundles shared stylesheet and builder before its article renderer',()=>{
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../assets/swapp-actus-app.js'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-share.js'),'utf8');
 assert.match(index,/href="\/assets\/swapp-article-share\.css/);
 assert.match(index,/src="\/assets\/swapp-article-share\.js/);
 assert.ok(index.indexOf('/assets/swapp-article-share.js')<index.indexOf('/assets/swapp-actus-app.js'));
 assert.match(app,/SwappArticleShare\?\.build/);
 assert.match(js,/window\.SwappArticleShare=\{build\}/);
 assert.match(js,/role/);
});
