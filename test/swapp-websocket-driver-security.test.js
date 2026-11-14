'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const lock=require('../package-lock.json');
const manifest=require('../package.json');

const safeVersion='0.7.5';
const safeIntegrity='sha512-ZL2+3c7kMBdIRCMz6l8jQMHyGVxj+UL+xVk74Ombiciboca8rHa15L86B19E5oh1pL9Ii/uj54gtsIrZGMo6zA==';

test('CVE-2026-54466: all websocket-driver installations are pinned to 0.7.5',()=>{
 assert.equal(manifest.overrides['websocket-driver'],safeVersion);
 const found=Object.entries(lock.packages).filter(([key])=>
  key==='node_modules/websocket-driver'||key.endsWith('/node_modules/websocket-driver'));
 assert.ok(found.length>0,'websocket-driver absent du verrouillage');
 for(const [name,entry] of found){
  assert.equal(entry.version,safeVersion,name);
  assert.equal(entry.resolved,'https://registry.npmjs.org/websocket-driver/-/websocket-driver-0.7.5.tgz');
  assert.equal(entry.integrity,safeIntegrity);
 }
 assert.equal(lock.packages['node_modules/faye-websocket'].dependencies['websocket-driver'],'>=0.5.1');
});

// Runtime is tested separately in CI with just the patched package installed.
// Do not skip this when SWAPP_WS_SECURITY_TEST=1: a missing package is a failure.
test('CVE-2026-54466: draft75 length header is rejected before it overflows',{
 skip:process.env.SWAPP_WS_SECURITY_TEST!=='1'&&'Runtime test runs with the patched package in CI'
},()=>{
 const packageInfo=require('websocket-driver/package.json');
 assert.equal(packageInfo.version,safeVersion);
 const Draft75=require('websocket-driver/lib/websocket/driver/draft75');
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
 assert.equal(attack._length,16383);

 // A correctly bounded legacy frame stays acceptable.
 const valid=parse([0x80,0x01,0x41]);
 assert.equal(valid.closed,false);
 assert.equal(valid._stage,0);
});
