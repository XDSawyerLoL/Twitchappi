'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {renderNewsStory,renderArticleEngagement}=require('../modules/swapp-news/native-pages');
const {sitemapXml}=require('../modules/swapp-seo');
function article(overrides={}){
 return {slug:'baldurs-gate-news',title:"Baldur's Gate 3 : nouveautés & communauté",
  body:'## Le jeu\nLa rédaction présente les nouveautés vérifiées.',summary:'Un tour des annonces.',
  game:'Baldur’s Gate 3',category:'Actualité',status:'published',author:'SWAPP',
  publishedAt:'2026-10-21T19:00:00Z',sources:[],...overrides};
}
test('compact share toolbar appears immediately after article hero, before reading',()=>{
 const html=renderNewsStory(article());
 const hero=html.indexOf('id="swapp-article-hero"');
 const share=html.indexOf('id="swapp-article-share"');
 const reading=html.indexOf('id="article-content"');
 const endcap=html.indexOf('class="swapp-article-engagement"');
 assert.ok(hero>=0&&hero<share&&share<reading&&reading<endcap);
 const toolbar=html.slice(share,reading);
 assert.match(toolbar,/class="swapp-article-share"/);
 assert.match(toolbar,/class="sash-label">Partager/);
 assert.doesNotMatch(toolbar,/Cette actu mérite|sash-eyebrow|sash-copy|sash-interact|sash-after/);
 assert.doesNotMatch(html,/class="sae-sharebar"/);
});
test('real locally hosted platform SVGs appear on five distinct useful actions',()=>{
 const html=renderNewsStory(article()),toolbar=html.slice(html.indexOf('id="swapp-article-share"'),html.indexOf('id="article-content"'));
 for(const name of ['Discuter de cet article sur SWAPP Social','Partager cet article sur X',
  'Partager cet article sur Bluesky','Rejoindre le Discord SWAPP','Copier le lien de cet article'])
  assert.match(toolbar,new RegExp(name),name);
 for(const path of ['/favicon.ico','/assets/brand-icons/x.svg','/assets/brand-icons/bluesky.svg','/assets/brand-icons/discord.svg'])
  assert.ok(toolbar.includes(path),path);
 assert.equal((toolbar.match(/class="sash-action(?:\s|")/g)||[]).length,5);
 for(const name of ['x','bluesky','discord']){
  const svg=fs.readFileSync(path.join(__dirname,'../assets/brand-icons/'+name+'.svg'),'utf8');
  assert.match(svg,/<svg/);
  assert.match(svg,/<path d="/);
  assert.doesNotMatch(svg,/<script|https?:\/\//i);
 }
});
test('game and general articles have share links, game actions stay in endcap',()=>{
 const game=renderNewsStory(article());
 assert.match(game,/data-swapp-follow-game[^>]*aria-pressed="false"/);
 assert.match(game,/data-swapp-wishlist-game[^>]*aria-pressed="false"/);
 assert.match(game,/data-game-slug="baldur-s-gate-3"/);
 const general=renderNewsStory(article({game:''}));
 assert.match(general,/Partager cet article sur X/);
 assert.match(general,/Partager cet article sur Bluesky/);
 const endcap=renderArticleEngagement(article({game:''}));
 assert.match(endcap,/La conversation/);
 assert.doesNotMatch(endcap,/data-swapp-follow-game|data-swapp-wishlist-game/);
});
test('sharing preserves canonical article destination and escapes hostile title',()=>{
 const html=renderNewsStory(article({title:'Jeu & <script>alert(1)</script>'}));
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/data-article-url="https:\/\/swapp\.tv\/actus\/baldurs-gate-news"/);
 assert.match(html,/swapp\.tv%2Factus%2Fbaldurs-gate-news/);
 assert.match(html,/https:\/\/x\.com\/intent\/tweet/);
 assert.match(html,/https:\/\/bsky\.app\/intent\/compose/);
 assert.doesNotMatch(html,/href="\/jeux\//);
});
test('toolbar is compact, responsive, keyboard-accessible and has truthful copy feedback',()=>{
 const html=renderNewsStory(article());
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-share.css'),'utf8');
 assert.match(css,/display:flex;align-items:center;flex-wrap:wrap/);
 assert.match(css,/min-height:54px/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/grid-template-columns|min-height:120px|box-shadow:0 22px/);
 assert.match(html,/aria-label="Partager cet article"/);
 assert.match(html,/data-swapp-share-notice role="status" aria-live="polite"/);
 assert.match(html,/data-swapp-share-copy data-article-url=/);
 assert.match(html,/href="\/assets\/swapp-article-share\.css\?v=20261110-compact-share-v2"/);
 assert.match(html,/src="\/assets\/swapp-article-share\.js\?v=20261110-compact-share-v2"/);
 assert.match(html,/class="sae-main"/);
 assert.match(html,/class="sae-controls"/);
 assert.doesNotMatch(html,/class="sae-invite"/);
});
test('SPA shares the same compact CSS and JS and loads them before its renderer',()=>{
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../assets/swapp-actus-app.js'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-share.js'),'utf8');
 assert.match(index,/href="\/assets\/swapp-article-share\.css\?v=20261110-compact-share-v2"/);
 assert.match(index,/src="\/assets\/swapp-article-share\.js\?v=20261110-compact-share-v2"/);
 assert.ok(index.indexOf('/assets/swapp-article-share.js')<index.indexOf('/assets/swapp-actus-app.js'));
 assert.match(app,/SwappArticleShare\?\.build/);
 assert.match(js,/window\.SwappArticleShare=\{build\}/);
 assert.match(js,/assets\/brand-icons\/bluesky\.svg/);
 assert.match(js,/assets\/brand-icons\/discord\.svg/);
 assert.match(js,/role','status'/);
});
test('retired game index and detail pages do not appear in sitemap',()=>{
 const xml=sitemapXml([article()]);
 assert.match(xml,/\/actus\/baldurs-gate-news/);
 assert.doesNotMatch(xml,/\/jeux(?:\/|<)/);
});
