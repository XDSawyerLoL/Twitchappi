'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeAutoGameSync,generic}=require('../modules/swapp-native-auto-game');
test('Native OBS category is updated without dashboard using linked Twitch metadata',async()=>{
 const room={host:'obs',category:'Gaming',title:'SWAPP test'};
 const user={id:'a',login:'streamer',current_live_category:'Gaming',
  twitch_link:{login:'streamer_tw',id:'123'}};
 let writes=0;
 const packets=[];
 const client=createNativeAutoGameSync({
  schedule:false,
  getUsers:()=>({users:[user]}),
  saveUsers:async()=>{writes++},
  getNativeRoom:()=>room,
  isLocalLive:()=>true,
  io:{to:()=>({emit:(event,data)=>packets.push({event,data})})},
  twitchAPI:async path=>path.startsWith('streams?')?
   {data:[{user_login:'streamer_tw',game_name:'Aion 2'}]}:{data:[]}
 });
 const result=await client.syncOnce();
 assert.equal(result.updated,1);assert.equal(user.current_live_category,'Aion 2');
 assert.equal(room.category,'Aion 2');assert.equal(writes,1);
 assert.equal(packets[0].event,'native:metadata:updated');
 const again=await client.syncOnce();assert.equal(again.updated,0);
 assert.equal(writes,1);
});
test('Never replace an explicit game and never invent a game without Twitch',async()=>{
 const user={id:'b',login:'other',current_live_category:'Cyberpunk 2077',
  twitch_link:{login:'other_tw',id:'222'}};
 const room={host:'obs',category:'Cyberpunk 2077'};
 let calls=0;
 const client=createNativeAutoGameSync({schedule:false,getUsers:()=>({users:[user]}),
  saveUsers:async()=>{throw Error('should not save')},getNativeRoom:()=>room,isLocalLive:()=>true,
  io:{to:()=>({emit(){}})},twitchAPI:async()=>{calls++;return {data:[]}}});
 assert.equal((await client.syncOnce()).updated,0);assert.equal(calls,0);
 assert.equal(user.current_live_category,'Cyberpunk 2077');
 assert.equal(generic('Gaming'),true);assert.equal(generic('Aion 2'),false);
});
test('Do not update when a creator manually edits while Twitch lookup is in progress',async()=>{
 const room={host:'obs',category:''};
 const user={id:'x',login:'channel',current_live_category:'',twitch_link:{login:'tw',id:'33'}};
 let saves=0;
 const client=createNativeAutoGameSync({schedule:false,getUsers:()=>({users:[user]}),
  saveUsers:async()=>{saves++},getNativeRoom:()=>room,isLocalLive:()=>true,
  io:{to:()=>({emit(){}})},
  twitchAPI:async()=>{user.current_live_category='Elden Ring';room.category='Elden Ring';
   return {data:[{user_login:'tw',game_name:'Aion 2'}]}}
 });
 assert.equal((await client.syncOnce()).updated,0);
 assert.equal(saves,0);assert.equal(room.category,'Elden Ring');
});
