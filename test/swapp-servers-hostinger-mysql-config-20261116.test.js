'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {mysqlConfig}=require('../modules/swapp-servers');
const src=()=>fs.readFileSync(path.join(__dirname,'../modules/swapp-servers.js'),'utf8');

test('directory reuses the Hostinger account MySQL URI when no dedicated/shared URL exists',()=>{
 const configured=mysqlConfig({SWAPP_ACCOUNT_STORE:'mysql',SWAPP_ACCOUNT_MYSQL_URL:'mysql://account-host/example'});
 assert.deepEqual(configured,{url:'mysql://account-host/example',source:'SWAPP_ACCOUNT_MYSQL_URL'});
});
test('explicit server URI takes precedence over shared and account credentials',()=>{
 const config=mysqlConfig({
  SWAPP_SERVERS_MYSQL_URL:'mysql://servers-host/directory',
  SWAPP_MYSQL_URL:'mysql://shared-host/swapp',
  SWAPP_ACCOUNT_MYSQL_URL:'mysql://account-host/accounts'});
 assert.equal(config.source,'SWAPP_SERVERS_MYSQL_URL');
 assert.equal(config.url,'mysql://servers-host/directory');
});
test('shared MySQL URI takes precedence over account-specific MySQL URI',()=>{
 const config=mysqlConfig({SWAPP_MYSQL_URL:'mysql://shared-host/swapp',SWAPP_ACCOUNT_MYSQL_URL:'mysql://accounts-host/swapp'});
 assert.equal(config.source,'SWAPP_MYSQL_URL');
 assert.equal(config.url,'mysql://shared-host/swapp');
});
test('never treat a generic PostgreSQL DATABASE_URL as a MySQL connection',()=>{
 assert.deepEqual(mysqlConfig({DATABASE_URL:'postgresql://host/db'}),{url:'',source:null});
 assert.deepEqual(mysqlConfig({SWAPP_MYSQL_URL:'  ',SWAPP_ACCOUNT_MYSQL_URL:'   '}),{url:'',source:null});
});
test('public reads cannot create a new empty directory in a mismatched database',()=>{
 const code=src();
 const guard=code.slice(code.indexOf('if(readOnly){'),code.indexOf('if(!ready){'));
 assert.match(guard,/SWAPP_SERVERS_SCHEMA_MISSING/);
 assert.doesNotMatch(guard,/CREATE TABLE/);
 assert.match(code,/swapp_servers_schema_missing/);
});
test('scheduled review and sitemap reads cannot initialize unrelated MySQL tables',()=>{
 const code=src();
 assert.match(code,/autoPublishPendingServers\(\{getDatabase:readDatabase\}\)/);
 assert.match(code,/app\.get\('\/sitemap-serveurs\.xml',[\s\S]*?const sql=await readDatabase\(\)/);
 assert.match(code,/app\.get\('\/sitemap-serveurs-:page\.xml',[\s\S]*?const sql=await readDatabase\(\)/);
});
test('the public count and directory listing use one portable, parameterized SQL filter',()=>{
 const code=src();
 assert.match(code,/const DIRECTORY_FILTER_SQL=/);
 assert.match(code,/CONCAT_WS/);
 assert.match(code,/s\.status='published'/);
 assert.ok((code.match(/const filter=DIRECTORY_FILTER_SQL;/g)||[]).length>=2);
 assert.match(code,/const args=\[game,game,q,q\]/);
 assert.match(code,/publicCount=\{status:'ready'/);
});
test('admin diagnostics identify configuration source without exposing credentials',()=>{
 const code=src();
 assert.match(code,/configSource:getDatabase===db\?mysqlConfig\(\)\.source:'injected'/);
 assert.match(code,/tables,publicCount,listing/);
 assert.doesNotMatch(code,/json\(\{[^\n]*mysqlUrl\(\)/);
});

test('directory filter normalizes each searchable column and bound parameter to one MySQL collation',()=>{
 const code=src();
 assert.match(code,/const directoryUtf8 = expression =>/);
 assert.match(code,/CONVERT\\(' \+ expression \+ ' USING utf8mb4\\) COLLATE utf8mb4_unicode_ci/);
 for(const column of ['s.game','s.name','s.description','s.tags'])assert.ok(code.includes("'"+column+"'"),column);
 assert.match(code,/\['s.name','s.description','s.tags','s.game'\]\.map\(directoryUtf8\)/);
 // Four bound parameters still protect both count/listing and diagnostics.
 assert.match(code,/const args=\[game,game,q,q\]/);
 assert.match(code,/\['','','',''\]/);
});
