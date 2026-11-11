'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('SWAPP FLASH instantly renders a reviewed source snapshot when API is unavailable',()=>{
 const client=read('assets/swapp-actus-app.js');
 const match=client.match(/const SWAPP_FLASH_FALLBACK = (\{[^\n]+\});/);
 assert.ok(match,'browser bundle needs self-contained editorial snapshot');
 const seed=JSON.parse(match[1]);
 const catalog=JSON.parse(read('data/swapp-editorial-signals.json'));
 assert.equal(seed.editorial.length,catalog.items.length);
 assert.deepEqual(new Set(seed.editorial.map(x=>x.id)),new Set(catalog.items.map(x=>x.id)));
 for(const item of seed.editorial){
  assert.equal(item.verification,'source_primaire_consultee');
  assert.match(item.imageUrl,/^https:\/\//);
  assert.match(item.sourceUrl,/^https:\/\//);
  assert.ok(item.caveat.length>20);
 }
 assert.match(client,/let flashData=SWAPP_FLASH_FALLBACK;/);
 assert.match(client,/refreshSignalSection\(\);\s*fetchJson\('\/api\/actus\/signaux'\)/);
 assert.doesNotMatch(client,/Brèves indisponibles/);
 assert.match(client,/archivées au/);
});
test('API keeps reviewed signals available during MySQL source watcher errors',()=>{
 const server=read('server.js');
 assert.match(server,/const reviewed=editorialSignals\(\);/);
 assert.match(server,/try\{watch=await watchCandidates/);
 assert.match(server,/buildSignalResponse\(reviewed,watch\)/);
});
test('Metro 2039 article has reliable primary sources, official video and GAMING tag',()=>{
 const manifest=JSON.parse(read('data/swapp-editorial-releases.json'));
 const file='swapp-veille-native-20261111-metro-2039-dossier.json';
 assert.equal(manifest.releases.filter(x=>x===file).length,1);
 const batch=JSON.parse(read('data/'+file));
 assert.equal(batch.kind,'swapp-editorial-release');
 assert.equal(batch.articles.length,1);
 const a=batch.articles[0];
 assert.equal(a.game,'Metro 2039');
 assert.ok(a.tags.includes('GAMING'));
 assert.match(a.trailerUrl,/^https:\/\/www\.youtube\.com\/watch\?v=cglLxmNfk7Q$/);
 assert.ok(a.body.split(/\s+/).length>1000);
 assert.equal(a.sources.length,5);
 assert.ok(a.sources.some(x=>x.url.includes('playstation.com/2026/09/03/')));
 assert.ok(a.sources.some(x=>x.url.includes('press.plaion.com/fr/')));
 assert.equal(a.publishedAt,'2026-11-11T11:45:00.000Z');
});
test('new client version evicts stale cached error state',()=>{
 const html=read('index.html');
 assert.match(html,/swapp-actus-app\.js\?v=20261111-flash-fallback-metro-v4/);
});
