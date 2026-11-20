'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBindingStore,generateRecoveryCodes,recoveryDigest}=require('../modules/swapp-quantic-account-auth');

test('MySQL recovery rotates a Vault key atomically and consumes recovery codes once',async()=>{
 const account='aaaaaaaaaaaaaaaaaaaaaaaa',old='a'.repeat(64),next='b'.repeat(64);
 const recoveryHash=recoveryDigest(generateRecoveryCodes()[0],'S'.repeat(48));
 let binding=new Map([[account,old]]),codes=new Map(),strict=new Set();
 let tx=null,rollbacks=0,failUpdate=false;
 const conn={
  async beginTransaction(){tx={binding:new Map(binding),codes:new Map(codes),strict:new Set(strict)}},
  async commit(){binding=tx.binding;codes=tx.codes;strict=tx.strict;tx=null},
  async rollback(){rollbacks++;tx=null},
  release(){},
  async execute(sql,params=[]){
   if(sql.startsWith('SELECT key_hash FROM swapp_quantic_account_bindings WHERE user_id=')){
    const key=tx.binding.get(params[0]);return [key?[{key_hash:key}]:[],[]];
   }
   if(sql.startsWith('SELECT code_hash FROM swapp_quantic_recovery_codes WHERE user_id=')){
    const found=[...tx.codes.values()].includes(params[0]);return [found?[{code_hash:'one'}]:[],[]];
   }
   if(sql.startsWith('INSERT INTO swapp_quantic_strict_accounts')){
    tx.strict.add(params[0]);return [{affectedRows:1},[]];
   }
   if(sql.startsWith('DELETE FROM swapp_quantic_recovery_codes WHERE user_id=')){
    for(const [k,id] of tx.codes)if(id===params[0])tx.codes.delete(k);
    return [{affectedRows:1},[]];
   }
   if(sql.startsWith('INSERT INTO swapp_quantic_recovery_codes')){
    if(tx.codes.has(params[0]))throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});
    tx.codes.set(params[0],params[1]);return [{affectedRows:1},[]];
   }
   if(sql.startsWith('SELECT user_id FROM swapp_quantic_recovery_codes WHERE code_hash=')){
    const id=tx.codes.get(params[0]);return [id?[{user_id:id}]:[],[]];
   }
   if(sql.startsWith('UPDATE swapp_quantic_account_bindings SET key_hash=')){
    if(failUpdate)throw Error('mysql_write_failed');
    if([...tx.binding.values()].includes(params[0]))throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});
    if(tx.binding.get(params[1])!==params[2])return [{affectedRows:0},[]];
    tx.binding.set(params[1],params[0]);return [{affectedRows:1},[]];
   }
   throw Error('Unexpected SQL: '+sql);
  }
 };
 const pool={
  query:async()=>[[],[]],getConnection:async()=>conn,
  async execute(sql,params=[]){
   if(sql.startsWith('SELECT key_hash FROM swapp_quantic_account_bindings WHERE user_id=')){
    const key=binding.get(params[0]);return [key?[{key_hash:key}]:[],[]];
   }
   if(sql.startsWith('SELECT code_hash FROM swapp_quantic_recovery_codes WHERE user_id=')){
    const id=[...codes.values()].includes(params[0]);return [id?[{code_hash:'one'}]:[],[]];
   }
   if(sql.startsWith('SELECT user_id FROM swapp_quantic_strict_accounts WHERE user_id=')){
    return [strict.has(params[0])?[{user_id:params[0]}]:[],[]];
   }
   if(sql.includes('JSON_UNQUOTE(JSON_EXTRACT(payload_json')){
    return [[{strict_flag:'false',only_flag:'false'}],[]];
   }
   throw Error('Unexpected pool SQL: '+sql);
  }
 };
 const store=createBindingStore({pool});
 const codes8=Array.from({length:8},(_,i)=>i===0?recoveryHash:i.toString(16).padStart(64,'0'));
 await store.setRecoveryCodes(account,codes8);
 assert.equal(codes.size,8);
 assert.equal(await store.hasRecovery(account),true);
 assert.equal(await store.getKey(account),old);
 assert.equal(await store.isVaultOnly(account),false);
 await store.enableVaultOnly(account);
 assert.equal(await store.isVaultOnly(account),true,'strict policy remains even with stale account JSON');
 failUpdate=true;
 await assert.rejects(store.recoverAccount(next,recoveryHash),/mysql_write_failed/);
 assert.equal(binding.get(account),old,'transaction rollback preserves binding');
 assert.equal(codes.size,8,'recovery code not spent on database failure');
 failUpdate=false;
 assert.equal(await store.recoverAccount(next,recoveryHash),account);
 assert.equal(binding.get(account),next);
 assert.equal(codes.size,0);
 assert.equal(await store.hasRecovery(account),false);
 await assert.rejects(store.recoverAccount('c'.repeat(64),recoveryHash),/quantic_recovery_invalid/);
 assert.equal(binding.get(account),next);
 assert.ok(rollbacks>=2);
});
