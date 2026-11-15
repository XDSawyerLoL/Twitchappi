'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {desktopNavigation,mobileNavigation,serverHeader,serverMobile,items}=require('../assets/swapp-navigation');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');

test('five first-level destinations without Découvrir',()=>{
 assert.deepEqual(items.map(({href})=>href),['/','/actus','/social','/boutique','/tv']);
 assert.deepEqual(items.map(({label})=>label),['Accueil','Actualité','Social','Boutique','SWAPP TV']);
 const html=desktopNavigation('discover');
 const firstLevel=html.slice(0,html.indexOf('<div class="swapp-tv-navigation">'));
 assert.equal((firstLevel.match(/<a /g)||[]).length,4);
 assert.doesNotMatch(firstLevel,/href="\/decouvrir"|>SWAPER</);
 assert.doesNotMatch(html,/href="\/categories"|>Découvrir<\/a>/);
 assert.match(html,/class="swapp-tv-submenu"/);
 assert.match(html,/class="swapp-tv-submenu-links"><a href="\/decouvrir"[^>]*aria-current="page">Swapper<\/a>/);
 assert.match(html,/href="\/tv"[^>]*class="active swapp-tv-nav-cta"/);
 assert.doesNotMatch(html,/swapp-news-menu|href="\/equipes"/);
});
test('mobile keeps Accueil, Actualité, Social, SWAPP TV then Plus',()=>{
 const html=mobileNavigation('home');
 const pinned=html.slice(0,html.indexOf('<details class="swapp-mobile-more">'));
 assert.equal((pinned.match(/<a /g)||[]).length,4);
 for(const href of ['/','/actus','/social','/tv'])assert.match(pinned,new RegExp('href="'+href+'"'));
 assert.doesNotMatch(pinned,/href="\/decouvrir"|SWAPER/);
 assert.match(html,/class="swapp-mobile-tv-subnav"[^>]*>[\s\S]*href="\/decouvrir"/);
 for(const href of ['/social','/boutique','/on-air','/bandes-annonces','/compte'])
  assert.match(html,new RegExp('href="'+href+'"'));
 assert.doesNotMatch(html,/href="\/equipes"|\/actus\?tag=/);
});
test('server and SPA use the same versioned navigation contract',()=>{
 const home=read('index.html'),native=require('../modules/swapp-news/site-shell').layout({content:'<main>Test</main>'});
 for(const source of [home,native]){
  for(const name of ['swapp-navigation.js','swapp-hub-nav.js','swapp-unified-nav.css'])
   assert.ok(source.includes('/assets/'+name+'?v='+
    (name==='swapp-unified-nav.css'?'20261113-nav-simple-v2':name==='swapp-navigation.js'?'20261115-servers-menu-v5':'20261115-servers-menu-v5')),name);
 }
 for(const page of [serverHeader('actus'),serverMobile('actus')]){
  assert.doesNotMatch(page,/href="\/equipes"|swapp-news-more/);
  assert.doesNotMatch(page,/href="\/categories"/);
  assert.match(page,/href="\/decouvrir"/);
 }
 const reconcile=read('assets/swapp-hub-nav.js');
 assert.match(reconcile,/const valid=/);
 assert.match(reconcile,/const pinned=\['\/','\/actus','\/social','\/tv'\]/);
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


test('SERVEUR + is a primary desktop link, a mobile Plus link and active on the ranking pages',()=>{
 const {desktopNavigation,mobileNavigation,serverHeader,serverMobile,servers}=require('../assets/swapp-navigation');
 assert.equal(servers.href,'/serveurs');
 assert.equal(servers.label,'SERVEUR +');
 const desktop=desktopNavigation('servers');
 assert.match(desktop,/href="\/serveurs"[^>]*class="active"[^>]*aria-current="page">SERVEUR \+<\/a>/);
 assert.ok(desktop.indexOf('href="/explorer"')<desktop.indexOf('href="/serveurs"'));
 assert.equal((desktop.match(/href="\/serveurs"/g)||[]).length,1);
 const mobile=mobileNavigation('servers');
 assert.match(mobile,/swapp-mobile-more-links[\s\S]*href="\/serveurs"[^>]*class="active"[^>]*aria-current="page">SERVEUR \+<\/a>/);
 assert.doesNotMatch(mobile.slice(0,mobile.indexOf('swapp-mobile-more')),/href="\/serveurs"/);
 for(const native of [serverHeader('servers'),serverMobile('servers')]){
  assert.match(native,/href="\/serveurs"/);
 }
 const serverPages=read('modules/swapp-servers.js');
 assert.match(serverPages,/active:'servers'/);
 const reconciler=read('assets/swapp-hub-nav.js');
 assert.match(reconciler,/route==='\/serveurs'\|\|route\.startsWith\('\/serveurs\/'\)\?'servers'/);
 assert.match(reconciler,/nav\.querySelector\('a\[href="\/serveurs"\]'\)/);
});
