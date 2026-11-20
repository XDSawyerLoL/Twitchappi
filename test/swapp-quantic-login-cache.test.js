'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeQuanticLoginCacheVersioner,QUANTIC_LOGIN_ASSETS}=require('../modules/swapp-quantic-login-cache');

const HTML='<html><head><link rel="stylesheet" href="/assets/swapp-quantic-id-site.css?v=old-v3"><script defer src="/assets/swapp-quantic-login-keeper.js?v=old-v3"></script><script defer src="/assets/swapp-quantic-id-site.js?v=old-v3"></script><script src="/assets/unrelated.js?v=unchanged"></script></head></html>';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-qvault-'));
 t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 fs.mkdirSync(path.join(root,'assets'));
 for(const file of QUANTIC_LOGIN_ASSETS)fs.writeFileSync(path.join(root,'assets',file),'first:'+file);
 return {root,version:makeQuanticLoginCacheVersioner({root})};
}
test('Quantic login assets receive same deterministic content-bound revision',t=>{
 const {version}=fixture(t),html=version(HTML);
 const tags=[...html.matchAll(/\?v=qvault-([a-f0-9]{16})/g)];
 assert.equal(tags.length,3);
 assert.equal(new Set(tags.map(x=>x[1])).size,1);
 assert.equal(html,version(HTML));
 assert.match(html,/\/assets\/unrelated\.js\?v=unchanged/);
 assert.doesNotMatch(html,/old-v3/);
});
test('editing one login script invalidates three asset URLs but never changes cookies',t=>{
 const {root,version}=fixture(t);
 const before=version(HTML);
 fs.writeFileSync(path.join(root,'assets','swapp-quantic-id-site.js'),'new version with automatic signup');
 const after=version(HTML);
 assert.notEqual(after,before);
 assert.equal([...after.matchAll(/\?v=qvault-([a-f0-9]{16})/g)].length,3);
});
test('missing login file cannot break rendering while Hostinger syncs',t=>{
 const {root,version}=fixture(t);
 fs.unlinkSync(path.join(root,'assets','swapp-quantic-id-site.css'));
 assert.equal(version(HTML),HTML);
});
test('server disables 30 minute cache for all scripts and styles but preserves media cache',()=>{
 const server=fs.readFileSync(require.resolve('../server.js'),'utf8');
 assert.match(server,/if\(\/\\\.\(\?:js\|css\)\$\/\.test\(staticPath\)\)/);
 assert.match(server,/public,max-age=0,no-cache,must-revalidate/);
 assert.match(server,/swapp-quantic-login-keeper/);
 assert.match(server,/Surrogate-Control/);
 assert.match(server,/refreshQuanticLoginAssetVersions\(fs\.readFileSync\(found/);
 assert.match(server,/app\.get\('\/index_script\.js'/);
 assert.doesNotMatch(server,/public, max-age=1800/);
 assert.match(server,/maxAge: '30m'/); // Media still retains short cache.
});
