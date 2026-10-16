'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {secretLike,getTracked,createPackage}=require('../tools/swapp-hostinger-package');
test('release packaging rejects committed secrets and untracked inputs are not archived',()=>{
 assert.equal(secretLike('.env'),true);
 assert.equal(secretLike('private/.env.production'),true);
 assert.equal(secretLike('config/service-account.json'),true);
 assert.equal(secretLike('private/id_rsa.key'),true);
 assert.equal(secretLike('.env.example'),false);
 assert.equal(secretLike('migrations/mysql/001_news_pilot.sql'),false);
 const mandatory=['app.js','server.js','package.json','package-lock.json','index.html',
  'modules/swapp-hubs.js','tools/swapp-release.js','assets/swapp-social-native/social-body.html'];
 assert.throws(()=>getTracked(()=>mandatory.concat('.env').join('\n')),/secrets/);
 assert.deepEqual(getTracked(()=>mandatory.join('\n')),mandatory);
});
test('release package is generated outside repo and never uploads or modifies production',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-zip-'));
 const output=path.join(dir,'release.zip');
 let archived=0;
 const mandatory=['app.js','server.js','package.json','package-lock.json','index.html',
  'modules/swapp-hubs.js','tools/swapp-release.js','assets/swapp-social-native/social-body.html'];
 const run=(_bin,args)=>{
  if(args[0]==='ls-tree')return mandatory.join('\n');
  if(args[0]==='status')return '';
  if(args[0]==='rev-parse')return 'abc123def456\n';
  if(args[0]==='archive'){
   archived++;
   const target=args.find(s=>s.startsWith('--output=')).slice('--output='.length);
   fs.writeFileSync(target,Buffer.alloc(1200,1));
   return '';
  }
  throw Error('Unexpected command: '+args[0]);
 };
 try{
  const result=createPackage({destination:output,run});
  assert.equal(result.revision,'abc123def456');
  assert.equal(result.networkCalls,0);
  assert.equal(result.uploaded,false);
  assert.equal(result.liveUnchanged,true);
  assert.equal(archived,1);
  assert.equal(fs.existsSync(output),true);
  assert.throws(()=>createPackage({destination:output,run}),/already exists/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('release package refuses dirty tracked code',()=>{
 const mandatory=['app.js','server.js','package.json','package-lock.json','index.html',
  'modules/swapp-hubs.js','tools/swapp-release.js','assets/swapp-social-native/social-body.html'];
 const run=(_bin,args)=>{
  if(args[0]==='ls-tree')return mandatory.join('\n');
  if(args[0]==='status')return ' M server.js\n';
  throw Error('Unexpected operation');
 };
 assert.throws(()=>createPackage({run}),/uncommitted/);
});
