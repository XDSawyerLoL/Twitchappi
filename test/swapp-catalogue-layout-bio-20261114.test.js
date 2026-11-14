'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const {catalogueContent,page}=require('../modules/swapp-catalogue-lab');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');

test('real homepage has only the shared footer; lab keeps its legal notes',()=>{
 const home=catalogueContent({publicHome:true});
 const lab=catalogueContent({publicHome:false});
 assert.doesNotMatch(home,/class="scl-footer"|class="scl-legal"/);
 assert.match(lab,/class="scl-footer"/);
 assert.match(lab,/href="\/mentions-legales"/);
 assert.match(read('index.html'),/swapp-footer\.js/);
 assert.match(renderIntoSpa(read('index.html')), /id="scl-articles"/);
 assert.match(page(),/class="scl-footer"/);
});

test('article rail stays below the hero on desktop, tablet and mobile',()=>{
 const css=read('assets/swapp-catalogue-lab.css');
 assert.ok(css.includes('#scl-articles{margin-top:clamp(28px,3vw,52px)'));
 assert.match(css,/#scl-articles \.scl-article-cards\{[\s\S]*?margin:0;[\s\S]*?padding:12px 4% 30px/);
 assert.match(css,/@media\(max-width:950px\)\{#scl-articles \.scl-article-cards/);
 assert.ok(css.includes('#scl-articles{margin-top:28px}'));
 assert.ok(css.includes('#scl-articles{margin-top:22px}'));
 assert.doesNotMatch(css,/#scl-articles\{margin-top:-/);
});

test('creator preview displays only verified public biographies',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/function streamerBioEndpoint\(item\)/);
 assert.match(js,/\/api\/twitch\/channels\//);
 assert.match(js,/\/api\/oryon\/profile\//);
 assert.match(js,/if\(item\.kind==='live'\)void loadStreamerBiography\(item,content\)/);
 assert.match(js,/if\(!biography\)return box\.remove\(\)/);
 assert.match(js,/description\.textContent=biography/);
 assert.match(js,/content\.isConnected/);
 assert.doesNotMatch(js,/innerHTML\s*=\s*biography/);
 assert.match(read('assets/swapp-catalogue-lab.css'),/\.scl-streamer-bio\{/);
});

test('Twitch endpoint validates login, caches responses and excludes sensitive keys',async()=>{
 const source=read('server.js');
 const start=source.indexOf('const SWAPP_STREAMER_BIO_TTL_MS');
 const end=source.indexOf('// Recherche de chaînes Twitch pour la nouvelle page Oryon.',start);
 assert.ok(start>0&&end>start);
 const routes=[],calls=[];
 const app={get(path,middleware,callback){routes.push({path,callback})}};
 const twitchAPI=async q=>{
  calls.push(q);
  return {data:[{id:'123',login:'example',display_name:'Example',
   description:'Jeux et discussions',email:'private@example.com',access_token:'SECRET'}]};
 };
 new Function('app','heavyLimiter','twitchAPI','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET',
  source.slice(start,end))(app,()=>{},twitchAPI,'id','secret');
 const route=routes.find(x=>x.path==='/api/twitch/channels/:login/bio');
 assert.ok(route);
 function response(){
  return {statusCode:200,headers:{},body:null,
   status(code){this.statusCode=code;return this},
   set(k,v){this.headers[k]=v;return this},
   json(obj){this.body=obj;return this}};
 }
 const a=response();await route.callback({params:{login:'example'}},a);
 assert.equal(a.statusCode,200);
 assert.equal(a.body.bio,'Jeux et discussions');
 assert.equal(a.body.display_name,'Example');
 assert.ok(!JSON.stringify(a.body).includes('SECRET'));
 assert.ok(!JSON.stringify(a.body).includes('private@example.com'));
 const cached=response();
 await route.callback({params:{login:'example'}},cached);
 assert.equal(calls.length,1);
 assert.equal(cached.body.bio,a.body.bio);
 const invalid=response();
 await route.callback({params:{login:'<script>'}},invalid);
 assert.equal(invalid.statusCode,400);
 assert.equal(calls.length,1);
});
