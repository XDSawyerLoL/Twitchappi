'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const nav=require('../assets/swapp-navigation');
const {page}=require('../modules/swapp-program');
test('SWAPP TV is a distinguished last desktop tab; video belongs exclusively under Actualité',()=>{
 assert.equal(nav.items.at(-1).href,'/tv');
 assert.equal(nav.items.some(x=>x.href==='/bandes-annonces'),false);
 const html=nav.serverHeader('tv');
 assert.match(html,/href="\/tv" class="active swapp-tv-nav-cta" aria-current="page"/);
 assert.match(html,/class="swapp-news-more"/);
 assert.match(html,/aria-label="Ouvrir les rubriques Actualité"/);
 assert.match(html,/class="swapp-news-menu"/);
 assert.match(html,/href="\/bandes-annonces"/);
 assert.match(nav.serverHeader('trailers'),/href="\/bandes-annonces" aria-current="page"/);
});
test('mobile menu pins TV and keeps videos grouped with Actualité',()=>{
 const html=nav.serverMobile('tv'),main=html.split('<details class="swapp-mobile-more">')[0];
 for(const route of ['/','/decouvrir','/actus','/tv'])assert.ok(main.includes('href="'+route+'"'),route);
 assert.equal((main.match(/<a /g)||[]).length,4);
 assert.match(html,/swapp-mobile-menu-title">ACTUALITÉ/);
 assert.match(html,/Vidéos et bandes-annonces/);
 assert.match(html,/swapp-tv-nav-cta/);
});
test('TV and programme follow existing SWAPP colors and layout',()=>{
 const css=read('assets/swapp-program.css');
 assert.match(css,/--swapp-program-blue:#14223b/);
 assert.match(css,/--swapp-program-purple:#2a2345/);
 assert.match(css,/var\(--swapp-page-accent,#67dce8\)/);
 assert.doesNotMatch(css,/#bdff6c/i);
 assert.match(css,/\.stv-rail\{border:1px solid #ffffff29/);
 assert.match(css,/\.scal-head\{min-height:220px/);
 const tv=page('tv'),programme=page('agenda');
 assert.match(tv,/href="\/tv\/programme"/);
 assert.doesNotMatch(tv,/href="\/jeux"/);
 assert.match(programme,/LE PROGRAMME/);
 assert.match(programme,/id="scal-grid"/);
 assert.match(tv,/20261022-unified-da-v3/);
 assert.match(programme,/20261022-unified-da-v3/);
});
test('Agenda legacy route safely redirects under TV and shared nav assets bust browser caches',()=>{
 const server=read('server.js'),shell=read('modules/swapp-news/site-shell.js'),home=read('index.html');
 assert.match(server,/app\.get\('\/tv\/programme'/);
 assert.match(server,/res\.redirect\(308,'\/tv\/programme'/);
 for(const html of [shell,home]){
  assert.match(html,/swapp-unified-nav\.css\?v=20261022-tvnav-v1/);
  assert.match(html,/swapp-hub-nav\.js\?v=20261022-one-account-menu-v2/);
  assert.match(html,/swapp-navigation\.js\?v=20261022-one-account-menu-v2/);
 }
});
