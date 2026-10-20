'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareVerified,inspectDestination}=require('../tools/swapp-social-migration-verify');
test('same canonical digest and collection counts pass',()=>{
 const s={sha256:'a'.repeat(64),bytes:435,counts:{users:2,posts:8,messages:3,follows:2}};
 assert.deepEqual(compareVerified(s,s).count_differences,[]);
 assert.equal(compareVerified(s,s).matches,true);
});
test('same counts but changed message body fails by digest',()=>{
 const left={sha256:'a'.repeat(64),bytes:435,counts:{users:2,posts:8,messages:3}};
 const right={...left,sha256:'b'.repeat(64)};
 assert.equal(compareVerified(left,right).matches,false);
});
test('an omitted private message fails by count',()=>{
 const left={sha256:'a'.repeat(64),bytes:435,counts:{users:2,posts:8,messages:3}};
 const right={sha256:'b'.repeat(64),bytes:400,counts:{users:2,posts:8,messages:2}};
 assert.deepEqual(compareVerified(left,right).count_differences,['messages']);
 assert.equal(compareVerified(left,right).matches,false);
});
test('missing destination fails closed and closes the MySQL connection',async()=>{
 let ended=0,queried=0;
 const mysql={createConnection:async()=>({
  execute:async(sql)=>{queried++;assert.match(sql,/SELECT data FROM swapp_social_native_store/);return[[]]},
  end:async()=>{ended++}
 })};
 await assert.rejects(()=>inspectDestination({mysql,uri:'mysql://dummy@localhost/db'}),/destination_snapshot_not_found/);
 assert.equal(ended,1);assert.equal(queried,1);
});
