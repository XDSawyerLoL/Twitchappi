'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {cardImageSources,trailerId}=require('../assets/swapp-article-extras');
const release=require('../data/swapp-veille-native-20261113-multicategories-sourcees.json');
const editorialSignals=require('../data/swapp-editorial-signals.json');

test('all four articles carry credited, externally hosted official illustrative media',()=>{
 assert.equal(release.articles.length,4);
 for(const article of release.articles){
  assert.doesNotThrow(()=>assertArticle(article,{publish:true}),article.slug);
  const covers=cardImageSources(article);
  assert.ok(covers.length>0,article.slug);
  assert.ok(covers[0].startsWith('https://'),article.slug);
  assert.ok(article.thumbnail?.credit&&article.thumbnail?.rights,article.slug);
  assert.match(article.thumbnail.rights,/non réhéberg|sans copie/i,article.slug);
  assert.ok(!article.editorialVerdict,article.slug);
  if(article.image){
   assert.ok(article.image.url.startsWith('https://'),article.slug);
   assert.ok(article.image.credit,article.slug);
  }
 }
 const bySlug=new Map(release.articles.map(article=>[article.slug,article]));
 assert.equal(trailerId(bySlug.get('playstation-plus-novembre-2026-death-stranding-2-atomfall-dragon-quest').trailerUrl),'HdzIwQhYABQ');
 assert.equal(trailerId(bySlug.get('dawn-of-war-4-geforce-now-sortie-3-decembre-2026-factions-modes').trailerUrl),'FIr-v1G-4nQ');
});

function makeElement(tag,klass,text){
 const node={tag,klass,text,children:[],attrs:{},listeners:{},classList:{add(){}},
  append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=v;},
  addEventListener(type,handler){this.listeners[type]=handler;},
  scrollIntoView(){this.scrolled=true;},remove(){}};
 return node;
}
function flashRenderer(){
 const script=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-actus-app.js'),'utf8');
 const start=script.indexOf('const renderFlashCard=entry=>{');
 const end=script.indexOf('\n};\nrefreshSignalSection=',start);
 assert.ok(start>=0&&end>start);
 const code=script.slice(start,end+3);
 const el=(tag,klass='',text='')=>makeElement(tag,klass,text);
 const slugOk=value=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(value||''));
 const safeSource=value=>/^https:\/\//.test(String(value||''))?value:null;
 const shortDate=value=>value;
 const doc={createTextNode:text=>({text})};
 return new Function('el','slugOk','safeSource','shortDate','document',code+';return renderFlashCard;')(el,slugOk,safeSource,shortDate,doc);
}
function walk(node,match,found=[]){
 if(match(node))found.push(node);
 for(const c of node.children||[])if(c&&typeof c==='object')walk(c,match,found);
 return found;
}
const entry={id:'example-signal',topics:['GAMING'],title:'Une nouvelle actualité',sourceDate:'2026-11-12',
 sourceUrl:'https://publisher.example/news',sourceName:'Editeur',imageUrl:'https://publisher.example/cover.jpg',
 imageCredit:'Editeur officiel',fact:'Un fait sourcé',impact:'Impact',caveat:'Réserve'};

test('flash title and illustration open native /actus article when linked',()=>{
 const card=flashRenderer()({...entry,articleSlug:'exemple-article-swapp'});
 const title=walk(card,x=>x.klass==='swapp-flash-title')[0];
 const thumb=walk(card,x=>x.klass==='swapp-flash-thumb')[0];
 const source=walk(card,x=>x.klass==='swapp-flash-source-link')[0];
 assert.equal(title.href,'/actus/exemple-article-swapp');
 assert.equal(thumb.href,title.href);
 assert.equal(source.href,entry.sourceUrl);
 assert.equal(title.target,undefined);
 assert.equal(thumb.target,undefined);
});

test('unpublished flash opens its complete local details instead of redirecting externally',()=>{
 const card=flashRenderer()({...entry,articleSlug:null});
 const title=walk(card,x=>x.klass==='swapp-flash-title')[0];
 const thumb=walk(card,x=>x.klass==='swapp-flash-thumb')[0];
 const details=walk(card,x=>x.klass==='swapp-flash-details')[0];
 assert.ok(title.href.startsWith('#swapp-flash-detail-'));
 assert.equal(thumb.href,title.href);
 assert.equal(details.open,undefined);
 let prevented=false;
 title.listeners.click({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(details.open,true);
 assert.equal(details.scrolled,true);
});

test('related two approved signals point at their new native articles',()=>{
 const get=id=>editorialSignals.items.find(item=>item.id===id);
 assert.equal(get('gemini-4-hydrogen-annonce-20261112').articleSlug,
  'gemini-4-hydrogen-google-agent-ia-12-novembre-2026-disponibilite');
 assert.equal(get('dawn-of-war-iv-geforce-now-20261112').articleSlug,
  'dawn-of-war-4-geforce-now-sortie-3-decembre-2026-factions-modes');
});
