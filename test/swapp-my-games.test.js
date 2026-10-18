'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gameHubs,renderMyGames,renderGamePage,renderGameIndex}=require('../modules/swapp-game-pages');
const {registerSeoRoutes,sitemapXml}=require('../modules/swapp-seo');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const articles=[
 {slug:'story-one',title:'GTA 6 : premier article',summary:'Premier vrai article',game:'Grand Theft Auto VI',publishedAt:'2026-10-16T12:00:00Z',status:'published'},
 {slug:'story-two',title:'GTA 6 : deuxième article',summary:'Deuxième article réel',game:'GTA VI',publishedAt:'2026-10-17T12:00:00Z',status:'published'},
 {slug:'private-story',title:'Secret interne',summary:'Ne doit pas apparaître',game:'Grand Theft Auto VI',status:'draft'},
 {slug:'other-game',title:'Jeu seul',summary:'Insuffisant',game:'Hades II',status:'published'}
];
function fakeResponse(){
 return {code:200,body:'',headers:{},set(k,v){this.headers[k]=v;return this},type(){return this},
  status(code){this.code=code;return this},send(s){this.body=s;return this}};
}
test('Mes jeux only offers real indexed games and published stories',()=>{
 const groups=gameHubs(articles);
 const html=renderMyGames(groups);
 assert.match(html,/data-swapp-library-root/);
 assert.match(html,/data-my-games-enable-sync/);
 assert.match(html,/data-my-games-export/);
 assert.match(html,/data-my-games-followed/);
 assert.match(html,/data-my-games-available/);
 assert.match(html,/data-my-games-news/);
 assert.match(html,/story-one/);
 assert.match(html,/story-two/);
 assert.doesNotMatch(html,/private-story|Secret interne|Hades II/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/data-story-date="2026-10-17T12:00:00.000Z"/);
 assert.match(html,/href="\/communaute"/);
 assert.match(html,/href="\/boutique"/);
 assert.doesNotMatch(html,/acheter maintenant|promotion limitée|\d+ spectateurs connectés/i);
});
test('index and game pages have explicit follow and Mes jeux paths without duplicate feeds',()=>{
 const groups=gameHubs(articles);
 const index=renderGameIndex(groups),game=renderGamePage(groups[0]);
 assert.match(index,/data-swapp-follow-game/);
 assert.match(index,/href="\/mes-jeux"/);
 assert.match(game,/data-game-slug="grand-theft-auto-vi"/);
 assert.match(game,/href="\/mes-jeux"/);
 assert.match(game,/href="\/boutique"/);
 assert.match(game,/data-swapp-live-shelf data-game="Grand Theft Auto VI"/);
});
test('Mes jeux reuses only published data from the existing cache and never goes into sitemap',async()=>{
 const routes=new Map();
 let reads=0;
 registerSeoRoutes({get:(path,callback)=>routes.set(path,callback)},{
  getPublished:async()=>{reads++;return articles}
 });
 const my=fakeResponse(),games=fakeResponse();
 await routes.get('/mes-jeux')({},my);
 await routes.get('/jeux')({},games);
 assert.equal(my.code,200);
 assert.equal(my.headers['Cache-Control'],'private, no-store');
 assert.match(my.body,/Mes jeux/);
 assert.equal(reads,1,'same public editorial cache');
 assert.doesNotMatch(sitemapXml(articles),/mes-jeux/,'personal preferences never indexed');
});
test('article follow button requires a real cached game hub',()=>{
 const source=read('modules/swapp-news/native-pages.js');
 assert.match(source,/data-swapp-follow-game/);
 assert.match(source,/gameHubUrl&&/);
 assert.match(source,/data-game-slug/);
});
test('local storage is not written at startup; following is deliberate and removable',()=>{
 const source=read('assets/swapp-my-games.js');
 let serialized='',writes=0;
 const listeners={};
 const win={addEventListener(name,handler){listeners['window:'+name]=handler},confirm:()=>true};
 const doc={
  querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener(name,handler){listeners[name]=handler}
 };
 const context={
  window:win,document:doc,
  localStorage:{getItem:()=>serialized||null,setItem:(key,value)=>{assert.equal(key,'swapp:followed-games:v1');serialized=value;writes++}},
  Date,JSON,Math,Number,String,RegExp,Set,Map,Array
 };
 vm.runInNewContext(source,context,{timeout:750});
 assert.equal(writes,0,'no automatic opt-in');
 const button={dataset:{gameSlug:'grand-theft-auto-vi',gameName:'Grand Theft Auto VI'}};
 const event={target:{closest(sel){return sel==='[data-swapp-follow-game]'?button:null}}};
 listeners.click(event);
 assert.equal(writes,1);
 assert.equal(JSON.parse(serialized).games[0].slug,'grand-theft-auto-vi');
 listeners.click(event);
 assert.deepEqual(JSON.parse(serialized).games,[]);
 const bad={dataset:{gameSlug:'../unsafe',gameName:'Unsafe'}};
 listeners.click({target:{closest:sel=>sel==='[data-swapp-follow-game]'?bad:null}});
 assert.equal(writes,2,'cannot persist an invalid slug');
});
test('changes on other tabs, manual read status, privacy and graceful disabled storage',()=>{
 const code=read('assets/swapp-my-games.js');
 assert.match(code,/addEventListener\('storage'/);
 assert.match(code,/data-my-games-mark-seen/);
 assert.match(code,/data-my-games-clear/);
 assert.match(code,/window\.confirm/);
 assert.match(code,/LIMIT=30/);
 assert.match(code,/addEventListener\('swapp:home-feature-ready'/);
 assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|sendBeacon|serviceWorker|Notification\(/);
});
test('SPA and native routes share the same assets and do not grow the top-level menu',()=>{
 const home=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 const nav=read('assets/swapp-navigation.js'),css=read('assets/swapp-my-games.css');
 for(const page of [home,shell]){
  assert.match(page,/swapp-my-games\.css\?v=20261018-cross-device-v2/);
  assert.match(page,/swapp-my-games\.js\?v=20261018-cross-device-v2/);
 }
 assert.doesNotMatch(nav,/href:'\/mes-jeux'/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(read('assets/swapp-home-news.js'),/swapp:home-feature-ready/);
});
