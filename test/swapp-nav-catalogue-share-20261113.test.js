'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const nav=require('../assets/swapp-navigation');
const app=read('assets/swapp-actus-app.js');

function element(tag,cls='',label=''){
 return {tag,cls,textContent:label,children:[],attrs:{},parentNode:null,hidden:false,
  setAttribute(k,v){this.attrs[k]=String(v)},
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n)}},
  querySelector(sel){
   if(sel.startsWith('.')){
    const name=sel.slice(1);
    const walk=n=>n.cls===name?n:n.children.map(walk).find(Boolean);
    return walk(this);
   }return null;
  },
  focus(){this.focused=true},
  select(){this.selected=true}
 };
}
function harness(){
 const start=app.indexOf('function shareArticleCard(');
 const end=app.indexOf('function paragraphContent(',start);
 assert.ok(start>0&&end>start);
 const opened=[];
 const api=new Function('el','slugOk','articleTopics','date','cover','window','location','open',
  app.slice(start,end)+';return {makeCard,shareArticleCard};')(
   element,slug=>/^[a-z0-9-]{4,110}$/.test(slug),()=>['GAMING'],()=> '13/11/2026',
   ()=>element('div','swapp-actus-cover'),
   {SwappLocalTastes:{record(){}}},{origin:'https://swapp.tv'},
   slug=>opened.push(slug)
 );
 return {...api,opened};
}
const article={slug:'article-test-partage',title:'Un article SWAPP',summary:'Une analyse complète',game:'Fortnite',publishedAt:'2026-11-13T10:00:00Z'};

test('Découvrir is primary and Swapper is only inside SWAPP TV',()=>{
 const items=nav.items;
 assert.equal(items.find(i=>i.href==='/categories').label,'Découvrir');
 assert.equal(items.some(i=>i.href==='/decouvrir'),false);
 for(const page of [nav.desktopNavigation('discover'),nav.mobileNavigation('categories')]){
  assert.match(page,/>Swapper<\/a>/);
  assert.match(page,/>Découvrir<\/a>/);
  assert.doesNotMatch(page,/>SWAPER<\/a>|>DIRECT<\/a>|>Jeux &amp; catégories<\/a>|swapp-news-more/);
 }
 const desktop=nav.desktopNavigation('discover');
 assert.ok(desktop.indexOf('href="/categories"')<desktop.indexOf('href="/actus"'));
 assert.ok(desktop.indexOf('href="/decouvrir"')>desktop.indexOf('class="swapp-tv-navigation"'));
 const css=read('assets/swapp-unified-nav.css');
 assert.match(css,/#nav\.mainNav \.swapp-tv-submenu/);
 assert.match(css,/\.swapp-tv-submenu:not\(\[open\]\)/);
});
test('catalogue has only the requested title while keeping size controls',()=>{
 const source=read('index_script.js');
 assert.equal((source.match(/<h1>CATALOGUE<\/h1>/g)||[]).length,2);
 assert.doesNotMatch(source,/<h1>Choisis une ambiance\.<\/h1>/);
 assert.doesNotMatch(source,/Vignettes réglables : compact sur mobile/);
 assert.ok(source.includes('catSizeControls()'));
 assert.ok(source.includes('window.catSizeControls()'));
});
test('ACTUS article card has an X intent anchor separate from SWAPP reading link',()=>{
 const h=harness();
 const card=h.makeCard(article);
 assert.equal(card.tag,'article');
 const link=card.children[0],share=card.children[1].children[0];
 assert.equal(link.tag,'a');
 assert.equal(link.href,'/actus/article-test-partage');
 assert.equal(share.tag,'a');
 assert.equal(share.textContent,'Partager sur X');
 assert.equal(share.target,'_blank');
 assert.equal(share.rel,'noopener noreferrer');
 const target=new URL(share.href);
 assert.equal(target.origin,'https://x.com');
 assert.equal(target.pathname,'/intent/tweet');
 assert.equal(target.searchParams.get('url'),'https://swapp.tv/actus/'+article.slug);
 assert.equal(target.searchParams.get('text'),article.title);
 let prevented=false;
 link.onclick({button:0,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.deepEqual(h.opened,[article.slug]);
});
test('ACTUS sharing does not use Windows native sheet',()=>{
 assert.equal(app.includes('navigator.share('),false);
 const h=harness();
 assert.ok(h.shareArticleCard(article).startsWith('https://x.com/intent/tweet?'));
 assert.equal(h.shareArticleCard({slug:'<invalid>'}), '');
});
test('versioned SPA assets expose new navigation, catalogue and sharing without cache collisions',()=>{
 const home=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const source of [home,shell]){
  for(const file of ['swapp-navigation.js','swapp-hub-nav.js','swapp-unified-nav.css'])
   assert.ok(source.includes(file+'?v='+(file==='swapp-unified-nav.css'?'20261113-nav-simple-v2':file==='swapp-hub-nav.js'?'20261113-nav-simple-v2':'20261113-nav-simple-v2')));
 }
 assert.match(home,/index_script\.js\?v=20261113-catalogue-heading-v1/);
 assert.match(home,/swapp-actus-app\.js\?v=20261113-direct-x-v3/);
 assert.match(home,/swapp-actus-app\.css\?v=20261113-relocated-feature-v2/);
});
