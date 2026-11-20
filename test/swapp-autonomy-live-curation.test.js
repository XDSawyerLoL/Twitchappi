'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {replayTitle} = require('../modules/swapp-discovery-diversity');
const {createLiveCuration} = require('../modules/swapp-autonomy/live-curation');
const live = (login,game,viewer_count=94,extra={}) => ({
  platform:'twitch',login,game_name:game,viewer_count,
  title:'En direct aujourd’hui',type:'live',...extra
});
test('tagged reruns are filtered even with an ordinary title', () => {
  assert.equal(replayTitle(live('axel0nline','Albion Online',94,{tags:['Français','Rediffusion']})),true);
  assert.equal(replayTitle(live('zbb__','ROB RUN',97,{tags:['rediffusion']})),true);
  assert.equal(replayTitle(live('regular','Dofus',96,{tags:['Français']})),false);
});
test('24/7 loops and AFK excluded, genuine 24-hour marathon retained', () => {
  assert.equal(replayTitle(live('sleeping','Game',102,{title:'GTA6 24/7'})),true);
  assert.equal(replayTitle(live('afk','Game',27,{title:'AFK Farming'})),true);
  assert.equal(replayTitle(live('marathon','Game',28,{title:'MARATHON DMZ Jour 4 - REPRISE A 12H'})),false);
});
test('small gaming creators are selected from the signed home list without cloning', () => {
  const items=[
    live('creator_a','Star Citizen',94,{fairProof:'signed-proof'}),
    live('creator_b','Dofus',96),
    live('creator_c','Just Chatting',94),
    live('creator_d',"I'm Only Sleeping",102),
    live('creator_e','Albion Online',94,{tags:['Rediffusion']}),
    live('creator_f','Sea of Thieves',150),
    live('creator_g','Sea of Thieves',19)
  ];
  const result=createLiveCuration({items,nowMs:180000});
  assert.equal(result.eligibleSmallCount,2);
  assert.ok([0,1].includes(result.surpriseIndex));
  assert.equal(items[0].fairProof,'signed-proof');
  assert.equal(result.gamesInSample.length,2);
  assert.equal(result.basis,'home-sample-only');
});
test('candidate exclusions measured before home ranking', () => {
  const raw=[live('rerun','Albion Online',94,{tags:['Rediffusion']}),live('test','Star Citizen',94)];
  const result=createLiveCuration({items:raw.slice(1),candidates:raw,nowMs:180000});
  assert.equal(result.candidateCount,2);
  assert.equal(result.homeCount,1);
  assert.equal(result.excludedReplayCandidates,1);
});
test('Surprise pick is deterministic within a three-minute window', () => {
  const items=['a1','b1','c1','d1'].map((login,i)=>live(login,'Dofus',80+i));
  const a=createLiveCuration({items,nowMs:180000});
  const b=createLiveCuration({items,nowMs:181000});
  assert.equal(a.surpriseIndex,b.surpriseIndex);
  assert.equal(a.refreshWindowSeconds,180);
});
test('does not invent global popularity trends from homepage sample', () => {
  const result=createLiveCuration({items:[
    live('one','Star Citizen',20),live('two','Star Citizen',100),
    live('three','Dofus',50)
  ],nowMs:180000});
  assert.deepEqual(result.gamesInSample[0],{
    game:'Star Citizen',streams:2,viewersInSample:120
  });
  assert.equal(result.gamesInSample[1].streams,1);
  assert.equal('trendPercent' in result,false);
  assert.equal('globalViewers' in result,false);
});
test('invalid snapshots fail closed and an empty verified pool is explicit', () => {
  assert.throws(()=>createLiveCuration({items:null}),/Invalid/);
  assert.throws(()=>createLiveCuration({items:[],nowMs:-100}),/Invalid/);
  const empty=createLiveCuration({items:[live('chatter','Just Chatting',90)]});
  assert.equal(empty.surpriseIndex,null);
  assert.equal(empty.eligibleSmallCount,0);
});

test('actual Home ranking excludes rediffusion tags without changing original pool', () => {
  const {rankHomeLives}=require('../modules/swapp-home-discovery');
  const rows=[
    live('creator_a','Albion Online',94,{tags:['Rediffusion']}),
    live('creator_b','Star Citizen',94,{title:'AFK STREAM 24/7'}),
    live('creator_c','Dofus',96,{title:'En direct avec les viewers'})
  ];
  const ranked=rankHomeLives(rows,{limit:12});
  assert.deepEqual(ranked.map(row=>row.login),['creator_c']);
  assert.equal(rows.length,3);
  assert.equal(rows[0].tags[0],'Rediffusion');
});
test('Surprise pointer remains valid when signed proof is present', () => {
  const items=[
    live('creator_a','Star Citizen',56,{fairProof:'first-signed'}),
    live('creator_b','Dofus',77,{fairProof:'second-signed'})
  ];
  const result=createLiveCuration({items,nowMs:180000});
  assert.equal(typeof items[result.surpriseIndex].fairProof,'string');
  assert.equal(result.homeCount,2);
});
