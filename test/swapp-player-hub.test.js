'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gameHubs,renderMyGames}=require('../modules/swapp-game-pages');
const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-my-games.js'),'utf8');
const articles=[
 {slug:'first-story',title:'Nouveau dossier Minecraft',summary:'Vraie publication',game:'Minecraft',publishedAt:'2026-10-17T12:00:00Z',status:'published'},
 {slug:'second-story',title:'Minecraft : une mise à jour',summary:'Vraie analyse',game:'Minecraft',publishedAt:'2026-10-16T12:00:00Z',status:'published'},
 {slug:'draft-story',title:'Article interne',summary:'Non publié',game:'Minecraft',publishedAt:'2026-10-18T12:00:00Z',status:'draft'}
];
function client(){
 const handlers=new Map(),store=new Map();
 const digest={children:[],replaceChildren(...children){this.children=children}};
 const summary={textContent:''};
 const links=[
  {dataset:{storyDate:'2026-10-17T12:00:00.000Z',storyTitle:'Nouveau dossier Minecraft'},getAttribute:()=>'/actus/first-story'},
  {dataset:{storyDate:'2026-10-16T12:00:00.000Z',storyTitle:'Minecraft : une mise à jour'},getAttribute:()=>'/actus/second-story'},
  {dataset:{storyDate:'2026-10-18T12:00:00.000Z',storyTitle:'Lien interdit'},getAttribute:()=>'/admin'}
 ];
 const card={dataset:{gameSlug:'minecraft',gameName:'Minecraft'},
  querySelector:q=>q==='[data-my-games-news]'?{hidden:true,textContent:''}:
   q==='[data-my-games-mark-seen]'?{hidden:true}:null,
  querySelectorAll:q=>q==='[data-story-date]'?links:[]};
 const nodes={
  '[data-my-games-digest]':digest,
  '[data-my-games-digest-summary]':summary,
  '[data-my-games-followed]':{replaceChildren(){}},
  '[data-my-games-available]':{replaceChildren(){}},
  '[data-my-games-empty]':{hidden:false},
  '[data-my-games-count]':{textContent:''},
  '[data-my-games-search]':{value:'',addEventListener(){}},
  '[data-my-games-no-match]':{hidden:true}
 };
 const root={querySelector:q=>nodes[q]||null,
  querySelectorAll:q=>q==='[data-swapp-game-card]'?[card]:[]};
 const createElement=tag=>({tag,textContent:'',children:[],setAttribute(){},
  append(...items){this.children.push(...items)}});
 const document={querySelector:q=>q==='[data-swapp-library-root]'?root:null,
  querySelectorAll:()=>[],createElement,
  addEventListener:(type,fn)=>handlers.set(type,fn)};
 const window={addEventListener:(type,fn)=>handlers.set('window:'+type,fn),confirm:()=>true};
 const localStorage={getItem:key=>store.get(key)||null,setItem:(key,v)=>store.set(key,v),
  removeItem:key=>store.delete(key)};
 vm.runInNewContext(source,{document,window,localStorage,Date,Math,Map,Set,JSON,String,Number,Array,Intl},{timeout:1500});
 return {digest,summary,handlers,store};
}
test('Mes jeux exposes published metadata for the private editorial digest',()=>{
 const html=renderMyGames(gameHubs(articles));
 assert.match(html,/id="mes-nouveautes"/);
 assert.match(html,/data-my-games-digest-summary/);
 assert.match(html,/data-my-games-digest/);
 assert.match(html,/data-story-title="Nouveau dossier Minecraft"/);
 assert.match(html,/data-story-title="Minecraft : une mise à jour"/);
 assert.doesNotMatch(html,/draft-story|Article interne/);
 assert.match(html,/name="robots" content="noindex,follow"/);
});
test('highlights show only articles of a deliberately followed game, not unrelated routes',()=>{
 const h=client();
 assert.equal(h.digest.children.length,0);
 const button={dataset:{gameSlug:'minecraft',gameName:'Minecraft'}};
 const click=()=>h.handlers.get('click')({target:{
  closest:selector=>selector==='[data-swapp-follow-game]'?button:null
 }});
 click();
 assert.equal(h.digest.children.length,2);
 assert.equal(h.digest.children[0].children[1].href,'/actus/first-story');
 assert.match(h.summary.textContent,/2 publications/);
 assert.equal(JSON.parse(h.store.get('swapp:followed-games:v1')).games.length,1);
 click();
 assert.equal(h.digest.children.length,0);
});
test('wishlist interest highlights published stories without silently following',()=>{
 const h=client();
 h.handlers.get('window:swapp:wishlist-changed')({detail:{slugs:['minecraft','../unsafe']}});
 assert.equal(h.digest.children.length,2);
 assert.equal(h.digest.children[0].children[0].children[0].textContent,'Dans tes envies');
 assert.equal(h.store.size,0);
 h.handlers.get('window:swapp:wishlist-changed')({detail:{slugs:[]}});
 assert.equal(h.digest.children.length,0);
});
test('store-only wishlist titles fall back to the boutique, never a fake game dossier',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../assets/swapp-wishlist-rewards.js'),'utf8');
 assert.match(code,/hasPublishedHub=\$\$\('\[data-swapp-game-card\]'\)/);
 assert.match(code,/a\.href=hasPublishedHub\?'\/actus\?q='\+encodeURIComponent\(cleanName\(item\.game\)\):'\/boutique'/);
 assert.match(code,/swapp:wishlist-changed/);
});
