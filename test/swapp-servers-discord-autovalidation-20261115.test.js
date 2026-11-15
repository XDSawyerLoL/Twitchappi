'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inviteCode,verifyDiscordInvite}=require('../modules/swapp-servers-discord');
const {register,page,autoReviewPendingDiscord}=require('../modules/swapp-servers');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const VERIFIED={valid:true,inviteUrl:'https://discord.gg/SWAPP123',code:'SWAPP123',guildId:'123456789012345678',guildName:'SWAPP'};
function response(){
 return {statusCode:200,data:null,headers:{},status(n){this.statusCode=n;return this},
  set(k,v){this.headers[k]=v;return this},json(data){this.data=data;return this}};
}
function routes(options){
 const byMethod={GET:new Map(),POST:new Map()};
 const app={get:(route,...handlers)=>byMethod.GET.set(route,handlers.at(-1)),post:(route,...handlers)=>byMethod.POST.set(route,handlers.at(-1))};
 register(app,{enableAutoReview:false,...options});
 return byMethod;
}
function request(body={},session={oryonUser:{id:'0123456789abcdef0123456789abcdef'}}){
 return {body,session,query:{},params:{},get:header=>header==='origin'?'https://swapp.tv':undefined};
}
function body(game='Discord / Multigaming'){
 return {name:'SWAPP Discord',game,description:'Communauté gaming francophone multijoueur, événements et entraide',website:'https://discord.gg/SWAPP123',joinAddress:'',region:'France',tags:'gaming,discord',bannerUrl:''};
}
test('Discord invite parser requires an official HTTPS invitation, not an arbitrary URL',()=>{
 assert.equal(inviteCode('https://discord.gg/AbC123'),'AbC123');
 assert.equal(inviteCode('https://discord.com/invite/AbC123'),'AbC123');
 for(const value of ['http://discord.gg/AbC123','https://discord.gg.evil.tld/AbC123','https://evil.tld/invite/AbC123','https://discord.gg/a/extra','https://discord.gg/AbC123:80','javascript:alert(1)'])
  assert.equal(inviteCode(value),'',value);
});
test('automatic checker approves only guild invites confirmed by Discord itself',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return{status:200,ok:true,json:async()=>({code:'SWAPP123',type:0,guild:{id:'123456789012345678',name:'SWAPP'},expires_at:null})}};
 const checked=await verifyDiscordInvite('https://discord.gg/SWAPP123',{fetcher});
 assert.equal(checked.valid,true);
 assert.equal(checked.inviteUrl,'https://discord.gg/SWAPP123');
 assert.equal(calls[0].url,'https://discord.com/api/v10/invites/SWAPP123?with_counts=true');
 assert.equal(calls[0].options.redirect,'error');
 const notGuild=await verifyDiscordInvite('https://discord.gg/SWAPP123',{fetcher:async()=>({ok:true,status:200,json:async()=>({code:'SWAPP123',type:1,guild:null})})});
 assert.equal(notGuild.valid,false);
 const expired=await verifyDiscordInvite('https://discord.gg/SWAPP123',{fetcher:async()=>({ok:true,status:200,json:async()=>({code:'SWAPP123',type:0,guild:{id:'123456789012345678'},expires_at:'2020-01-01T00:00:00Z'})})});
 assert.equal(expired.valid,false);
 const unavailable=await verifyDiscordInvite('https://discord.gg/SWAPP123',{fetcher:async()=>{throw Error('timeout')}});
 assert.equal(unavailable.valid,false);
});
test('a real Discord submission is published immediately but an unverified game server stays pending',async()=>{
 const inserted=[];
 const fakeDb={execute:async(sql,values)=>{
  if(sql.startsWith('SELECT COUNT(*) AS n'))return[[{n:0}]];
  if(sql.startsWith('INSERT INTO swapp_game_servers')){inserted.push(values);return[{affectedRows:1}]}
  throw Error('Unexpected SQL '+sql);
 }};
 const app=routes({getDatabase:async()=>fakeDb,inviteVerifier:async()=>VERIFIED});
 const discord=response();
 await app.POST.get('/api/swapp/serveurs')(request(body()),discord);
 assert.equal(discord.statusCode,201);
 assert.equal(discord.data.status,'published');
 assert.equal(discord.data.autoVerified,true);
 assert.equal(inserted[0].at(-1),'published');
 assert.equal(inserted[0][6],VERIFIED.inviteUrl);
 const game=response();
 await app.POST.get('/api/swapp/serveurs')(request(body('Rust')),game);
 assert.equal(game.data.status,'pending');
 assert.equal(game.data.autoVerified,false);
 assert.equal(inserted[1].at(-1),'pending');
});
test('existing Discord listings are automatically reconciled without publishing invalid invites',async()=>{
 const changed=[];
 const fakeDb={
  query:async()=>[[{id:'a'.repeat(32),website:'https://discord.gg/SWAPP123',joinAddress:''},
   {id:'b'.repeat(32),website:'https://discord.gg/INVALID',joinAddress:''}]],
  execute:async(sql,values)=>{changed.push({sql,values});return[{affectedRows:1}]}
 };
 const r=await autoReviewPendingDiscord({getDatabase:async()=>fakeDb,inviteVerifier:async(url)=>url.endsWith('SWAPP123')?VERIFIED:{valid:false,reason:'invite_not_found'}});
 assert.deepEqual(r,{checked:2,approved:1});
 assert.equal(changed.length,1);
 assert.match(changed[0].sql,/WHERE id=\? AND status="pending"/);
});
test('moderation count is admin-only and the existing SWAPP guard is authoritative',async()=>{
 const db={query:async()=>[[{n:3}]]};
 const a=routes({isAdmin:()=>true,getDatabase:async()=>db});
 const b=routes({isAdmin:()=>false,getDatabase:async()=>db});
 const ok=response(),denied=response();
 await a.GET.get('/api/swapp/serveurs/moderation/count')(request(),ok);
 await b.GET.get('/api/swapp/serveurs/moderation/count')(request(),denied);
 assert.deepEqual(ok.data,{pending:3,url:'/serveurs#ss-review'});
 assert.equal(denied.statusCode,403);
 const html=page({isAdmin:true});
 assert.ok(html.indexOf('class="ss-admin"')<html.indexOf('class="ss-toolbar"'),'admin panel must be near top');
 assert.match(html,/id="ss-owned"/);
 const source=read('server.js');
 assert.match(source,/isAdmin:req=>isOryonAdmin\(req\)\|\|isAdminTwitchUser\(req\.session\?\.twitchUser\)/);
 const notifications=read('assets/swapp-servers-alerts.js');
 assert.match(notifications,/moderation\/count/);
 assert.match(notifications,/data-ss-account-alert/);
});
