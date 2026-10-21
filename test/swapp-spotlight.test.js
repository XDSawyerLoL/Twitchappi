'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createSpotlightStore,validateSlot,validateGame,validateOwner,DDL}=require('../modules/swapp-spotlight');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const NOW=Date.parse('2026-10-20T18:00:00Z');
const person={id:'creator_123',login:'streamer_123',twitch_link:{id:'123456789',login:'streamer_123'}};
const slot='2026-10-22T19:00:00Z';

test('Spotlight only accepts future 30-minute UTC slots and validated game identity',()=>{
 assert.equal(validateSlot(slot,{now:NOW}).startsAt,'2026-10-22 19:00:00');
 assert.equal(validateSlot(slot,{now:NOW}).endsAt,'2026-10-22 19:30:00');
 for(const invalid of ['2026-10-22T19:05:00Z','2026-10-22T19:00:00+02:00','garbage','2026-11-22T19:30']){
   assert.throws(()=>validateSlot(invalid,{now:NOW}));
 }
 assert.throws(()=>validateSlot('2026-10-20T18:30:00Z',{now:NOW}),/slot_outside_booking_window/);
 assert.throws(()=>validateSlot('2027-02-20T19:00:00Z',{now:NOW}),/slot_outside_booking_window/);
 assert.equal(validateGame('The Witcher 3: Wild Hunt').slug,'the-witcher-3-wild-hunt');
 assert.equal(validateOwner(person).twitchId,'123456789');
 assert.throws(()=>validateOwner({...person,twitch_link:null}),/verified_twitch_link_required/);
});
test('schema prevents duplicated game slots and duplicated creator slots',()=>{
 assert.match(DDL,/active_game_slot VARCHAR\(190\) UNIQUE DEFAULT NULL/);
 assert.match(DDL,/active_user_slot VARCHAR\(150\) UNIQUE DEFAULT NULL/);
 assert.match(DDL,/ENGINE=InnoDB/);
 assert.match(DDL,/twitch_game_id/);
});
test('booking writes the real Twitch ID and cannot exceed max scheduled quota',async()=>{
 const seen=[],pool={async query(sql){assert.equal(sql,DDL)},async execute(sql,args){
   seen.push({sql,args});
   return [{affectedRows:1,insertId:42}];
 }};
 const store=createSpotlightStore({getPool:()=>pool,now:()=>NOW});
 const item=await store.reserve({user:person,game:'The Witcher 3: Wild Hunt',start_at:slot,twitchGameId:'12345'});
 assert.equal(item.id,42);
 assert.equal(item.end_at,'2026-10-22T19:30:00.000Z');
 assert.equal(seen.length,1);
 assert.match(seen[0].sql,/COUNT\(\*\).*swapp_creator_spotlight/s);
 assert.deepEqual(seen[0].args.slice(0,4),['creator_123','streamer_123','123456789','streamer_123']);
 assert.equal(seen[0].args.at(-1),3);
 assert.equal(seen[0].args[6],'12345');
});
test('writes reject full creator quota, preserve original login and never fall back to JSON',async()=>{
 const pool={async query(){},async execute(){return [{affectedRows:0}]}};
 const store=createSpotlightStore({getPool:()=>pool,now:()=>NOW});
 await assert.rejects(()=>store.reserve({user:person,game:'Fortnite',start_at:slot,twitchGameId:'33214'}),/spotlight_max_upcoming_reached/);
 const disabled=createSpotlightStore({getPool:()=>null,now:()=>NOW});
 await assert.rejects(()=>disabled.list('Fortnite'),/spotlight_storage_unavailable/);
});
test('cancellation and changes require the same SWAPP account',async()=>{
 const seen=[],pool={async query(){},async execute(sql,args){seen.push({sql,args});
   if(sql.includes('SELECT id,game_slug'))return [[{id:42,game_slug:'fortnite'}]];
   return [{affectedRows:1}];
 }};
 const store=createSpotlightStore({getPool:()=>pool,now:()=>NOW});
 assert.deepEqual(await store.cancel('42',person),{cancelled:true,id:42});
 const r=await store.reschedule('42',person,'2026-10-23T19:30:00Z');
 assert.equal(r.start_at,'2026-10-23T19:30:00.000Z');
 assert.ok(seen.some(x=>x.sql.includes('AND user_id=?')&&x.args.includes('creator_123')));
 assert.ok(seen.some(x=>x.sql.includes("status='cancelled'")));
});
test('Spotlight response strips private Twitch ID and internal SWAPP IDs',async()=>{
 const pool={async query(){},async execute(sql){
   assert.match(sql,/status='reserved'/);
   return [[{id:5,user_id:'private',creator_login:'smallstreamer',twitch_user_id:'999',
    twitch_login:'smallstreamer',game_name:'Fortnite',game_slug:'fortnite',
    twitch_game_id:'33214',start_at:slot,end_at:'2026-10-22T19:30:00Z',status:'reserved'}]];
 }};
 const store=createSpotlightStore({getPool:()=>pool,now:()=>NOW});
 const [item]=await store.list('Fortnite');
 assert.equal(item.creator_login,'smallstreamer');
 assert.ok(!('user_id' in item));
 assert.ok(!('twitch_user_id' in item));
 assert.ok(!('twitch_game_id' in item));
});
test('end-to-end code contract links MySQL routes, articles, games and dashboard',()=>{
 const server=read('server.js'),article=read('modules/swapp-news/native-pages.js');
 const game=read('modules/swapp-game-pages.js'),client=read('assets/swapp-spotlight.js');
 const spa=read('index.html'),ssr=read('modules/swapp-news/site-shell.js');
 for(const method of ["app.get('/api/creator/spotlight'","app.get('/api/creator/spotlight/mine'",
 "app.post('/api/creator/spotlight/reservations'",
 "app.patch('/api/creator/spotlight/reservations/:id'",
 "app.delete('/api/creator/spotlight/reservations/:id'"])assert.ok(server.includes(method));
 assert.match(server,/String\(live\.game_id\)!==String\(booking\.twitch_game_id\)/);
 assert.match(server,/state:'live_verified'/);
 assert.match(server,/SWAPP_SPOTLIGHT_ENABLED/);
 assert.match(article,/data-spotlight-game/);
 assert.match(game,/data-spotlight-game/);
 assert.match(client,/data-spotlight-dashboard/);
 assert.match(client,/live_verified/);
 for(const html of [spa,ssr]){
  assert.match(html,/swapp-spotlight\.css\?v=20261020-spotlight-mvp-1/);
  assert.match(html,/swapp-spotlight\.js\?v=20261021-recognition-v1/);
 }
});
