'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register}=require('../modules/swapp-servers');
const {renderProfile}=require('../modules/swapp-servers-profile');
const {getProfileEvidence}=require('../modules/swapp-servers-stats');
const ID='a'.repeat(32);
const server={id:ID,owner_id:'owner-a',slug:'swapp-aaaaaaa',name:'SWAPP',game:'Discord / Multigaming',
 description:'Une communauté de joueurs et de créateurs sur SWAPP.',website:'https://discord.gg/exemple',
 tags:'Multigaming,FR',region:'France',created_at:'2026-11-14T00:00:00Z'};
function mock({missingOptional=false,down=false,isAdmin=false}={}){
 const handlers={},seen=[];
 const db={
  execute:async(sql,args=[])=>{
   seen.push({sql,args});
   if(down)throw Object.assign(Error('database down'),{code:'ECONNREFUSED'});
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers s WHERE'))return [[{n:1}]];
   if(sql.startsWith('SELECT s.id,s.owner_id,s.slug,s.name')){
    if(missingOptional&&sql.includes('swapp_game_server_branding'))throw Object.assign(Error('no branding'),{code:'ER_NO_SUCH_TABLE'});
    return [[{...server,bannerUrl:'',votes_month:missingOptional?null:7}]];
   }
   if(sql.startsWith('SELECT server_id'))throw Object.assign(Error('optional stats missing'),{code:'ER_NO_SUCH_TABLE'});
   throw Error('Unexpected SQL '+sql);
  },
  query:async(sql)=>{
   seen.push({sql});
   if(down)throw Object.assign(Error('database down'),{code:'ECONNREFUSED'});
   if(sql.startsWith('SELECT game,COUNT(*)'))return [[{game:'Discord / Multigaming',count:1}]];
   if(sql.startsWith('SELECT 1 FROM'))return [[]];
   throw Error('Unexpected SQL '+sql);
  }
 };
 const app={get:(route,...f)=>handlers['GET '+route]=f.at(-1),
  post:(route,...f)=>handlers['POST '+route]=f.at(-1),put:(route,...f)=>handlers['PUT '+route]=f.at(-1),delete:(route,...f)=>handlers['DELETE '+route]=f.at(-1)};
 register(app,{getDatabase:async()=>db,isAdmin:()=>isAdmin,enableAutoReview:false});
 const req={query:{game:server.game,sort:'votes',page:1},params:{jeu:'discord-multigaming'},
  session:{oryonUser:{id:'owner-a'}},get:()=> 'https://swapp.tv'};
 const res=()=>({statusCode:200,headers:{},data:null,html:'',status(n){this.statusCode=n;return this},
  set(k,v){this.headers[k]=v;return this},json(value){this.data=value;return this},
  type(){return this},send(value){this.html=value;return this},sendStatus(n){this.statusCode=n;return this}});
 return {handlers,seen,req,res};
}
test('missing optional MySQL tables leave authentic published listing accessible',async()=>{
 const c=mock({missingOptional:true}),r=c.res();
 await c.handlers['GET /api/swapp/serveurs'](c.req,r);
 assert.equal(r.statusCode,200);
 assert.equal(r.data.servers.length,1);
 assert.equal(r.data.servers[0].name,'SWAPP');
 assert.equal(r.data.servers[0].votes_month,null);
 assert.equal(r.data.servers[0].rank,null);
 assert.equal(r.data.ranking,'temporarily_unavailable');
 assert.equal(r.data.servers[0].reviewCount,undefined);
 assert.ok(c.seen.some(x=>x.sql.includes('NULL AS votes_month')));
});
test('server list survives unavailable enrichment metrics',async()=>{
 const c=mock(),r=c.res();
 await c.handlers['GET /api/swapp/serveurs'](c.req,r);
 assert.equal(r.statusCode,200);
 assert.equal(r.data.servers.length,1);
 assert.equal(r.data.servers[0].votes_month,7);
 assert.equal(r.data.servers[0].reviewCount,undefined);
});
test('real database outage remains HTTP 503 and cannot be mistaken for zero records',async()=>{
 const c=mock({down:true}),r=c.res();
 await c.handlers['GET /api/swapp/serveurs'](c.req,r);
 assert.equal(r.statusCode,503);
 assert.equal(r.data.error,'annuaire_temporairement_indisponible');
 assert.equal(r.data.total,undefined);
});
test('private diagnostics are inaccessible to an ordinary member',async()=>{
 const c=mock(),r=c.res();
 await c.handlers['GET /api/swapp/serveurs/diagnostic'](c.req,r);
 assert.equal(r.statusCode,403);
 assert.equal(c.seen.length,0);
});
test('public page keeps factual information, controlled reviews, and no made-up values',()=>{
 const html=renderProfile({server,stats:{allVotes:12,allClicks:4,monthClicks:2,
  history:{votes:[],clicks:[]},historyAvailable:true},
  votes:3,rank:2,reviewSummary:{count:2,staff:4,atmosphere:5,availability:4},
  reviews:[],gamePath:'/serveurs/discord-multigaming'});
 for(const name of ['informations','questions','statistiques','avis'])assert.match(html,new RegExp('id="'+name+'"'));
 for(const word of ['Informations pratiques','FAQ','Ajouté sur SWAPP','Clics enregistrés','Équipe','Ambiance','Disponibilité'])assert.match(html,new RegExp(word));
 assert.match(html,/N°2 AU CLASSEMENT/);
 assert.doesNotMatch(html,/>8 432</);
 const noData=renderProfile({server,reviewSummary:null,stats:null});
 assert.match(noData,/Avis indisponibles/);
 assert.doesNotMatch(noData,/Aucun avis publié pour le moment/);
});
test('a failed review query does not prevent server profile rendering',async()=>{
 const sql={execute:async statement=>{
  if(statement.startsWith('SELECT COUNT(*) AS n FROM swapp_game_server_vote_events'))return [[{n:6}]];
  if(statement.includes('AVG(staff)'))throw Object.assign(Error('table unavailable'),{code:'ER_NO_SUCH_TABLE'});
  if(statement.includes('SELECT s.id,(SELECT'))return [[{id:ID,votes:3}]];
  return [[]];
 }};
 const result=await getProfileEvidence(sql,{id:ID,game:server.game,votesMonth:3});
 assert.equal(result.rank,1);
 assert.equal(result.stats.allVotes,6);
 assert.equal(result.reviewSummary,null);
});
test('client renders only one generic public error and retains SSR listings',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers.js'),'utf8');
 assert.match(source,/count\.hidden=state\.status==='error'/);
 assert.match(source,/keepServerRendered/);
 assert.match(source,/Classement temporairement indisponible/);
 assert.doesNotMatch(source,/Service ou base des serveurs temporairement indisponible \(HTTP 503\)/);
 assert.match(source,/console\.warn\('\[SWAPP SERVEURS\]/);
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers.css'),'utf8');
 assert.match(css,/ss-pro-facts/);
 assert.match(css,/ss-card-stats/);
 assert.match(css,/ss-pro-side-actions\{margin:7px 0 0!important/);
});
