'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const nav=require('../assets/swapp-navigation');
const {community}=require('../modules/swapp-hubs');
test('six primary destinations; Swapper is nested beneath SWAPP TV',()=>{
 assert.deepEqual(nav.items.map(x=>x.label),['Accueil','Découvrir','Actualité','Social','Boutique','SWAPP TV']);
 const desktop=nav.desktopNavigation('categories');
 assert.equal((desktop.match(/<a /g)||[]).length,7); // 6 primary + 1 TV sublink
 for(const href of ['/','/categories','/actus','/social','/boutique','/tv'])
  assert.match(desktop,new RegExp('href="'+href+'"'));
 assert.doesNotMatch(desktop,/swapp-news-more|swapp-news-menu|href="\/equipes"/);
 assert.match(desktop,/href="\/categories" class="active" aria-current="page"/);
 assert.match(desktop,/class="swapp-tv-submenu"/);
 assert.match(desktop,/href="\/decouvrir"[^>]*>Swapper<\/a>/);
 assert.ok(desktop.indexOf('href="/decouvrir"')>desktop.indexOf('href="/tv"'));
 const mobile=nav.mobileNavigation('categories');
 const pinned=mobile.split('<details class="swapp-mobile-more">')[0];
 assert.equal((pinned.match(/<a /g)||[]).length,4);
 for(const href of ['/','/categories','/actus','/tv'])
  assert.match(pinned,new RegExp('href="'+href+'"'));
 assert.doesNotMatch(pinned,/href="\/decouvrir"/);
 assert.match(mobile,/class="swapp-mobile-tv-subnav"/);
 assert.match(mobile,/href="\/decouvrir"/);
 assert.match(mobile,/href="\/social"/);
 assert.doesNotMatch(mobile,/href="\/equipes"/);
});
test('SOCIAL content is public, while the only login dialog uses the SWAPP session',()=>{
 const html=community();
 assert.match(html,/class="swapp-social-access-content"/);
 assert.match(html,/id="swapp-social-access-gate"|class="swapp-social-access-gate"/);
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/id="swapp-social-login-form"/);
 assert.match(html,/id="swapp-social-close-auth"/);
 assert.match(html,/swapp-social-access\.js\?v=20261022-one-account-v1/);
 assert.doesNotMatch(html,/Connecte-toi avec ton compte SWAPP pour découvrir la communauté/);
 const gate=read('assets/swapp-social-access.css');
 assert.match(gate,/\.swapp-social-access-gate\[hidden\]\{display:none!important\}/);
 assert.match(gate,/pointer-events:auto!important/);
 assert.match(gate,/filter:none!important/);
 const js=read('assets/swapp-social-access.js');
 assert.match(js,/addEventListener\('swapp:login-required'/);
 assert.match(js,/\/api\/oryon\/login/);
 assert.match(js,/\/api\/oryon\/register/);
 assert.match(js,/\/api\/oryon\/session/);
 assert.doesNotMatch(js,/\/api\/pulse\/login/);
});
test('SOCIAL attempted actions request site-wide authentication but do not hide the composer',()=>{
 const session=read('assets/swapp-social-native/session.js');
 const app=read('assets/swapp-social-native/app.js');
 const views=read('assets/swapp-social-native/views.js');
 assert.match(session,/document\.dispatchEvent\(new CustomEvent\('swapp:login-required'\)\)/);
 assert.match(session,/dom\.composer\.hidden=state\.feed==='news'/);
 assert.match(views,/dom\.composer\.hidden=view!=='home'\|\|state\.feed==='news'/);
 assert.match(app,/dom\.textarea\.addEventListener\('focus',/);
 assert.match(app,/if\(!state\.user\)openAuth\(\)/);
 assert.match(app,/if\(!requireAuth\(\)\|\|dom\.publish\.disabled\)return/);
 assert.doesNotMatch(session,/document\.getElementById\('swapp-social-login'\)\?\.focus/);
});
test('article creators use one discovery section, and static shop selection is honestly dated',()=>{
 const article=read('modules/swapp-news/native-pages.js');
 const shop=read('modules/swapp-hubs.js');
 assert.match(article,/\$\{spotlight\}<div class="swapp-live-grid"/);
 assert.equal((article.match(/swapp-spotlight-public/g)||[]).length,1);
 assert.match(shop,/LA SÉLECTION <em>SWAPP/);
 assert.match(shop,/sélection datée du 16 octobre 2026/);
 assert.doesNotMatch(shop,/LES 10 JEUX <em>DU MOMENT/);
 const tv=read('assets/swapp-tv-broadcast.js');
 assert.match(tv,/access\.hidden=!enabled/);
});
