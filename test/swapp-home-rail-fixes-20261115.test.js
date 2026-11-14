'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {API,mergeLives,mergeGames,normalizeGame}=require('../assets/swapp-catalogue-lab');
const {rankGames}=require('../assets/swapp-genre-discovery');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('more verified streams are available: no one-stream-per-game limit or 12-slot home cap',()=>{
 const server=read('server.js');
 assert.match(server,/Math\.min\(24, Number\(req\.query\.limit \|\| 3\)\)/);
 assert.doesNotMatch(server,/if \(!byGame\.has\(gid\)\) byGame\.set\(gid, s\)/);
 assert.match(server,/byGame\.get\(gid\)\.push\(stream\)/);
 assert.match(server,/while\(unique\.length < limit\)/);
 assert.match(API.home,/limit=24/);
 assert.match(API.top,/limit=100/);
 const home=Array.from({length:24},(_,i)=>({user_login:'native'+i,game_name:'Aion 2',title:'Live',
  viewer_count:5,thumbnail_url:'https://static-cdn.jtvnw.net/live.jpg'}));
 const top=Array.from({length:100},(_,i)=>({user_login:'twitch'+i,game_name:'Aion 2',title:'Live',
  viewer_count:15,thumbnail_url:'https://static-cdn.jtvnw.net/live.jpg'}));
 const lives=mergeLives(home,top);
 assert.equal(lives.length,124);
 assert.ok(lives.every(item=>item.kind==='live'&&item.audienceVerified===true));
});

test('the game inventory accepts 180 categories and uses Twitch cursor pagination',()=>{
 const categories=Array.from({length:180},(_,i)=>({name:'Game '+String(i).padStart(3,'0'),
  box_art_url:'https://static-cdn.jtvnw.net/box.jpg'}));
 const merged=mergeGames(categories,[]);
 assert.equal(merged.length,180);
 const extra=mergeGames(categories,[{game:'Cyberpunk 2077',gameSlug:'cyberpunk-2077'}]);
 assert.equal(extra.length,181);
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/async function fetchGameInventory\(\)/);
 assert.match(js,/page<2&&games\.length<180/);
 assert.match(js,/uri\.searchParams\.set\('cursor',cursor\)/);
 assert.match(js,/fetchGameInventory\(\)/);
 assert.match(js,/ranked\.slice\(0,180\)/);
 assert.match(js,/group\.games\.filter\(matching\);/);
});

test('Top and Discover contain different real games, without fake ranks',()=>{
 const games=['Aion 2','Valorant','Cyberpunk 2077'].map(name=>
  normalizeGame({name,box_art_url:'https://static-cdn.jtvnw.net/cover.jpg'}));
 const live=[{id:'twitch:one',kind:'live',game:'Aion 2',gameSlug:'aion-2',viewers:14,audienceVerified:true}];
 const top=rankGames(games,live).filter(g=>g.liveCount>0).slice(0,16);
 const slugs=new Set(top.map(g=>g.gameSlug));
 const discovery=rankGames(games,[]).filter(g=>!slugs.has(g.gameSlug));
 assert.deepEqual(top.map(x=>x.game),['Aion 2']);
 assert.deepEqual(discovery.map(x=>x.game),['Cyberpunk 2077','Valorant']);
 assert.equal(top[0].audience,14);
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/state\.topGameSlugs=new Set\(active\.map\(game=>game\.gameSlug\)\)/);
 assert.match(js,/\.filter\(item=>!state\.topGameSlugs\?\.has\(item\.gameSlug\)\)/);
 assert.doesNotMatch(js,/const fallback=active\.length\?\[\]:ranked/);
 assert.match(js,/active\.forEach\(\(item,index\)=>fragment\.append\(createGamePoster\(item,index\+1\)\)\)/);
});

test('theme beam is painted behind all game art and reactivates on other SPA views',()=>{
 const css=read('assets/swapp-nav-utility.css');
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(css,/html\.swapp-catalogue-spotlight::after\{display:none!important\}/);
 assert.match(css,/\.scl-main::before\{/);
 assert.match(css,/z-index:0;pointer-events:none/);
 assert.match(css,/\.scl-main>\*\{/);
 assert.match(css,/position:relative;z-index:1/);
 assert.match(css,/--swapp-page-accent/);
 assert.match(js,/syncCatalogueLight/);
 assert.match(js,/homeView\.classList\.contains\('active'\)/);
 assert.match(read('index.html'),/swapp-nav-utility\.css\?v=20261115-light-behind-v4/);
 assert.match(read('modules/swapp-page-shell.js'),/swapp-nav-utility\.css\?v=20261115-light-behind-v4/);
});

test('genre carousel arrow scrolls by actual card width, with keyboard support',()=>{
 const css=read('assets/swapp-genre-discovery.css');
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/scroll-behavior:smooth/);
 assert.match(js,/if\(target\.id==='scl-genre-cards'\)/);
 assert.match(js,/getComputedStyle\(target\)\.columnGap/);
 assert.match(js,/direction\*count\*step/);
 assert.match(js,/genreRail\?\.addEventListener\('keydown'/);
 assert.match(read('modules/swapp-catalogue-spa.js'),/swapp-catalogue-lab\.js\?v=20261115-rail-inventory-v27/);
});
