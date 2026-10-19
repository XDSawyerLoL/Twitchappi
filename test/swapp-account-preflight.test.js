'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {accountPersistenceStatus}=require('../modules/swapp-account-durability');
const {inspect,ORIGIN,ROUTES}=require('../tools/swapp-account-preflight');

test('durable account check rejects a configured but locally loaded store',()=>{
 assert.equal(accountPersistenceStatus({firestoreOk:true,persistence:'render-disk-json',userCount:4}).safe,false);
 assert.equal(accountPersistenceStatus({firestoreOk:true,persistence:'firestore:oryon_users:test',userCount:4}).safe,true);
 assert.equal(accountPersistenceStatus({firestoreOk:true,persistence:'firestore:oryon_users:test',userCount:0}).safe,false);
});
test('release gate blocks a misleading safe flag on a local fallback',async()=>{
 const fixtures={
  accounts:{firestore:true,persistence:'render-disk-json',users:4,github_deploy_safe:true},
  release:{complete:true,fingerprint:'a'.repeat(64)},
  mysql:{enabled:true,state:'database_read_ready'},
  social:{features:{personalInviteChannels:true}},
  upstream:{success:true}
 };
 const fetchMock=async url=>{
  const key=Object.keys(ROUTES).find(name=>url===ORIGIN+ROUTES[name]);
  assert.ok(key);
  return {ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(fixtures[key])};
 };
 const result=await inspect(fetchMock);
 assert.deepEqual(result.blockers,['accounts']);
});
