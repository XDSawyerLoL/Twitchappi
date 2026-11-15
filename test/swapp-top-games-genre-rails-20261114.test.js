'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {rankGames,groupGamesByGenre,GENRES}=require('../assets/swapp-genre-discovery');
const {catalogueContent}=require('../modules/swapp-catalogue-lab');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {mergeGames,normalizeGame,normalizeLive}=require('../assets/swapp-catalogue-lab');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const catalogue=[
 {kind:'game',game:'Valorant',gameSlug:'valorant',image:'https://static-cdn.jtvnw.net/valorant.jpg'},
 {kind:'game',game:'Aion 2',gameSlug:'aion-2',image:'https://static-cdn.jtvnw.net/aion.jpg'},
 {kind:'game',game:'Cyberpunk 2077',gameSlug:'cyberpunk-2077',image:''},
 {kind:'game',game:'Jeu indépendant récent',gameSlug:'jeu-independant-recent',image:'https://static-cdn.jtvnw.net/other.jpg'}
];
const live=(id,game,viewers,verified,image='')=>({
 kind:'live',id,game,gameSlug:game.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),
 viewers,audienceVerified:verified,image
});

test('top games ranks actual confirmed lives, not invented scores or viewers',()=>{
 const ranked=rankGames(catalogue,[
  live('tw:1','Aion 2',19,true),
  live('tw:2','Aion 2',null,false),
  live('tw:3','Valorant',900,true),
  live('tw:3','Valorant',900,true),
  live('tw:4','Cyberpunk 2077',null,false,'https://static-cdn.jtvnw.net/live.jpg')
 ]);
 assert.deepEqual(ranked.slice(0,3).map(g=>g.game),['Aion 2','Valorant','Cyberpunk 2077']);
 assert.equal(ranked[0].liveCount,2);
 assert.equal(ranked[0].audience,19);
 assert.equal(ranked[0].audienceVerifiedCount,1);
 assert.equal(ranked[1].liveCount,1);
 assert.equal(ranked[1].audience,900);
 assert.equal(ranked[2].audience,null);
 assert.equal(ranked[2].cover,'https://static-cdn.jtvnw.net/live.jpg');
 assert.equal(ranked[2].coverSource,'live');
 assert.equal(ranked[3].liveCount,0);
 assert.equal(ranked[3].audience,null);
 const none=rankGames(catalogue,[]);
 assert.equal(none.filter(g=>g.liveCount>0).length,0);
 assert.ok(none.every(g=>g.audience===null));
});

test('the source remains actual category feed merged with real live game names',()=>{
 const games=mergeGames([{name:'Aion 2',box_art_url:'https://static-cdn.jtvnw.net/aion.jpg'}],[
  live('tw:4','Cyberpunk 2077',12,true)
 ]);
 assert.equal(games.length,2);
 assert.equal(games[0].image,'https://static-cdn.jtvnw.net/aion.jpg');
 assert.deepEqual(games.map(g=>g.game),['Aion 2','Cyberpunk 2077']);
 assert.deepEqual(rankGames(games,[live('tw:4','Cyberpunk 2077',12,true)])
  .map(g=>g.game),['Cyberpunk 2077','Aion 2']);
});

test('the poster requests portrait box art while live thumbnails keep widescreen resolution',()=>{
 const game=normalizeGame({name:'Valorant',
  box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/123-{width}x{height}.jpg'});
 assert.equal(game.image,'https://static-cdn.jtvnw.net/ttv-boxart/123-720x960.jpg');
 const fixed=normalizeGame({name:'Minecraft',
  box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/123-285x380.jpg'});
 assert.equal(fixed.image,'https://static-cdn.jtvnw.net/ttv-boxart/123-720x960.jpg');
 const other=normalizeGame({name:'Other game',box_art_url:'https://swapp.tv/cover.jpg'});
 assert.equal(other.image,'https://swapp.tv/cover.jpg');
 const stream=normalizeLive({user_login:'example_streamer',game_name:'Valorant',
  thumbnail_url:'https://static-cdn.jtvnw.net/previews-ttv/live_user_example-{width}x{height}.jpg',
  viewer_count:30});
 assert.equal(stream.image,'https://static-cdn.jtvnw.net/previews-ttv/live_user_example-640x360.jpg');
 assert.equal(stream.viewers,30);
});

test('genres contain actual game posters grouped by their correct genre',()=>{
 const groups=groupGamesByGenre(catalogue,[live('tw:1','Aion 2',2,true)]);
 const mmorpg=groups.find(g=>g.id==='mmorpg');
 const fps=groups.find(g=>g.id==='fps');
 assert.deepEqual(mmorpg.games.map(g=>g.game),['Aion 2']);
 assert.deepEqual(fps.games.map(g=>g.game),['Valorant']);
 assert.equal(mmorpg.liveCount,1);
 assert.ok(groups.find(g=>g.id==='autres').games.length>0);
 assert.equal(GENRES.length,25);
 assert.equal(groups.filter(g=>g.games.length===0).length,0);
});

test('live rail is followed by top game posters, 25 genre controls, actual genre game shelves',()=>{
 const html=catalogueContent({publicHome:true});
 const required=['scl-live','scl-genres','scl-top-games','scl-games','scl-genre-shelves','scl-articles'];
 for(const id of required)assert.ok(html.includes('id="'+id+'"'),id);
 for(let i=1;i<required.length;i++)
  assert.ok(html.indexOf('id="'+required[i-1]+'"')<html.indexOf('id="'+required[i]+'"'),
   required[i-1]+' must precede '+required[i]);
 assert.match(html,/LES JEUX DU MOMENT/);
 assert.match(html,/id="scl-top-games-cards"/);
 assert.match(html,/id="scl-genre-cards"/);
 assert.match(html,/id="scl-genre-shelves"/);
 const spa=renderIntoSpa(read('index.html'));
 assert.match(spa,/id="scl-top-games-cards"/);
 assert.match(spa,/id="scl-genre-shelves"/);
 assert.match(spa,/swapp-genre-discovery\.css\?v=20261115-hidpi-genre-v8/);
 assert.match(spa,/swapp-catalogue-lab\.js\?v=20261115-hidpi-posters-v30/);
});

test('poster rails show valid game artwork, linked real creator discovery and no fake ranks',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-genre-discovery.css');
 assert.match(js,/function createGamePoster\(item,rank\)/);
 assert.match(js,/if\(item\.cover\)/);
 assert.match(js,/void showGameLives\(item\)/);
 assert.match(js,/item\.audienceVerifiedCount\?/);
 assert.match(js,/if\(Number\.isSafeInteger\(rank\)&&rank>=1&&rank<=99\)/);
 assert.match(js,/state\.topGameSlugs=new Set\(active\.map/);
 assert.match(js,/heading\.textContent='Top des jeux en ce moment'/);
 assert.match(js,/state\.games\.filter\(matching\)/);
 assert.match(js,/ranked\.slice\(0,180\)/);
 assert.match(css,/\.scl-game-poster-image img/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/\.scl-game-poster-rank/);
 assert.match(css,/scroll-snap-type:x proximity/);
 assert.match(css,/@media\(max-width:650px\)/);
});
