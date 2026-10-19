'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMysqlAccountsStore,createMysqlAccountsRecovery,accountRow,validateUri,DDL}=require('../modules/swapp-oryon-mysql-accounts');

function fixture(){
 const rows=new Map(),events=[];
 let tx;
 const conn={
  async beginTransaction(){tx=new Map(rows);events.push('BEGIN')},
  async commit(){events.push('COMMIT');for(const k of rows.keys())rows.delete(k);for(const [k,v] of tx)rows.set(k,v);tx=undefined},
  async rollback(){events.push('ROLLBACK');tx=undefined},
  release(){events.push('RELEASE')},
  async execute(sql,args=[]){
   if(sql.startsWith('SELECT user_id FROM swapp_oryon_accounts LIMIT 1'))
    return [[...tx.keys()].slice(0,1).map(user_id=>({user_id})),[]];
   if(sql.startsWith('SELECT user_id FROM swapp_oryon_accounts WHERE user_id=?'))
    return [tx.has(args[0])?[{user_id:args[0]}]:[],[]];
   if(sql.startsWith('INSERT INTO swapp_oryon_accounts')){
    const [id,login,email,payload]=args;
    if([...tx.values()].some(r=>r.login===login||r.email===email))throw Object.assign(Error('Duplicate'),{code:'ER_DUP_ENTRY'});
    tx.set(id,{login,email,payload_json:payload});return [{affectedRows:1},[]];
   }
   if(sql.startsWith('UPDATE swapp_oryon_accounts')){
    const [login,email,payload,,id]=args;
    if([...tx].some(([key,r])=>key!==id&&(r.login===login||r.email===email)))throw Object.assign(Error('Duplicate'),{code:'ER_DUP_ENTRY'});
    tx.set(id,{login,email,payload_json:payload});return [{affectedRows:1},[]];
   }
   throw Error('Unexpected statement: '+sql);
  }
 };
 const pool={
  async query(sql){assert.equal(sql,DDL);events.push('DDL');return [[],[]]},
  async execute(sql){
   assert.match(sql,/^SELECT payload_json FROM swapp_oryon_accounts/);
   return [[...rows.values()].map(r=>({payload_json:r.payload_json})),[]];
  },
  async getConnection(){return conn}
 };
 return {pool,rows,events};
}
const account=(id,login,email)=>({
 id,login,email,password_hash:'salt:pbkdf2-hash',
 remember_token_hash:'hashed-token',channel_id:id,display_name:login
});

test('MySQL accounts accept existing Hostinger URL format',()=>{
 assert.equal(validateUri('mysql://test:password@db.example.com:3306/swapp').startsWith('mysql://'),true);
 assert.throws(()=>validateUri('postgres://user:pass@example.org/base'));
 assert.throws(()=>validateUri('mysql://user:pass@HOST/swapp'));
});
test('Account rows preserve stable IDs and hashed auth data',()=>{
 const u=account('user_123','alpha','alpha@example.org');
 const row=accountRow(u);
 assert.equal(JSON.parse(row.payload).password_hash,u.password_hash);
 assert.equal(JSON.parse(row.payload).remember_token_hash,u.remember_token_hash);
 assert.throws(()=>accountRow({...u,id:'../../admin'}));
});
test('Register, load, update and refusal to erase accounts are durable',async()=>{
 const f=fixture(),store=createMysqlAccountsStore({pool:f.pool});
 const first=account('user_123','alpha','alpha@example.org');
 await store.save([first]);
 assert.equal(store.ready,true);
 assert.equal((await store.load())[0].id,'user_123');
 const updated={...first,display_name:'New display'};
 await store.save([updated]);
 assert.equal((await store.load())[0].display_name,'New display');
 await assert.rejects(store.save([]),/refuse_empty_overwrite/);
 assert.equal((await store.load()).length,1);
 assert.ok(f.events.includes('ROLLBACK'));
});
test('MySQL unique login/email prevents identity collision and rolls back',async()=>{
 const f=fixture(),store=createMysqlAccountsStore({pool:f.pool});
 const one=account('user_123','alpha','alpha@example.org');
 await store.save([one]);
 await assert.rejects(store.save([one,account('user_456','alpha','beta@example.org')]),/duplicate_identity/);
 await assert.rejects(store.save([one,account('user_456','beta','alpha@example.org')]),/duplicate_identity/);
 assert.equal((await store.load()).length,1);
});
test('MySQL account store never deletes omitted existing accounts',async()=>{
 const f=fixture(),store=createMysqlAccountsStore({pool:f.pool});
 const one=account('user_123','alpha','alpha@example.org');
 const two=account('user_456','beta','beta@example.org');
 await store.save([one,two]);
 await store.save([one]);
 assert.equal((await store.load()).length,2);
});

test('MySQL account readiness retries after a temporary outage without restarting Node',async()=>{
 let ready=false,attempts=0,clock=1000;
 const recovery=createMysqlAccountsRecovery({
  isReady:()=>ready,
  load:async()=>{
   attempts++;
   if(attempts===1)throw Error('temporary_mysql_outage');
   ready=true;
  },
  now:()=>clock,
  retryDelayMs:5000
 });

 assert.equal(await recovery.ensure(),false);
 assert.equal(attempts,1);
 clock+=4999;
 assert.equal(await recovery.ensure(),false);
 assert.equal(attempts,1);
 clock+=1;
 assert.equal(await recovery.ensure(),true);
 assert.equal(attempts,2);
});

test('MySQL account readiness shares one recovery attempt across concurrent requests',async()=>{
 let ready=false,attempts=0,release;
 const pending=new Promise(resolve=>{release=resolve});
 const recovery=createMysqlAccountsRecovery({
  isReady:()=>ready,
  load:async()=>{attempts++;await pending;ready=true}
 });

 const first=recovery.ensure();
 const second=recovery.ensure();
 await Promise.resolve();
 assert.equal(attempts,1);
 release();
 assert.deepEqual(await Promise.all([first,second]),[true,true]);
 assert.equal(attempts,1);
});

test('MySQL account readiness does not query the database while already ready',async()=>{
 let attempts=0;
 const recovery=createMysqlAccountsRecovery({
  isReady:()=>true,
  load:async()=>{attempts++}
 });

 assert.equal(await recovery.ensure(),true);
 assert.equal(attempts,0);
});
