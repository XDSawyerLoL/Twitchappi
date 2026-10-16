'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('last mobile stylesheet renders five visible destinations and an unclipped Plus popup',()=>{
 const shared=read('assets/swapp-unified-nav.css');
 const legacy=read('assets/swapp-mobile-comfort.css');
 const finish=read('assets/swapp-presentation-polish.css');
 assert.match(legacy,/overflow-x:auto!important/,'old scrolling rule must be guarded');
 assert.match(shared,/swapp-mobile-more-links/);
 assert.match(finish,/Compact five-destination mobile bar, including Safari\/iPhone/);
 const rule=finish.slice(finish.indexOf('Compact five-destination mobile bar, including Safari/iPhone'));
 assert.match(rule,/#mobileNav\.mobileNav\s*\{/);
 assert.match(rule,/display:grid!important/);
 assert.match(rule,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
 assert.match(rule,/overflow-x:visible!important/);
 assert.match(rule,/overflow-y:visible!important/);
 assert.match(rule,/min-width:0!important/);
 assert.match(rule,/\.swapp-mobile-more\[open\]/);
 assert.match(rule,/\.swapp-mobile-more-links/);
 assert.match(rule,/safe-area-inset-left/);
 assert.match(rule,/safe-area-inset-right/);
 assert.ok(finish.indexOf('Compact five-destination mobile bar')>finish.indexOf('iPhone / iOS Safari'),
  'visible compact navigation must be the final mobile override');
});

test('native and SPA navigation share the same four pinned destinations and Plus',()=>{
 const {serverMobile}=require('../assets/swapp-navigation');
 const html=serverMobile('community');
 const top=html.slice(0,html.indexOf('<details class="swapp-mobile-more">'));
 for(const label of ['Accueil','Découvrir','Actualité','Communauté']){
  assert.match(top,new RegExp('>'+label+'<'));
 }
 assert.equal((top.match(/<a /g)||[]).length,4);
 assert.match(html,/<summary>Plus<\/summary>/);
 for(const route of ['/categories','/equipes','/bandes-annonces','/boutique','/compte']){
  assert.ok(html.includes('href="'+route+'"'),route);
 }
 const spa=read('assets/swapp-hub-nav.js');
 assert.match(spa,/const pinned=\['\/','\/decouvrir','\/actus','\/communaute'\]/);
});

function mountedMenu(){
 const listeners={};
 const summary={focused:false,focus(){this.focused=true}};
 const details={
  open:true,
  matches:sel=>sel==='details.swapp-mobile-more',
  querySelector:sel=>sel===':scope > summary'?summary:null,
  querySelectorAll:()=>[]
 };
 const nav={
  children:[details],
  addEventListener(){},
  querySelector:()=>null
 };
 const doc={
  readyState:'complete',
  getElementById:id=>id==='mobileNav'?nav:null,
  addEventListener:(name,fn)=>{listeners[name]=fn}
 };
 const win={
  innerWidth:390,
  location:{pathname:'/communaute',origin:'https://swapp.tv'},
  matchMedia:q=>({matches:q.includes('1080px')}),
  requestAnimationFrame:fn=>{fn();return 0},
  addEventListener(){}
 };
 vm.runInNewContext(read('assets/swapp-mobile-nav-follow.js'),{window:win,document:doc,URL});
 return {listeners,details,summary,nav};
}

test('tap outside the iPhone bottom bar dismisses Plus but inside tap retains it',()=>{
 const f=mountedMenu();
 f.listeners.click({target:{closest:sel=>sel==='#mobileNav'?f.nav:null}});
 assert.equal(f.details.open,true,'inside navigation must not be dismissed');
 f.listeners.click({target:{closest:()=>null}});
 assert.equal(f.details.open,false,'outside tap must close the menu');
 f.details.open=true;
 f.listeners.click({target:{closest:sel=>sel==='#mobileNav'?f.nav:sel==='.swapp-mobile-more-links a'?{}:null}});
 assert.equal(f.details.open,false,'selecting an inner link must dismiss the popup');
});

test('Escape closes Plus and restores keyboard focus to its summary',()=>{
 const f=mountedMenu();
 let prevented=false;
 f.listeners.keydown({key:'Escape',preventDefault(){prevented=true}});
 assert.equal(f.details.open,false);
 assert.equal(f.summary.focused,true);
 assert.equal(prevented,true);
 f.details.open=true;
 f.listeners.keydown({key:'Enter',preventDefault(){}});
 assert.equal(f.details.open,true,'unrelated keys must not dismiss Plus');
});

test('both shells and release verifier use exactly the latest navigation assets',()=>{
 const home=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 const css='/assets/swapp-presentation-polish.css?v=20261016-ios-account-front-v7';
 const js='/assets/swapp-mobile-nav-follow.js?v=20261016-follow-v2';
 for(const html of [home,native]){
  assert.equal(html.split(css).length-1,1);
  assert.equal(html.split(js).length-1,1);
 }
 const release=read('tools/swapp-release.js');
 assert.match(release,/'assets\/swapp-presentation-polish\.css'/);
 assert.match(release,/'assets\/swapp-mobile-nav-follow\.js'/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/20261016-ios-account-front-v7/);
 assert.match(smoke,/20261016-follow-v2/);
});


test('iPhone fixed bar and Plus popup paint above floating companion and SOCIAL sticky stack',()=>{
 const finish=read('assets/swapp-presentation-polish.css');
 const social=read('assets/swapp-social-native/social-swapp.css');
 const companion=read('assets/swapp-mairy.css');
 const unified=read('assets/swapp-unified-nav.css');
 assert.match(unified,/#mobileNav\{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:90/);
 assert.match(companion,/position:fixed;right:clamp[^;]+;bottom:22px;z-index:125/);
 assert.match(social,/\.swapp-social-viewport \.swapp-social-sticky-stack\{[\s\S]*?z-index:60;/);
 const mobileFix=finish.slice(finish.indexOf('iPhone layering fix: shared bottom navigation'));
 assert.match(mobileFix,/@media\(max-width:1080px\)/);
 assert.match(mobileFix,/#mobileNav\.mobileNav\{[\s\S]*?position:fixed!important/);
 assert.match(mobileFix,/#mobileNav\.mobileNav\{[\s\S]*?z-index:210!important/);
 assert.match(mobileFix,/\.swapp-companion\{\s*z-index:125;/);
 assert.match(mobileFix,/#mobileNav\.mobileNav:has\(\.swapp-mobile-more\[open\]\)\{[\s\S]*?-webkit-backdrop-filter:none!important/);
 assert.match(mobileFix,/backdrop-filter:none!important/);
 assert.match(mobileFix,/#mobileNav\.mobileNav \.swapp-mobile-more\[open\] > \.swapp-mobile-more-links/);
 assert.match(read('assets/swapp-video-gallery.css'),/\.swapp-video-backdrop\{position:fixed;inset:0;z-index:240/);
});
