'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {register}=require('../modules/swapp-servers');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function api({verify=async()=>({valid:true,inviteUrl:'https://discord.gg/ABC123',guildId:'123456789012345678'})}={}){
 const routes={},writes=[],events=[],db={};
 const conn={
  async beginTransaction(){events.push('begin')},async commit(){events.push('commit')},
  async rollback(){events.push('rollback')},release(){events.push('release')},
  async execute(sql,args=[]){
   if(sql.startsWith('SELECT id,slug,status FROM swapp_game_servers'))return [[]];
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers'))return [[{n:0}]];
   if(sql.startsWith('SELECT id,slug,game,website,join_address'))return [[{id:'a'.repeat(32),slug:'test-aaaaaaa',game:'Minecraft',website:'https://example.org'}]];
   writes.push({sql,args});return [{affectedRows:1}];
  }
 };
 db.getConnection=async()=>conn;
 register({get:(route,...handlers)=>routes['GET '+route]=handlers.at(-1),
  post:(route,...handlers)=>routes['POST '+route]=handlers.at(-1),
  put:(route,...handlers)=>routes['PUT '+route]=handlers.at(-1)},
 {getDatabase:async()=>db,inviteVerifier:verify,enableAutoReview:false});
 const request=(body,id='a'.repeat(32))=>({
  body,params:{id},get:key=>key==='origin'?'https://swapp.tv':null,
  session:{oryonUser:{id:'test-member'}},query:{}
 });
 const response=()=>({code:200,payload:null,status(n){this.code=n;return this},json(data){this.payload=data;return this}});
 return {routes,writes,events,request,response};
}
const basic=()=>({name:'Ma communauté Minecraft',game:'Minecraft',
 description:'Communauté française Minecraft avec des joueurs et des événements.',
 website:'https://example.org',joinAddress:'',region:'France',language:'fr',
 types:['Communauté','Jeux'],logoUrl:'',bannerUrl:'',accentColor:'#8ceaf0',
 secondaryColor:'#ad6bff',gallery:[]});
test('a valid game listing with website and no IP creates successfully',async()=>{
 const ctx=api(),res=ctx.response();await ctx.routes['POST /api/swapp/serveurs'](ctx.request(basic()),res);
 assert.equal(res.code,201);assert.equal(res.payload.status,'published');
 assert.ok(ctx.writes.some(x=>x.sql.startsWith('INSERT INTO swapp_game_server_branding')));
});
test('missing website AND join address returns actionable field error and no database writes',async()=>{
 const ctx=api(),res=ctx.response();const payload=basic();payload.website='';
 await ctx.routes['POST /api/swapp/serveurs'](ctx.request(payload),res);
 assert.equal(res.code,422);assert.equal(res.payload.error,'informations_invalides');
 assert.match(res.payload.fields.joinAddress,/adresse de connexion/i);
 assert.equal(ctx.writes.length,0);
});
test('pasting a ChatGPT download link into a logo URL yields logo-specific guidance',async()=>{
 const ctx=api(),res=ctx.response();const payload=basic();payload.logoUrl='sandbox:/mnt/data/swapp-logo.png';
 await ctx.routes['POST /api/swapp/serveurs'](ctx.request(payload),res);
 assert.equal(res.code,422);
 assert.match(res.payload.fields.logoUrl,/fichier PNG\/JPG\/WebP/);
 assert.equal(ctx.writes.length,0);
});
test('banner with invalid/nonpublic URL returns banner-specific advice',async()=>{
 const ctx=api(),res=ctx.response();const payload=basic();payload.bannerUrl='http://example.org/image.jpg';
 await ctx.routes['POST /api/swapp/serveurs'](ctx.request(payload),res);
 assert.equal(res.code,422);
 assert.match(res.payload.fields.bannerUrl,/HTTPS/);
 assert.equal(ctx.writes.length,0);
});
test('short description, bad color and unsupported type name are explained independently',async()=>{
 const ctx=api(),res=ctx.response();const payload=basic();
 payload.description='Trop court';payload.accentColor='purple';payload.types=['Inconnue'];
 await ctx.routes['POST /api/swapp/serveurs'](ctx.request(payload),res);
 assert.equal(res.code,422);
 for(const key of ['description','accentColor','types'])assert.ok(res.payload.fields[key],key);
 assert.equal(ctx.writes.length,0);
});
test('Discord invite needs no game IP address or website',async()=>{
 const ctx=api(),res=ctx.response();const payload=basic();
 payload.game='Discord / Multigaming';payload.website='';payload.joinAddress='';
 payload.discordCode='ABC123';
 await ctx.routes['POST /api/swapp/serveurs'](ctx.request(payload),res);
 assert.equal(res.code,201);
 assert.equal(res.payload.status,'published');
});
test('owner edit also returns the precise field, without touching database',async()=>{
 const ctx=api(),res=ctx.response(),payload=basic();
 payload.logoUrl='file:///C:/Users/test/logo.png';
 await ctx.routes['PUT /api/swapp/serveurs/:id'](ctx.request(payload),res);
 assert.equal(res.code,422);
 assert.match(res.payload.fields.logoUrl,/HTTPS/);
 assert.equal(ctx.writes.length,0);
});
test('client visibly uses precise field errors, invalid focus and uploaded-image precedence',()=>{
 const client=read('assets/swapp-servers-create.js');
 assert.match(client,/result\.fields/);
 assert.match(client,/focusField\.focus/);
 assert.match(client,/aria-invalid/);
 assert.match(client,/urlField\.value=''/);
 assert.match(client,/adresse de connexion au jeu OU/);
 assert.doesNotMatch(client,/Certaines informations sont invalides\. Vérifie/);
 const markup=read('modules/swapp-servers-create.js');
 assert.match(markup,/Tu n’as pas besoin des deux/);
});
