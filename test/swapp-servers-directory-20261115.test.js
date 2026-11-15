'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {page,register,GAMES,slug,safeUrl}=require('../modules/swapp-servers');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('native server directory is a real SWAPP page with usable discover and submit controls',()=>{
 const html=page();
 assert.match(html,/Serveurs de jeux — classements/);
 for(const id of ['ss-results','ss-game','ss-q','ss-sort','ss-form','ss-dialog','ss-count'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/\/assets\/swapp-servers\.js/);
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
 const seen=[];const app={get:(p,...args)=>seen.push(['GET',p,args.length]),post:(p,...args)=>seen.push(['POST',p,args.length])};
 register(app);
 for(const [method,route] of [['GET','/serveurs'],['GET','/api/swapp/serveurs'],['POST','/api/swapp/serveurs'],['POST','/api/swapp/serveurs/:id/vote'],['GET','/api/swapp/serveurs/moderation'],['POST','/api/swapp/serveurs/:id/moderation']])
  assert.ok(seen.some(x=>x[0]===method&&x[1]===route),method+' '+route);
 const js=read('assets/swapp-servers.js');
 assert.match(js,/textContent/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(read('modules/swapp-explorer.js'),/\/serveurs/);
 const server=read('server.js');
 assert.ok(server.indexOf("require('./modules/swapp-servers').register(app)")<server.indexOf("require('./modules/swapp-explorer').register(app)"));
});
test('public listing excludes pending servers and monthly votes are based on vote events',()=>{
 const source=read('modules/swapp-servers.js');
 assert.match(source,/WHERE s.status="published"/);
 assert.match(source,/swapp_game_server_vote_events/);
 assert.match(source,/FOR UPDATE/);
 assert.match(source,/7200000/);
 assert.match(source,/ORYON_ADMIN_USER_IDS/);
});
