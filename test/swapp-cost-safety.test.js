'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('SWAPP never initializes paid Google AI from a stored Hostinger secret',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.match(server,/const SWAPP_PAID_AI_ENABLED = false;/);
 assert.match(server,/const GEMINI_API_KEY = SWAPP_PAID_AI_ENABLED \? process\.env\.GEMINI_API_KEY : null;/);
 assert.match(server,/if \(GEMINI_API_KEY\) \{/);
 assert.match(server,/gemini: !!aiClient/);
 assert.match(server,/ai:!!aiClient/);
 assert.match(server,/error: 'paid_ai_disabled'/);
 assert.doesNotMatch(server,/const GEMINI_API_KEY = process\.env\.GEMINI_API_KEY;/);
});

test('No SWAPP workflow is installed in GitHub Actions',()=>{
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/swapp-quality.yml')),false);
 const pkg=require(path.join(root,'package.json'));
 assert.equal(pkg.scripts['release:info'],'node tools/swapp-release.js');
 assert.equal(pkg.scripts['verify:production'],'node tools/swapp-deploy-smoke.js');
});

test('Hostinger-only runbook documents on-demand checks and third party dependencies',()=>{
 const guide=fs.readFileSync(path.join(root,'docs/SWAPP_DEPLOY_RUNBOOK.md'),'utf8');
 assert.match(guide,/npm run check/);
 assert.match(guide,/npm test/);
 assert.match(guide,/npm run verify:production/);
 assert.match(guide,/Aucun GitHub Actions automatique/);
 assert.match(guide,/Render/);
 assert.match(guide,/Google Cloud/);
});
