'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createPage,SERVER_TYPES,discordLink,twitchLink,readTypes}=require('../modules/swapp-servers-create');
const {register,page,detailPage}=require('../modules/swapp-servers');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
function setup({existing=[],n=1,verify=async()=>({valid:true,inviteUrl:'https://discord.gg/AbC123',guildId:'123456789012345678'})}={}){
 const writes=[],calls=[],events=[];
 const conn={
  async beginTransaction(){events.push('begin')},
  async commit(){events.push('commit')},
  async rollback(){events.push('rollback')},
  release(){events.push('release')},
  async execute(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith('SELECT id,slug,status FROM swapp_game_servers'))return[existing];
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers'))return[[{n}]];
   if(sql.startsWith('INSERT INTO swapp_game_servers')||sql.startsWith('UPDATE swapp_game_servers SET name=')||sql.startsWith('INSERT INTO swapp_game_server_extras')){writes.push({sql,args});return[{affectedRows:1}]}
   throw Error('Unexpected SQL '+sql);
  }
 };
 const app={GET:new Map(),POST:new Map()};
 const api={get:(route,...handlers)=>app.GET.set(route,handlers.at(-1)),post:(route,...handlers)=>app.POST.set(route,handlers.at(-1))};
 register(api,{enableAutoReview:false,getDatabase:async()=>({getConnection:async()=>conn}),inviteVerifier:verify});
 const res=()=>({code:200,data:null,html:null,status(n){this.code=n;return this},json(x){this.data=x;return this},type(){return this},set(){return this},send(x){this.html=x;return this}});
 const request=body=>({get:key=>key==='origin'?'https://swapp.tv':'',session:{oryonUser:{id:'member-123'}},body,query:{},params:{}});
 return {app,writes,calls,events,request,res};
}
const example=()=>({name:'SWAPP - Les joueurs',game:'Discord / Multigaming',description:'Une communauté francophone qui partage des streams et des parties.',website:'https://swapp.tv',discordCode:'AbC123',twitch:'MonStreamer',language:'fr',region:'France',types:['Communauté','Jeux','Roleplay'],bannerUrl:'https://swapp.tv/banner.jpg'});
test('creator is a full page with the same field hierarchy as a server directory, not a popup',()=>{
 const html=createPage({game:'Discord / Multigaming',games:['Discord / Multigaming','Minecraft']});
 for(const heading of ['Informations de base','Configuration','Connexion au serveur','Réseaux sociaux','Compte SWAPP'])assert.ok(html.includes(heading),heading);
 for(const field of ['name','game','description','website','discordCode','twitch','language','types','bannerUrl'])assert.ok(html.includes('name="'+field+'"'),field);
 assert.ok(SERVER_TYPES.length>=18);
 assert.match(html,/id="ss-create-preview-name"/);
 assert.match(html,/\/assets\/swapp-servers-create\.js/);
 assert.doesNotMatch(html,/type="password"/);
 assert.doesNotMatch(page(),/id="ss-dialog"/);
 assert.match(page(),/href="\/serveurs\/creer"/);
});
test('Discord and Twitch inputs accept a short ID or official link only',()=>{
 assert.equal(discordLink('AbC123'),'https://discord.gg/AbC123');
 assert.equal(discordLink('https://discord.gg/AbC123'),'https://discord.gg/AbC123');
 assert.equal(discordLink('https://discord.com/invite/AbC123'),'https://discord.gg/AbC123');
 assert.equal(discordLink('https://discord.gg.evil.tld/AbC123'),'');
 assert.equal(discordLink('https://invalid.example/a'),'');
 assert.equal(twitchLink('MonStreamer'),'https://www.twitch.tv/monstreamer');
 assert.equal(twitchLink('https://www.twitch.tv/MonStreamer'),'https://www.twitch.tv/monstreamer');
 assert.deepEqual(readTypes(['Jeux','Jeux','Roleplay','Inconnu']),['Jeux','Roleplay']);
});
test('creation URLs are registered before generic game routes',()=>{
 const {app}=setup(),routes=[...app.GET.keys()];
 assert.ok(routes.indexOf('/serveurs/creer')<routes.indexOf('/serveurs/:jeu'));
 assert.ok(routes.includes('/serveurs/discord/creer'));
 assert.ok(routes.includes('/serveurs/:jeu/creer'));
 const result={code:200,html:'',status(n){this.code=n;return this},set(){return this},type(){return this},send(x){this.html=x;return this}};
 app.GET.get('/serveurs/creer')({query:{}},result);
 assert.match(result.html,/Ajouter un serveur Discord/);
});
test('Discord creation saves the full form transactionally and returns a published profile',async()=>{
 const ctx=setup();const response=ctx.res();
 await ctx.app.POST.get('/api/swapp/serveurs')(ctx.request(example()),response);
 assert.equal(response.code,201);
 assert.equal(response.data.status,'published');
 assert.equal(response.data.url.startsWith('/serveurs/discord-multigaming/'),true);
 assert.deepEqual(ctx.events,['begin','commit','release']);
 const server=ctx.writes.find(x=>x.sql.startsWith('INSERT INTO swapp_game_servers'));
 const extra=ctx.writes.find(x=>x.sql.startsWith('INSERT INTO swapp_game_server_extras'));
 assert.ok(server&&extra,'both tables must be written');
 assert.equal(server.args[6],'https://discord.gg/AbC123');
 assert.equal(server.args[9],'Communauté, Jeux, Roleplay');
 assert.equal(extra.args[1],'fr');
 assert.equal(extra.args[2],'https://www.twitch.tv/monstreamer');
 assert.equal(extra.args[3],'https://swapp.tv/');
 assert.equal(extra.args[4],'123456789012345678');
});
test('a pending duplicate is completed in place instead of consuming a new slot',async()=>{
 const ctx=setup({existing:[{id:'b'.repeat(32),slug:'ancien-serveur-bbbbbbb',status:'pending'}],n:5});
 const response=ctx.res();
 await ctx.app.POST.get('/api/swapp/serveurs')(ctx.request(example()),response);
 assert.equal(response.code,200);
 assert.equal(response.data.url,'/serveurs/discord-multigaming/ancien-serveur-bbbbbbb');
 assert.ok(ctx.writes.some(x=>x.sql.startsWith('UPDATE swapp_game_servers SET name=')));
 assert.ok(!ctx.writes.some(x=>x.sql.startsWith('INSERT INTO swapp_game_servers')));
 assert.deepEqual(ctx.events,['begin','commit','release']);
});
test('an already-published duplicate returns its existing URL, without saving again',async()=>{
 const ctx=setup({existing:[{id:'c'.repeat(32),slug:'deja-publie-ccccccc',status:'published'}]});
 const response=ctx.res();
 await ctx.app.POST.get('/api/swapp/serveurs')(ctx.request(example()),response);
 assert.equal(response.code,200);
 assert.equal(response.data.alreadyExists,true);
 assert.equal(ctx.writes.length,0);
 assert.deepEqual(ctx.events,['begin','rollback','release']);
});
test('Discord check failure refuses creation before database access',async()=>{
 const ctx=setup({verify:async()=>({valid:false,reason:'invite_not_found'})});
 const response=ctx.res();
 await ctx.app.POST.get('/api/swapp/serveurs')(ctx.request(example()),response);
 assert.equal(response.code,422);
 assert.equal(response.data.error,'verification_discord_impossible');
 assert.equal(ctx.calls.length,0);
});
test('server profiles display creator metadata without unsafe HTML',()=>{
 const html=detailPage({id:'f'.repeat(32),name:'SWAPP Discord',slug:'swapp-discord-fffffff',game:'Discord / Multigaming',
 description:'Communauté de joueurs',region:'France',tags:'Jeux',website:'https://discord.gg/AbC123',
 twitch_url:'https://www.twitch.tv/monstreamer',homepage_url:'https://swapp.tv/',language:'fr',join_address:'',banner_url:''},4);
 assert.match(html,/Chaîne Twitch/);
 assert.match(html,/Site officiel/);
 assert.match(html,/Français/);
});
test('Hostinger build includes all files used by the creator',()=>{
 const pack=read('tools/swapp-hostinger-package.js');
 for(const path of ['modules/swapp-servers-create.js','assets/swapp-servers-create.js','assets/swapp-servers-create.css'])
  assert.ok(pack.includes("'"+path+"'"),path);
});
