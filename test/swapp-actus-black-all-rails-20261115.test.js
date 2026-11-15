'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const js=read('assets/swapp-catalogue-lab.js');
const css=read('assets/swapp-catalogue-lab.css');
const actus=read('assets/swapp-actus-app.css');

test('ACTUS route and the real featured hero have a neutral black canvas',()=>{
 for(const selector of [
  'html body #actus.view','html body #actus .swapp-actus-native',
  'html body #actus .swapp-actus-featured-hero',
  'html body #actus .swapp-actus-featured-link',
  'html body #actus .swapp-actus-featured-empty',
  'html body #actus .swapp-actus-cover-fallback'
 ])assert.ok(actus.includes(selector),selector);
 assert.match(actus,/html body #actus \.swapp-actus-featured-hero,[\s\S]*?background:#030405!important/);
 assert.match(actus,/html body #actus \.swapp-actus-featured-link::after[\s\S]*?rgba\(3,4,5,\.95\)/);
 assert.match(actus,/html body #actus \.swapp-actus-cover-fallback,[\s\S]*?background:#101214!important/);
 assert.doesNotMatch(actus.slice(actus.indexOf('/* V11 \/ ACTUS BLACK:')),/\bimg\s*\{[^}]*filter:blur\(/);
 assert.match(read('index.html'),/swapp-actus-app\.css\?v=20261115-actus-black-v11/);
});

test('all static and newly generated game rails have visible arrows and keyboard access',()=>{
 const html=require('../modules/swapp-catalogue-lab').catalogueContent({publicHome:true});
 for(const id of ['scl-live-cards','scl-small-cards','scl-genre-cards','scl-top-games-cards',
  'scl-game-cards','scl-article-cards','scl-favorite-cards']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const id of ['scl-live-cards','scl-small-cards','scl-top-games-cards',
  'scl-game-cards','scl-article-cards'])assert.ok(js.includes(id),id);
 assert.match(css,/\.scl-rail-nav\{display:flex!important/);
 assert.doesNotMatch(css,/\.scl-rail-nav\{display:none!important\}/);
 assert.match(js,/function installRailHoverScroll\(\)/);
 assert.match(js,/function installDynamicRailHoverScroll\(\)/);
 assert.match(js,/function syncRailArrowState\(\)/);
 assert.match(js,/installDynamicRailHoverScroll\(\)/);
 assert.match(js,/installRailArrowState\(\)/);
 assert.match(css,/\.scl-genre-cards\.scl-is-edge-scrolling\{/);
 assert.match(read('modules/swapp-catalogue-spa.js'),/20261115-all-rails-v31/);
 assert.match(read('modules/swapp-catalogue-spa.js'),/20261115-all-rails-toolbar-v27/);
});

test('delegated hover scroll works after the genre shelf is dynamically rendered',()=>{
 const start=js.indexOf('function installDynamicRailHoverScroll(){');
 const end=js.indexOf('/* Disabled buttons accurately',start);
 assert.ok(start>0&&end>start);
 const handlers={},documentHandlers={},classes=new Set();
 const rail={
  isConnected:true,scrollWidth:1400,clientWidth:400,scrollLeft:150,
  classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},
  getBoundingClientRect:()=>({left:0,right:400,width:400})
 };
 const root={addEventListener:(event,fn)=>{handlers[event]=fn}};
 const doc={hidden:false,addEventListener:(e,fn)=>{documentHandlers[e]=fn}};
 let touch=false,reduced=false,frame=null,cancelled=false;
 const factory=new Function('root','document','window','navigator','dialog',
  'prefersLessMotion','requestAnimationFrame','cancelAnimationFrame',
  js.slice(start,end)+';return installDynamicRailHoverScroll;');
 const init=factory(root,doc,{matchMedia:()=>({matches:!touch}),addEventListener(){}},
  {connection:{saveData:false}},{open:false},()=>reduced,
  fn=>{frame=fn;return 1},()=>{frame=null;cancelled=true});
 init();
 const target={closest:()=>rail};
 const step=now=>{const fn=frame;frame=null;assert.equal(typeof fn,'function');fn(now)};
 handlers.pointermove({target,pointerType:'mouse',clientX:392});
 step(50);
 assert.ok(rail.scrollLeft>150);
 assert.ok(classes.has('scl-is-edge-scrolling'));
 const after=rail.scrollLeft;
 handlers.pointermove({target,pointerType:'mouse',clientX:190});
 step(66);
 assert.equal(rail.scrollLeft,after,'center does not drift');
 assert.equal(classes.has('scl-is-edge-scrolling'),false);
 handlers.pointerleave();
 touch=true;
 handlers.pointermove({target,pointerType:'touch',clientX:392});
 assert.equal(frame,null);
 assert.equal(rail.scrollLeft,after);
 touch=false;reduced=true;
 handlers.pointermove({target,pointerType:'mouse',clientX:392});
 assert.equal(frame,null);
 reduced=false;
 handlers.pointermove({target,pointerType:'mouse',clientX:392});
 doc.hidden=true;
 documentHandlers.visibilitychange();
 assert.ok(cancelled,'hidden tab cancels auto-scrolling');
});

test('navigation buttons are disabled only at real boundaries',()=>{
 const start=js.indexOf('function syncRailArrowState(){');
 const end=js.indexOf('function scheduleRailArrowState(){',start);
 assert.ok(start>0&&end>start);
 const left={disabled:false},right={disabled:false};
 const track={scrollWidth:920,clientWidth:350,scrollLeft:0};
 const section={
  querySelector:()=>track,
  querySelectorAll:()=>[left,right]
 };
 const genres={scrollWidth:860,clientWidth:300,scrollLeft:0};
 const genreLeft={dataset:{scrollLeft:'scl-genre-cards'},disabled:false};
 const genreRight={dataset:{scrollRight:'scl-genre-cards'},disabled:false};
 const root={
  querySelectorAll:selector=>selector==='.scl-rail'?[section]:[genreLeft,genreRight]
 };
 const run=new Function('root','$',js.slice(start,end)+';return syncRailArrowState;')(root,()=>genres);
 run();
 assert.equal(left.disabled,true);assert.equal(right.disabled,false);
 assert.equal(genreLeft.disabled,true);assert.equal(genreRight.disabled,false);
 track.scrollLeft=570;genres.scrollLeft=560;run();
 assert.equal(left.disabled,false);assert.equal(right.disabled,true);
 assert.equal(genreLeft.disabled,false);assert.equal(genreRight.disabled,true);
 track.scrollWidth=track.clientWidth;genres.scrollWidth=genres.clientWidth;run();
 assert.equal(left.disabled,true);assert.equal(right.disabled,true);
 assert.equal(genreLeft.disabled,true);assert.equal(genreRight.disabled,true);
});
