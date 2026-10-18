'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ensureSocialMysqlSchema}=require('../modules/swapp-social-mysql-schema');
test('SOCIAL bootstraps five interaction tables plus player passports, audio and private game follows',async()=>{
 const queries=[];
 const pool={query:async sql=>{queries.push(sql);return [[],[]]}};
 await ensureSocialMysqlSchema(pool);
 assert.equal(queries.length,28);
 const names=['swapp_social_matches','swapp_social_polls','swapp_social_votes','swapp_social_rooms','swapp_social_room_messages','swapp_social_passports','swapp_social_voice_notes','swapp_social_audio_blocks','swapp_social_game_follows','swapp_social_game_wishlist','swapp_social_reward_accounts','swapp_social_reward_ledger','swapp_social_private_rooms','swapp_social_private_members'];
 names.forEach((name,i)=>{
  assert.match(queries[i],new RegExp('^CREATE TABLE IF NOT EXISTS '+name+'\\b','i'));
  assert.equal(queries[14+i],'SELECT 1 FROM '+name+' LIMIT 0');
 });
});
test('SOCIAL stops on CREATE failure and does not continue with later tables',async()=>{
 let attempts=0;
 const pool={query:async()=>{attempts++;const e=new Error('denied');e.code='ER_TABLEACCESS_DENIED_ERROR';throw e}};
 await assert.rejects(ensureSocialMysqlSchema(pool),/denied/);
 assert.equal(attempts,1);
});
