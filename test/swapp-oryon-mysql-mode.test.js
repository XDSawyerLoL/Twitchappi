'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(base,'server.js'),'utf8');
const migration=fs.readFileSync(path.join(base,'migrations/mysql/009_swapp_oryon_accounts.sql'),'utf8');
const {DDL}=require('../modules/swapp-oryon-mysql-accounts');

test('local SWAPP accounts use MySQL when explicitly activated',()=>{
 assert.match(server,/SWAPP_ACCOUNT_STORE/);
 assert.match(server,/SWAPP_MYSQL_ACCOUNTS/);
 assert.match(server,/swappMysqlAccounts\.load\(\)/);
 assert.match(server,/swappMysqlAccounts\.save\(normalized\.users\)/);
 assert.match(server,/__oryonUsersPersistence='mysql:swapp_oryon_accounts'/);
 assert.match(server,/if\(SWAPP_MYSQL_ACCOUNTS\)return \{users:\[\]\}/);
});
test('database account mode fails closed on errors, never falls back to JSON/Firestore',()=>{
 assert.match(server,/swappMysqlAccountsReady=false/);
 assert.match(server,/mysql_accounts_unavailable/);
 assert.match(server,/if\(SWAPP_MYSQL_ACCOUNTS\)return !swappMysqlAccountsReady/);
 assert.match(server,/if\(SWAPP_MYSQL_ACCOUNTS&&!swappMysqlAccountsReady&&req\.path!=='\/persistence-status'\)/);
});
test('account readiness endpoint identifies actual MySQL store, not Firestore configuration',()=>{
 assert.match(server,/store:'mysql',mysql:swappMysqlAccountsReady/);
 assert.match(server,/github_deploy_safe:swappMysqlAccountsReady/);
 assert.match(server,/Cache-Control','no-store'/);
});
test('SQL schema is additive, indexed and consistent with auto bootstrap',()=>{
 const normalized=value=>value.replace(/^--.*$/gm,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
 assert.equal(normalized(migration),normalized(DDL));
 assert.match(migration,/UNIQUE KEY swapp_oryon_login_unique/);
 assert.match(migration,/UNIQUE KEY swapp_oryon_email_unique/);
 assert.doesNotMatch(migration,/\b(?:DROP|DELETE|TRUNCATE|ALTER)\s+/i);
});
