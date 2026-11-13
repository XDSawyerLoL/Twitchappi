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
function harness(navigator){
 const start=app.indexOf('async function shareArticleCard(');
 const end=app.indexOf('function paragraphContent(',start);
 assert.ok(start>0&&end>start,'share and card functions are present');
 const opened=[];
 const api=new Function('el','slugOk','articleTopics','date','cover','window','location','navigator','document','open',
  app.slice(start,end)+';return {makeCard,shareArticleCard};')(
   element,slug=>/^[a-z0-9-]{4,110}$/.test(slug),()=>['GAMING'],()=> '13/11/2026',
   ()=>element('div','swapp-actus-cover'),
   {SwappLocalTastes:{record(){}}},{origin:'https://swapp.tv'},navigator,
   {execCommand(){return false}},slug=>opened.push(slug)
  );
 return {...api,opened};
}
const article={slug:'article-test-partage',title:'Un article SWAPP',summary:'Une analyse complète',game:'Fortnite',publishedAt:'2026-11-13T10:00:00Z'};

test('SWAPER and DÉCOUVRIR are correctly labelled, with one uniform navigation',()=>{
 const items=nav.items;
 assert.equal(items.find(i=>i.href==='/decouvrir').label,'SWAPER');
 assert.equal(items.find(i=>i.href==='/categories').label,'DÉCOUVRIR');
 for(const page of [nav.desktopNavigation('discover'),nav.mobileNavigation('categories')]){
  assert.match(page,/>SWAPER<\/a>/);
  assert.match(page,/>DÉCOUVRIR<\/a>/);
  assert.doesNotMatch(page,/>DIRECT<\/a>|>Jeux &amp; catégories<\/a>|swapp-news-more/);
 }
 const css=read('assets/swapp-unified-nav.css');
 assert.match(css,/#nav\.mainNav \.navGroup > a/);
 assert.match(css,/#mobileNav\.mobileNav > a/);
 assert.match(css,/swapp-tv-nav-cta:before\{display:none!important\}/);
});
test('catalogue has only the requested title while keeping size controls',()=>{
 const source=read('index_script.js');
 assert.equal((source.match(/<h1>CATALOGUE<\/h1>/g)||[]).length,2);
 assert.doesNotMatch(source,/<h1>Choisis une ambiance\.<\/h1>/);
 assert.doesNotMatch(source,/Vignettes réglables : compact sur mobile/);
 assert.ok(source.includes('catSizeControls()'));
 assert.ok(source.includes('window.catSizeControls()'));
});
test('each magazine card contains a native reading link AND a separate share button',()=>{
 const h=harness({});
 const card=h.makeCard(article);
 assert.equal(card.tag,'article');
 assert.equal(card.cls,'swapp-actus-card');
 const link=card.children[0],actions=card.children[1];
 assert.equal(link.tag,'a');
 assert.equal(link.href,'/actus/article-test-partage');
 assert.equal(actions.tag,'div');
 assert.equal(actions.children[0].tag,'button');
 assert.equal(actions.children[0].textContent,'Partager');
 assert.match(actions.children[0].attrs['aria-label'],/Partager l’article/);
 assert.equal(link.children.some(x=>x.tag==='button'),false);
 let prevented=false;
 link.onclick({button:0,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.deepEqual(h.opened,[article.slug]);
 let stopped=false;
 actions.children[0].onclick({stopPropagation(){stopped=true}});
 assert.equal(stopped,true);
 assert.deepEqual(h.opened,[article.slug],'sharing must not open the article');
});
test('desktop copying and native sharing use the on-site canonical article URL',async()=>{
 const copied=[];
 const h=harness({clipboard:{writeText:async link=>copied.push(link)}});
 const card=h.makeCard(article),actions=card.children[1],status=actions.children[1];
 await h.shareArticleCard(article,actions,actions.children[0],status);
 assert.deepEqual(copied,['https://swapp.tv/actus/article-test-partage']);
 assert.equal(status.textContent,'Lien copié');
 assert.equal(status.hidden,false);
 assert.deepEqual(h.opened,[]);
 const payload=[];
 const mobile=harness({share:async data=>payload.push(data)});
 const mobileCard=mobile.makeCard(article),tools=mobileCard.children[1],note=tools.children[1];
 await mobile.shareArticleCard(article,tools,tools.children[0],note);
 assert.deepEqual(payload,[{title:article.title,url:'https://swapp.tv/actus/article-test-partage'}]);
 assert.equal(note.textContent,'Partage effectué');
});
test('restricted clipboard leaves selectable URL, without claiming it was copied',async()=>{
 const h=harness({clipboard:{writeText:async()=>{throw Error('permission denied')}}});
 const card=h.makeCard(article),actions=card.children[1],status=actions.children[1];
 await h.shareArticleCard(article,actions,actions.children[0],status);
 const field=actions.children.find(x=>x.cls==='swapp-actus-share-url');
 assert.ok(field,'fallback exposes URL in the card');
 assert.equal(field.value,'https://swapp.tv/actus/article-test-partage');
 assert.equal(field.selected,true);
 assert.equal(status.textContent,'Lien sélectionné : copiez-le');
});
test('versioned SPA assets expose new navigation, catalogue and sharing without cache collisions',()=>{
 const home=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const source of [home,shell]){
  for(const file of ['swapp-navigation.js','swapp-hub-nav.js','swapp-unified-nav.css'])
   assert.ok(source.includes(file+'?v='+(file==='swapp-unified-nav.css'?'20261113-nav-uniform-v1':'20261113-swaper-decouvrir-v1')));
 }
 assert.match(home,/index_script\.js\?v=20261113-catalogue-heading-v1/);
 assert.match(home,/swapp-actus-app\.js\?v=20261113-inline-share-v1/);
 assert.match(home,/swapp-actus-app\.css\?v=20261113-inline-share-v1/);
});
