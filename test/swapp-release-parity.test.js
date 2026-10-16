'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RELEASE_FILES,releaseInfo}=require('../tools/swapp-release');
const {baseUrl}=require('../tools/swapp-deploy-smoke');

test('release fingerprint is deterministic, content-sensitive and non-secret',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-release-'));
 try{
  for(const name of RELEASE_FILES){
   const full=path.join(dir,name);
   fs.mkdirSync(path.dirname(full),{recursive:true});
   fs.writeFileSync(full,'initial: '+name+'\n','utf8');
  }
  const first=releaseInfo(dir,{SWAPP_GIT_SHA:'aabbccddeeff'});
  assert.equal(first.complete,true);
  assert.deepEqual(first.missing,[]);
  assert.equal(first.revision,'aabbccddeeff');
  assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(releaseInfo(dir,{}).fingerprint,first.fingerprint);
  fs.appendFileSync(path.join(dir,'assets/swapp-social-native/social-swapp.css'),'/* change */');
  const changed=releaseInfo(dir,{});
  assert.notEqual(changed.fingerprint,first.fingerprint);
  fs.unlinkSync(path.join(dir,'ads.txt'));
  const incomplete=releaseInfo(dir,{});
  assert.equal(incomplete.complete,false);
  assert.equal(incomplete.fingerprint,null);
  assert.deepEqual(incomplete.missing,['ads.txt']);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('release endpoint is public but explicitly uncached and fails closed',()=>{
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(server,/SWAPP_DEPLOY_RELEASE=require\('\.\/tools\/swapp-release'\)\.releaseInfo\(__dirname\)/);
 assert.match(server,/app\.get\('\/api\/release'/);
 assert.match(server,/SWAPP_DEPLOY_RELEASE\.complete\?200:503/);
 assert.match(server,/res\.set\('Cache-Control','no-store'\)/);
});

test('production verifier rejects unsafe origins and accepts canonical SWAPP',()=>{
 assert.equal(baseUrl('https://swapp.tv'),'https://swapp.tv');
 assert.equal(baseUrl('https://www.swapp.tv'),'https://www.swapp.tv');
 assert.equal(baseUrl('http://localhost:3000'),'http://localhost:3000');
 for(const bad of ['http://swapp.tv','https://malicious.example','https://swapp.tv:8080/hack','https://swapp.tv/?user=1','https://user:pass@swapp.tv']){
  assert.throws(()=>baseUrl(bad));
 }
});

test('release check verifies SOCIAL, ads.txt, home and Actualité separately',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','tools/swapp-deploy-smoke.js'),'utf8');
 for(const route of ['/api/release','/ads.txt','/communaute','/actus','/assets/swapp-social-native/social-swapp.css']){
  assert.ok(src.includes(route),route);
 }
 assert.match(src,/DEPLOYMENT DRIFT/);
 assert.match(src,/expected\.fingerprint/);
});
