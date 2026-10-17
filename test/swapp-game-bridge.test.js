'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('SPA list and article reader share one exact-game matcher',()=>{
 const app=read('assets/swapp-actus-app.js');
 const start=app.indexOf('const gameKey=');
 const end=app.indexOf('const fetchJson=',start);
 assert.ok(start>=0&&end>start,'game matcher must be defined before the readers');
 const ctx={};
 vm.runInNewContext(app.slice(start,end)+'\n;globalThis.check=sameGame;',ctx,{timeout:1000});
 const check=ctx.check;
 assert.equal(check('Hades','Hades II'),false);
 assert.equal(check('Planet Zoo','Planet Zoo 2'),false);
 assert.equal(check('Fortnite','Fortnite'),true);
 assert.equal(check('Planet Zoo 2','Planet Zoo II'),true);
 assert.equal(check('GTA VI','Grand Theft Auto VI'),true);
 assert.equal(check('Elden Ring','Valorant'),false);
 assert.equal(app.split('const matches=sameGame;').length-1,2);
 assert.ok(!app.includes('a.length>=7&&b.includes(a)'),'substring fallback creates false sequel matches');
 assert.ok(app.includes("!sameGame(game,data.game)"),'list must validate backend game identity');
 assert.ok(app.includes("!matches(a.game,data.game)"),'reader must validate backend game identity');
});

test('game context belongs to existing creator and article cards',()=>{
 const media=read('assets/swapp-media-live.js');
 const app=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-media.css');
 assert.match(media,/function card\(item,matchedGame=''/);
 assert.match(media,/gameMatch\(matchedGame,item\.game_name\|\|item\.category\|\|item\.game\)/);
 assert.match(media,/swapp-related-cover/);
 assert.match(media,/body\.append\(title,connection,desc,action\)/);
 assert.match(app,/swapp-game-connection','Même jeu/);
 assert.match(css,/SWAPP GAME BRIDGE V12/);
 assert.match(css,/\.swapp-game-connection/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('creator links remain inside SWAPP, never turn a live into an external default click',()=>{
 const app=read('assets/swapp-actus-app.js');
 const media=read('assets/swapp-media-live.js');
 assert.match(app,/\/live\/twitch\//);
 assert.match(app,/SwappArticlePlayer\?\.openFull/);
 assert.match(media,/\/live\/twitch\//);
 assert.doesNotMatch(app,/https:\/\/www\.twitch\.tv\//);
 assert.match(media,/\/api\/discovery\/game-lives\?limit=6&game=/);
 assert.doesNotMatch(read('assets/swapp-home-news.js'),/api\/discovery\/game-lives/);
});

test('deployment fingerprint and public smoke cover the V12 bridge assets',()=>{
 const files=read('tools/swapp-release.js');
 const smoke=read('tools/swapp-deploy-smoke.js');
 const home=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 const legacy=read('modules/swapp-news/article-core.js');
 for(const marker of ["'assets/swapp-media.css'","'assets/swapp-media-live.js'","'modules/swapp-news/article-core.js'"])
  assert.ok(files.includes(marker),'fingerprint missing '+marker);
 for(const text of [home,shell,legacy])
  assert.ok(text.includes('20261017-game-bridge-v12'),'missing cache bust on one SWAPP route');
 assert.match(smoke,/SWAPP GAME BRIDGE V12/);
 assert.match(smoke,/Actualité still matches sequels incorrectly/);
});
