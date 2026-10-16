'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function exploreHarness(fetcher){
 // Evaluate the actual ESM module with its imports replaced by local doubles:
 // no network, DOM engine or account is required for this UI regression test.
 const source=read('assets/swapp-social-native/views.js')
  .replace(/^import .*?;\s*$/gm,'')
  .replace(/\bexport\s+(?=async function|function|const)/g,'');
 const dom={
  viewTitle:{textContent:''},
  feedTabs:{hidden:false},
  composer:{hidden:true},
  welcome:{hidden:true},
  feed:{innerHTML:''}
 };
 const state={view:'home',feed:'discover',user:null};
 const esc=value=>String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
 const load=(new Function('state','dom','document','api','esc','setStatus','errorText',
  source+'\nreturn {loadExplore};'))(
  state,dom,{querySelectorAll:()=>[]},fetcher,esc,
  (title,detail)=>{dom.feed.innerHTML=title+': '+detail},
  error=>String(error?.message||'Search unavailable')
 ).loadExplore;
 return {load,dom,state};
}

test('mobile SOCIAL Explorer offers a search input before a query',async()=>{
 const h=exploreHarness(async()=>({users:[],posts:[]}));
 await h.load();
 assert.equal(h.state.view,'explore');
 assert.match(h.dom.feed.innerHTML,/id="social-mobile-search-form"/);
 assert.match(h.dom.feed.innerHTML,/id="social-mobile-query"/);
 assert.match(h.dom.feed.innerHTML,/type="search"/);
 assert.match(h.dom.feed.innerHTML,/Rechercher/);
});

test('SOCIAL Explorer keeps its mobile input after successful search',async()=>{
 let requested='';
 const h=exploreHarness(async url=>{requested=url;return {users:[],posts:[]}});
 await h.load('Elden Ring');
 assert.match(requested,/\/api\/pulse\/search\?q=Elden%20Ring/);
 assert.match(h.dom.feed.innerHTML,/id="social-mobile-search-form"/);
 assert.match(h.dom.feed.innerHTML,/value="Elden Ring"/);
 assert.match(h.dom.feed.innerHTML,/Aucun résultat/);
});

test('SOCIAL Explorer retains a retry input on search failure',async()=>{
 const h=exploreHarness(async()=>{throw Error('Service hors ligne')});
 await h.load('jeu');
 assert.match(h.dom.feed.innerHTML,/Recherche momentanément indisponible/);
 assert.match(h.dom.feed.innerHTML,/Service hors ligne/);
 assert.match(h.dom.feed.innerHTML,/id="social-mobile-search-form"/);
});

test('SOCIAL Explorer escapes malicious query values in input attributes',async()=>{
 const h=exploreHarness(async()=>({users:[],posts:[]}));
 await h.load('test" onfocus="alert(1)');
 assert.ok(!h.dom.feed.innerHTML.includes('value="test" onfocus="alert(1)"'));
 assert.match(h.dom.feed.innerHTML,/value="test&quot; onfocus=&quot;alert\(1\)"/);
});

test('mobile change-of-view repositions feed without scroll listeners',()=>{
 const source=read('assets/swapp-social-native/app.js');
 assert.match(source,/function revealSocialContent\(\)/);
 assert.match(source,/feed\.scrollIntoView\(\{block:'start',behavior:'auto'\}\)/);
 assert.match(source,/revealSocialContent\(\);/);
 assert.ok(!/addEventListener\(['"]scroll['"]/.test(source.slice(source.indexOf('function revealSocialContent'),source.indexOf('function setReply'))));
 const css=read('assets/swapp-social-native/social-swapp.css');
 assert.match(css,/#pulse-feed\{\s*scroll-margin-top:calc/);
 assert.match(css,/\.pulse-main:has\(#feed-tabs\[hidden\]\) #pulse-feed/);
});
