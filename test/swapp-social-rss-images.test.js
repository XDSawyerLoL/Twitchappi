'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const views=read('assets/swapp-social-native/views.js');
function loadImageResolver(){
 const start=views.indexOf('function safeNewsUrl(value){');
 const end=views.indexOf('\nfunction newsTime(',start);
 assert.ok(start>0&&end>start);
 const code=views.slice(start,end)+'\nsafeNewsMedia';
 return vm.runInNewContext(code,{
  URL,globalThis:{SwappArticleExtras:null},Array,String
 });
}
test('RSS news cards have images even when verified editorial image is null',()=>{
 const resolve=loadImageResolver();
 for(const [title,slug,id] of [
  ['Crimson Desert','crimson-desert-news','k9WnZqkAFis'],
  ['Cyberpunk 2077','cyberpunk-news','RgvsbigEylQ'],
  ['Ordinary Oddness','ordinary-oddness-news','mOMUnP5fAdo']
 ]){
  const article={title,slug,image:null,trailerUrl:'https://www.youtube.com/watch?v='+id};
  assert.equal(resolve(article),'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg');
 }
 assert.match(views,/image:safeNewsMedia\(a\)/);
 assert.match(views,/data-news-image="['"]\+esc\(image\)/);
 assert.match(views,/class="pulse-news-media"/);
});
test('RSS retains a verified cover and never invents pictures for unrelated games',()=>{
 const resolve=loadImageResolver();
 assert.equal(resolve({image:{url:'https://example.org/genuine-cover.jpg'},trailerUrl:'https://www.youtube.com/watch?v=RgvsbigEylQ'}),'https://example.org/genuine-cover.jpg');
 assert.equal(resolve({image:null,trailerUrl:'https://not-youtube.example/watch?v=RgvsbigEylQ'}),'');
 assert.equal(resolve({image:null,trailerUrl:'javascript:alert(1)'}),'');
 assert.equal(resolve({image:null,trailerUrl:''}),'');
});
test('SOCIAL makes Communities the actual MySQL text and voice workspace',()=>{
 const body=read('assets/swapp-social-native/social-body.html');
 const app=read('assets/swapp-social-native/app.js');
 const rooms=read('assets/swapp-social-interactions.js');
 const next=read('assets/swapp-social-next.js');
 assert.match(body,/data-view="rooms"[^>]*>.*?Communautés/);
 assert.match(app,/setView\('rooms','Communautés'\)/);
 assert.match(rooms,/data-open-form="room"/);
 assert.match(rooms,/name="visibility"><option value="private"/);
 assert.match(rooms,/rooms\/personal/);
 assert.match(rooms,/ESPACES PRIVÉS/);
 assert.match(rooms,/SALONS PUBLICS/);
 assert.match(next,/ÉTAPE 1 \/ TON JEU/);
});
test('homepage excludes promotional X/Discord section; SOCIAl keeps its RSS image assets refreshed',()=>{
 const index=read('index.html'),home=read('assets/swapp-home-news.js');
 const hubs=read('modules/swapp-hubs.js'),app=read('assets/swapp-social-native/app.js');
 assert.doesNotMatch(index,/swapp-social-bridge\.js|swapp-social-bridge\.css/);
 assert.doesNotMatch(home,/SwappSocialBridge\?\.mount/);
 assert.match(hubs,/swapp-social-native\/app\.js\?v=20261021-rss-media-community-v2/);
 assert.match(app,/views\.js\?v=20261021-rss-media-community-v2/);
});
