'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('HLS.js production dependency and npm lock are pinned to a verified release',()=>{
 const pkg=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.dependencies['hls.js'],'1.6.15');
 assert.equal(lock.packages[''].dependencies['hls.js'],pkg.dependencies['hls.js']);
 assert.deepEqual(lock.packages['node_modules/hls.js'],{
  version:'1.6.15',
  resolved:'https://registry.npmjs.org/hls.js/-/hls.js-1.6.15.tgz',
  integrity:'sha512-E3a5VwgXimGHwpRGV+WxRTKeSp2DW5DI5MWv34ulL3t5UNmyJWCQ1KmLEHbYzcfThfXG8amBL+fCYPneGHC4VA==',
  license:'Apache-2.0'
 });
});

test('SWAPP serves installed HLS.js from the same origin before static assets',()=>{
 const server=read('server.js');
 const endpoint=server.indexOf("app.get('/assets/hls.min.js'");
 const generic=server.indexOf("app.use('/assets', express.static(");
 assert.ok(endpoint>0&&generic>endpoint,'first-party HLS engine must have priority');
 const route=server.slice(endpoint,generic);
 assert.match(route,/SWAPP_HLS_LOCAL_DIST/);
 assert.match(route,/\bres\.type\('application\/javascript'\)\.sendFile/);
 assert.match(route,/\.status\(503\)/,'missing dependency must fail visibly');
 assert.doesNotMatch(route,/https?:\/\/|redirect\(/,'no CDN fallback at runtime');
});

test('OBS HLS relay and SWAPP TV never execute a CDN script in native player',()=>{
 const relay=read('modules/swapp-direct-hls-relay.js');
 const html=read('local-agent/player.html');
 const station=read('assets/swapp-tv-broadcast.js');
 assert.match(relay,/_SWAPP_HLS_SRC__/);
 assert.match(html,/<script src="\/assets\/hls\.min\.js"/);
 assert.doesNotMatch(relay,/cdn\.jsdelivr\.net|unpkg\.com|@latest/);
 assert.doesNotMatch(html,/cdn\.jsdelivr\.net|unpkg\.com|@latest/);
 assert.match(html,/if\(window\.Hls && Hls\.isSupported\(\)\)/);
 assert.match(html,/v\.canPlayType\('application\/vnd\.apple\.mpegurl'\)/);
 assert.match(station,/frame\.src='\/api\/oryon\/local-relay\/'\+encodeURIComponent\(item\.login\)\+'\/player'/);
});

test('both SWAPP public and local playback paths use the pinned HLS runtime',()=>{
 const root=read('server.js');
 const local=read('local-agent/server.js');
 const localPackage=JSON.parse(read('local-agent/package.json'));
 assert.match(root,/node_modules','hls\.js','dist','hls\.min\.js'/);
 assert.match(local,/node_modules','hls\.js','dist','hls\.min\.js'/);
 assert.equal(localPackage.dependencies['hls.js'],'^1.6.15');
});
test('legacy SWAPP local player embeds no live third-party CDN dependency',()=>{
 for(const file of ['main.js','env.quickstart']){
  const code=read(file);
  assert.match(code,/app\.get\('\/assets\/hls\.min\.js'/);
  assert.match(code,/node_modules','hls\.js','dist','hls\.min\.js'/);
  assert.doesNotMatch(code,/cdn\.jsdelivr\.net\/npm\/hls|unpkg\.com\/hls|hls\.js@latest/);
 }
});

test('capacity telemetry is honest about process scope and tracks segment responses',()=>{
 const relay=read('modules/swapp-direct-hls-relay.js');
 const server=read('server.js');
 assert.match(relay,/app\.get\('\/api\/oryon\/local-relay\/capacity'/);
 assert.match(relay,/scope:'single_node_process'/);
 assert.match(relay,/segment_response_bytes_60s/);
 assert.match(relay,/recordSegmentResponse\(bytes\.length\)/);
 assert.match(relay,/verified_live_rooms:active/);
 assert.match(relay,/Math\.max\(0,MAX_ROOMS-rooms\.size\)/);
 assert.doesNotMatch(relay,/https?:\/\/(?:google|aws|amazon)/);
 assert.match(server,/SWAPP_HLS_LOCAL_DIST/);
});
