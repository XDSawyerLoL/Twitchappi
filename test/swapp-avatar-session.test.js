'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const server=read('server.js');

function sessionHelpers(){
 const a=server.indexOf('function swappSessionAvatarUrl(user){');
 const b=server.indexOf('function normalizeOryonEmail(',a);
 assert.ok(a>0&&b>a,'avatar session helper is present');
 const sandbox={
  module:{exports:{}},
  normalizeOryonLogin:s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,''),
  encodeURIComponent
 };
 vm.runInNewContext(server.slice(a,b)+'\nmodule.exports={swappSessionAvatarUrl,sessionOryonUser}',sandbox);
 return sandbox.module.exports;
}
test('avatar session URL remains valid for an image larger than 200k Base64 characters',()=>{
 const {sessionOryonUser}=sessionHelpers();
 const image='data:image/jpeg;base64,'+'A'.repeat(276000);
 const user=sessionOryonUser({id:'abc',login:'vnhz',avatar_url:image});
 assert.equal(user.avatar_url,'/api/oryon/avatar/vnhz');
 assert.ok(user.avatar_url.length<64);
 assert.equal(user.login,'vnhz');
});
test('external avatar URLs and missing avatar stay compatible',()=>{
 const {swappSessionAvatarUrl}=sessionHelpers();
 assert.equal(swappSessionAvatarUrl({login:'vnhz',avatar_url:'https://images.example.org/avatar.webp'}),
  'https://images.example.org/avatar.webp');
 assert.equal(swappSessionAvatarUrl({login:'vnhz',avatar_url:''}),'');
 assert.equal(swappSessionAvatarUrl({login:'vnhz',avatar_url:'data:text/html;base64,AA=='}),'');
});
test('rebuild current login header avatar from saved owner, including old truncated sessions',()=>{
 const start=server.indexOf('function getSessionIdentity(req){');
 const end=server.indexOf('// WebRTC infra config.',start);
 const identity=server.slice(start,end);
 assert.match(identity,/const persisted=\(readOryonUsers\(\)\.users\|\|\[\]\)\.find/);
 assert.match(identity,/String\(u\.id\)===String\(lu\?\.id\)/);
 assert.match(identity,/local\.avatar_url=persisted\?swappSessionAvatarUrl\(persisted\):swappSessionAvatarUrl\(lu\)/);
});
test('read-only avatar image endpoint validates type and signature',()=>{
 const start=server.indexOf("app.get('/api/oryon/avatar/:login'");
 const end=server.indexOf('// Public images exist only',start);
 assert.ok(start>0&&end>start,'public avatar endpoint declared');
 const route=server.slice(start,end);
 assert.match(route,/ORYON_USERS_READY/);
 assert.match(route,/readOryonUsers\(\)/);
 assert.match(route,/data:image\\\/\(jpeg\|png\|webp\)/);
 assert.match(route,/Buffer\.from\(match\[2\],'base64'\)/);
 assert.match(route,/if\(!jpeg&&!png&&!webp\)/);
 assert.match(route,/res\.send\(bytes\)/);
 assert.match(route,/X-Content-Type-Options/);
 assert.doesNotMatch(route,/req\.session\?\.oryonUser\s*=/);
});
test('shared editorial account UI accepts relative image endpoints',()=>{
 const js=read('assets/swapp-nav-session.js');
 assert.match(js,/new URL\(src,location\.origin\)/);
 assert.match(js,/u\.origin===location\.origin/);
 assert.match(js,/avatar\.addEventListener\('error'/);
});
