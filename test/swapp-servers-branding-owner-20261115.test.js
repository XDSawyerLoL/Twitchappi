'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register,detailPage}=require('../modules/swapp-servers');
const {createPage}=require('../modules/swapp-servers-create');
const {renderProfile}=require('../modules/swapp-servers-profile');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const id='a'.repeat(32),slug='swapp-cyberpunk-aaaaaaa';
const row={id,slug,owner_id:'owner-1',name:'SWAPP Cyber RP',game:'Cyberpunk 2077',description:'Communauté française Cyberpunk avec événements et roleplay.',
 website:'https://example.com',joinAddress:'nightcity.example.com:7777',region:'France',tags:'Jeux, Roleplay',
 bannerUrl:'https://example.com/banner.jpg',logoUrl:'/media/serveurs/'+id+'/logo',brandBannerUrl:'/media/serveurs/'+id+'/banner',
 accentColor:'#ff456a',secondaryColor:'#a53fff',tagline:'La ville appartient aux audacieux',
 galleryJson:'["https://example.com/screen1.jpg"]',language:'fr',twitchUrl:'https://www.twitch.tv/swapp',homepageUrl:'https://example.com'};
function mock({owned=true}={}){
 const writes=[],calls=[],events=[],handlers={};
 const conn={
  beginTransaction:async()=>events.push('begin'),
  commit:async()=>events.push('commit'),
  rollback:async()=>events.push('rollback'),
  release:()=>events.push('release'),
  execute:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.startsWith('SELECT id,slug,game,website,join_address FROM swapp_game_servers'))return [owned?[{id,slug,game:row.game,website:row.website,join_address:row.joinAddress}]:[]];
   if(sql.startsWith('SELECT id FROM swapp_game_servers WHERE id=? AND owner_id='))return [owned?[{id}]:[]];
   writes.push({sql,args});return[{affectedRows:1}];
  }
 };
 const db={
  getConnection:async()=>conn,
  execute:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.startsWith('SELECT s.id,s.slug,s.name,s.game,s.description,s.website'))return [owned?[{...row}]:[]];
   if(sql.startsWith('SELECT m.contents,m.mime'))return [[{contents:Buffer.from('abc'),mime:'image/png'}]];
   throw Error('unexpected query '+sql);
  }
 };
 const app={get:(route,...fn)=>handlers['GET '+route]=fn.at(-1),
  post:(route,...fn)=>handlers['POST '+route]=fn.at(-1),
  put:(route,...fn)=>handlers['PUT '+route]=fn.at(-1)};
 register(app,{getDatabase:async()=>db,enableAutoReview:false});
 const req=(payload={},account='owner-1')=>({body:payload,params:{id,slug,kind:'logo'},
  session:account?{oryonUser:{id:account}}:{},get:key=>key==='origin'?'https://swapp.tv':'',query:{}});
 const response=()=>({code:200,data:null,html:'',headers:{},status(n){this.code=n;return this},
  set(k,v){this.headers[k]=v;return this},type(){return this},json(d){this.data=d;return this},
  send(d){this.html=d;return this},sendStatus(n){this.code=n;return this},redirect(n,path){this.code=n;this.location=path;return this}});
 return {handlers,writes,calls,events,req,response};
}
test('private owner editor displays the saved branding without exposing it in public pages',async()=>{
 const ctx=mock(),r=ctx.response();
 await ctx.handlers['GET /serveurs/gerer/:slug'](ctx.req(),r);
 assert.equal(r.code,200);
 assert.match(r.html,/id="ss-create-edit-data"/);
 assert.match(r.html,/data-ss-edit-id=/);
 assert.match(r.html,/Personnaliser SWAPP Cyber RP/);
 assert.match(r.html,/logoFile/);
 assert.match(r.html,/accentColor/);
 assert.match(r.html,/gallery1/);
 assert.doesNotMatch(createPage({game:'Minecraft',games:['Minecraft']}),/id="ss-create-edit-data"/);
});
test('owner-only update writes main, extras and branding atomically',async()=>{
 const ctx=mock(),r=ctx.response();
 const payload={name:row.name,game:row.game,description:row.description,website:row.website,joinAddress:row.joinAddress,
  language:'fr',twitch:'swapp',types:['Jeux','Roleplay'],region:'France',logoUrl:row.logoUrl,brandBannerUrl:row.brandBannerUrl,
  accentColor:'#ff456a',secondaryColor:'#a53fff',tagline:row.tagline,gallery:['https://example.com/screen1.jpg']};
 await ctx.handlers['PUT /api/swapp/serveurs/:id'](ctx.req(payload),r);
 assert.equal(r.code,200);
 assert.equal(r.data.updated,true);
 assert.equal(r.data.url,'/serveurs/cyberpunk-2077/'+slug);
 assert.deepEqual(ctx.events,['begin','commit','release']);
 assert.ok(ctx.writes.some(x=>x.sql.includes('UPDATE swapp_game_servers SET name=')));
 assert.ok(ctx.writes.some(x=>x.sql.includes('swapp_game_server_extras')));
 const brand=ctx.writes.find(x=>x.sql.includes('INSERT INTO swapp_game_server_branding'));
 assert.ok(brand);
 assert.equal(brand.args[1],row.logoUrl);
 assert.equal(brand.args[2],row.brandBannerUrl);
 assert.equal(brand.args[3],'#ff456a');
 assert.equal(brand.args[4],'#a53fff');
});
test('a different account cannot modify or upload artwork to another member server',async()=>{
 const ctx=mock({owned:false}),r=ctx.response();
 const payload={name:row.name,game:row.game,description:row.description,website:row.website,joinAddress:row.joinAddress,language:'fr'};
 await ctx.handlers['PUT /api/swapp/serveurs/:id'](ctx.req(payload,'stranger'),r);
 assert.equal(r.code,404);assert.equal(ctx.writes.length,0);
 const r2=ctx.response();const png=Buffer.alloc(128);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 const req=ctx.req(png,'stranger');req.body=png;
 await ctx.handlers['PUT /api/swapp/serveurs/:id/media/:kind'](req,r2);
 assert.equal(r2.code,404);assert.equal(ctx.writes.length,0);
});
test('upload validates image magic bytes and persists the file as a BLOB',async()=>{
 const ctx=mock(),bad=ctx.response();
 const r0=ctx.req(Buffer.alloc(200));r0.body=Buffer.alloc(200);
 await ctx.handlers['PUT /api/swapp/serveurs/:id/media/:kind'](r0,bad);
 assert.equal(bad.code,415);
 const good=ctx.response(),png=Buffer.alloc(200);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 const request=ctx.req(png);request.body=png;
 await ctx.handlers['PUT /api/swapp/serveurs/:id/media/:kind'](request,good);
 assert.equal(good.code,200);
 assert.equal(good.data.url,'/media/serveurs/'+id+'/logo');
 assert.ok(ctx.writes.some(x=>x.sql.startsWith('INSERT INTO swapp_game_server_media')));
});
test('public detail highlights brand logo, secondary color, slogan, gallery and red heart',()=>{
 const html=renderProfile({server:{...row,
  logo_url:row.logoUrl,accent_color:row.accentColor,secondary_color:row.secondaryColor,tagline:row.tagline,
  gallery_json:row.galleryJson},cover:row.bannerUrl,canEdit:true,gamePath:'/serveurs/cyberpunk-2077',votes:8});
 assert.match(html,/--ss-brand-accent:#ff456a/);
 assert.match(html,/--ss-brand-secondary:#a53fff/);
 assert.match(html,/La ville appartient aux audacieux/);
 assert.match(html,/id="galerie"/);
 assert.match(html,/ss-pro-owner-edit/);
 assert.match(html,/ss-heart/);
 assert.match(html,/alt="Logo de SWAPP Cyber RP"/);
 const directory=read('assets/swapp-servers.js');
 assert.match(directory,/ss-server-logo/);
 assert.match(directory,/ss-owner-edit/);
 assert.match(read('assets/swapp-servers.css'),/SERVEUR \+ MARKETPLACE 2026/);
});
test('editor JSON cannot terminate a script element when name contains HTML',()=>{
 const hostile={...row,name:'</script><script>alert(1)</script>'};
 const html=createPage({game:row.game,games:[row.game],edit:hostile});
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/id="ss-create-edit-data"/);
});


test('owner portfolio is a separate page, with private access and edit buttons',async()=>{
 const source=read('modules/swapp-servers.js');
 assert.ok(source.indexOf("app.get('/serveurs/mes-serveurs'")<source.indexOf("app.get('/serveurs/:jeu',(req,res)"));
 assert.match(source,/WHERE s.owner_id=\? ORDER BY s.created_at DESC LIMIT 30/);
 assert.match(source,/Cache-Control','private,no-store/);
 assert.match(source,/ss-owner-manage-cta/);
 assert.match(source,/\/serveurs\/mes-serveurs/);
 assert.doesNotMatch(source.slice(source.indexOf('function page('),source.indexOf('const DETAIL_STEAM_GAME_IDS')),/id="ss-owned"/);
});
test('marketing palette is driven by saved colors and does not fake server metrics',()=>{
 const script=read('assets/swapp-servers.js'),css=read('assets/swapp-servers.css');
 assert.match(script,/ss-server-tagline/);
 assert.match(script,/s\.canEdit/);
 assert.match(script,/ss-heart/);
 assert.match(css,/--ss-brand-secondary/);
 assert.match(css,/ss-server-logo/);
 assert.match(css,/ss-pro-gallery/);
 assert.match(css,/ss-pro-vote/);
 assert.match(read('assets/swapp-servers-create.js'),/method:editId\?'PUT':'POST'/);
});
