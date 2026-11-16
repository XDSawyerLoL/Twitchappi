'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('server.js');
function enabled(name,env){
 const found=source.match(new RegExp('const '+name+' = ([^;]+);'));
 assert.ok(found,name+' missing');
 return new Function('process','FIRESTORE_RUNTIME_ENABLED','return '+found[1])({env},false);
}
test('Firebase app cannot initialize even when stale secrets are supplied',()=>{
 assert.match(source,/const FIRESTORE_RUNTIME_ENABLED=false;/);
 assert.match(source,/if \(FIRESTORE_RUNTIME_ENABLED && admin\)/);
 assert.match(source,/if\(!FIRESTORE_RUNTIME_ENABLED \|\| !token\) return null/);
});
test('old ENABLE_CRON/ENABLE_TRACKED_CRON=true are ignored',()=>{
 const env={ENABLE_CRON:'true',ENABLE_TRACKED_CRON:'true'};
 assert.equal(enabled('ENABLE_CRON',env),false);
 assert.equal(enabled('ENABLE_TRACKED_CRON',env),false);
 for(const method of ['upsertChannelMetaFromStream','upsertGameMeta','updateDailyRollupsForStream',
  'collectAnalyticsSnapshot','updateTrackedDailyRollups','collectTrackedSnapshot']){
  const start=source.indexOf('async function '+method+'(');
  assert.ok(start>=0,method);
  assert.match(source.slice(start,start+350),/if\s*\(!FIRESTORE_RUNTIME_ENABLED/,'missing guard '+method);
 }
});
test('retired jobs never emit misleading Firestore startup warnings',()=>{
 assert.match(source,/const ENABLE_CRON = false;/);
 assert.match(source,/const ENABLE_TRACKED_CRON = false;/);
 assert.doesNotMatch(source,/Legacy Firestore analytics CRON flags ignored/);
 assert.doesNotMatch(source,/CRON ENABLED = false/);
 assert.doesNotMatch(source,/TRACKED CRON ENABLED = false/);
 assert.doesNotMatch(source,/Legacy Firestore retired: use Hostinger MySQL/);
});
test('retired tracked and Firebase Steam endpoints fail explicitly, no fake writes',()=>{
 const regexp=/app\.(?:get|post)\('\/api\/tracked_channels\/(?:add|disable|list)'[^\n]*\n\s*if\(!FIRESTORE_RUNTIME_ENABLED\)return res\.status\(410\)/g;
 assert.equal((source.match(regexp)||[]).length,3);
 assert.match(source,/firebase_steam_link_retired/);
});
test('news backend cannot fall back to Firestore',()=>{
 assert.match(source,/const newsMysqlUrl=process\.env\.SWAPP_NEWS_MYSQL_URL\|\|process\.env\.SWAPP_MYSQL_URL\|\|process\.env\.SWAPP_ACCOUNT_MYSQL_URL\|\|''/);
 assert.match(source,/const newsUseMysql=!!newsMysqlUrl/);
 assert.match(source,/const newsStorage=newsUseMysql[\s\S]{1,145}:null;/);
 assert.match(source,/if \(newsUseMysql\) \{/);
 assert.match(source,/Obsolete Firestore setting ignored/);
});
test('production backup import requires operational MySQL, not Firebase',()=>{
 assert.match(source,/if\(IS_PROD && \(!SWAPP_MYSQL_ACCOUNTS \|\| !swappMysqlAccountsReady\)\)/);
 assert.match(source,/mysql_accounts_required_for_import_in_production/);
 assert.doesNotMatch(source,/firestore_required_for_import_in_production/);
});
test('smoke gate verifies actual runtime has no Firestore and correct MySQL',()=>{
 const smoke=read('tools/swapp-deploy-smoke.js');
 for(const token of ['/api/swapp/storage-runtime','storage.firestoreRuntime===false',
  'storage.firebaseAppInitialized===false','storage.legacySnapshotCron===false',
  'storage.legacyTrackedCron===false','storage.accountsReady===true',
  "storage.newsBackend==='mysql'"]){
  assert.ok(smoke.includes(token),token);
 }
 assert.match(source,/app\.get\('\/api\/swapp\/storage-runtime'/);
});
test('wizard removes Firebase setup and sample env selects MySQL',()=>{
 const wizard=read('setup-wizard.js'),env=read('.env.example');
 assert.match(wizard,/SWAPP_ACCOUNT_STORE:'mysql'/);
 assert.match(wizard,/SWAPP_NEWS_BACKEND:'mysql'/);
 assert.doesNotMatch(wizard,/keepFirebase|values\.FIREBASE_SERVICE_KEY_BASE64/);
 assert.match(env,/SWAPP_NEWS_BACKEND=mysql/);
 assert.match(env,/ENABLE_CRON=false/);
 assert.match(env,/ENABLE_TRACKED_CRON=false/);
 assert.doesNotMatch(env,/^FIREBASE_SERVICE_KEY=/m);
});
