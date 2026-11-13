'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const nav=require('../assets/swapp-navigation');
const {page}=require('../modules/swapp-program');
test('SWAPP TV keeps its navigation position, while Actualité is a single direct link',()=>{
 assert.equal(nav.items.at(-1).href,'/tv');
 assert.equal(nav.items.some(x=>x.href==='/bandes-annonces'),false);
 const html=nav.serverHeader('tv');
 assert.match(html,/href="\/tv" class="swapp-tv-nav-cta" aria-current="page"|href="\/tv" class="active swapp-tv-nav-cta" aria-current="page"/);
 assert.doesNotMatch(html,/swapp-news-more|swapp-news-menu|href="\/equipes"/);
 assert.match(html,/href="\/actus"[^>]*>Actualité<\/a>/);
 assert.match(html,/href="\/categories"[^>]*>Découvrir<\/a>/);
 assert.match(nav.serverHeader('trailers'),/href="\/actus" class="active"/);
});
test('mobile pins Accueil, Découvrir, Actualité and SWAPP TV; Swapper lives in Plus',()=>{
 const html=nav.serverMobile('tv'),main=html.split('<details class="swapp-mobile-more">')[0];
 for(const route of ['/','/categories','/actus','/tv'])assert.ok(main.includes('href="'+route+'"'),route);
 assert.equal((main.match(/<a /g)||[]).length,4);
 assert.doesNotMatch(main,/href="\/decouvrir"/);
 assert.match(html,/class="swapp-mobile-tv-subnav"/);
 assert.match(html,/href="\/decouvrir"/);
 assert.match(html,/href="\/bandes-annonces"/);
 assert.match(html,/PODCAST/);
 assert.doesNotMatch(html,/href="\/equipes"/);
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
 assert.match(tv,/id="stv-program-open"/);
 assert.doesNotMatch(tv,/href="\/jeux"/);
 assert.match(programme,/LE PROGRAMME/);
 assert.match(programme,/id="scal-grid"/);
 assert.match(tv,/20261025-tv-station-clock-v3/);
 assert.match(programme,/20261025-tv-station-clock-v3/);
});
test('Agenda legacy route safely redirects under TV and shared nav assets bust browser caches',()=>{
 const server=read('server.js'),shell=read('modules/swapp-news/site-shell.js'),home=read('index.html');
 assert.match(server,/app\.get\('\/tv\/programme'/);
 assert.match(server,/res\.redirect\(308,'\/tv\/programme'/);
 for(const html of [shell,home]){
  assert.match(html,/swapp-unified-nav\.css\?v=20261113-nav-simple-v2/);
  assert.match(html,/swapp-hub-nav\.js\?v=20261113-nav-simple-v2/);
  assert.match(html,/swapp-navigation\.js\?v=20261113-nav-simple-v2/);
 }
});
