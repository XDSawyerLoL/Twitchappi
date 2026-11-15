'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {page}=require('../modules/swapp-servers');
const {renderExternalDiscovery,CATEGORY_LINKS}=require('../modules/swapp-servers-external-discovery');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('external top-server exploration is attributed and clearly separate from SWAPP voting',()=>{
 const html=page();
 assert.match(html,/id="ss-results"/);
 assert.match(html,/class="ss-partner-discovery ss-inner"/);
 assert.ok(html.indexOf('id="ss-results"')<html.indexOf('ss-partner-discovery'));
 assert.match(html,/Source externe · Top-Serveurs/);
 assert.match(html,/votes, résultats et serveurs externes ne sont pas comptabilisés/);
 assert.match(html,/SWAPP n’est pas affilié à Top-Serveurs/);
});
test('curated category destinations are verified top-serveurs.net URLs',()=>{
 assert.deepEqual(CATEGORY_LINKS.map(x=>x.href),[
  'https://top-serveurs.net/minecraft','https://top-serveurs.net/gta',
  'https://top-serveurs.net/cyberpunk-2077','https://top-serveurs.net/discord',
  'https://top-serveurs.net/rust','https://top-serveurs.net/dayz'
 ]);
 const html=renderExternalDiscovery();
 for(const item of CATEGORY_LINKS){
  assert.ok(html.includes(item.href));
 }
 assert.match(html,/target="_blank" rel="noopener noreferrer nofollow"/);
});
test('genre-specific pages only recommend that same external category',()=>{
 assert.match(page({game:'Minecraft'}),/href="https:\/\/top-serveurs\.net\/minecraft"/);
 assert.doesNotMatch(renderExternalDiscovery('Minecraft'),/top-serveurs\.net\/rust/);
 assert.match(renderExternalDiscovery('GTA RP'),/top-serveurs\.net\/gta/);
 assert.equal(renderExternalDiscovery('Enshrouded'),'');
});
test('no API token, scraped images, external votes or phantom top-server standings',()=>{
 const module=read('modules/swapp-servers-external-discovery.js');
 for(const unexpected of ['fetch(','axios.','http.get(','server_token=','<img ','votes_month:']){
  assert.ok(!module.includes(unexpected),unexpected+' must not exist in external linking');
 }
 const pack=read('tools/swapp-hostinger-package.js');
 assert.match(pack,/modules\/swapp-servers-external-discovery\.js/);
 assert.match(read('assets/swapp-servers.css'),/ss-partner-card/);
});
