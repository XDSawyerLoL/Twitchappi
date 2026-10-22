'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizePanel,normalizePanels}=require('../modules/swapp-channel-panels');
const {normalize}=require('../assets/swapp-channel-mosaic');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const legacy=(title='Menu')=>({image_url:'https://swapp.tv/assets/example.jpg',title,description:'À découvrir',link_url:'https://example.org'});
test('five legacy vignettes are preserved and given varied non-destructive defaults',()=>{
 const panels=normalizePanels(Array.from({length:5},(_,i)=>legacy('Visuel '+i)));
 assert.equal(panels.length,5);
 assert.deepEqual(panels.map(p=>p.size),['large','large','medium','medium','medium']);
 assert.ok(panels.every(p=>p.ratio==='auto'&&p.fit==='contain'&&p.focal_x===50));
 assert.ok(panels.every(p=>p.image_url==='https://swapp.tv/assets/example.jpg'));
});
test('stored hero, ratio, crop, text overlay, focal coordinates survive server normalization',()=>{
 const p=normalizePanel({...legacy(),size:'hero',ratio:'21:9',fit:'cover',
   focal_x:22,focal_y:81,style:'overlay'});
 assert.equal(p.size,'hero');assert.equal(p.ratio,'21:9');
 assert.equal(p.fit,'cover');assert.equal(p.focal_x,22);
 assert.equal(p.focal_y,81);assert.equal(p.style,'overlay');
});
test('invalid metadata fails to safe layout while image and text survive',()=>{
 const p=normalizePanel({...legacy(),size:'full-999',ratio:'evil',fit:'zoom',style:'script',focal_x:-34,focal_y:9999});
 assert.equal(p.size,'large');assert.equal(p.ratio,'auto');
 assert.equal(p.fit,'contain');assert.equal(p.style,'image');
 assert.equal(p.focal_x,0);assert.equal(p.focal_y,100);
});
test('maximum eight panels, preserved order, no automatic erasure of images',()=>{
 const all=normalizePanels(Array.from({length:12},(_,i)=>({...legacy(String(i)),size:'small'})));
 assert.equal(all.length,8);
 assert.deepEqual(all.map(p=>p.title),Array.from({length:8},(_,i)=>String(i)));
});
test('browser normalization matches server core layout model',()=>{
 const p={...legacy(),size:'hero',ratio:'3:4',fit:'cover',focal_x:70,focal_y:18,style:'overlay'};
 assert.deepEqual(normalize(p,0),normalizePanel(p,0));
});
test('profile POST persists complete selected presentation and does not erase other fields',()=>{
 const server=read('server.js');
 assert.match(server,/normalizePanels\(incomingPanels\)/);
 assert.match(server,/link_url:sanitizePanelUrl\(panel\.link_url\)/);
 assert.match(server,/if\(supplied\('bio'\)\)/);
 assert.match(server,/if\(supplied\('avatar_url'\)\)/);
 assert.match(server,/if\(supplied\('banner_url'\)\)/);
 assert.match(server,/if\(supplied\('oryon_local_player_url'\)\)|hasOwnProperty\.call\(req\.body,'oryon_local_player_url'\)/);
 assert.match(server,/await writeOryonUsersAndWait\(data\)/);
});
test('panel editor saves against authenticated existing SWAPP route and no new paid API',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 assert.match(js,/fetch\('\/api\/oryon\/profile'/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/JSON\.stringify\(\{channel_vignettes:result,channel_panels:result\}\)/);
 assert.match(js,/requestAnimationFrame/);
 assert.doesNotMatch(js,/localStorage\.setItem|new WebSocket|GIPHY_API_KEY/);
});
test('owner editor exposes sizes, ratios, focal crop, ordering, import, upload and deletion',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 for(const x of ['Composer ma chaîne','Panoramique · 12 colonnes','Original · sans recadrage',
  'Afficher l’image entière','Remplir et recadrer','Position horizontale','Position verticale',
  'Supprimer','Monter','Descendre','Ajouter un visuel','image/jpeg','data:image/jpeg;base64,']){
  assert.ok(js.includes(x),x);
 }
 assert.match(js,/selected>=0/);
});
test('mosaic CSS uses 12-column full-width hierarchy without default giant boxes',()=>{
 const css=read('assets/swapp-channel-mosaic.css');
 for(const size of ['hero','large','medium','small']){
  assert.match(css,new RegExp('data-size="'+size+'"'));
 }
 assert.match(css,/repeat\(12,minmax\(0,1fr\)\)/);
 assert.match(css,/max-width:1900px!important/);
 assert.match(css,/border:0!important;border-radius:0!important;box-shadow:none!important/);
 for(const ratio of ['1:1','4:5','3:4','16:9','21:9','3:2','auto'])
  assert.ok(css.includes('data-ratio="'+ratio+'"'),ratio);
 assert.match(css,/--swapp-page-accent/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/@media\(hover:none\),\(pointer:coarse\)/);
});
test('integration is versioned, releases track files and does not change player or chat',()=>{
 const html=read('index.html'),rel=read('tools/swapp-release.js');
 for(const file of ['assets/swapp-channel-mosaic.css','assets/swapp-channel-mosaic.js']){
  assert.ok(html.includes('/'+file+'?v=20261022-public-v2'));
  assert.ok(rel.includes("'"+file+"'"));
 }
 assert.ok(rel.includes("'modules/swapp-channel-panels.js'"));
 const js=read('assets/swapp-channel-mosaic.js');
 assert.doesNotMatch(js,/socket\.emit\(|updateLiveUi\(|setMiniLive\(/);
});

test('legacy local browser thumbnails remain visible until they are saved to MySQL',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 assert.match(js,/typeof oryonGetChannelVignettes==='function'/);
 assert.match(js,/source=oryonGetChannelVignettes\(p\)/);
 assert.match(js,/source\.filter\(v=>v\?\.image_url\|\|v\?\.image\)/);
});
test('no fictitious news block when live is offline or no articles match the game',()=>{
 const news=read('assets/swapp-live-articles.js');
 assert.match(news,/if\(!channel\.live\?\.is_live\|\|!game\)return/);
 assert.match(news,/if\(!articles\.length\)return/);
 assert.match(news,/placement\.append\(shelf\)/);
 assert.match(read('index.html'),/swapp-live-articles\.js\?v=20261022-no-empty-creator-news-v1/);
});
