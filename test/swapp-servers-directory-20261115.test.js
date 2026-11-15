'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {page,register,GAMES,slug,safeUrl}=require('../modules/swapp-servers');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('native server directory is a real SWAPP page with usable discover and submit controls',()=>{
 const html=page();
 assert.match(html,/Serveurs de jeux — classements/);
 for(const id of ['ss-results','ss-game','ss-q','ss-sort','ss-add','ss-count'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/\/assets\/swapp-servers\.js/);
 assert.match(html,/href="\/serveurs\/creer"/);
 assert.doesNotMatch(html,/id="ss-dialog"/);
 assert.match(html,/\/assets\/swapp-servers\.css/);
 assert.doesNotMatch(html,/10 000 serveurs|faux serveurs|exemple de classement/);
});
test('server listing includes coherent games, safe names and HTTPS-only URL validation',()=>{
 assert.ok(GAMES.includes('GTA V / FiveM'));
 assert.ok(GAMES.includes('Minecraft'));
 assert.equal(slug('Serveur RP Français !'),'serveur-rp-francais');
 assert.equal(safeUrl('javascript:alert(1)'),'');
 assert.equal(safeUrl('http://example.com'),'');
 assert.equal(safeUrl('https://example.com'),'https://example.com/');
});
test('backend declares all public and authenticated routes',()=>{
 const seen=[];const app={get:(p,...args)=>seen.push(['GET',p,args.length]),post:(p,...args)=>seen.push(['POST',p,args.length]),put:(p,...args)=>seen.push(['PUT',p,args.length])};
 register(app,{enableAutoReview:false});
 for(const [method,route] of [['GET','/serveurs'],['GET','/api/swapp/serveurs'],['POST','/api/swapp/serveurs'],['POST','/api/swapp/serveurs/:id/vote'],['GET','/api/swapp/serveurs/moderation'],['POST','/api/swapp/serveurs/:id/moderation']])
  assert.ok(seen.some(x=>x[0]===method&&x[1]===route),method+' '+route);
 const js=read('assets/swapp-servers.js');
 assert.match(js,/textContent/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(read('modules/swapp-explorer.js'),/\/serveurs/);
 const server=read('server.js');
 assert.ok(server.indexOf("require('./modules/swapp-servers').register(app,{")<server.indexOf("require('./modules/swapp-explorer').register(app)"));
});
test('public listing excludes pending servers and monthly votes are based on vote events',()=>{
 const source=read('modules/swapp-servers.js');
 assert.match(source,/s\.status="published" AND/);
 assert.match(source,/swapp_game_server_vote_events/);
 assert.match(source,/FOR UPDATE/);
 assert.match(source,/7200000/);
 assert.match(source,/ORYON_ADMIN_USER_IDS/);
});


test('game art grid and live category counts use real sources and no fabricated numbers',()=>{
 const home=page(),minecraft=page({game:'Minecraft'});
 assert.match(home,/id="ss-featured-games"/);
 assert.match(home,/id="ss-game-search"/);
 assert.match(home,/class="ss-game-tile/);
 assert.match(minecraft,/data-ss-current-game="Minecraft"/);
 assert.match(minecraft,/https:\/\/swapp.tv\/serveurs\/minecraft/);
 const js=read('assets/swapp-servers.js');
 assert.match(js,/cdn\.cloudflare\.steamstatic\.com\/steam\/apps/);
 assert.match(js,/27471_IGDB-720x960/);
 assert.match(js,/displayGameCounts\(data\.gameCounts\)/);
 assert.doesNotMatch(js,/Comptage indisponible/);
 assert.doesNotMatch(js,/history\.pushState/);
 assert.match(js,/location\.assign\(next\)/);
 assert.match(js,/Aucun serveur inscrit sur SWAPP pour/);
 assert.match(js,/data\.gameCounts/);
 const api=read('modules/swapp-servers.js');
 assert.match(api,/COUNT\(\*\) AS count FROM swapp_game_servers WHERE status="published"/);
});
test('published server detail page includes game-specific artwork and native join/vote controls',()=>{
 const {detailPage}=require('../modules/swapp-servers');
 const pageHtml=detailPage({id:'abcdef0123456789abcdef0123456789',name:'Serveur Test',slug:'serveur-test-abcdef',game:'Rust',
  description:'Survie et événements sur une communauté réelle',website:'https://example.com',join_address:'rust.example.com:28015',region:'France',tags:'Survie,PVE',banner_url:''},12);
 assert.match(pageHtml,/steam\/apps\/252490\/header\.jpg/);
 assert.match(pageHtml,/data-ss-vote-id/);
 assert.match(pageHtml,/data-ss-copy/);
 assert.match(pageHtml,/data-ss-profile-votes>12/);
 assert.match(pageHtml,/\/serveurs\/rust\/serveur-test-abcdef/);
 const code=read('modules/swapp-servers.js');
 assert.match(code,/status="published" LIMIT 1/);
 assert.match(code,/FOR UPDATE/);
});
test('magazine uses full-width solid black surrounding the central content',()=>{
 const css=read('assets/swapp-actus-app.css');
 assert.match(css,/ACTUS full-viewport backdrop/);
 assert.match(css,/body:has\(#actus\.view\.active\)/);
 assert.match(css,/background-image:none!important/);
});
