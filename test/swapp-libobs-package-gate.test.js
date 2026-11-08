'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('OBS Studio 33 uses actual native core module loader and canonical portable runtime',()=>{
 const native=read('local-agent/libobs-host/main.cpp');
 const ps=read('local-agent/libobs-host/build-and-stage-windows.ps1');
 assert.match(native,/obs_load_core_modules\(\)/);
 assert.match(native,/fs::current_path\(exe\)/);
 assert.doesNotMatch(native,/^\s*obs_load_all_modules\(\);/m);
 assert.match(ps,/Join-Path \$obs 'core'/);
 assert.match(ps,/Join-Path \$work 'bin\\64bit'/);
 for(const module of ['win-capture','win-wasapi','win-dshow','obs-outputs','obs-x264','obs-ffmpeg','rtmp-services']){
  assert.ok(ps.includes("'"+module+"'"),'Missing required OBS module '+module);
 }
 assert.match(ps,/Copy-Item -LiteralPath \$core -Destination \(Join-Path \$work 'core'\) -Recurse -Force/);
 assert.match(ps,/Move-Item -LiteralPath \$work -Destination \$stage/);
});

test('Windows installer build tests capture, checks tunnel binary and preserves local option',()=>{
 const batch=read('local-agent/BUILD-WINDOWS.bat');
 const helper=read('local-agent/scripts/ensure-cloudflared-windows.ps1');
 assert.match(batch,/node --test .*swapp-libobs-bridge\.test\.js/);
 assert.match(batch,/npm run dist:win/);
 assert.match(helper,/Get-FileHash -LiteralPath \$p -Algorithm SHA256/);
 assert.match(helper,/github\.com\/cloudflare\/cloudflared\/releases/);
});

test('no public release without explicit opt-in and staged native GPL runtime',()=>{
 const workflow=read('.github/workflows/swapp-live-windows.yml');
 const pkg=JSON.parse(read('local-agent/package.json'));
 assert.match(workflow,/publish_release:/);
 assert.match(workflow,/default: false/);
 assert.match(workflow,/if: \$\{\{ inputs\.publish_release == true \}\}/);
 assert.match(workflow,/GPL-2\.0-LICENSE\.txt/);
 assert.ok(pkg.build.extraResources.some(x=>x.to==='swapp-libobs'));
});
