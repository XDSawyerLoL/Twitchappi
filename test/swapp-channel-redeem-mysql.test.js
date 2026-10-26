'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createChannelPointsMysql}=require('../modules/swapp-channel-points-mysql');
function db(){
 const statements=[],balances=new Map([['streamer|alice',300]]),redemptions=new Set();
 const connection={
  beginTransaction:async()=>statements.push('BEGIN'),commit:async()=>statements.push('COMMIT'),
  rollback:async()=>statements.push('ROLLBACK'),release(){},
  execute:async(sql,args)=>{
   statements.push(sql);
   const key=args[0]+'|'+args[1];
   if(sql.includes('FROM swapp_channel_redemptions'))return [[...redemptions].filter(id=>id===key+'|'+args[2]).map(request_id=>({request_id}))];
   if(sql.startsWith('SELECT points FROM swapp_channel_points'))return [[{points:balances.get(key)||0}]];
   if(sql.startsWith('UPDATE swapp_channel_points SET points=')){
    balances.set(args[2]+'|'+args[3],args[0]);return [{affectedRows:1}];
   }
   if(sql.startsWith('INSERT INTO swapp_channel_redemptions')){
    redemptions.add(args[0]+'|'+args[1]+'|'+args[2]);return [{affectedRows:1}];
   }
   throw Error('unexpected '+sql);
  }
 };
 const pool={query:async()=>[[]],getConnection:async()=>connection};
 return {pool,balances,redemptions,statements};
}
test('MySQL redemption debits exactly once, transactionally and with idempotency key',async()=>{
 const fixture=db();
 const sql=createChannelPointsMysql({uri:'mysql://app:pass@localhost/swapp',
  mysqlFactory:{createPool:()=>fixture.pool},now:()=>12345});
 const who={id:'alice',login:'alice',display_name:'Alice'},token='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const first=await sql.spend('streamer',who,'cheer',75,token);
 assert.deepEqual(first,{ok:true,points:225});
 assert.equal(fixture.balances.get('streamer|alice'),225);
 const duplicate=await sql.spend('streamer',who,'cheer',75,token);
 assert.equal(duplicate.reason,'duplicate');
 assert.equal(fixture.balances.get('streamer|alice'),225);
 const insufficient=await sql.spend('streamer',who,'highlight',500,'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
 assert.equal(insufficient.reason,'insufficient');
 assert.equal(fixture.balances.get('streamer|alice'),225);
 assert.equal(fixture.redemptions.size,1);
 assert.equal(fixture.statements.filter(s=>s==='COMMIT').length,1);
});
