'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {register,autoPublishPendingServers,page,validJoinAddress,validListingDetails}=require('../modules/swapp-servers');
function appWith({db,verifyDiscord=async()=>({valid:true,inviteUrl:'https://discord.gg/ABC123'})}){
 const routes={};
 const app={get:(p,...h)=>routes['GET '+p]=h.at(-1),post:(p,...h)=>routes['POST '+p]=h.at(-1)};
 register(app,{getDatabase:async()=>db,inviteVerifier:verifyDiscord,enableAutoReview:false});
 return routes;
}
const mockResponse=()=>({code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}});
const gameRequest=(game,joinAddress='play.swapp.fr:25565',website='')=>({
 get:key=>key==='origin'?'https://swapp.tv':'',
 session:{oryonUser:{id:'test-account'}},
 body:{name:'SWAPP Example',game,description:'Serveur communautaire francophone avec joueurs et activités.',website,joinAddress,region:'France',tags:'communauté',bannerUrl:''}
});
test('published Minecraft listings no longer need administrator approval',async()=>{
 const inserts=[];const db={execute:async(sql,params)=>{
  if(sql.startsWith('SELECT COUNT(*) AS n'))return [[{n:0}]];
  if(sql.startsWith('INSERT INTO')){inserts.push({sql,params});return [{affectedRows:1}]}
  throw Error('unexpected SQL '+sql);
 }};
 const result=mockResponse();
 await appWith({db})['POST /api/swapp/serveurs'](gameRequest('Minecraft'),result);
 assert.equal(result.code,201);
 assert.equal(result.body.status,'published');
 assert.equal(result.body.verification,'listing_format');
 assert.equal(result.body.onlineVerified,false);
 assert.match(result.body.url,/^\/serveurs\/minecraft\//);
 assert.match(inserts[0].sql,/VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,"published"\)/);
});
test('invalid coordinates cannot be instantly published',async()=>{
 assert.equal(validJoinAddress('play.swapp.fr:25565'),true);
 assert.equal(validJoinAddress('127.0.0.1:80'),false);
 assert.equal(validJoinAddress('192.168.1.12:25565'),false);
 assert.equal(validJoinAddress('localhost:25565'),false);
 assert.equal(validJoinAddress('play.swapp.fr:99999'),false);
 assert.equal(validListingDetails({game:'Minecraft',joinAddress:'play.swapp.fr:25565'}),true);
 assert.equal(validListingDetails({game:'Minecraft',joinAddress:'http://localhost:80'}),false);
});
test('existing Minecraft pending listings are automatically promoted in batches',async()=>{
 const writes=[];
 const db={query:async()=>[[{id:'a'.repeat(32),game:'Minecraft',website:'',joinAddress:'play.swapp.fr:25565'}]],
  execute:async(sql,args)=>{writes.push({sql,args});return [{affectedRows:1}]}};
 const r=await autoPublishPendingServers({getDatabase:async()=>db,limit:10});
 assert.deepEqual(r,{checked:1,approved:1,skipped:0});
 assert.equal(writes.length,1);
 assert.match(writes[0].sql,/UPDATE swapp_game_servers SET status="published"/);
});
test('invalid Discord invites are rejected immediately, never queued',async()=>{
 let inserted=false;
 const db={execute:async(sql)=>{if(sql.startsWith('SELECT COUNT(*)'))return[[{n:0}]];if(sql.startsWith('INSERT'))inserted=true;return [{}]}};
 const r=mockResponse();
 await appWith({db,verifyDiscord:async()=>({valid:false,reason:'invite_not_found'})})['POST /api/swapp/serveurs'](
  gameRequest('Discord / Multigaming','','https://discord.gg/ABC123'),r);
 assert.equal(r.code,422);
 assert.equal(r.body.error,'verification_discord_impossible');
 assert.equal(inserted,false);
});
test('SERVEUR + no longer renders Mes serveurs tracking panel',()=>{
 const html=page();
 assert.doesNotMatch(html,/>Mes serveurs</);
 assert.doesNotMatch(html,/id="ss-owned"/);
 assert.match(html,/Publication immédiate/);
});
