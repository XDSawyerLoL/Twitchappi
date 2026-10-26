'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const client=fs.readFileSync(path.join(__dirname,'..','assets','swapp-obs-direct-dashboard.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','assets','swapp-obs-direct-dashboard.css'),'utf8');
test('legacy rejected HTTP codes cannot be displayed during a healthy live',()=>{
 assert.match(client,/result\.stage==='rejected'&&result\.last_error_code/);
 assert.doesNotMatch(client,/lines\[1\]\+\(result\.last_error_code\?/);
});
test('OBS public readiness fetch is cheap and checks real media metadata',()=>{
 assert.match(client,/\/api\/oryon\/local-relay\//);
 assert.match(client,/\+'\/probe'/);
 assert.match(client,/probe\.playlist_ready===true/);
 assert.match(client,/probe\.segment_ready===true/);
 assert.match(client,/probe\.ts_sync_byte===true/);
 assert.match(client,/probe\.media\?\.video_browser_compatible===true/);
 assert.doesNotMatch(client,/fetch\([^\n]*\.ts/);
});
test('player availability must not be advertised as tested on external devices',()=>{
 assert.match(client,/La lecture réelle sur un autre appareil reste à vérifier/);
 assert.match(client,/Teste malgré tout le son et l’image sur un autre appareil\/réseau/);
 assert.match(client,/audio AAC non identifié/);
 assert.match(css,/swapp-obs-public-readiness\[data-status="warning"\]/);
});
