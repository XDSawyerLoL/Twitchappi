'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const start=source.indexOf('const IS_PASSENGER_HOSTING = Boolean(');
const end=source.indexOf('const TWITCH_CLIENT_ID',start);
assert.ok(start>=0 && end>start,'server listening config not found');
const declarations=source.slice(start,end);
function config(env){
 return vm.runInNewContext(declarations+'\n({IS_PASSENGER_HOSTING,LISTEN_PORT,PORT})',{process:{env}});
}

test('Hostinger managed mode binds port 3000, not an ephemeral port',()=>{
 const c=config({HOSTINGER_NODEJS:'1'});
 assert.equal(c.IS_PASSENGER_HOSTING,false);
 assert.equal(c.LISTEN_PORT,3000);
 assert.equal(c.PORT,3000);
});
test('production defaults to port 3000 without Hostinger-specific variables',()=>{
 assert.equal(config({NODE_ENV:'production'}).LISTEN_PORT,3000);
});
test('explicit assigned PORT overrides the managed fallback',()=>{
 const c=config({NODE_ENV:'production',PORT:'4871'});
 assert.equal(c.LISTEN_PORT,4871);
 assert.equal(String(c.PORT),'4871');
});
test('legacy Passenger still owns server.listen() when PORT is absent',()=>{
 const c=config({PASSENGER_APP_ENV:'production'});
 assert.equal(c.IS_PASSENGER_HOSTING,true);
 assert.equal(c.LISTEN_PORT,undefined);
});
test('local development remains on port 10000',()=>{
 assert.equal(config({NODE_ENV:'development'}).LISTEN_PORT,10000);
});
