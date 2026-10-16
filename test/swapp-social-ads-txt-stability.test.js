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

test('SOCIAL fixes its primary icon bar and reserves a feed spacer',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css');
 const html=read('assets/swapp-social-native/social-body.html');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(css,/SOCIAL navigation stability — fixed primary controls/);
 assert.match(css,/\.swapp-social-viewport \.pulse-mobile-nav\{\s*position:fixed!important/);
 assert.match(css,/\.swapp-social-viewport \.swapp-social-mobile-spacer\{\s*display:block/);
 assert.match(css,/top:calc\(var\(--social-site-header-height\) \+ var\(--social-local-header-height\)\)/);
 assert.match(css,/\.swapp-social-viewport \.pulse-tabs\{\s*position:sticky!important/);
 assert.ok(html.indexOf('class="swapp-social-mobile-spacer"')>html.indexOf('class="pulse-mobile-nav"'));
 assert.ok(html.indexOf('class="swapp-social-mobile-spacer"')<html.indexOf('class="pulse-welcome"'));
 assert.match(hubs,/social-swapp\.css\?v=20261016-stable-nav-5/);
});

test('SOCIAL icon bar stays independent of global SWAPP bottom navigation',()=>{
 const css=read('assets/swapp-social-native/social-swapp.css');
 assert.match(css,/\.swapp-social-viewport \.pulse-main\{\s*isolation:isolate/);
 assert.match(css,/--social-site-header-height:68px/);
 assert.match(css,/--social-local-header-height:60px/);
 assert.match(css,/--social-iconbar-height:55px/);
 const html=read('assets/swapp-social-native/social-body.html');
 assert.equal((html.match(/class="swapp-social-mobile-spacer"/g)||[]).length,1);
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
