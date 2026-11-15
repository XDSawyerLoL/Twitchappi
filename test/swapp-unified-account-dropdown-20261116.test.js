'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const unified=require('../assets/swapp-account-unified');
function element(doc,tag){
 const events=new Map(),attrs={};
 const e={
  ownerDocument:doc,tagName:String(tag).toUpperCase(),className:'',textContent:'',
  title:'',children:[],dataset:{},
  style:{values:{},setProperty(k,v){this.values[k]=v}},
  classList:{added:[],add(...values){this.added.push(...values)},toggle(){},remove(){}},
  setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k]||null,
  addEventListener:(name,fn)=>events.set(name,fn),
  click:()=>events.get('click')?.({stopPropagation(){}}),
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=children},
  querySelectorAll:()=>[],
  querySelector:()=>null
 };
 return e;
}
const fakeDOM=()=>{
 const doc={createElement:null};doc.createElement=tag=>element(doc,tag);
 return {doc,menu:doc.createElement('div')};
};
function allNodes(node){
 return [node,...(node.children||[]).flatMap(allNodes)];
}
test('unified dropdown uses exactly the same action options and no Twitch item on SPA/native',()=>{
 const a=fakeDOM();
 unified.render(a.menu,{signedIn:true,localAccount:true,displayName:'Test utilisateur',onBroadcast:()=>{},onLogout:()=>{}});
 const titles=allNodes(a.menu).filter(n=>n.className==='swapp-account-action').map(n=>n.textContent);
 assert.deepEqual(titles,['Mon espace SWAPP','Diffuser','Se déconnecter']);
 assert.ok(!titles.some(t=>/Twitch/.test(t)));
 assert.ok(allNodes(a.menu).some(n=>n.className==='swapp-account-appearance swapp-native-appearance'));
 assert.ok(allNodes(a.menu).some(n=>n.className==='swapp-native-theme-colors'));
 assert.ok(a.menu.classList.added.includes('swapp-account-unified-menu'));
});
test('anonymous dropdown contains login/account creation rather than Twitch connect',()=>{
 const a=fakeDOM();
 unified.render(a.menu,{signedIn:false});
 const titles=allNodes(a.menu).filter(n=>n.className==='swapp-account-action').map(n=>n.textContent);
 assert.deepEqual(titles,['Se connecter','Créer un compte SWAPP']);
});
test('appearance palette and privacy are shared, explicitly saved only on the device',()=>{
 assert.equal(unified.KEY,'oryon_viewer_accent');
 assert.deepEqual(unified.COLORS.map(x=>x[1]),['#22d3ee','#a855f7','#22c55e','#f59e0b','#f43f5e','#ffffff']);
 const core=read('assets/swapp-account-unified.js');
 assert.match(core,/tastes\.setEnabled\(/);
 assert.match(core,/tastes\.clear\(/);
 assert.match(core,/Recommandations locales/);
 assert.match(core,/localStorage/);
 assert.doesNotMatch(core,/fetch\(|sendBeacon|XMLHttpRequest|\.cookie|indexedDB/);
});
test('the SPA and native route families load the same renderer before their adapters',()=>{
 const spa=read('index.html'),page=read('modules/swapp-page-shell.js');
 const article=read('modules/swapp-news/article-core.js'),native=read('assets/swapp-nav-session.js');
 const spaAdapter=read('assets/swapp-account-menu.js');
 assert.ok(spa.indexOf('swapp-account-unified.js?')<spa.indexOf('index_script.js?'));
 assert.ok(spa.indexOf('swapp-account-menu.js?')<spa.indexOf('index_script.js?'));
 assert.match(page,/swapp-account-unified\.js\?v=/);
 assert.match(page,/swapp-nav-session\.js\?v=/);
 assert.ok(page.indexOf('swapp-account-unified.js?')<page.indexOf('swapp-nav-session.js?'));
 assert.match(article,/swapp-account-unified\.js\?v=/);
 assert.ok(article.indexOf('swapp-account-unified.js?')<article.indexOf('swapp-nav-session.js?'));
 assert.match(native,/shared\.render\(menu/);
 assert.match(native,/swappNativeBound/);
 assert.match(spaAdapter,/shared\.render\(menu/);
 assert.match(spaAdapter,/observer\.observe\(menu,\{childList:true\}\)/);
});
test('Twitch linking and unlinking remain on /compte; header hides OAuth controls',()=>{
 const spa=read('index_script.js');
 const start=spa.indexOf('async function renderSettings(){');
 assert.ok(start>=0);
 const account=spa.slice(start,start+16000);
 assert.match(account,/connectTwitch\(\)/);
 assert.match(account,/logoutTwitch\(\)/);
 const adapter=read('assets/swapp-account-menu.js');
 assert.match(adapter,/\(\?:Connecter\|Déconnecter\) Twitch/);
 assert.doesNotMatch(adapter,/onclick="connectTwitch\(\)"/);
 const core=read('assets/swapp-account-unified.js');
 assert.doesNotMatch(core,/connectTwitch\(|logoutTwitch\(/);
});
test('new menu sources participate in the Hostinger archive and release fingerprint',()=>{
 for(const path of ['tools/swapp-hostinger-package.js','tools/swapp-release.js']){
  const code=read(path);
  for(const asset of ['swapp-account-unified.js','swapp-account-menu.js','swapp-nav-session.js','swapp-native-account.css'])
   assert.ok(code.includes('assets/'+asset),path+' missing '+asset);
 }
 const css=read('assets/swapp-native-account.css');
 assert.match(css,/swapp-account-unified-menu/);
 assert.match(css,/@media\(max-width:570px\)/);
 assert.match(css,/:focus-visible/);
});
