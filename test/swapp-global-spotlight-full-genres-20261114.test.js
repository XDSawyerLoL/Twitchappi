'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {GENRES,genreForGame,rankGenres}=require('../assets/swapp-genre-discovery');
const {install}=require('../assets/swapp-nav-utility');
const {desktopNavigation,mobileNavigation,items}=require('../assets/swapp-navigation');
const ROOT=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('25 editorial genres remain available without replacing the game posters',()=>{
 assert.equal(GENRES.length,25);
 const ids=new Set(GENRES.map(x=>x.id));
 for(const id of ['mmorpg','fps','tps','rpg','arpg','battle-royale','moba',
  'survie','sandbox','strategie','gestion','simulation','course','sport',
  'combat','horreur','plateforme','roguelike','puzzle','coop','exploration',
  'rythme','action','indie','autres'])assert.ok(ids.has(id),id);
 const css=read('assets/swapp-genre-discovery.css');
 assert.match(css,/\.scl-genre-cards\s*\{[\s\S]*?display:grid;grid-template-columns:repeat\(auto-fit,minmax\(143px,1fr\)\)/);
 assert.match(css,/\.scl-game-poster\s*\{/);
 assert.match(css,/\.scl-game-poster-rank\s*\{/);
 assert.match(css,/\.scl-genre-game-rail/);
 assert.match(css,/@media\(max-width:600px\)/);
 const renderer=read('assets/swapp-catalogue-lab.js');
 assert.match(renderer,/genreApi\.rankGenres\(state\.games,state\.lives\)/);
 assert.match(renderer,/genreApi\.rankGames\(state\.games,state\.lives\)/);
 assert.match(renderer,/genreApi\.groupGamesByGenre\(state\.games,state\.lives\)/);
 assert.match(renderer,/function createGamePoster\(item,rank\)/);
 assert.match(renderer,/group\.liveCount/);
});

test('genre classifier covers representative popular games and never turns chat into a game',()=>{
 const cases={
  'AION 2':'mmorpg','Guild Wars 2':'mmorpg',
  'Counter-Strike 2':'fps','Warframe':'tps',
  'Fortnite':'battle-royale','League of Legends':'moba',
  'Cyberpunk 2077':'rpg','Diablo IV':'arpg',
  'Enshrouded':'survie','Roblox':'sandbox',
  'Crusader Kings III':'strategie','Factorio':'gestion',
  'The Sims 4':'simulation','Forza Horizon 5':'course',
  'EA SPORTS FC 26':'sport','Tekken 8':'combat',
  'Dead by Daylight':'horreur','Hollow Knight':'plateforme',
  'Balatro':'roguelike','Portal 2':'puzzle',
  'It Takes Two':'coop','Outer Wilds':'exploration',
  'Beat Saber':'rythme','Red Dead Redemption 2':'action',
  'Undertale':'indie','Jeu inédit':'autres'
 };
 for(const [game,expected] of Object.entries(cases))
  assert.equal(genreForGame(game),expected,game);
 assert.equal(genreForGame('Just Chatting'),'');
 assert.equal(genreForGame('Music'),'');
});

test('genre ranking uses only verified live data, with no fabricated audience',()=>{
 const genres=rankGenres([{kind:'game',game:'Diablo IV',gameSlug:'diablo-iv',image:'https://example.org/diablo.jpg'}],[
  {kind:'live',id:'one',game:'Diablo IV',viewers:200,audienceVerified:true},
  {kind:'live',id:'two',game:'Diablo IV',viewers:null,audienceVerified:false},
  {kind:'live',id:'one',game:'Diablo IV',viewers:200,audienceVerified:true}
 ]);
 const arpg=genres.find(x=>x.id==='arpg');
 assert.equal(arpg.liveCount,2);
 assert.equal(arpg.gameCount,1);
 assert.equal(arpg.audience,200);
 assert.equal(arpg.image,'https://example.org/diablo.jpg');
 assert.equal(genres.length,25);
 assert.equal(genres.find(x=>x.id==='mmorpg').audience,null);
});

test('global cursor halo tracks the mouse over the whole document and follows Appearance accent',()=>{
 const listeners=new Map(),values=new Map(),classes=new Set();
 const root={
  style:{setProperty(k,v){values.set(k,v)}},
  classList:{
   add(k){classes.add(k)},
   toggle(k,enabled){if(enabled)classes.add(k);else classes.delete(k)},
   contains(k){return classes.has(k)}
  }
 };
 const doc={
  documentElement:root,visibilityState:'visible',
  addEventListener(name,handler){listeners.set(name,handler)},
  querySelector(){return null}
 };
 const win={
  document:doc,
  matchMedia:q=>({matches:q.includes('hover: hover')}),
  requestAnimationFrame:callback=>callback()
 };
 install(win);
 assert.equal(typeof listeners.get('pointermove'),'function');
 listeners.get('pointermove')({clientX:347,clientY:223,pointerType:'mouse'});
 assert.equal(values.get('--swapp-spot-x'),'347px');
 assert.equal(values.get('--swapp-spot-y'),'223px');
 assert.equal(classes.has('swapp-global-spotlight'),true);
 listeners.get('pointerleave')();
 assert.equal(classes.has('swapp-global-spotlight-hidden'),true);
 const css=read('assets/swapp-nav-utility.css');
 assert.match(css,/html\.swapp-global-spotlight/);
 assert.match(css,/--swapp-page-accent/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/prefers-reduced-motion:no-preference/);
 assert.match(read('index.html'),/swapp-nav-utility\.js\?v=20261114-global-spot-v3/);
 assert.match(read('modules/swapp-page-shell.js'),/swapp-nav-utility\.js\?v=20261114-global-spot-v3/);
 const limited=new Map();
 install({document:{documentElement:root,addEventListener:(event,callback)=>limited.set(event,callback),querySelector:()=>null},
  matchMedia:q=>({matches:q.includes('prefers-reduced-motion: reduce')})});
 assert.equal(limited.has('pointermove'),false);
});

test('no Découvrir tab remains in common navigation; existing legacy URLs stay compatible',()=>{
 assert.deepEqual(items.map(x=>x.label),['Accueil','Actualité','Social','Boutique','SWAPP TV']);
 for(const menu of [desktopNavigation('home'),mobileNavigation('home')]){
  assert.doesNotMatch(menu,/>Découvrir<\/a>|href="\/categories"/);
  assert.match(menu,/href="\/decouvrir"/);
 }
 assert.match(read('server.js'),/app\.get\('\/categories',\(req,res\)=>\{/);
 const script=read('assets/swapp-hub-nav.js');
 assert.match(script,/!nav\.querySelector\('a\[href="\/categories"\]'\)/);
 assert.match(script,/const pinned=\['\/','\/actus','\/social','\/tv'\]/);
});
