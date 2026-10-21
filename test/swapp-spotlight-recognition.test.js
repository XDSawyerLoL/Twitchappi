'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MIN_FEATURE_VIEWERS,qualifiesForSpotlight,creatorSpotlightMessage,createSpotlightNotices,DDL}
 =require('../modules/swapp-spotlight-notices');

test('20 concurrent viewers, correct game and Twitch verification are required',()=>{
 assert.equal(MIN_FEATURE_VIEWERS,20);
 for(const count of [0,1,19]){
  assert.equal(qualifiesForSpotlight({state:'live_verified',viewers:count}),false);
 }
 assert.equal(qualifiesForSpotlight({state:'wrong_game',viewers:999}),false);
 assert.equal(qualifiesForSpotlight({state:'offline',viewers:999}),false);
 assert.equal(qualifiesForSpotlight({state:'verification_unavailable',viewers:999}),false);
 assert.equal(qualifiesForSpotlight({state:'live_verified',viewers:20}),true);
});

test('creator recognition is factual, private and does not invent analytics',()=>{
 const m=creatorSpotlightMessage('The Witcher 3','teststreamer');
 assert.match(m.title,/SWAPP/);
 assert.match(m.body,/sélectionné/);
 assert.doesNotMatch(m.body,/\d+ vues|nouveaux abonnés|spectateurs gagnés/);
 assert.equal(m.url,'/live/twitch/teststreamer');
 assert.match(DDL,/reservation_id.*PRIMARY KEY/);
 assert.match(DDL,/user_id/);
});
test('one MySQL notice per Spotlight slot, read for owner only',async()=>{
 const queries=[],pool={
  async query(sql){queries.push({kind:'ddl',sql})},
  async execute(sql,args){
   queries.push({kind:'execute',sql,args});
   return sql.includes('SELECT twitch_login,game_name')?
    [[{twitch_login:'linkedcreator',game_name:'Elden Ring',recorded_at:'2026-10-21T10:00:00Z'}]]:
    [{affectedRows:1}];
  }
 };
 const service=createSpotlightNotices({getPool:()=>pool});
 assert.equal(await service.record({id:8},{state:'live_verified',viewers:19}),false);
 assert.equal(queries.length,0);
 assert.equal(await service.record({id:8},{state:'live_verified',viewers:20}),true);
 assert.equal(queries.filter(x=>x.kind==='ddl').length,1);
 assert.match(queries[1].sql,/INSERT IGNORE/);
 const notices=await service.mine('creator_123');
 assert.equal(notices.length,1);
 assert.equal(queries.at(-1).args[0],'creator_123');
 assert.equal(notices[0].url,'/live/twitch/linkedcreator');
 assert.equal(await service.mine('wrong user'),[]);
});
