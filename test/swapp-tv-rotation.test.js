'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {lineup}=require('../assets/swapp-tv-rotation');
test('TV alternates verified current Spotlight with other creators without audience ranking',()=>{
 const now=Date.parse('2026-10-21T19:00:00Z');
 const stream=(login,viewers=0)=>({login,platform:'twitch',game:'Fortnite',game_name:'Fortnite',viewer_count:viewers});
 const slot={twitch_login:'small_creator',start_at:'2026-10-21T18:30:00Z',end_at:'2026-10-21T19:30:00Z',live:{state:'live_verified'}};
 const result=lineup([stream('popular_creator',10000),stream('small_creator',2),stream('third_creator',5)],[slot],now);
 assert.deepEqual(result.map(x=>x.login),['small_creator','popular_creator','third_creator']);
});
test('TV excludes duplicates, invalid channel identities and expired bookings',()=>{
 const now=Date.parse('2026-10-21T19:00:00Z');
 const data=[{login:'one_stream',platform:'twitch',game:'Aion 2',game_name:'Aion 2'},{login:'one_stream',platform:'twitch',game:'Aion 2',game_name:'Aion 2'},{login:'bad login',platform:'twitch',game:'Aion 2',game_name:'Aion 2'},{login:'hades',platform:'twitch',game:'Hades',game_name:'Hades II'}];
 const stale={twitch_login:'one_stream',start_at:'2026-10-21T18:00:00Z',end_at:'2026-10-21T18:30:00Z',live:{state:'live_verified'}};
 const result=lineup(data,[stale],now);
 assert.equal(result.length,1);assert.equal(result[0].spotlight,false);
});
