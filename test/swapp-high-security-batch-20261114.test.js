'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const lock=require('../package-lock.json');
const manifest=require('../package.json');

const required=Object.freeze({
 'node-forge':'1.4.3',
 'body-parser':'1.20.9',
 '@fastify/busboy':'3.2.2',
 '@grpc/grpc-js':'1.14.5',
 'engine.io':'6.6.10',
 'nodemailer':'10.4.1',
 'socket.io-parser':'4.2.7',
 'protobufjs':'7.6.5',
 'form-data':'2.5.6',
 'ws':'8.21.0',
 'uuid':'11.1.1'
});
const present=name=>Object.entries(lock.packages)
 .filter(([p])=>p==='node_modules/'+name||p.endsWith('/node_modules/'+name));

test('all 11 vulnerable npm packages and nested copies are patched',()=>{
 assert.equal(manifest.dependencies['body-parser'],'1.20.9');
 assert.equal(manifest.dependencies.nodemailer,'10.4.1');
 assert.equal(manifest.overrides['body-parser'],'$body-parser');
 for(const [name,version] of Object.entries(required)){
  const matches=present(name);
  assert.ok(matches.length>0,'missing '+name);
  for(const [path,entry] of matches){
   assert.equal(entry.version,version,path);
   assert.match(entry.integrity,/^sha512-[A-Za-z0-9+/]+=*$/,path+' integrity');
   assert.match(entry.resolved,/^https:\/\/registry\.npmjs\.org\//,path+' registry');
  }
 }
 for(const [name,version] of Object.entries(required)){
  if(name==='body-parser'||name==='nodemailer')continue;
  assert.equal(manifest.overrides[name],version,'forced dependency: '+name);
 }
 assert.equal(manifest.overrides['proxy-addr'],'2.0.8');
 assert.equal(manifest.overrides['websocket-driver'],'0.8.0');
});

test('patched subdependency ranges remain coherent for Express, body-parser and protobufjs',()=>{
 assert.equal(lock.packages[''].dependencies['body-parser'],'1.20.9');
 assert.equal(lock.packages[''].dependencies.nodemailer,'10.4.1');
 assert.equal(lock.packages['node_modules/express'].dependencies['body-parser'],'~1.20.3');
 assert.equal(lock.packages['node_modules/express/node_modules/qs'].version,'6.16.1');
 assert.equal(lock.packages['node_modules/body-parser'].dependencies.qs,'~6.16.0');
 assert.equal(lock.packages['node_modules/qs'].version,'6.16.1');
 assert.equal(lock.packages['node_modules/side-channel'].version,'1.1.1');
 assert.equal(lock.packages['node_modules/hasown'].version,'2.0.4');
 assert.equal(lock.packages['node_modules/@protobufjs/fetch'].dependencies['@protobufjs/inquire'],'^1.1.0');
 assert.equal(lock.packages['node_modules/@protobufjs/inquire'].version,'1.1.2');
 assert.equal(lock.packages['node_modules/engine.io'].dependencies.ws,'~8.21.0');
});

test('patched packages load in a real Node runtime', {
 skip:process.env.SWAPP_DEPENDENCY_RUNTIME_TEST!=='1'&&'Full npm ci is run in GitHub Actions'
},()=>{
 for(const [name,version] of Object.entries(required)){
  const matches=present(name);
  for(const [lockPath] of matches){
   // require.resolve package manifests from each installed scope
   const installed=require('../'+lockPath+'/package.json');
   assert.equal(installed.version,version,lockPath);
  }
 }
 assert.equal(typeof require('nodemailer').createTransport,'function');
 const mailer=require('nodemailer').createTransport({streamTransport:true,buffer:true});
 assert.equal(typeof mailer.sendMail,'function');
 assert.equal(typeof require('body-parser').json,'function');
 assert.equal(typeof require('@grpc/grpc-js').Server,'function');
 assert.equal(typeof require('protobufjs').parse,'function');
 assert.equal(typeof require('socket.io-parser').Encoder,'function');
 assert.equal(typeof require('engine.io').Server,'function');
 assert.equal(typeof require('ws').WebSocketServer,'function');
 assert.equal(typeof require('@google-cloud/storage').Storage,'function');
 const uuid=require('../node_modules/@google-cloud/storage/node_modules/uuid');
 assert.match(uuid.v4(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
