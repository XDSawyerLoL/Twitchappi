'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {choice,createDirector,MAX_AIR_SECONDS}=require('../modules/swapp-tv-director');
test('director selects oldest eligible creator, not biggest audience',()=>{
 const rows=[{id:2,user_id:'a',twitch_login:'alpha',status:'waiting',joined_at:'2026-10-21T12:00:00Z',viewers:9000},{id:1,user_id:'b',twitch_login:'bravo',status:'waiting',joined_at:'2026-10-21T11:00:00Z',viewers:1}];
 assert.equal(choice(rows).user_id,'b');
 assert.equal(choice(rows,{recentUsers:['b']}).user_id,'a');
 assert.equal(MAX_AIR_SECONDS,600);
});
test('director never promotes a creator when live verification fails',async()=>{
 const log=[];
 const db={beginTransaction:async()=>{},commit:async()=>log.push('commit'),rollback:async()=>log.push('rollback'),release:()=>{},execute:async(sql)=>{
  log.push(sql);
  if(sql.includes('FROM swapp_tv_director WHERE'))return [[{current_queue_id:null,started_at:null}]];
  if(sql.includes("status='completed' AND"))return [[]];
  if(sql.includes("status='waiting' ORDER"))return [[{id:1,user_id:'u',twitch_login:'teststream',game_name:'Fortnite',status:'waiting',joined_at:'2026-10-21T11:00:00Z'}]];
  return [{affectedRows:1}];
 }};
 const pool={query:async()=>{},execute:async()=>{},getConnection:async()=>db};
 const director=createDirector({getPool:()=>pool,verifyLive:async()=>false});
 assert.deepEqual(await director.advance(),{changed:true,on_air:null});
 assert.ok(!log.some(x=>typeof x==='string'&&x.includes("SET status='on_air'")));
 assert.ok(log.includes('commit'));
});
