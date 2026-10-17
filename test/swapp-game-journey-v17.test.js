'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');

const article={
 slug:'une-aventure-sur-elden-ring',
 title:'Les mystères d’Elden Ring à découvrir sur SWAPP',
 summary:'Un nouvel angle sur ce jeu et sa communauté.',
 body:'## Notre analyse\n\nUne lecture approfondie.\n\n## Et ensuite ?\n\nRetrouvons les créateurs.',
 game:'Elden Ring',category:'Actualité',
 author:'Rédaction SWAPP',publishedAt:'2026-10-17T12:00:00Z',sources:[]
};

test('native game article has exactly three main journeys and still keeps sharing separate',()=>{
 const html=renderNewsStory(article);
 const i=html.indexOf('class="story-actions swapp-article-hero-actions swapp-game-journey-actions"');
 assert.ok(i>=0,'main action group');
 const end=html.indexOf('</div>',i);
 const main=html.slice(i,end);
 for(const label of ['Lire l’article','Voir les lives','En discuter'])assert.ok(main.includes(label));
 assert.equal((main.match(/class="button-link/g)||[]).length,3);
 assert.match(main,/href="#article-content"/);
 assert.match(main,/href="#swapp-article-lives"/);
 assert.match(main,/href="\/communaute\?share=news&amp;title=/);
 assert.match(main,/https%3A%2F%2Fswapp\.tv%2Factus%2Fune-aventure-sur-elden-ring/);
 assert.match(html,/data-swapp-article-share/,'original share remains available');
 assert.match(html,/id="swapp-article-lives"/);
});

test('no-game article never pretends there is a verified game-specific live',()=>{
 const html=renderNewsStory({...article,game:''});
 const main=html.slice(html.indexOf('class="story-actions swapp-article-hero-actions'),html.indexOf('</div>',html.indexOf('class="story-actions swapp-article-hero-actions')));
 assert.match(main,/href="\/decouvrir"/);
 assert.doesNotMatch(main,/href="#swapp-article-lives"/);
});

test('homepage lead shows one real article with native navigation and verified-only avatars',()=>{
 const home=read('assets/swapp-home-news.js');
 for(const name of ['swapp-home-feature-bridge','swapp-home-feature-cta','swapp-home-feature-creators','swapp-feature-ready',
  "action('Lire l’article'","action('Voir les lives'","action('En discuter'","fetchItems('/api/discovery/game-lives?limit=5&game="])
  assert.ok(home.includes(name),name);
 assert.ok(home.includes('data?.success!==true'),'unverified API replies must never display avatars');
 assert.ok(home.includes("gameKey(stream.game_name||stream.game)!==gameKey(game)"));
 assert.match(home,/encodeURIComponent\('https:\/\/swapp\.tv\/actus\/'/);
 assert.ok(!home.includes('Math.random()'));
});

test('SPA article reader repeats the same three routes without auto-publishing',()=>{
 const spa=read('assets/swapp-actus-app.js');
 assert.match(spa,/el\('nav','swapp-game-journey-actions'\)/);
 for(const cta of ["'Lire l’article ↓'","'Voir les lives →'","'En discuter →'"])assert.ok(spa.includes(cta));
 assert.match(spa,/\/communaute\?share=news&title=/);
 assert.match(spa,/heroCopy\.append\(actions\)/);
 assert.doesNotMatch(spa,/\/api\/pulse\/post|publishPost\(/);
});

test('Swap ton mood preserves V4 action handlers and keeps saved items mounted',()=>{
 const mood=read('assets/swapp-discover-comfort.js');
 const css=mood.slice(mood.indexOf('SWAPP V17 DISCOVER'));
 for(const marker of ['swapp-mood-reason','swapp-mood-saved-toggle','is-collapsed',
  "?'Passer'","?'Regarder'","?'Garder'","const mood=area.querySelector"]){
  assert.ok(mood.includes(marker),marker);
 }
 assert.match(mood,/deck\.classList\.toggle\('is-collapsed'\)/);
 assert.match(mood,/deck\.insertBefore\(toggle,deck\.firstChild\)/);
 assert.match(css,/\.v4Deck\.is-collapsed/);
 assert.doesNotMatch(mood,/localStorage|sendBeacon|fetch\(|\.replaceChildren\(/);
});

test('all three screens share the same lightweight CSS and mobile-safe controls',()=>{
 const css=read('assets/swapp-game-journey.css');
 for(const part of ['SWAPP GAME JOURNEY V17','.swapp-home-feature-links','.swapp-game-journey-actions',
  '.swapp-home-feature-faces','@media(max-width:650px)','@media(prefers-reduced-motion:reduce)'])
  assert.ok(css.includes(part),part);
 let bal=0;
 for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){bal+=c==='{'?1:c==='}'?-1:0;assert.ok(bal>=0)}
 assert.equal(bal,0);
 for(const file of ['index.html','modules/swapp-news/site-shell.js','modules/swapp-news/article-core.js']){
  const html=read(file);
  assert.match(html,/swapp-game-journey\.css\?v=20261018-hero-lifecycle-v25/);
 }
 const release=read('tools/swapp-release.js');
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(release,/'assets\/swapp-game-journey\.css'/);
 assert.match(smoke,/SWAPP GAME JOURNEY V17/);
});
