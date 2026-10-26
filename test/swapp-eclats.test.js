'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEclatsLedger,status,installEclatsStatus}=require('../modules/swapp-eclats');
test('Eclats never masquerade as free channel points or an available purchase',()=>{
 const result=status();
 assert.equal(result.unit,'ECLAT');
 assert.equal(result.purchasable,false);
 assert.equal(result.spendable,false);
 assert.equal(result.available_balance,null);
 assert.match(result.note,/distincts des pts de chaîne/);
 const routes={};installEclatsStatus({app:{get:(path,fn)=>routes[path]=fn}});
 const res={headers:{},set(k,v){this.headers[k]=v;return this},json(value){this.body=value;return this}};
 routes['/api/swapp/eclats/status']({},res);
 assert.equal(res.headers['Cache-Control'],'no-store');
 assert.equal(res.body.purchasable,false);
});
test('Gateway verifier is mandatory; unsigned or unconfirmed events cannot mint credits',async()=>{
 assert.throws(()=>createEclatsLedger({pool:{}}),/verified_gateway_required/);
 const pool={query:async()=>{throw Error('SQL must not run')},getConnection:()=>{throw Error('must not open db')}};
 const ledger=createEclatsLedger({pool,verifyPayment:async()=>({paid:false,currency:'eur'})});
 await assert.rejects(()=>ledger.recordSettledPayment({},''),/payment_not_verified/);
});
test('Only verified final EUR settlement is credited once, atomically and idempotently',async()=>{
 const events=new Set(),wallet=new Map();let commits=0,rollbacks=0;
 const conn={beginTransaction:async()=>{},commit:async()=>{commits++},rollback:async()=>{rollbacks++},release(){},
 execute:async(sql,args)=>{
  if(sql.startsWith('SELECT provider_event_id'))return [[...events].filter(e=>e===args[0]+'|'+args[1]).map(e=>({provider_event_id:e}))];
  if(sql.startsWith('INSERT INTO swapp_eclats_payment_events')){events.add(args[0]+'|'+args[1]);return [{affectedRows:1}]}
  if(sql.startsWith('INSERT INTO swapp_eclats_wallets')){wallet.set(args[0],(wallet.get(args[0])||0)+args[1]);return [{affectedRows:1}]}
  throw Error(sql);
 }};
 const ledger=createEclatsLedger({
  pool:{query:async()=>{},getConnection:async()=>conn},
  verifyPayment:async(payload,signature)=>{
   if(signature!=='trusted-webhook')return {paid:false};
   return {...payload,paid:true,currency:'eur'};
  },now:()=>123
 });
 const proof={provider:'stripe',event_id:'evt_paid_123456',buyer_id:'alice',credit_amount:100};
 await assert.rejects(()=>ledger.recordSettledPayment(proof,'wrong-signature'),/payment_not_verified/);
 const one=await ledger.recordSettledPayment(proof,'trusted-webhook');
 assert.deepEqual(one,{created:true,credited:100,buyer_id:'alice'});
 const again=await ledger.recordSettledPayment(proof,'trusted-webhook');
 assert.equal(again.created,false);assert.equal(again.reason,'duplicate');
 assert.equal(wallet.get('alice'),100);
 assert.equal(commits,1);assert.equal(events.size,1);assert.equal(rollbacks,1);
});
