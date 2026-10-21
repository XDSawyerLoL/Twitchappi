'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ownerOf,createTvQueue,DDL}=require('../modules/swapp-tv-queue');
const user={id:'creator123',login:'creator',twitch_link:{login:'twitchcreator'}};
test('queue requires a valid SWAPP account and linked Twitch identity',()=>{
 assert.equal(ownerOf(user).twitch,'twitchcreator');
 assert.throws(()=>ownerOf({...user,twitch_link:null}),/verified_twitch_link_required/);
 assert.throws(()=>ownerOf({...user,id:''}),/swapp_account_required/);
});
test('queue requires MySQL and rejects invalid games before attempting any insert',async()=>{
 const q=createTvQueue({getPool:()=>null});
 await assert.rejects(q.enter(user,'A'),/invalid_game/);
 await assert.rejects(q.enter(user,'Fortnite'),/tv_storage_unavailable/);
});
test('queue persists unique active membership and only removes the authenticated owner',async()=>{
 const queries=[];const pool={query:async sql=>{queries.push(sql);return [[]]},execute:async(sql,args)=>{queries.push([sql,args]);if(sql.startsWith('INSERT'))return [{insertId:7}];return [{affectedRows:1}]}};
 const q=createTvQueue({getPool:()=>pool});
 assert.deepEqual(await q.enter(user,'Fortnite'),{id:7,status:'waiting'});
 assert.deepEqual(await q.leave(user),{left:true});
 assert.match(DDL,/active_user VARCHAR\(80\) UNIQUE/);
 assert.match(queries.at(-1)[0],/WHERE user_id=\? AND status='waiting'/);
 assert.deepEqual(queries.at(-1)[1],['creator123']);
});
