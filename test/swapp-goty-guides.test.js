'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PUBLIC_PATHS,GAMES,WEIGHTS,render,registerRoutes,score}=require('../modules/swapp-goty-guides');
const {sitemapEntries}=require('../modules/swapp-seo');
test('the GOTY series contains 9 confirmed winners, 9 selections and 19 distinct routes',()=>{
 assert.equal(GAMES.length,18);
 assert.equal(PUBLIC_PATHS.length,19);
 assert.equal(new Set(PUBLIC_PATHS).size,19);
 for(let year=2017;year<=2025;year++){
  const selection=GAMES.filter(g=>g.year===year);
  assert.equal(selection.length,2,'two games in '+year);
  assert.equal(selection.filter(g=>g.winner).length,1,'one official winner in '+year);
 }
 assert.equal(GAMES.find(g=>g.year===2025&&g.winner).title,'Clair Obscur: Expedition 33');
 assert.equal(GAMES.find(g=>g.year===2019&&g.winner).title,'Sekiro: Shadows Die Twice');
});
test('every game contains a complete transparent five-axis score and actionable starting advice',()=>{
 for(const g of GAMES){
  assert.equal(g.scores.length,WEIGHTS.length,g.slug);
  g.scores.forEach((v,i)=>assert.ok(Number.isInteger(v)&&v>=0&&v<=WEIGHTS[i],g.slug));
  assert.equal(score(g),g.score,g.slug);
  assert.equal(g.start.length,3,g.slug);
  assert.ok(g.analysis.length>150,g.slug);
  assert.ok(g.strengths.length>=2,g.slug);
  assert.ok(g.limits.length>35,g.slug);
 }
});
test('all 19 editorial routes are crawlable, canonically indexed and substantial',()=>{
 const sitemap=new Set(sitemapEntries([]).map(x=>new URL(x.loc).pathname));
 for(const path of PUBLIC_PATHS){
  const html=render(path);
  assert.match(html,/<!doctype html>/i,path);
  assert.ok(html.includes('rel="canonical" href="https://swapp.tv'+path+'"'),path);
  assert.ok(html.includes('application/ld+json'),path);
  assert.ok(html.includes('swapp-goty.css'),path);
  assert.ok(html.includes('<h1>'),path);
  assert.ok(sitemap.has(path),'missing sitemap: '+path);
  assert.ok(html.length>3500,'thin content: '+path);
 }
});
test('editorial labelling does not invent an official runner-up and unknown paths do not render',()=>{
 const hub=render(PUBLIC_PATHS[0]);
 assert.match(hub,/ne décernent pas de deuxième place officielle/);
 assert.match(hub,/challengers marquants/);
 assert.match(hub,/distinctes de Metacritic/);
 assert.equal(render(PUBLIC_PATHS[0]+'/jeu-inexistant'),null);
 assert.equal(render(PUBLIC_PATHS[0]+'/a/b'),null);
});
test('route handler serves public HTML with a cache control and delegates unknown slug',()=>{
 let registered=null;
 registerRoutes({get(path,handler){registered={path,handler}}});
 assert.ok(registered);
 let next=false;
 const res={headers:{},set(k,v){this.headers[k]=v;return this},type(v){this.typeValue=v;return this},send(v){this.output=v;return this}};
 registered.handler({path:PUBLIC_PATHS[1]},res,()=>{next=true});
 assert.equal(next,false);assert.equal(res.typeValue,'html');
 assert.match(res.headers['Cache-Control'],/max-age/);
 assert.match(res.output,/SWAPP SCORE/);
 registered.handler({path:PUBLIC_PATHS[0]+'/nimporte-quoi'},res,()=>{next=true});
 assert.equal(next,true);
});
