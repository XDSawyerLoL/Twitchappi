'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {GENRES,genreForGame,rankGenres}=require('../assets/swapp-genre-discovery');
const {catalogueContent}=require('../modules/swapp-catalogue-lab');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('MMORPG, FPS, RPG, survie, stratégie, battle royale et MOBA sont réellement classés',()=>{
 const samples={
  'Aion 2':'mmorpg','World of Warcraft':'mmorpg',
  'Counter-Strike 2':'fps','Valorant':'fps',
  'Cyberpunk 2077':'rpg','Where Winds Meet':'rpg',
  'Enshrouded':'survie','Rust':'survie',
  'Crusader Kings III':'strategie','Civilization VII':'strategie',
  'Apex Legends':'battle-royale','League of Legends':'moba',
  'The Sims 4':'simulation','Red Dead Redemption 2':'action',
  'Jeu méconnu':'autres'
 };
 for(const [name,genre] of Object.entries(samples))assert.equal(genreForGame(name),genre,name);
 assert.equal(genreForGame('Just Chatting'),'');
 assert.equal(genreForGame(''), '');
 assert.ok(GENRES.length>=8);
});

test('les catégories les plus actives proviennent uniquement des vrais lives',()=>{
 const items=rankGenres([
  {kind:'game',game:'Aion 2',gameSlug:'aion-2',image:'https://swapp.tv/cover.jpg'},
  {kind:'game',game:'Aion 2',gameSlug:'aion-2',image:'https://swapp.tv/cover.jpg'},
  {kind:'game',game:'Counter-Strike 2',gameSlug:'counter-strike-2'}
 ],[
  {id:'twitch:one',kind:'live',game:'Aion 2',viewers:124,audienceVerified:true},
  {id:'twitch:two',kind:'live',game:'World of Warcraft',viewers:null,audienceVerified:false},
  {id:'twitch:two',kind:'live',game:'World of Warcraft',viewers:null,audienceVerified:false},
  {id:'twitch:three',kind:'live',game:'Valorant',viewers:40,audienceVerified:true},
  {id:'twitch:chat',kind:'live',game:'Just Chatting',viewers:1000,audienceVerified:true}
 ]);
 const mmorpg=items.find(x=>x.id==='mmorpg');
 assert.equal(items[0].id,'mmorpg');
 assert.equal(mmorpg.liveCount,2);
 assert.equal(mmorpg.gameCount,1);
 assert.equal(mmorpg.audience,124);
 assert.equal(items.find(x=>x.id==='fps').liveCount,1);
 assert.equal(items.find(x=>x.id==='autres').liveCount,0);
 assert.equal(rankGenres([],[{kind:'live',id:'a',game:'Dota 2',viewers:2500,audienceVerified:false}]).find(x=>x.id==='moba').audience,null);
});

test('un seul Accueil comprend les directs, les genres puis les actualités',()=>{
 const content=catalogueContent({publicHome:true});
 for(const id of ['scl-feature','scl-live','scl-genres','scl-articles','scl-games','scl-small'])assert.ok(content.includes('id="'+id+'"'),id);
 assert.ok(content.indexOf('id="scl-live"')<content.indexOf('id="scl-genres"'));
 assert.ok(content.indexOf('id="scl-genres"')<content.indexOf('id="scl-articles"'));
 const spa=renderIntoSpa(read('index.html'));
 assert.match(spa,/swapp-genre-discovery\.js\?v=20261115-genre-scroll-v5/);
 assert.match(spa,/swapp-genre-discovery\.css\?v=20261115-genre-scroll-v5/);
 assert.match(spa,/id="scl-genre-cards"/);
});

test('Découvrir du menu renvoie vers les genres sans casser Swapper',()=>{
 const script=read('assets/swapp-catalogue-spa.js');
 assert.match(script,/url\.pathname==='\/categories'/);
 assert.match(script,/window\.swappNavigateSpa\('home'\)/);
 assert.match(script,/getElementById\('scl-genres'\)/);
 assert.match(script,/history\.replaceState\(history\.state,'','\/#scl-genres'\)/);
 const server=read('server.js');
 const start=server.indexOf("app.get('/categories',(req,res)=>{");
 const end=server.indexOf('\n});',start);
 assert.ok(start>0&&end>start,'route de compatibilité absente');
 const handlers=[];
 new Function('app',server.slice(start,end+4))({get:(route,cb)=>handlers.push({route,cb})});
 assert.equal(handlers.length,1);
 const redirect={set(){return this},redirect(code,url){this.code=code;this.url=url}};
 handlers[0].cb({query:{genre:'mmorpg',game:'Aion 2'}},redirect);
 assert.equal(redirect.code,302);
 assert.equal(redirect.url,'/?genre=mmorpg&q=Aion+2#scl-genres');
 handlers[0].cb({query:{genre:'injection',q:'FPS'}},redirect);
 assert.equal(redirect.url,'/?q=FPS#scl-genres');
 assert.match(server,/\/decouvrir/);
});

test('le spot suit la souris dans la couleur Apparence, sans l’imposer aux mobiles',()=>{
 const css=read('assets/swapp-nav-utility.css');
 const js=read('assets/swapp-nav-utility.js');
 const catalogue=read('assets/swapp-catalogue-lab.js');
 assert.match(css,/--swapp-page-accent/);
 assert.match(css,/prefers-reduced-motion:no-preference/);
 assert.match(css,/hover:hover/);
 assert.match(js,/--swapp-spot-x/);
 assert.match(js,/doc\.addEventListener\('pointermove'/);
 assert.match(catalogue,/genreApi\.rankGenres\(state\.games,state\.lives\)/);
 assert.match(catalogue,/state\.genre/);
});
