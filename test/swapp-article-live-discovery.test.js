'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const curation=require('../assets/swapp-live-curation');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('exact news game matches a real category with accents and punctuation',()=>{
 const article={slug:'baldurs-gate-3-confirmed',game:'Baldur’s Gate 3',title:'Baldur’s Gate 3 : nouvelles aventures'};
 const match=curation.matchLiveToArticle({game_name:"Baldur's Gate 3"},[article]);
 assert.equal(match.slug,article.slug);
 assert.equal(match.game,"Baldur's Gate 3");
 assert.ok(match.score>=200);
});

test('title-only matches must be clear and not confuse numbered sequels',()=>{
 const articles=[{slug:'fortnite-le-retour',title:'Fortnite retrouve un mode classique'}];
 assert.equal(curation.matchLiveToArticle({game_name:'Fortnite'},articles)?.slug,'fortnite-le-retour');
 assert.equal(curation.matchLiveToArticle({game_name:'Fortnite'},[{slug:'fortnite-2-annonce',title:'Fortnite 2 annoncé'}]),null);
 assert.equal(curation.matchLiveToArticle({game_name:'Hades'},[{slug:'hades-ii-arrive',title:'Hades II arrive bientôt'}]),null);
 assert.equal(curation.matchLiveToArticle({game_name:'Just Chatting'},articles),null);
 assert.equal(curation.matchLiveToArticle({game_name:'Valorant'},articles),null);
});

test('unpublished or unverifiable article references are not fabricated',()=>{
 const invalid=[{slug:'../../elsewhere',game:'Fortnite',title:'Actualité du jeu'},{slug:'game-test',game:'Fortnite'}];
 assert.equal(curation.matchLiveToArticle({game_name:'Fortnite'},invalid),null);
 assert.equal(curation.matchLiveToArticle({game_name:'Fortnite'},[]),null);
});

test('matching live rises within its platform, SWAPP retains priority and links only when matched',()=>{
 const news=[{slug:'elden-ring-return',game:'Elden Ring',title:'Elden Ring annonce une nouvelle extension'}];
 const swapp=[{host_login:'native-other',game:'Just Chatting',title:'Mon live'}];
 const twitch=[
  {login:'twitch-first',game_name:'League of Legends',title:'Partie classée'},
  {login:'twitch-match',game_name:'Elden Ring',title:'Elden Ring en direct'},
  {login:'twitch-next',game_name:'Fortnite',title:'Découverte'}
 ];
 const result=curation.curateHomeLives(swapp,twitch,12,news);
 assert.deepEqual(result.items.map(x=>curation.loginOf(x)),['native-other','twitch-match','twitch-first','twitch-next']);
 assert.equal(result.matchedCount,1);
 assert.equal(result.items[1].swappNewsMatch.slug,'elden-ring-return');
 assert.equal(result.items[2].swappNewsMatch,undefined);
 assert.equal(result.nativeCount,1);
});

test('matching never alters the normal ordering when editorial data is unavailable',()=>{
 const swapp=[{login:'n1'},{login:'n2'}],twitch=[{login:'t1'},{login:'t2'}];
 const r=curation.curateHomeLives(swapp,twitch,12,[]);
 assert.deepEqual(r.items.map(x=>curation.loginOf(x)),['n1','n2','t1','t2']);
 assert.equal(r.matchedCount,0);
});

test('matches are shown inside existing live cards, with no extra homepage section',()=>{
 const home=read('assets/swapp-home-news.js');
 const spa=read('index_script.js');
 const css=read('assets/swapp-art-direction.css');
 assert.match(home,/swapp:home-news-ready/);
 assert.match(home,/getCachedArticles/);
 assert.match(spa,/swappNewsMatch/);
 assert.match(spa,/homeNewsLink1014/);
 assert.match(spa,/paintLiveGrid\(true\)/);
 assert.match(css,/#home \.homeLiveCard1014 \.homeNewsLink1014/);
 assert.doesNotMatch(spa,/swapp-news-lives-extra-section|homeGameMatchPanel/);
 assert.match(spa,/id="homeLiveGrid1014"/);
});

test('only explicitly identified editorial games trigger game-ID discovery requests',()=>{
 const articles=[
  {slug:'fortnite-details',game:'Fortnite',title:'Fortnite : mise à jour'},
  {slug:'news-generic',game:'Actualités',title:'Quelques nouvelles'},
  {slug:'fortnite-today',game:'fortnite',title:'Le jeu cette semaine'},
  {slug:'elden-ring-update',game:'Elden Ring',title:'Elden Ring : le DLC'},
  {slug:'hades-announced',game:'Hades II',title:'Hades II arrive'}
 ];
 assert.deepEqual(curation.featuredGames(articles,2),['Fortnite','Elden Ring']);
 assert.deepEqual(curation.featuredGames([{slug:'short',title:'Fortnite dévoile ses nouveautés'}],2),[]);
 assert.deepEqual(curation.featuredGames([],2),[]);
});

test('game-specific discovery uses the existing verified API with strict request limits',()=>{
 const spa=read('index_script.js');
 const server=read('server.js');
 assert.match(spa,/featuredGames\(latestArticleMatches,2\)/);
 assert.match(spa,/api\/discovery\/game-lives\?limit=4&game=/);
 assert.match(spa,/lastGameSearchKey/);
 assert.match(spa,/liveDiscoveryRevision/);
 assert.match(server,/app\.get\('\/api\/discovery\/game-lives'/);
 assert.match(server,/games\?name=/);
 assert.match(server,/game_id=/);
 assert.match(read('assets/swapp-home-news.js'),/api\/discovery\/game-lives/);
});
