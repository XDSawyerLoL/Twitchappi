'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('AdSense seller declaration matches the canonical repository ads.txt',()=>{
 const ads=read('ads.txt');
 assert.equal(ads,'google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0\n');
 const server=read('server.js');
 assert.match(server,/app\.get\('\/ads\.txt'/);
 const marker="const SWAPP_ADS_TXT=";
 const start=server.indexOf(marker),end=server.indexOf("\n});",start);
 assert.ok(start>=0&&end>start);
 assert.ok(server.slice(start,end+4).includes('SWAPP_ADS_TXT'));
 const registrations=[];
 const app={get:(name,callback)=>registrations.push({name,callback})};
 vm.runInNewContext(server.slice(start,end+4),{app});
 assert.equal(registrations.length,1);
 assert.equal(registrations[0].name,'/ads.txt');
 const response={statusCode:null,headers:{},body:null,
  set(key,value){this.headers[key]=value;return this},
  status(code){this.statusCode=code;return this},
  type(value){this.headers['Content-Type']=value;return this},
  send(value){this.body=value;return this}
 };
 registrations[0].callback({},response);
 assert.equal(response.statusCode,200);
 assert.equal(response.body,ads);
 assert.match(response.headers['Content-Type'],/text\/plain/);
 assert.equal(response.headers['X-Content-Type-Options'],'nosniff');
});

test('SOCIAL uses one sticky navigation container, not independent fixed bars',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css');
 const html=read('assets/swapp-social-native/social-body.html');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(css,/SOCIAL sticky stack v2/);
 assert.match(css,/\.swapp-social-viewport \.swapp-social-sticky-stack\{\s*display:block!important;\s*position:sticky!important/);
 assert.match(css,/\.swapp-social-viewport \.pulse-mobile-nav\{\s*position:relative!important/);
 assert.match(css,/\.swapp-social-viewport \.pulse-tabs\{\s*position:relative!important/);
 assert.match(css,/overflow:visible!important; \/\* overflow-x:auto creates a second scroll root \*\//);
 assert.match(css,/--social-site-top:68px/);
 assert.equal((html.match(/class="swapp-social-sticky-stack"/g)||[]).length,1);
 assert.equal((html.match(/id="feed-tabs"/g)||[]).length,1);
 assert.equal((html.match(/class="swapp-social-mobile-spacer"/g)||[]).length,0);
 const stackStart=html.indexOf('class="swapp-social-sticky-stack"');
 const stackClose=html.indexOf('</div>\n\n      <section class="pulse-welcome"',stackStart);
 assert.ok(stackStart>0&&stackClose>stackStart);
 for(const token of ['class="pulse-topbar"','class="pulse-mobile-nav"','id="feed-tabs"']){
  const pos=html.indexOf(token);assert.ok(pos>stackStart&&pos<stackClose,token);
 }
 assert.match(hubs,/social-swapp\.css\?v=20261016-social-sticky-stack-6/);
});

test('SOCIAL mobile Explore has a genuine search form and a submit handler',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css');
 const views=read('assets/swapp-social-native/views.js');
 const app=read('assets/swapp-social-native/app.js');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(views,/id="social-mobile-search-form"/);
 assert.match(views,/id="social-mobile-query"/);
 assert.match(views,/name="query"/);
 assert.match(app,/event\.target\.id==='social-mobile-search-form'/);
 assert.match(app,/await loadExplore\(query\)/);
 assert.match(css,/\.swapp-social-viewport \.pulse-mobile-search\{\s*display:grid!important/);
 assert.match(hubs,/app\.js\?v=20261016-social-search-7/);
});

test('stable CSS remains structurally balanced',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css').replace(/\/\*[\s\S]*?\*\//g,'');
 let depth=0;
 for(const char of css){
  if(char==='{')depth++;
  else if(char==='}')depth--;
  assert.ok(depth>=0,'unmatched CSS close');
 }
 assert.equal(depth,0,'unmatched CSS open');
});
