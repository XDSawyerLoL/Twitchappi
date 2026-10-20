'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {createNativeSocialReadiness}=require('../modules/swapp-social-native-status');
test('a cached missing snapshot can be re-probed immediately after successful bootstrap',async()=>{
 let exists=false,attempts=0;
 const mysql={createConnection:async()=>({
  execute:async()=>{attempts++;return exists?[[{snapshot_bytes:520,snapshot_origin:'fresh-v1'}]]:[[]]},
  end:async()=>{}
 })};
 const probe=createNativeSocialReadiness({mysqlFactory:()=>mysql,
  uri:'mysql://example@127.0.0.1/swapp',now:()=>1234});
 const initial=await probe.probe();
 assert.equal(initial.snapshot_present,false);
 assert.equal(attempts,1);
 exists=true;
 assert.equal((await probe.probe()).snapshot_present,false);
 assert.equal(attempts,1);
 probe.invalidate();
 const current=await probe.probe();
 assert.equal(current.snapshot_present,true);
 assert.equal(current.snapshot_type,'fresh');
 assert.equal(attempts,2);
});
test('server reports startup opt-in and safe bootstrap outcomes without exposing credentials',()=>{
 const s=src('server.js');
 assert.match(s,/fresh_auto_init_requested:process\.env\.SWAPP_SOCIAL_FRESH_AUTO_INIT==='1'/);
 assert.match(s,/fresh_bootstrap_state:socialFreshBootstrapState/);
 assert.match(s,/socialNativeReadiness\.invalidate\(\)/);
 assert.match(s,/fresh_initialization_not_requested/);
 assert.match(s,/fresh_start_approval_missing/);
 assert.match(s,/mysql_connection_unavailable/);
 assert.match(s,/snapshot_mode_mismatch/);
 assert.match(s,/const allowedCodes=new Set/);
 assert.doesNotMatch(s,/fresh_bootstrap_state:\s*error\.message/);
});
