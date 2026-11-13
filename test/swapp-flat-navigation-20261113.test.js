'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {desktopNavigation,mobileNavigation,serverHeader,serverMobile,items}=require('../assets/swapp-navigation');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');

test('seven main links are direct, with DIRECT for live discovery and separate Jeux et catégories',()=>{
 assert.deepEqual(items.map(({href})=>href),['/','/decouvrir','/categories','/actus','/social','/boutique','/tv']);
 assert.equal(items.find(x=>x.href==='/decouvrir').label,'DIRECT');
 const html=desktopNavigation('discover');
 assert.equal((html.match(/<a /g)||[]).length,7);
 assert.doesNotMatch(html,/<details|<summary|swapp-news-menu|href="\/equipes"/);
 assert.match(html,/href="\/decouvrir"[^>]*aria-current="page"[^>]*>DIRECT<\/a>/);
 assert.match(html,/href="\/categories"[^>]*>Jeux &amp; catégories<\/a>/);
 assert.match(html,/href="\/actus"[^>]*>Actualité<\/a>/);
});
test('mobile keeps four priorities and one Plus; no separate Actualité dropdown',()=>{
 const html=mobileNavigation('categories');
 const pinned=html.slice(0,html.indexOf('<details class="swapp-mobile-more">'));
 assert.equal((pinned.match(/<a /g)||[]).length,4);
 for(const href of ['/','/decouvrir','/categories','/actus'])assert.match(pinned,new RegExp('href="'+href+'"'));
 assert.match(pinned,/aria-label="Jeux &amp; catégories"/);
 assert.match(html,/href="\/tv"/);
 assert.match(html,/href="\/social"/);
 assert.match(html,/href="\/boutique"/);
 assert.match(html,/href="\/on-air"/);
 assert.match(html,/href="\/bandes-annonces"/);
 assert.doesNotMatch(html,/href="\/equipes"|swapp-mobile-menu-title|\/actus\?tag=/);
});
test('server and SPA use the same versioned navigation contract',()=>{
 const home=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 for(const source of [home,native]){
  for(const name of ['swapp-navigation.js','swapp-hub-nav.js','swapp-unified-nav.css'])
   assert.ok(source.includes('/assets/'+name+'?v=20261113-direct-games-flat-nav-v1'),name);
 }
 for(const page of [serverHeader('actus'),serverMobile('actus')]){
  assert.doesNotMatch(page,/href="\/equipes"|swapp-news-more/);
  assert.match(page,/href="\/categories"/);
  assert.match(page,/href="\/decouvrir"/);
 }
 const reconcile=read('assets/swapp-hub-nav.js');
 assert.match(reconcile,/const valid=/);
 assert.match(reconcile,/\/categories/);
 assert.match(reconcile,/const pinned=\['\/','\/decouvrir','\/categories','\/actus'\]/);
});
test('Équipes is temporarily redirected, not erased, and excluded from SEO discovery',()=>{
 const server=read('server.js'),seo=read('modules/swapp-seo.js');
 assert.match(server,/app\.get\(\['\/equipes','\/teams'\]/);
 const start=server.indexOf("app.get(['/equipes','/teams']");
 const end=server.indexOf('});',start);
 assert.ok(start>0&&end>start);
 const code=server.slice(start,end+3);
 const handlers=[];
 new Function('app',code)({get:(p,handler)=>handlers.push({p,handler})});
 assert.equal(handlers.length,1);
 let redirect=null;
 handlers[0].handler({originalUrl:'/equipes?game=test'},{
  redirect(code,url){redirect={code,url}}
 });
 assert.deepEqual(redirect,{code:302,url:'/decouvrir?game=test'});
 handlers[0].handler({originalUrl:'/teams'},{
  redirect(code,url){redirect={code,url}}
 });
 assert.deepEqual(redirect,{code:302,url:'/decouvrir'});
 const before=seo.slice(seo.indexOf('const CORE_PATHS='),seo.indexOf('const SLUG=',seo.indexOf('const CORE_PATHS=')));
 assert.doesNotMatch(before,/\/equipes/);
 assert.doesNotMatch(seo.slice(seo.indexOf('const LANDING_LINKS='),seo.indexOf('function landingMarkup')),/\/equipes/);
});
