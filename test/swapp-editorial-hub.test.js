'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderTechWatch,readTechItems,HUBS,VALID_PATHS}=require('../modules/swapp-tech-watch-page');
const nav=require('../assets/swapp-navigation');
const radar=require('../data/swapp-game-radar-20261111.json');

test('all five editorial destinations resolve to real news pages instead of creator channels',()=>{
 const expected=['/gaming','/ai','/robotics','/future','/live-news'];
 assert.deepEqual(HUBS.map(h=>h.href),expected);
 for(const url of ['/tech',...expected,'/technologies']){
  assert.ok(VALID_PATHS.has(url),url);
  const html=renderTechWatch([],{path:url});
  assert.match(html,/SWAPP LIVE NEWS/);
  assert.match(html,/<main class="swapp-hub">/);
  assert.doesNotMatch(html,/HORS LIVE|Tchat Swapp · tech/);
 }
 const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
 const editorial=server.indexOf("app.get(['/tech','/technologies','/gaming'");
 const creator=server.indexOf("app.get(/^\\/([a-zA-Z0-9_][a-zA-Z0-9_-]{1,39})$/");
 assert.ok(editorial>0&&creator>editorial,'editorial paths must precede creator catch-all');
 for(const slug of ['tech','technologies','gaming','ai','robotics','future','live-news']){
  assert.ok(server.includes("'"+slug+"'"),slug+' must be reserved');
 }
});

test('real, source-attributed game radar contains the six requested games with no unverified commercial pricing',()=>{
 assert.equal(radar.items.length,6);
 assert.equal(new Set(radar.items.map(x=>x.id)).size,6);
 for(const g of radar.items){
  assert.match(g.sourceUrl,/^https:\/\//);
  assert.match(g.releaseDate,/^20\d\d-\d\d-\d\d$/);
  assert.ok(g.summary.length>=50,g.game);
  assert.equal(Object.hasOwn(g,'price'),false);
 }
 const html=renderTechWatch([],{path:'/gaming'});
 for(const title of ['Dawn of War IV','Metro 2039','Fable','Persona 4 Revival','Stranger Than Heaven','Dragon Quest Monsters']){
  assert.ok(html.includes(title),title);
 }
 assert.match(html,/Ces fiches de suivi ne sont pas des nouvelles annonces du jour/);
});

test('technology source links remain editorial candidates and cannot inject markup',()=>{
 const html=renderTechWatch([{
  section:'IA',title:'<img src=x onerror=alert(1)>',source_name:'Source',
  source_url:'javascript:alert(1)',source_published_at:'2026-11-11'
 }],{path:'/ai'});
 assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
 assert.doesNotMatch(html,/href="javascript:/);
 assert.match(html,/non encore vérifiée/);
});

test('published cross-topic feed loads only from the CMS; menu is reachable on mobile and desktop',()=>{
 const html=renderTechWatch([],{path:'/live-news'});
 assert.match(html,/swapp-published-feed/);
 assert.match(html,/\/assets\/swapp-editorial-feed.js/);
 const desktop=nav.desktopNavigation('ai');
 const mobile=nav.mobileNavigation('robotics');
 assert.match(desktop,/\/live-news/);
 assert.match(mobile,/\/live-news/);
 assert.match(desktop,/\/tech/);
 assert.match(mobile,/\/tech/);
});

test('empty technology datasource remains a valid readable page',async()=>{
 assert.deepEqual(await readTechItems({}),[]);
 const html=renderTechWatch([],{path:'/robotics',feedError:true});
 assert.match(html,/momentanément indisponible/);
});
