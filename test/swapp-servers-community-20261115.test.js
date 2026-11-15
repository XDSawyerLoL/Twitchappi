'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {registerCommunity,renderCommunityPanels,sessionCreator}=require('../modules/swapp-servers-community');
const {detailPage}=require('../modules/swapp-servers');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');
const serverId='a'.repeat(32),creatorId='b'.repeat(32);
function fakeApp(){
 const routes=new Map(),app={};
 for(const method of ['get','post','put','delete'])app[method]=(path,...handlers)=>routes.set(method.toUpperCase()+' '+path,handlers.at(-1));
 return {app,routes};
}
function mockResponse(){
 const res={statusCode:200,headers:{},body:null};
 res.status=value=>{res.statusCode=value;return res};
 res.set=(k,v)=>{res.headers[k]=v;return res};
 res.json=value=>{res.body=value;return res};
 return res;
}
test('profile makes player matchmaking and verified community streams prominent without inventing counts',()=>{
 const html=detailPage({id:serverId,game:'Rust',name:'Communauté Test',slug:'communaute-test-a',description:'Jeu en communauté',twitch_url:'https://www.twitch.tv/teststreamer'},0);
 for(const phrase of ['id="joueurs"','id="directs"','id="ss-lfg-form"','id="ss-community-lives"','id="ss-creator-moderation"','href="#joueurs"','href="#directs"'])
  assert.ok(html.includes(phrase),phrase);
 assert.match(html,/data-ss-owner-twitch="teststreamer"/);
 assert.match(html,/swapp-servers-community\.js/);
 assert.match(html,/swapp-servers-community\.css/);
 assert.doesNotMatch(html,/spectateurs en direct<\/strong>/);
 const client=read('assets/swapp-servers-community.js');
 assert.match(client,/\/api\/discovery\/home-lives/);
 assert.match(client,/\/api\/twitch\/streams\/top/);
 assert.match(client,/EN DIRECT/);
 assert.match(client,/liveItems\.find/);
 assert.doesNotMatch(client,/Math\.random/);
});
test('community lookup and writes have authenticated routes and owner-controlled affiliation approval',async()=>{
 const {app,routes}=fakeApp(),sql=[];
 const db={
  query:async command=>{sql.push(command);return [[]]},
  execute:async(command,args=[])=>{
   sql.push(command);
   if(command.startsWith('SELECT id,owner_id'))return [[{id:serverId,owner_id:'owner'}]];
   if(command.startsWith('SELECT display_name'))return [[{name:'Joueur',message:'Coop',voice:'yes',expires_at:'2026-11-16T10:00:00Z',user_id:'player'}]];
   if(command.startsWith('SELECT id,platform,creator_login,status,user_id')&&command.includes('status="approved"'))return [[{id:creatorId,platform:'swapp',creator_login:'caster',status:'approved',user_id:'caster'}]];
   if(command.startsWith('SELECT 1 AS found'))return [[]];
   if(command.startsWith('SELECT id,platform,creator_login,status FROM')&&command.includes('status="pending"'))return [[]];
   if(command.startsWith('SELECT id,platform,creator_login,status FROM'))return [[]];
   if(command.startsWith('SELECT COUNT(*) AS n FROM swapp_server_lfg'))return [[{n:0}]];
   if(command.startsWith('SELECT TIMESTAMPDIFF'))return [[]];
   return [{affectedRows:1}];
  }
 };
 registerCommunity(app,{getDatabase:async()=>db,account:req=>req.session?.userId||'',
  ownerKeys:req=>[req.session?.userId||''],originGuard:req=>req.origin==='https://swapp.tv'});
 for(const route of [
  'GET /api/swapp/serveurs/:id/community','POST /api/swapp/serveurs/:id/lfg',
  'POST /api/swapp/serveurs/:id/lfg/remove','POST /api/swapp/serveurs/:id/creators',
  'POST /api/swapp/serveurs/:id/creators/:creatorId/moderate',
  'POST /api/swapp/serveurs/:id/creators/:creatorId/remove'
 ])assert.ok(routes.has(route),route);
 const get=routes.get('GET /api/swapp/serveurs/:id/community');
 const response=mockResponse();
 await get({params:{id:serverId},session:{userId:'player',oryonUser:{login:'player'}}},response);
 assert.equal(response.body.players.length,1);
 assert.equal(response.body.players[0].mine,true);
 assert.equal(response.body.creators[0].login,'caster');
 assert.equal(response.body.owner,false);
 assert.ok(!JSON.stringify(response.body).includes('user_id'));
 const post=routes.get('POST /api/swapp/serveurs/:id/lfg');
 const noLogin=mockResponse();
 await post({params:{id:serverId},body:{voice:'yes'},origin:'https://swapp.tv',session:{}},noLogin);
 assert.equal(noLogin.statusCode,401);
 const wrongOrigin=mockResponse();
 await post({params:{id:serverId},body:{voice:'yes'},origin:'https://evil.example',session:{userId:'player'}},wrongOrigin);
 assert.equal(wrongOrigin.statusCode,403);
 const success=mockResponse();
 await post({params:{id:serverId},body:{message:'Une partie coop',voice:'yes'},origin:'https://swapp.tv',
  session:{userId:'player',oryonUser:{login:'player'}}},success);
 assert.equal(success.body.available,true);
 assert.ok(sql.some(query=>query.includes('INTERVAL 60 MINUTE')));
 const unsolicited=mockResponse();
 await post({params:{id:serverId},body:{message:'https://phishing.example',voice:'either'},origin:'https://swapp.tv',session:{userId:'player'}},unsolicited);
 assert.equal(unsolicited.statusCode,422);
 const request=routes.get('POST /api/swapp/serveurs/:id/creators');
 const unlinked=mockResponse();
 await request({params:{id:serverId},body:{platform:'twitch'},origin:'https://swapp.tv',session:{userId:'caster'}},unlinked);
 assert.equal(unlinked.statusCode,403);
 const linked=mockResponse();
 await request({params:{id:serverId},body:{platform:'twitch'},origin:'https://swapp.tv',
  session:{userId:'caster',twitchUser:{login:'caster_tv'}}},linked);
 assert.equal(linked.body.status,'pending');
 const moderation=routes.get('POST /api/swapp/serveurs/:id/creators/:creatorId/moderate');
 const denied=mockResponse();
 await moderation({params:{id:serverId,creatorId},body:{decision:'approved'},origin:'https://swapp.tv',session:{userId:'caster'}},denied);
 assert.equal(denied.statusCode,403);
 const approved=mockResponse();
 await moderation({params:{id:serverId,creatorId},body:{decision:'approved'},origin:'https://swapp.tv',session:{userId:'owner'}},approved);
 assert.equal(approved.body.updated,true);
 assert.ok(sql.some(query=>query.includes('FOREIGN KEY(server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE')));
});
test('creator login is taken from signed-in session and HTML output is escaped',()=>{
 assert.equal(sessionCreator({session:{twitchUser:{login:'Some_Creator'}}},'twitch'),'some_creator');
 assert.equal(sessionCreator({session:{oryonUser:{login:'Native'}}},'swapp'),'native');
 assert.equal(sessionCreator({session:{}},'twitch'),'');
 const html=renderCommunityPanels({id:serverId,twitch_url:'https://www.twitch.tv/ok" onerror="alert(1)'});
 assert.ok(html.includes('data-ss-owner-twitch=""'));
 assert.doesNotMatch(html,/onerror="alert/);
});
