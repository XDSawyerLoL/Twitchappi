'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {renderProfile}=require('../modules/swapp-servers-profile');
const {getProfileEvidence}=require('../modules/swapp-servers-stats');
const {detailPage,register}=require('../modules/swapp-servers');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const server={
 id:'a'.repeat(32),slug:'test-cyberpunk-abcdef',game:'Cyberpunk 2077',
 name:'Test RP Night City',description:'Bienvenue dans Night City.\n\nLes choix ont des conséquences.\n<script>bad()</script>',
 region:'France',tags:'RP,Immersion',website:'https://example.com',join_address:'night-city.example:7777',
 banner_url:'',created_at:'2026-11-15T12:00:00Z'
};
function evidenceDb(){
 return {execute:async sql=>{
  if(sql.includes('DATE_FORMAT(voted_at'))return [[{day:'2026-11-15',n:3}]];
  if(sql.includes('DATE_FORMAT(clicked_at'))return [[{day:'2026-11-15',n:2}]];
  if(sql.startsWith('SELECT COUNT(*) AS allClicks'))return [[{allClicks:18,monthClicks:7}]];
  if(sql.includes('AVG(staff)'))return [[{count:1,staff:4,atmosphere:5,availability:4}]];
  if(sql.startsWith('SELECT staff,atmosphere,availability,comment'))return [[{staff:4,atmosphere:5,availability:4,comment:'Bon serveur',createdAt:'2026-11-14T10:00:00Z'}]];
  if(sql.startsWith('SELECT s.id,COUNT(v.id)'))return [[{id:'b'.repeat(32),votes:15},{id:server.id,votes:12}]];
  if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_server_vote_events'))return [[{n:29}]];
  throw Error('Unexpected SQL '+sql);
 }};
}
test('SWAPP profile reproduces the functional structure: cover, actions, sections, reviews and true status',()=>{
 const markup=renderProfile({server,votes:12,rank:2,cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
  stats:{monthClicks:7,allVotes:29,allClicks:18,history:{votes:[{day:'2026-11-15',count:3}],clicks:[{day:'2026-11-15',count:2}]}},
  reviewSummary:{count:1,staff:4,atmosphere:5,availability:4},
  reviews:[{staff:4,atmosphere:5,availability:4,comment:'Bon serveur',createdAt:'2026-11-14T10:00:00Z'}],
  outbound:'https://example.com',gamePath:'/serveurs/cyberpunk-2077'});
 for(const section of ['presentation','caracteristiques','statistiques','avis','voter'])
  assert.match(markup,new RegExp('id="'+section+'"'));
 assert.match(markup,/data-ss-profile-votes>12/);
 assert.match(markup,/data-ss-outbound-id/);
 assert.match(markup,/data-ss-vote-id/);
 assert.match(markup,/id="ss-review-form"/);
 assert.match(markup,/id="ss-profile-chart-data"/);
 assert.match(markup,/N°2 AU CLASSEMENT/);
 assert.match(markup,/Joueurs connectés<\/dt><dd>Non mesuré/);
 assert.match(markup,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
 assert.doesNotMatch(markup,/<script>bad\(\)<\/script>/);
});
test('real persisted evidence drives rank, votes, clicks and approved reviews',async()=>{
 const evidence=await getProfileEvidence(evidenceDb(),{id:server.id,game:server.game,votesMonth:12});
 assert.equal(evidence.rank,2);
 assert.equal(evidence.stats.allVotes,29);
 assert.equal(evidence.stats.monthClicks,7);
 assert.equal(evidence.reviewSummary.count,1);
 assert.equal(evidence.stats.history.votes[0].count,3);
});
test('server route renders the cinematic theme through the same SWAPP shell',()=>{
 const html=detailPage(server,12,{rank:2,stats:{monthClicks:7,allVotes:29,allClicks:18,history:{votes:[],clicks:[]}},
 reviewSummary:{count:0,staff:null,atmosphere:null,availability:null}});
 assert.match(html,/ss-pro-hero/);
 assert.match(html,/ss-pro-aside/);
 assert.match(html,/swapp-servers-detail\.js/);
 assert.match(html,/swapp-servers\.css/);
});
test('reviews and click recording are protected, do not invent activity, and require moderation',()=>{
 const source=read('modules/swapp-servers.js');
 assert.match(source,/CREATE TABLE IF NOT EXISTS swapp_game_server_reviews/);
 assert.match(source,/CREATE TABLE IF NOT EXISTS swapp_game_server_click_events/);
 assert.match(source,/swapp_game_server_reviews.*"pending"/);
 assert.match(read('modules/swapp-servers-stats.js'),/status="published" ORDER BY created_at DESC/);
 const routes=[];
 const app={get:(p,...handlers)=>routes.push('GET '+p),post:(p,...handlers)=>routes.push('POST '+p),put:(p,...handlers)=>routes.push('PUT '+p)};
 register(app,{enableAutoReview:false});
 for(const name of ['POST /api/swapp/serveurs/:id/visit','POST /api/swapp/serveurs/:id/reviews',
  'GET /api/swapp/serveurs/reviews/moderation','POST /api/swapp/serveurs/reviews/:id/moderation'])
  assert.ok(routes.includes(name),name);
 const js=read('assets/swapp-servers-detail.js');
 assert.match(js,/keepalive:true/);
 assert.match(js,/data-ss-period/);
 assert.match(js,/data-ss-outbound-id/);
 const css=read('assets/swapp-servers.css');
 assert.match(css,/SWAPP SERVER PROFILES V6/);
 assert.match(css,/@media\(max-width:570px\)/);
});
