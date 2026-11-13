'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const api=require('../assets/swapp-catalogue-lab');
const shell=require('../modules/swapp-catalogue-lab');
const js=read('assets/swapp-catalogue-lab.js');
const css=read('assets/swapp-catalogue-lab.css');
const a={
 slug:'swapp-article-officiel-2026',title:'Une actualité officielle sur SWAPP',
 category:'GAMING',summary:'Un article publié depuis la rédaction SWAPP.',
 publishedAt:'2026-11-13T10:00:00Z',status:'published',
 thumbnail:{url:'https://blog.playstation.com/cover.jpg',alt:'Visuel officiel'}
};
test('native ACTUS rail is distinct from the full magazine and absent from site primary navigation',()=>{
 const html=shell.page();
 assert.match(html,/id="scl-articles"/);
 assert.match(html,/id="scl-article-cards"/);
 assert.match(html,/data-scl-section="article"/);
 assert.match(html,/href="\/actus">Toutes les actualités<\/a>/);
 assert.match(html,/data-scl-filter="article"/);
 assert.ok(html.indexOf('id="scl-feature"')<html.indexOf('id="scl-articles"'));
 assert.ok(html.indexOf('id="scl-articles"')<html.indexOf('id="scl-live"'));
 assert.match(html,/swapp-article-extras\.js\?v=20261113-actus-rail-v3/);
 assert.match(html,/swapp-catalogue-lab\.js\?v=20261113-actus-rail-v3/);
 assert.match(html,/swapp-catalogue-lab\.css\?v=20261113-actus-rail-v3/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.doesNotMatch(read('assets/swapp-navigation.js'),/catalogue-test/);
});
test('news source is the real published CMS and NOT external feeds or invented content',()=>{
 assert.equal(api.API.articles,'/api/actus');
 assert.match(js,/async function fetchArticles\(\)/);
 assert.match(js,/!Array\.isArray\(payload\.articles\)/);
 assert.match(js,/Promise\.allSettled\(\[fetchJson\(API\.home\),fetchJson\(API\.top\),fetchJson\(API\.games\),fetchArticles\(\)\]\)/);
 assert.match(js,/state\.newsError=results\[3\]\.status==='rejected'/);
 assert.match(js,/state\.articles=normalizeArticles\(published\)/);
 assert.doesNotMatch(js,/\barticles:\s*\[\{\s*title:/);
});
test('published articles have canonical internal routes, descending order and no duplicates',()=>{
 const article=api.normalizeArticle(a);
 assert.ok(article);
 assert.equal(article.kind,'article');
 assert.equal(article.url,'/actus/swapp-article-officiel-2026');
 assert.equal(article.image,a.thumbnail.url);
 assert.equal(article.publishedAt,Date.parse(a.publishedAt));
 const newer={...a,slug:'swapp-autre-article-2026',publishedAt:'2026-11-13T11:00:00Z'};
 const items=api.normalizeArticles([a,newer,a,{...a,status:'draft',slug:'brouillon'}]);
 assert.deepEqual(items.map(item=>item.slug),[newer.slug,a.slug]);
 assert.equal(api.normalizeArticle({...a,slug:'https://publisher.example/article'}),null);
 assert.equal(api.normalizeArticle({...a,status:'draft'}),null);
 assert.equal(api.normalizeArticle({...a,title:'',slug:'sans-titre'}),null);
 assert.deepEqual(api.normalizeArticles(null),[]);
});
test('media accepts only valid HTTPS remote publisher art, no script or unsafe URL',()=>{
 assert.equal(api.cleanArticleImage('javascript:alert(1)'),'');
 assert.equal(api.cleanArticleImage('data:image/svg+xml,aa'),'');
 assert.equal(api.cleanArticleImage('http://example.com/cover.jpg'),'');
 assert.equal(api.cleanArticleImage('https://evil.test/cover.svg'),'');
 assert.equal(api.cleanArticleImage('https://blog.playstation.com/cover.jpg'),a.thumbnail.url);
 const empty=api.normalizeArticle({...a,thumbnail:{url:'javascript:alert(1)'},image:null,imageUrl:''});
 assert.equal(empty.image,'');
});
test('article cards have separate native reading and sharing actions, with honest clipboard fallback',async()=>{
 const from=js.indexOf('async function shareArticle(article,tools,feedback){');
 const end=js.indexOf('const matching=item=>',from);
 assert.ok(from>0&&end>from);
 const code=js.slice(from,end);
 const create=(tag,cls='',text='')=>({
  tag,cls,textContent:text,children:[],attrs:{},hidden:false,
  setAttribute(k,v){this.attrs[k]=String(v)},
  addEventListener(){},append(...nodes){this.children.push(...nodes)},
  focus(){this.focused=true},select(){this.selected=true},remove(){this.removed=true},
  querySelector(sel){return this.children.find(c=>c.cls===sel.slice(1))||null}
 });
 const copied=[],tools=create('div'),feedback=create('span');
 const navigator={clipboard:{writeText:async text=>copied.push(text)}};
 const fn=new Function('create','navigator','document','window','button','cleanArticleImage','$','empty',
  code+';return shareArticle;')(create,navigator,{execCommand(){return false}},
  {location:{origin:'https://swapp.tv'},SwappArticleExtras:null},
  (text,cls,handler)=>({...create('button',cls,text),onclick:handler}),
  api.cleanArticleImage,()=>create('div'),()=>create('p'));
 const article=api.normalizeArticle(a);
 await fn(article,tools,feedback);
 assert.deepEqual(copied,['https://swapp.tv/actus/swapp-article-officiel-2026']);
 assert.equal(feedback.textContent,'Lien SWAPP copié');
 assert.equal(feedback.hidden,false);
 assert.match(code,/const link=create\('a','scl-story-link'\)/);
 assert.match(code,/link\.href=article\.url/);
 assert.match(code,/const actions=create\('div','scl-story-actions'\)/);
 assert.match(code,/button\('Partager','scl-story-share'/);
 assert.doesNotMatch(code,/target=['"]_blank|publisher\.example\/article/);
});
test('illustrated article cards remain navigable and touch-friendly on mobile',()=>{
 assert.match(css,/#scl-articles\{margin-top:-113px/);
 assert.match(css,/#scl-live\{margin-top:18px/);
 assert.match(css,/\.scl-story-card/);
 assert.match(css,/\.scl-story-media img/);
 assert.match(css,/\.scl-story-share:focus-visible/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(js,/fillArticleRail\(state\.articles\.filter\(matching\),state\.newsError\)/);
 assert.match(js,/latin\(\[item\.name,item\.title,item\.game,item\.summary,item\.category\]/);
});
