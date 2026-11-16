'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {register,detailPage,page}=require('../modules/swapp-servers');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ID='a'.repeat(32),G='Minecraft';
const base={id:ID,owner_id:'owner-1',slug:'sample-aaaaaaa',name:'Sample RP',game:G,
 description:'Une communauté francophone pour découvrir les jeux ensemble.',
 website:'https://example.org',region:'France',tags:'RP,PvP',votes_month:8};
const req=(body={},session={oryonUser:{id:'owner-1'}})=>({
 body,session,params:{id:ID,slug:base.slug,kind:'logo',page:'1'},query:{game:G,sort:'votes',page:'2'},ip:'127.0.0.2',get:name=>name==='origin'?'https://swapp.tv':null
});
function response(){return{statusCode:200,headers:{},data:null,status(n){this.statusCode=n;return this},
 set(k,v){if(typeof k==='string')this.headers[k]=v;else Object.assign(this.headers,k);return this},
 json(value){this.data=value;return this},type(){return this},send(value){this.data=value;return this},
 sendStatus(n){this.statusCode=n;return this},redirect(n,url){this.statusCode=n;this.url=url;return this}}}
function appFor(db,verify=async()=>({valid:true,inviteUrl:'https://discord.gg/ABC123'})){
 const routes=new Map();
 const add=method=>(name,...handlers)=>routes.set(method+' '+name,handlers.at(-1));
 register({get:add('GET'),post:add('POST'),put:add('PUT')},{
  enableAutoReview:false,getDatabase:async()=>db,inviteVerifier:verify
 });
 return routes;
}
test('listing returns an actual page and rank, never permits shared HTTP caches for canEdit',async()=>{
 const queries=[],db={
  execute:async(sql,args)=>{
   queries.push({sql,args});
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers'))return [[{n:61}]];
   if(sql.startsWith('SELECT s.id,s.owner_id,s.slug'))return [[{...base,tags:'RP,PvP'}]];
   throw Error('Unexpected SQL '+sql);
  },
  query:async()=>[[{game:G,count:61}]]
 };
 const routes=appFor(db),r=response();
 await routes.get('GET /api/swapp/serveurs')(req(),r);
 assert.equal(r.statusCode,200);
 assert.equal(r.headers['Cache-Control'],'private,no-store');
 assert.equal(r.data.page,2);
 assert.equal(r.data.total,61);
 assert.equal(r.data.pageSize,24);
 assert.equal(r.data.hasMore,true);
 assert.equal(r.data.servers[0].rank,25);
 assert.equal(r.data.servers[0].canEdit,true);
 assert.match(queries[1].sql,/LIMIT \? OFFSET \?/);
 assert.deepEqual(queries[1].args.slice(-2),[24,24]);
 const anon=response();
 await routes.get('GET /api/swapp/serveurs')(req({},{}),anon);
 assert.equal(anon.data.servers[0].canEdit,false);
});
test('non-vote sorting does not invent numeric ranks',async()=>{
 const db={execute:async sql=>sql.startsWith('SELECT COUNT(*)')?[[{n:1}]]:[[{...base}]],query:async()=>[[]]};
 const r=response();const query=req();query.query.sort='name';
 await appFor(db).get('GET /api/swapp/serveurs')(query,r);
 assert.equal(r.data.servers[0].rank,null);
 const script=read('assets/swapp-servers.js');
 assert.match(script,/s\.rank/);
 assert.match(script,/state\.page/);
 assert.match(script,/hasMore/);
 assert.match(script,/ss-load-more/);
});
test('unchanged Discord invitation is not revalidated during a color edit',async()=>{
 let checked=0;const queries=[];
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
 execute:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT id,slug,game,website,join_address'))return [[{id:ID,slug:base.slug,game:'Discord / Multigaming',website:'https://discord.gg/ABC123'}]];
  return [{affectedRows:1}]
 }};
 const db={getConnection:async()=>conn};
 const routes=appFor(db,async()=>{checked++;return{valid:true,inviteUrl:'https://discord.gg/ABC123'}});
 const r=response();
 await routes.get('PUT /api/swapp/serveurs/:id')(req({
  name:'Discord SWAPP',game:'Discord / Multigaming',description:base.description,
  website:'https://example.org',discordCode:'ABC123',language:'fr',
  accentColor:'#ff4466',secondaryColor:'#aa66ff',types:['Communauté']
 }),r);
 assert.equal(r.statusCode,200);
 assert.equal(checked,0);
 assert.equal(r.data.updated,true);
 const meta=queries.find(x=>x.sql.startsWith('INSERT INTO swapp_game_server_extras'));
 assert.match(meta.sql,/discord_guild_id=IF\(/);
});
test('linked native and Twitch IDs are accepted only when both are authenticated in one session',async()=>{
 const observed=[];
 const db={execute:async(sql,args)=>{
  observed.push(args);
  if(sql.startsWith('SELECT s.id,s.slug,s.name'))return [[{...base,id:ID,slug:base.slug,logoUrl:'',accentColor:'#8ceaf0'}]];
  return [[]];
 }};
 const routes=appFor(db);
 const linked=req({}, {oryonUser:{id:'owner-1'},twitchUser:{id:'999'}});
 const r=response();
 await routes.get('GET /serveurs/gerer/:slug')(linked,r);
 assert.equal(r.statusCode,200);
 assert.deepEqual(observed[0].slice(-2),['owner-1','twitch:999']);
});
test('removing media requires owner rights and clears stored bytes and branding',async()=>{
 const operations=[];
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
 execute:async(sql,args)=>{
  operations.push({sql,args});
  if(sql.startsWith('SELECT id FROM swapp_game_servers WHERE'))return [[{id:ID}]];
  return [{affectedRows:1}]
 }};
 const routes=appFor({getConnection:async()=>conn});
 const r=response();
 await routes.get('POST /api/swapp/serveurs/:id/media/:kind/remove')(req(),r);
 assert.equal(r.data.removed,true);
 assert.ok(operations.some(x=>x.sql.startsWith('DELETE FROM swapp_game_server_media')));
 assert.ok(operations.some(x=>x.sql.startsWith('UPDATE swapp_game_server_branding')));
 assert.match(read('modules/swapp-servers-create.js'),/data-ss-clear-media="logo"/);
 assert.match(read('assets/swapp-servers-create.js'),/media\/'\+kind\+'\/remove/);
});
test('owner-only media deletion returns 404 for another account',async()=>{
 const db={getConnection:async()=>({beginTransaction:async()=>{},rollback:async()=>{},release(){},
 execute:async()=>[[]]})};
 const r=response();
 await appFor(db).get('POST /api/swapp/serveurs/:id/media/:kind/remove')(req({}, {oryonUser:{id:'attacker'}}),r);
 assert.equal(r.statusCode,404);
});
test('daily repeat voting is limited on the server without claiming it prevents all fraud',async()=>{
 const writes=[];
 const conn={beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release(){},
 execute:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM swapp_game_servers'))return [[{id:ID}]];
  if(sql.startsWith('SELECT voted_at'))return [[]];
  if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_server_vote_events'))return [[{n:3}]];
  writes.push(sql);return [{affectedRows:1}];
 }};
 const r=response();await appFor({getConnection:async()=>conn}).get('POST /api/swapp/serveurs/:id/vote')(req(),r);
 assert.equal(r.statusCode,429);
 assert.equal(r.data.error,'vote_daily_limit');
 assert.equal(writes.length,0);
});
test('public server profiles emit OpenGraph/Twitter meta and sitemap index routes',async()=>{
 const html=detailPage({...base,slug:base.slug,game:G,description:'Une communauté de jeux',brand_banner_url:'https://example.org/banner.jpg',tagline:'Venez jouer ensemble'},8);
 assert.match(html,/property="og:image" content="https:\/\/example.org\/banner.jpg"/);
 assert.match(html,/name="twitter:card" content="summary_large_image"/);
 assert.match(html,/property="og:title"/);
 const db={query:async()=>[[{n:1201}]]};
 const routes=appFor(db),r=response();
 await routes.get('GET /sitemap-serveurs.xml')(req(),r);
 assert.equal(r.statusCode,200);
 assert.match(r.data,/sitemap-serveurs-2\.xml/);
 assert.match(read('modules/swapp-seo.js'),/sitemap-serveurs\.xml/);
});

test('server directory and category landing pages expose first-party X previews',()=>{
 for(const html of [page(),page({game:'Minecraft'})]){
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(html,/name="twitter:image" content="https:\/\/swapp\.tv\/swapp-share-card\.png"/);
  assert.match(html,/property="og:image" content="https:\/\/swapp\.tv\/swapp-share-card\.png"/);
 }
});
