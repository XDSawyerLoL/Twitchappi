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
 assert.match(js,/JSON\.stringify\(\{channel_vignettes:panels,channel_panels:panels\}\)/);
 assert.match(js,/requestAnimationFrame/);
 assert.doesNotMatch(js,/localStorage\.setItem|new WebSocket|GIPHY_API_KEY/);
});
test('gallery save restores the existing SWAPP session and rejects other channel owners',()=>{
 const server=read('server.js');
 const profileRoute=server.slice(server.indexOf("app.post('/api/oryon/profile'"),server.indexOf("function makeOryonStreamKey"));
 assert.match(profileRoute,/restoreOryonSessionFromRememberCookie\(req, res, \{allowUserRecovery:false\}\)/);
 assert.match(profileRoute,/Session SWAPP expirée/);
 assert.doesNotMatch(profileRoute,/Compte Oryon requis/);
 assert.match(profileRoute,/if\(!cur\?\.id\)/);
 const js=read('assets/swapp-channel-mosaic.js');
 assert.match(js,/fetch\('\/api\/oryon\/session'/);
 assert.match(js,/String\(session.local.id\)!==String\(profile\(\)\?\.id\|\|''\)/);
 assert.match(js,/const savedUser=await verifiedPublish\(result,/);
 assert.match(js,/state.channelProfile=savedUser/);
});

test('owner editor exposes sizes, ratios, focal crop, ordering, import, upload and deletion',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 for(const x of ['Composer ma chaîne','Panoramique · 12 colonnes','Original · sans recadrage',
  'Afficher l’image entière','Remplir et recadrer','Position horizontale','Position verticale',
  'Supprimer','Monter','Descendre','Ajouter un visuel','image/jpeg','image/webp','image/png']){
  assert.ok(js.includes(x),x);
 }
 assert.match(js,/selected>=0/);
});
test('HD images are not recompressed when below the existing storage limit',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 assert.match(js,/const maxBytes=1100000/);
 assert.match(js,/if\(file\.size<=maxBytes/);
 assert.match(js,/resolve\(source\);return/);
 assert.match(js,/Math\.min\(longest,3200\)/);
 assert.match(js,/imageSmoothingQuality='high'/);
 assert.match(js,/canvas\.toDataURL\(codec,quality\)/);
 assert.match(js,/\['image\/webp',/);
 assert.match(js,/file\.size<=maxBytes && \/\^data:image/);
 assert.match(js,/verifiedPublish\(result,/);
});
test('owner can diagnose and replace an undersized legacy thumbnail without touching layout',()=>{
 const js=read('assets/swapp-channel-mosaic.js'),css=read('assets/swapp-channel-mosaic.css');
 assert.match(js,/img\.naturalWidth<cssWidth\*pixelRatio\*\.85/);
 assert.match(js,/Image trop petite/);
 assert.match(js,/Résolution faible pour cette taille/);
 assert.match(js,/Importer \/ remplacer par l’image originale \(HD\)/);
 assert.match(js,/size\.addEventListener\('change',\(\)=>\{p\.size=size\.value;showImageQuality\(\)\}\)/);
 assert.match(css,/data-low-resolution="true"/);
 assert.match(css,/swapp-mosaic-quality-note\[data-warning="true"\]/);
 assert.doesNotMatch(css,/transform:scale\(1\.018\)/);
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
 assert.ok(html.includes('/assets/swapp-channel-mosaic.css?v=20261025-preview-grid-v1'));
 assert.ok(html.includes('/assets/swapp-channel-mosaic.js?v=20261025-preview-grid-v1'));
 for(const file of ['assets/swapp-channel-mosaic.css','assets/swapp-channel-mosaic.js'])
  assert.ok(rel.includes("'"+file+"'"));
 assert.ok(rel.includes("'modules/swapp-channel-panels.js'"));
 const js=read('assets/swapp-channel-mosaic.js');
 assert.doesNotMatch(js,/socket\.emit\(|updateLiveUi\(|setMiniLive\(/);
});

test('creator gallery avoids duplicated navigation after channel polish',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 assert.match(js,/querySelectorAll\('button'\)/);
 assert.match(js,/button\.textContent\.trim\(\)==='Galerie'/);
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

test('gallery publish verifies metadata and real stored layouts, not just counts',()=>{
 const {publishedLayoutMatches}=require('../assets/swapp-channel-mosaic');
 const p={...legacy('Affiche'),size:'hero',ratio:'21:9',fit:'cover',style:'overlay',focal_x:28,focal_y:70};
 assert.equal(publishedLayoutMatches([p],[{...p,image_url:'/api/oryon/panel-image/abc'}]),true);
 assert.equal(publishedLayoutMatches([p],[{...p,size:'medium',image_url:'/api/oryon/panel-image/abc'}]),false);
 assert.equal(publishedLayoutMatches([p],[{...p,image_url:'data:image/png;base64,aGVsbG8='}]),false);
 assert.equal(publishedLayoutMatches([p],[]),false);
});
test('composer previews the whole published mosaic before saving',()=>{
 const js=read('assets/swapp-channel-mosaic.js');
 const css=read('assets/swapp-channel-mosaic.css');
 assert.match(js,/swapp-mosaic-editor-live-preview/);
 assert.match(js,/function renderPreview\(\)/);
 assert.match(js,/function refreshPreviewCard\(index\)/);
 assert.match(js,/function updatePreviewFocus\(index\)/);
 assert.match(js,/cardsArea\.append\(card\)/);
 assert.match(js,/renderPreview\(\);/);
 for(const attr of ['size','ratio','fit','style'])assert.match(js,new RegExp("tile\\.dataset\\."+attr));
 assert.match(css,/swapp-mosaic-editor-live-grid/);
 assert.match(css,/swapp-mosaic-preview-tile\[data-size="hero"\]/);
 assert.match(css,/swapp-mosaic-preview-tile\[data-ratio="21:9"\]/);
 assert.match(css,/@media\(max-width:680px\)/);
});
