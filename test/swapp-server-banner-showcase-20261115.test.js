'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register}=require('../modules/swapp-servers');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const ID='a'.repeat(32);
const row={id:ID,name:'La Citadelle RP',slug:'citadelle-rp-abcdef',game:'Rust',
 description:'Une communauté de survie francophone, active et organisée.',
 banner_url:'',brandBannerUrl:'https://example.org/citadelle-banner.jpg',
 logoUrl:'https://example.org/citadelle-logo.jpg'};
function category(data){
 const handlers={};
 const db={
  execute:async sql=>{
   if(sql.startsWith('SELECT s.id,s.name,s.slug,s.game,s.description'))return [[data]];
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE game='))return [[{n:1}]];
   throw Error('Unexpected SQL '+sql);
  }
 };
 const app={get:(url,...callbacks)=>handlers[url]=callbacks.at(-1),post(){},put(){},delete(){}};
 register(app,{getDatabase:async()=>db,enableAutoReview:false});
 const response={html:'',statusCode:200,set(){return this},type(){return this},
  status(n){this.statusCode=n;return this},send(str){this.html=str;return this}};
 return handlers['/serveurs/:jeu']({params:{jeu:'rust'},session:{}},response).then(()=>response);
}
test('the native category page gives a genuine owner banner full-width cinematic treatment',async()=>{
 const response=await category(row);
 assert.equal(response.statusCode,200);
 assert.match(response.html,/class="ss-card-image ss-category-preview-art ss-server-cover ss-cover-custom"/);
 assert.match(response.html,/src="https:\/\/example.org\/citadelle-banner\.jpg"/);
 assert.match(response.html,/class="ss-cover-title">La Citadelle RP/);
 assert.match(response.html,/alt="Bannière de La Citadelle RP"/);
 assert.match(response.html,/href="\/serveurs\/rust\/citadelle-rp-abcdef#joueurs"/);
 assert.match(response.html,/href="\/serveurs\/rust\/citadelle-rp-abcdef#directs"/);
});
test('no owner banner transparently falls back to genuine matching game artwork',async()=>{
 const response=await category({...row,brandBannerUrl:'',banner_url:''});
 assert.equal(response.statusCode,200);
 assert.match(response.html,/steam\/apps\/252490\/header\.jpg/);
 assert.match(response.html,/alt="Visuel du jeu Rust"/);
 assert.doesNotMatch(response.html,/class="ss-card-image ss-category-preview-art ss-server-cover ss-cover-custom"/);
});
test('client cards prioritize a real banner and keep fallback with accessible identity',()=>{
 const js=read('assets/swapp-servers.js');
 assert.match(js,/const cover=safeArt\(s\.bannerUrl,s\.id,'banner'\)/);
 assert.match(js,/artInto\(art,s\.game,cover,s\.name\)/);
 assert.match(js,/img\.alt=preferred&&ownerName\?'Bannière de '/);
 assert.match(js,/host\.classList\.remove\('ss-cover-custom'\)/);
 assert.match(js,/caption\.append\(make\('h3','ss-cover-title',s\.name\)\)/);
 const css=read('assets/swapp-servers.css');
 assert.match(css,/SERVEUR \+ V19/);
 assert.match(css,/\.ss-directory \.ss-server-card \.ss-card-image\s*\{[\s\S]*?aspect-ratio:2 \/ 1/);
 assert.match(css,/\.ss-directory \.ss-server-card \.ss-card-image>img\s*\{[\s\S]*?object-fit:cover/);
 assert.match(css,/\.ss-directory \.ss-results\s*\{[\s\S]*?repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(css,/\.ss-directory \.ss-server-card \.ss-card-image>img\s*\{[^}]*filter:blur/);
});
