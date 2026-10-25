'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Windows packaging is manual-only to prevent unexpected CI charges',()=>{
 const workflow=read('.github/workflows/swapp-live-windows.yml');
 assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
 assert.doesNotMatch(workflow,/^\s+push:/m);
 assert.doesNotMatch(workflow,/^\s+pull_request:/m);
 assert.doesNotMatch(workflow,/^\s+schedule:/m);
 assert.match(workflow,/runs-on:\s*windows-2025/);
 assert.match(workflow,/npm run dist:win --prefix local-agent/);
});
test('quality gate is also opt-in and does not silently run on production pushes',()=>{
 const quality=read('.github/workflows/swapp-quality.yml');
 assert.match(quality,/^on:\s*\n\s+workflow_dispatch:/m);
 assert.doesNotMatch(quality,/^\s+push:|^\s+pull_request:|^\s+schedule:/m);
});
test('no new paid script hooks inserted in package for release',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.check,'node --check server.js && node --check index_script.js && node --check app.js');
 assert.equal(pkg.scripts.test,'node --test test/*.test.js');
});
