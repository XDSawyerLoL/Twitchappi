'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const src=read('assets/swapp-editorial-color.js');
function run(saved){
 const vars=new Map(),classes=new Set(),events={},storage=new Map();
 if(saved!==undefined)storage.set('oryon_viewer_accent',saved);
 const root={style:{setProperty:(name,value)=>vars.set(name,value)},
  classList:{add:name=>classes.add(name)}};
 const window={addEventListener:(name,handler)=>{events[name]=handler}};
 const localStorage={getItem:key=>storage.get(key)||null,setItem:()=>{throw Error('Unexpected write')}};
 new Function('document','window','localStorage',src)({
  documentElement:root},window,localStorage);
 return {vars,classes,events,storage};
}
test('native article restores the exact SWAPP homepage user accent without changing the brand',()=>{
 const app=run('#fb923c');
 assert.equal(app.vars.get('--swapp-side-light'),'#fb923c');
 assert.equal(app.vars.get('--swapp-light-accent'),'#fb923c');
 assert.equal(app.vars.get('--swapp-page-accent'),'#fb923c');
 assert.ok(app.classes.has('swapp-editorial-theme'));
 assert.equal(app.vars.has('--brand'),false);
});
test('invalid stored color is rejected and a safe default applied',()=>{
 for(const value of [undefined,'url(javascript:evil)', '#f00', '#f3f3f3;--brand:red','not-a-color']){
  assert.equal(run(value).vars.get('--swapp-side-light'),'#22d3ee');
 }
});
test('updates from any SWAPP tab propagate on storage event and bfcache restore',()=>{
 const app=run('#a78bfa');
 app.storage.set('oryon_viewer_accent','#60a5fa');
 app.events.storage({key:'oryon_viewer_accent'});
 assert.equal(app.vars.get('--swapp-side-light'),'#60a5fa');
 assert.equal(app.vars.get('--swapp-page-accent'),'#60a5fa');
 app.storage.set('oryon_viewer_accent','#22d3ee');
 app.events.pageshow({});
 assert.equal(app.vars.get('--swapp-side-light'),'#22d3ee');
});
test('native layout loads color before the body and article CSS does not tint actual player',()=>{
 const html=read('modules/swapp-news/site-shell.js');
 const css=read('assets/swapp-article-immersive.css');
 assert.match(html,/swapp-editorial-color\.js\?v=20261022-global-color-v1/);
 assert.match(html,/swapp-article-immersive\.css\?v=20261021-compact-reading-v1/);
 assert.ok(html.indexOf('swapp-editorial-color.js?v=20261022-global-color-v1')<html.indexOf('</head><body'));
 assert.match(css,/html\.swapp-editorial-theme body\.swapp-editorial-route \.article-wrap/);
 assert.match(css,/color-mix\(in srgb,var\(--swapp-side-light,#22d3ee\) 26%,transparent\)/);
 assert.doesNotMatch(src,/setItem\(/);
});
