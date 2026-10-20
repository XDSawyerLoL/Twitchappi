'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PUBLIC_PATHS,CLASSES,SECTIONS,render,registerAion2Routes}=require('../modules/swapp-aion2-guides');
const {sitemapEntries}=require('../modules/swapp-seo');
test('all Aion 2 guide pages are distinct, server-rendered, indexed and linked',()=>{
 assert.equal(CLASSES.length,8);
 assert.equal(SECTIONS.length,7);
 assert.equal(PUBLIC_PATHS.length,16);
 assert.equal(new Set(PUBLIC_PATHS).size,16);
 const canonical=new Set();
 for(const path of PUBLIC_PATHS){
  const html=render(path);
  assert.equal(typeof html,'string',path);
  assert.match(html,/<!doctype html>/i,path);
  assert.match(html,/swapp-aion2-guide\.css/,path);
  assert.match(html,/swapp-aion2-guide\.js/,path);
  assert.ok(html.includes('rel="canonical" href="https://swapp.tv'+path+'"'),path);
  assert.ok(html.includes('Illustration officielle')||html.includes('Art officiel'),path);
  assert.ok(html.includes('SWAPP'),path);
  assert.ok(!canonical.has(path));canonical.add(path);
 }
 const routes=new Set(sitemapEntries([]).map(x=>new URL(x.loc).pathname));
 for(const path of PUBLIC_PATHS) assert.ok(routes.has(path),'Missing sitemap path '+path);
});
test('class-specific pages have substantive PvE, PvP and rotation instructions',()=>{
 for(const item of CLASSES){
  const page=render('/guides/aion-2/classes/'+item.slug);
  assert.ok(page.includes('<h1>'+item.name+'</h1>'),item.slug);
  assert.ok(page.includes('BUILD PVE')&&page.includes('BUILD PVP'),item.slug);
  assert.ok(page.includes('ROTATION DE DÉPART'),item.slug);
 }
});
test('unknown guide slug returns null, not an invented page',()=>{
 for(const path of ['/guides/aion-2/classes/faux','/guides/aion-2/nexistepas','/guides/aion-2/classes/inconnue/bonus'])assert.equal(render(path),null);
});
test('routes register as non-mutating public GET endpoints',()=>{
 const rows=[];
 registerAion2Routes({get(route,handler){rows.push({route,handler})}});
 assert.equal(rows.length,1);
 const response={output:'',status:'',headers:{},set(k,v){this.headers[k]=v;return this},type(v){this.status=v;return this},send(v){this.output=v;return this}};
 const req={path:'/guides/aion-2/classes/clerc'};
 rows[0].handler(req,response,()=>{throw Error('Should have matched');});
 assert.match(response.output,/<h1>Clerc<\/h1>/);
 assert.equal(response.status,'html');
 assert.match(response.headers['Cache-Control'],/max-age/);
});