'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServerAdRequestStore}=require('../modules/swapp-server-ad-requests-store');
const request={planId:'server_visibility',serverId:'server-1',slot:'server_discovery',contactEmail:'owner@example.org'};
function setup(){
 const calls=[];
 const store=createServerAdRequestStore({uri:'mysql://test',clock:()=>123,mysqlFactory:{createPool:()=>({
  query:async(sql)=>{calls.push(['schema',sql]);return[]},
  execute:async(sql,params)=>{calls.push(['query',sql,params]);return[[]]}
 })}});
 return {store,calls};
}
test('only verified owner can create a pending unpaid application',async()=>{
 const {store,calls}=setup();
 await assert.rejects(store.create({ownerId:'owner-1',request,ownsServer:async()=>false}),/ownership_required/);
 assert.equal(calls.length,0);
 const created=await store.create({ownerId:'owner-1',request:{...request,amountCents:1,status:'active',paymentVerified:true},ownsServer:async()=>true});
 assert.equal(created.amountCents,3990);
 assert.equal(created.status,'pending_review');
 assert.equal(created.paymentVerified,false);
 assert.equal(calls[1][2][9],'pending_review');
 assert.equal(calls[1][2][10],0);
});
test('ownership check is mandatory and own records are scoped',async()=>{
 const {store,calls}=setup();
 await assert.rejects(store.create({ownerId:'owner-1',request}),/ownership_check_required/);
 await store.listMine('owner-1');
 assert.deepEqual(calls[1][2],['owner-1']);
});
