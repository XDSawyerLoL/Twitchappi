'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const manifest=require('../package.json');
const lock=require('../package-lock.json');

test('CVE-2026-90711: la dépendance transitive est verrouillée sur 2.0.8',()=>{
 assert.equal(manifest.overrides['proxy-addr'],'2.0.8');
 const installs=Object.entries(lock.packages).filter(([name])=>name==='node_modules/proxy-addr'||name.endsWith('/node_modules/proxy-addr'));
 assert.ok(installs.length>0,'no proxy-addr in package lock');
 for(const [name,record] of installs){
  assert.equal(record.version,'2.0.8',name);
  assert.equal(record.resolved,'https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz',name);
  assert.equal(record.integrity,'sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==',name);
 }
});

test('SWAPP ne passe pas de X-Forwarded-For brut aux journaux IP',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.match(server,/app\.set\('trust proxy', 1\)/);
 assert.match(server,/const ip = String\(req\.ip \|\| req\.socket\?\.remoteAddress \|\| ''\)\.trim\(\)/);
 assert.match(server,/ip: req\?\.ip \|\| req\?\.socket\?\.remoteAddress \|\| ''/);
 assert.doesNotMatch(server,/req\.headers\['x-forwarded-for'\]/);
 assert.doesNotMatch(server,/req\?\.headers\?\.\['x-forwarded-for'\]/);
});

let installed=null;
try{installed=require('proxy-addr')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
test('CVE-2026-90711: un CIDR IPv6 large ne fait pas confiance à toutes les IPv4',
 {skip:!installed&&'Installer les dépendances avec npm ci pour le test de comportement'},()=>{
 const badV4='8.8.8.8';
 assert.equal(require('proxy-addr/package.json').version,'2.0.8');
 assert.equal(installed.compile('::/1')(badV4),false);
 assert.equal(installed.compile('::ffff:10.0.0.0/8')(badV4),false);
 assert.equal(installed.compile('10.0.0.0/8')(badV4),false);
 assert.equal(installed.compile('10.0.0.0/8')('10.4.2.1'),true);
 assert.equal(installed.compile('::ffff:10.0.0.0/104')('10.4.2.1'),true);
});
