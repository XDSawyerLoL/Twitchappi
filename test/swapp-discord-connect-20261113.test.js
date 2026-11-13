'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {
 createDiscordConnect,validWebhook,keyFromEnv,encryptWebhook,decryptWebhook,
 webhookPayload,sameOrigin,TABLES
}=require('../modules/swapp-discord-connect');
const root=path.join(__dirname,'..');
const id='123456789012345678',token='A'.repeat(45);
const hook='https://discord.com/api/webhooks/'+id+'/'+token;
const creator={id:'0123456789abcdef01234567',login:'streamfr',display_name:'Un streamer',
 current_live_title:'En direct sur SWAPP',current_live_category:'Where Winds Meet',channel_public:true};
function bootstrap({isVerified=()=>false,enabled=true,sqlRows=[]}={}){
 const handlers={get:new Map(),post:new Map(),delete:new Map()};
 const queries=[];
 const app={};
 for(const method of ['get','post','delete'])app[method]=(route,...rest)=>{
  handlers[method].set(route,rest[rest.length-1]);
 };
 const env=enabled?{
  SWAPP_ACCOUNT_STORE:'mysql',SWAPP_DISCORD_CLIENT_ID:id,SWAPP_DISCORD_CLIENT_SECRET:'Z'.repeat(40),
  SWAPP_DISCORD_REDIRECT_URI:'https://swapp.tv/api/swapp/discord/callback',
  SWAPP_DISCORD_ENCRYPTION_KEY:'12'.repeat(32),SWAPP_ACCOUNT_MYSQL_URL:'mysql://root:pass@example.org/swapp'
 }: {};
 const db={
  async query(sql){queries.push([sql]);return [[]]},
  async execute(sql,params){queries.push([sql,params]);return [sqlRows]}
 };
 const integration=createDiscordConnect({
  app,env,mysqlFactory:{createPool(){return db}},
  restoreSession:async()=>{},findOwner:login=>login==='streamfr'?creator:null,
  getOwnerById:uid=>uid===creator.id?creator:null,getVerifiedLive:isVerified,
  setIntervalImpl:()=>({unref(){}}),fetchImpl:async()=>{throw Error('unexpected Discord request')}
 });
 return {integration,handlers,queries};
}
function response(){
 const output={statusCode:200,headers:{},jsonBody:null,redirected:null};
 return Object.assign(output,{
  set(key,value){this.headers[key]=value;return this},
  status(code){this.statusCode=code;return this},
  json(body){this.jsonBody=body;return this},
  redirect(url){this.redirected=url;return this},
  send(content){this.html=content;return this},
  type(mime){this.mime=mime;return this},
  end(){return this}
 });
}
function request(){
 return {session:{oryonUser:{id:creator.id,login:creator.login}},params:{},query:{},
  get(name){return name==='host'?'swapp.tv':name==='origin'?'https://swapp.tv':
   name==='content-type'?'application/json':''}};
}
test('Discord webhooks accept only official HTTPS incoming webhook endpoints',()=>{
 assert.equal(validWebhook(hook),true);
 for(const bad of ['http://discord.com/api/webhooks/'+id+'/'+token,
  'https://discord.com.evil.example/api/webhooks/'+id+'/'+token,
  'https://discord.com/api/webhooks/'+id+'/'+token+'?wait=true',
  'https://discord.com/api/webhooks/'+id+'/weak',
  'https://127.0.0.1/api/webhooks/'+id+'/'+token])
  assert.equal(validWebhook(bad),false,bad);
 assert.equal(sameOrigin(request()),true);
 assert.equal(sameOrigin({get:key=>key==='host'?'swapp.tv':'https://attacker.test'}),false);
});
test('each webhook is encrypted/authenticated, not persisted in plaintext',()=>{
 const key=keyFromEnv({SWAPP_DISCORD_ENCRYPTION_KEY:'ab'.repeat(32)});
 assert.equal(key.length,32);
 const encrypted=encryptWebhook(hook,key);
 assert.ok(encrypted.startsWith('v1.'));
 assert.equal(encrypted.includes(token),false);
 assert.equal(decryptWebhook(encrypted,key),hook);
 assert.throws(()=>decryptWebhook(encrypted,crypto.randomBytes(32)));
 assert.throws(()=>encryptWebhook('https://evil.example/webhook',key));
 assert.equal(keyFromEnv({SWAPP_DISCORD_ENCRYPTION_KEY:'short'}),null);
});
test('a verified live generates a canonical SWAPP card without global mentions',()=>{
 const msg=webhookPayload(creator);
 assert.equal(msg.allowed_mentions.parse.length,0);
 assert.equal(msg.tts,false);
 assert.equal(msg.embeds[0].url,'https://swapp.tv/streamfr');
 assert.equal(msg.embeds[0].title,creator.current_live_title);
 assert.ok(msg.content.includes('https://swapp.tv/streamfr'));
 assert.ok(TABLES.some(ddl=>ddl.includes('UNIQUE KEY swapp_discord_live_once')));
});
test('disabled Discord integration makes no outbound requests and requires no secrets',async()=>{
 const b=bootstrap({enabled:false});
 assert.equal(b.integration.enabled,false);
 const res=response();
 await b.handlers.get.get('/api/swapp/discord/status')(request(),res);
 assert.equal(res.statusCode,503);
 assert.equal(res.jsonBody.configured,false);
 assert.equal(await b.integration.notifyLive('streamfr','a'.repeat(24)),false);
 assert.equal(b.queries.length,0);
});
test('status exposes only consented metadata and does not expose webhook secrets',async()=>{
 const b=bootstrap();
 const res=response();
 await b.handlers.get.get('/api/swapp/discord/status')(request(),res);
 assert.equal(res.statusCode,200);
 assert.equal(res.jsonBody.success,true);
 assert.equal(res.jsonBody.connected,false);
 assert.deepEqual(res.jsonBody.communities,[]);
 assert.equal(JSON.stringify(res.jsonBody).includes('webhook_cipher'),false);
 assert.equal(JSON.stringify(res.jsonBody).includes('access_token'),false);
});
test('OAuth callback requires same-session state before any token exchange',async()=>{
 const b=bootstrap(),res=response();
 const req=request();req.query={state:'abc',code:'fake'};
 await b.handlers.get.get('/api/swapp/discord/callback')(req,res);
 assert.equal(res.redirected,'/discord?error=oauth_state');
});
test('spoofed live status cannot announce to any Discord server',async()=>{
 const b=bootstrap({isVerified:()=>false});
 assert.equal(await b.integration.notifyLive('streamfr','a'.repeat(24)),false);
 assert.equal(b.queries.length,0);
});
test('verified live is a no-op when no community has opted in',async()=>{
 const b=bootstrap({isVerified:()=>true});
 assert.equal(await b.integration.notifyLive('streamfr','a'.repeat(24)),false);
 assert.ok(b.queries.some(([sql])=>sql.includes('swapp_discord_communities')));
});
test('community updates require SWAPP session, same-origin JSON and an explicit boolean opt-in',async()=>{
 const b=bootstrap();
 const handler=b.handlers.post.get('/api/swapp/discord/community/:guildId');
 const req=request();req.params.guildId=id;req.body={announcements:true,public:false};
 req.get=key=>key==='origin'?'https://attacker.example':key==='host'?'swapp.tv':'application/json';
 let res=response();await handler(req,res);
 assert.equal(res.statusCode,403);
 req.get=key=>key==='origin'?'https://swapp.tv':key==='host'?'swapp.tv':'application/json';
 req.body={announcements:'true',public:false};
 res=response();await handler(req,res);
 assert.equal(res.statusCode,400);
});
test('Discord integration registers before the creator catch-all and listens to verified HLS publication',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.ok(server.includes('createDiscordConnect({'));
 assert.ok(server.indexOf("createDiscordConnect({")<server.indexOf("app.get(/^\\/([a-zA-Z0-9_"));
 assert.ok(server.includes('swappDiscordConnect.notifyLive(login,eventId)'));
 assert.ok(server.includes('swappDiscordHlsProvider=swappDirectRelay'));
 const menu=fs.readFileSync(path.join(root,'assets/swapp-account-menu.js'),'utf8');
 assert.ok(menu.includes("discord.href='/discord'"));
});
