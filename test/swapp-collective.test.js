'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {page}=require('../modules/swapp-collective');
const {createPassageMetrics}=require('../modules/swapp-passage-metrics');
const {choose}=require('../modules/swapp-live-handoff');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('MARATHON is one responsive real-data interface without fake fixtures',()=>{
 const html=page('marathon');
 assert.match(html,/id="swapp-marathon"/);
 assert.match(html,/id="sm-game"/);
 assert.match(html,/id="sm-live"/);
 assert.match(html,/id="sm-program"/);
 assert.match(html,/\/assets\/swapp-marathon\.js/);
 const js=source('assets/swapp-marathon.js');
 assert.match(js,/\/api\/discovery\/game-lives\?game=/);
 assert.match(js,/\/api\/swapp-tv\/native-lineup/);
 assert.match(js,/\/api\/creator\/spotlight\?game=/);
 assert.match(js,/media_verified!==true/);
 assert.match(js,/Créneau réservé/);
 assert.doesNotMatch(js,/Math\.random\(\)|fakeBooking|fakeLive/);
 const css=source('assets/swapp-collective.css');
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed|backdrop-filter/);
});

test('ASCENSION uses only recorded landing, with clear unsupported and login states',()=>{
 const html=page('ascension');
 assert.match(html,/id="swapp-ascension"/);
 for(const id of ['sa-received','sa-sent','sa-creators','sa-refresh','sa-status'])
  assert.ok(html.includes('id="'+id+'"'),id);
 const script=source('assets/swapp-ascension.js');
 assert.match(script,/\/api\/swapp\/passage\/ascension/);
 assert.match(script,/response\.status===401/);
 assert.match(script,/confirmed_destination_page_open/);
 assert.match(html,/ni des spectateurs uniques, ni des abonnements/);
});

test('small creators are prioritised without cross-game leaks or previous creator loops',()=>{
 const streams=[
  {platform:'twitch',login:'hadesbig',game:'Hades',viewer_count:5000},
  {platform:'twitch',login:'hadessmall',game:'Hades',viewer_count:14},
  {platform:'twitch',login:'hades2',game:'Hades II',viewer_count:1}
 ];
 const selected=choose(streams,{game:'Hades',platform:'swapp',login:'origin'});
 assert.equal(selected.login,'hadessmall');
 const excluded=choose(streams,{game:'Hades',platform:'swapp',login:'origin',exclude:['twitch:hadessmall']});
 assert.equal(excluded.login,'hadesbig');
 const noCandidate=choose(streams,{game:'Hades',platform:'swapp',login:'origin',exclude:['twitch:hadessmall','twitch:hadesbig']});
 assert.equal(noCandidate,null);
});

test('proofs of genuinely live sources are required before counting an arrival',async()=>{
 let timestamp=500000;
 const rows=[];
 const pool={
  async query(query){assert.match(query,/CREATE TABLE IF NOT EXISTS swapp_passage_arrivals/);return [[],[]]},
  async execute(query,parameters){
   if(query.startsWith('INSERT IGNORE')){const digest=parameters[0];
    if(rows.some(r=>r[0]===digest))return [{affectedRows:0}];
    rows.push(parameters);return [{affectedRows:1}];
   }
   if(query.startsWith('SELECT COUNT'))return [[{total:rows.length,sources:1}]];
   throw Error('unexpected SQL');
  }
 };
 const service=createPassageMetrics({getPool:()=>pool,secret:'a-really-long-session-secret-for-every-worker-0123456789',now:()=>timestamp});
 const live={platform:'twitch',login:'hadesplayer',game:'Hades',live:true};
 const next={platform:'swapp',login:'swappsmall',game:'Hades'};
 const proof=service.issueLiveProof(live);
 assert.match(proof,/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
 assert.equal(service.verifyLiveProof(proof,live),true);
 assert.equal(service.verifyLiveProof(proof,{...live,game:'Hades II'}),false);
 assert.equal(service.issueLiveProof({...live,live:false}),null);
 const receipt=service.issue(live,next);
 assert.ok(receipt);
 assert.equal((await service.arrive(receipt)).recorded,true);
 assert.equal((await service.arrive(receipt)).recorded,false,'replayed proof cannot count twice');
 assert.equal(rows.length,1);
 const summary=await service.summary({swappLogin:'swappsmall'});
 assert.equal(summary.received,1);
 assert.equal(summary.unique_viewers,false);
 assert.equal(summary.follows_measured,false);
 timestamp+=125000;
 assert.equal((await service.arrive(receipt)).success,false,'expired receipts fail closed');
});

test('a database outage cannot fabricate statistics or prevent live playback',()=>{
 const disabled=createPassageMetrics({getPool:()=>null,secret:'z'.repeat(48)});
 const live={platform:'swapp',login:'vnhz',game:'Hades',live:true};
 const next={platform:'twitch',login:'hadesone',game:'Hades'};
 assert.equal(disabled.enabled(),false);
 assert.equal(disabled.issueLiveProof(live),null);
 assert.equal(disabled.issue(live,next),null);
 const server=source('server.js');
 assert.match(server,/if\(req\.query\.phase==='commit'/);
 assert.match(server,/swappPassageMetrics\.verifyLiveProof/);
 assert.match(server,/app\.post\('\/api\/swapp\/passage\/arrive'/);
 assert.match(server,/app\.get\('\/api\/swapp\/passage\/ascension'/);
 assert.match(server,/SWAPP_LIVE_HANDOFF_DISABLED/);
});

test('TV retains the real player and shows only subtle navigation',()=>{
 const html=require('../modules/swapp-program').page('tv');
 assert.match(html,/href="\/marathon"/);
 assert.match(html,/href="\/ascension"/);
 assert.match(html,/class="stv-collective"/);
 const code=source('assets/swapp-tv-broadcast.js');
 assert.match(code,/function markWatched\(/);
 assert.match(code,/source_proof/);
 assert.match(code,/\/api\/swapp\/passage\/arrive/);
 assert.match(code,/frame\?\.addEventListener\('load'/);
 assert.match(code,/frame\.src='https:\/\/player\.twitch\.tv/);
 assert.match(code,/frame\.src='\/api\/oryon\/local-relay\//);
});
