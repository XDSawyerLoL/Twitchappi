'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('SOCIAL editorial rail is scoped to /social and wired once',()=>{
 const html=read('assets/swapp-social-native/social-body.html');
 const hub=read('modules/swapp-hubs.js');
 const css=read('assets/swapp-social-refinement.css');
 assert.equal((html.match(/id="swapp-social-reading"/g)||[]).length,1);
 assert.equal((html.match(/id="swapp-social-reading-stories"/g)||[]).length,1);
 assert.match(hub,/swapp-social-reading\.js\?v=/);
 assert.match(hub,/swapp-social-refinement\.css\?v=/);
 assert.match(css,/\.swapp-social-viewport \.swapp-social-reading-item/);
 assert.match(css,/\.swapp-social-viewport \.pulse-profile-hero/);
 assert.match(css,/\.swapp-social-viewport \.pulse-message\.mine/);
 assert.match(css,/@media\(max-width:920px\)/);
 assert.match(html,/for="pulse-text">Un jeu, un avis, une découverte/);
});

function dom(){
 const make=tag=>({tag,hidden:true,children:[],append(...x){this.children.push(...x)},
  replaceChildren(f){this.children=f.children},addEventListener(){},remove(){this.removed=true},
  setAttribute(){},scrollBy(){},querySelector(){return null},clientWidth:600,scrollLeft:0,scrollWidth:900});
 const section=make('section'),list=make('div'),stories=make('section'),track=make('div');
 const prev=make('button'),next=make('button'),tabs=make('nav');
 tabs.hidden=false;
 const ids={'swapp-social-reading':section,'swapp-social-reading-stories':list,
  'swapp-social-stories':stories,'swapp-social-stories-track':track,
  'swapp-social-story-prev':prev,'swapp-social-story-next':next,'feed-tabs':tabs};
 return {section,list,stories,track,
  document:{getElementById:id=>ids[id]||null,
   createElement:make,createDocumentFragment:()=>make('fragment')}};
}
async function mount(articles){
 const nodes=dom();
 const fetch=async()=>({ok:true,json:async()=>({articles})});
 vm.runInNewContext(read('assets/swapp-social-reading.js'),{
  document:nodes.document,fetch,location:{origin:'https://swapp.tv'},URL,Intl,Date,
  window:{addEventListener(){},requestAnimationFrame(callback){callback()},matchMedia(){return{matches:false}}}
 });
 // Hydration is intentionally asynchronous, and must not block the rest of SOCIAL.
 await new Promise(resolve=>setImmediate(resolve));
 return nodes;
}
test('discovery only displays real safe SWAPP links with images from the API',async()=>{
 const {section,list}=await mount([
  {slug:'nouveau-jeu-2026',title:'Une actualité publiée',publishedAt:'2026-10-16T12:00:00Z',imageUrl:'https://example.org/image.jpg'},
  {slug:'../../bad',title:'Lien interdit',publishedAt:'2026-10-16T13:00:00Z'},
  {slug:'second-article',title:'Un autre article',publishedAt:'2026-10-15T12:00:00Z',image:{url:'https://example.org/second.jpg'}}
 ]);
 assert.equal(section.hidden,false);
 assert.equal(list.children.length,2);
 assert.equal(list.children[0].href,'/actus/nouveau-jeu-2026');
 assert.equal(list.children[0].children[0].children[0].tag,'img');
 assert.equal(list.children[1].href,'/actus/second-article');
});
test('SOCIAL leaves the rail hidden when there are no published articles',async()=>{
 const {section,list}=await mount([]);
 assert.equal(section.hidden,true);
 assert.equal(list.children.length,0);
});

test('news stories are real SWAPP article links, never generated from empty images',async()=>{
 const {stories,track}=await mount([
  {slug:'article-avec-image',title:'Actualité illustrée',imageUrl:'https://example.org/illustration.jpg'},
  {slug:'article-sans-image',title:'Article sans miniature'},
  {slug:'invalid-slug!',title:'Article non valide',imageUrl:'https://example.org/none.jpg'}
 ]);
 assert.equal(stories.hidden,false);
 assert.equal(track.children.length,1);
 assert.equal(track.children[0].href,'/actus/article-avec-image');
 assert.equal(track.children[0].children[0].tag,'img');
});
