'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('../package.json');
const lock=require('../package-lock.json');

test('GHSA-cppf-2hm6-mrvm: express-rate-limit and ip-address patched in npm lock',()=>{
 assert.equal(manifest.dependencies['express-rate-limit'],'8.7.5');
 const rate=lock.packages['node_modules/express-rate-limit'];
 assert.equal(lock.packages[''].dependencies['express-rate-limit'],'8.7.5');
 assert.equal(rate.version,'8.7.5');
 assert.equal(rate.resolved,'https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.5.tgz');
 assert.equal(rate.integrity,'sha512-wi+v38cx2EqD0JnhE/e74o5tFqKWUOAPFJIgyEiqJ8v2MNpoOAA3kI2hXYOI+YM+HE5yqbdAlVxm2GqOIeYOgA==');
 assert.equal(rate.dependencies['ip-address'],'^10.2.0');
 assert.equal(rate.dependencies.debug,'^4.4.3');
 assert.equal(manifest.overrides['ip-address'],'10.7.3');
 const ips=Object.entries(lock.packages).filter(([path])=>
  path==='node_modules/ip-address'||path.endsWith('/node_modules/ip-address'));
 assert.ok(ips.length>0,'ip-address is required by the rate limiter');
 for(const [name,value] of ips){
  assert.equal(value.version,'10.7.3',name);
  assert.equal(value.integrity,'sha512-A1kdq/tSb5QjvKvAMgIoEvDBIgL7qaqVP/jkvSwYYRZ9iEzvPpopxp2wQfu3SuZRHtpHNxMn8Fs0bS+gf5Xmwg==');
 }
 assert.equal(lock.packages['node_modules/debug'].version,'4.4.3');
});

// Must run after npm ci, not against an unavailable or mocked dependency.
test('express-rate-limit 8.7.5 actually enforces max, emits 429 and passes other routes',{
 skip:process.env.SWAPP_RATE_LIMIT_RUNTIME_TEST!=='1'&&'Requires installed npm runtime'
},async(t)=>{
 const express=require('express');
 const rateLimit=require('express-rate-limit');
 assert.equal(require('express-rate-limit/package.json').version,'8.7.5');
 assert.equal(require('ip-address/package.json').version,'10.7.3');
 assert.equal(typeof rateLimit,'function');
 const app=express();
 const limiter=rateLimit({
  windowMs:60_000,
  max:2,
  standardHeaders:true,
  legacyHeaders:false,
  validate:false, // In this isolated test server, trust-proxy validation is irrelevant.
  keyGenerator:()=> 'test-limiter-client'
 });
 app.get('/limited',limiter,(_req,res)=>res.json({ok:true}));
 app.get('/health',(_req,res)=>res.json({healthy:true}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const results=[];
 for(let i=0;i<3;i++){
  const resp=await fetch(base+'/limited');
  results.push({status:resp.status,body:await resp.text()});
 }
 assert.deepEqual(results.map(x=>x.status),[200,200,429]);
 const open=await fetch(base+'/health');
 assert.equal(open.status,200);
 assert.deepEqual(await open.json(),{healthy:true});
});
