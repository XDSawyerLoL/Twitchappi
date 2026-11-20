'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const lock=require('../package-lock.json');
const manifest=require('../package.json');

const safeVersion='0.8.0';
const safeIntegrity='sha512-upjjWCo/1ZysdZ3rMvXXUDk9PmbYne+wSD1t78HAvIvjmR+avda0MsLWhtkn5PW8Ht34EXhhWF6OseWJ8nTGlg==';

test('CVE-2026-54466: all websocket-driver installations are pinned to 0.8.0',()=>{
 assert.equal(manifest.overrides['websocket-driver'],safeVersion);
 const found=Object.entries(lock.packages).filter(([key])=>
  key==='node_modules/websocket-driver'||key.endsWith('/node_modules/websocket-driver'));
 assert.ok(found.length>0,'websocket-driver absent du verrouillage');
 for(const [name,entry] of found){
  assert.equal(entry.version,safeVersion,name);
  assert.equal(entry.resolved,'https://registry.npmjs.org/websocket-driver/-/websocket-driver-0.8.0.tgz');
  assert.equal(entry.integrity,safeIntegrity);
 }
 assert.equal(lock.packages['node_modules/faye-websocket'].dependencies['websocket-driver'],'>=0.5.1');
 assert.equal(manifest.overrides['websocket-extensions'],'0.2.0');
 assert.equal(lock.packages['node_modules/websocket-extensions'].version,'0.2.0');
 assert.equal(lock.packages['node_modules/websocket-extensions'].integrity,
  'sha512-vQaTTgDDgwlrreIJAprknlnvEtZMMxfLqoxyQYnWO8dgcz2qIzQNysCpwOekz8kqLvzrZ0dcaL9hejZ+2AszCA==');
 assert.equal(lock.packages['node_modules/websocket-driver'].dependencies['websocket-extensions'],'>=0.2.0');
});

// Runtime is tested separately in CI with just the patched package installed.
// Do not skip this when SWAPP_WS_SECURITY_TEST=1: a missing package is a failure.
test('CVE-2026-54466: draft75 length header is rejected before it overflows',{
 skip:process.env.SWAPP_WS_SECURITY_TEST!=='1'&&'Runtime test runs with the patched package in CI'
},()=>{
 const packageInfo=require('../node_modules/websocket-driver/package.json');
 assert.equal(packageInfo.version,safeVersion);
 const Draft75=require('../node_modules/websocket-driver/lib/websocket/driver/draft75');
 const parse=bytes=>{
  const driver={
   readyState:1,
   _stage:0,
   _maxLength:256,
   closed:false,
   _parseLeadingByte:Draft75.prototype._parseLeadingByte,
   close(){this.closed=true;this.readyState=3;return true},
   _reader:{
    put(value){this.bytes=value},
    eachByte(callback,scope){
     for(const byte of this.bytes){if(scope.closed)break;callback.call(scope,byte)}
    }
   }
  };
  Draft75.prototype.parse.call(driver,Buffer.from(bytes));
  return driver;
 };
 // 127 is within the limit, but an additional continuation byte
 // expands the declared length far beyond 256. The fixed driver closes.
 const attack=parse([0x80,0xff,0xff,0xff,0x01]);
 assert.equal(attack.closed,true);
 assert.equal(attack.readyState,3);
 // Only the rejection state is contractual; the parser's internal size may change.

 // A correctly bounded legacy frame stays acceptable.
 const valid=parse([0x80,0x01,0x41]);
 assert.equal(valid.closed,false);
 assert.equal(valid._stage,0);
});
