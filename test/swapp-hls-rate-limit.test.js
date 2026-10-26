'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const start=server.indexOf('function isSwappHlsPlaybackRequest(req){');
const end=server.indexOf('\nconst apiLimiter =',start);
assert.ok(start>=0&&end>start,'HLS rate exemption exists');
const skip=vm.runInNewContext(server.slice(start,end)+'\nisSwappHlsPlaybackRequest');
const route=(method,url)=>({method,originalUrl:url});
test('video manifest and TS GET/HEAD reads never exhaust shared API limit',()=>{
 for(const path of [
  '/api/oryon/local-relay/vnhz/index.m3u8',
  '/api/oryon/local-relay/vnhz/dvr.m3u8',
  '/api/oryon/local-relay/vnhz/seg_123.ts?source=hls'
 ]){
  assert.equal(skip(route('GET',path)),true,path);
  assert.equal(skip(route('HEAD',path)),true,path);
 }
});
test('OBS writes, credentials, traversal, diagnostics and other API endpoints remain protected',()=>{
 for(const [method,url] of [
  ['PUT','/api/swapp/obs-hls/put'],
  ['POST','/api/oryon/local-relay/vnhz/seg_123.ts'],
  ['GET','/api/oryon/local-relay/vnhz/diagnostics'],
  ['GET','/api/oryon/local-relay/vnhz/../admin'],
  ['GET','/api/oryon/local-relay/vnhz/player'],
  ['GET','/api/oryon/local-relay/vnhz/poster.jpg'],
  ['GET','/api/swapp/social'],
  ['GET','/api/oryon/local-relay/vnhz/seg_xyz.ts']
 ])assert.equal(skip(route(method,url)),false,method+' '+url);
});
