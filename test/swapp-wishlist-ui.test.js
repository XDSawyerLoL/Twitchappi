'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-wishlist-rewards.js'),'utf8');
function harness({guest=false}={}){
 const listeners={},map=new Map(),rows=[],calls=[];
 const el=()=>({dataset:{},style:{},hidden:false,disabled:false,textContent:'',
  setAttribute(k,v){this[k]=v},append(){},replaceChildren(...items){this.children=items},
  remove(){},parentNode:null});
 const wishlistButton=el();
 wishlistButton.dataset.gameSlug='minecraft';
 wishlistButton.dataset.gameName='Minecraft';
 for(const k of ['[data-swapp-library-root]','[data-swapp-wishlist-results]','[data-swapp-wishlist-count]',
 '[data-swapp-loyalty-status]','[data-swapp-rewards-points]','[data-swapp-rewards-level]',
 '[data-swapp-rewards-next]','[data-swapp-rewards-fill]','[data-swapp-rewards-track]'])
  map.set(k,el());
 const document={
  querySelector:q=>map.get(q)||null,
  querySelectorAll:q=>q==='[data-swapp-wishlist-game]'?[wishlistButton]:[],
  createElement:el,
  addEventListener:(event,fn)=>{listeners[event]=fn}
 };
 const window={addEventListener:(event,fn)=>{listeners['window:'+event]=fn},confirm:()=>true,
  alert:()=>{throw Error('Blocking native dialogs must not be used')}};
 const fetch=async(url,opts={})=>{
  const method=opts.method||'GET',route=String(url).split('/api/swapp/interactions')[1];
  calls.push({method,route});
  if(guest)return {ok:false,status:401,json:async()=>({error:'account_required'})};
  if(route==='/library/wishlist'){
   if(method==='DELETE')rows.splice(0);
   return {ok:true,status:200,json:async()=>({wishlist:rows})};
  }
  if(route==='/rewards/me')return {ok:true,status:200,json:async()=>({
   rewards:{points:30,level:'Éclaireur',nextLevel:'Pionnier',pointsToNext:30}
  })};
  if(route.startsWith('/library/wishlist/')){
   const slug=route.split('/').at(-1);
   if(method==='PUT'&&!rows.some(x=>x.slug===slug))rows.push({
    slug,game:JSON.parse(opts.body).game,addedAt:'2026-10-18T10:00:00.000Z'
   });
   if(method==='DELETE'){const i=rows.findIndex(x=>x.slug===slug);if(i>=0)rows.splice(i,1)}
   return {ok:true,status:200,json:async()=>({wishlist:rows})};
  }
  throw Error('Unexpected URL '+url);
 };
 vm.runInNewContext(script,{window,document,fetch,Set,Array,Math,Number,String,JSON,Promise},{timeout:1000});
 const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 return {listeners,button:wishlistButton,map,rows,calls,tick};
}
test('authoritative XP progress and wish state render only from private API',async()=>{
 const h=harness();await h.tick();
 assert.equal(h.map.get('[data-swapp-rewards-points]').textContent,'30');
 assert.equal(h.map.get('[data-swapp-rewards-level]').textContent,'Éclaireur');
 assert.equal(h.button['aria-pressed'],'false');
 assert.equal(h.rows.length,0);
});
test('adding/removing a wish updates the UI; no fake checkout',async()=>{
 const h=harness();await h.tick();
 const click=()=>h.listeners.click({target:{closest:q=>q==='[data-swapp-wishlist-game]'?h.button:null}});
 click();await h.tick();assert.equal(h.rows.length,1);
 assert.equal(h.button['aria-pressed'],'true');
 assert.doesNotMatch(h.map.get('[data-swapp-loyalty-status]').textContent,/Cannot read properties of null|some/);
 click();await h.tick();assert.equal(h.rows.length,0);
 assert.equal(h.button['aria-pressed'],'false');
 assert.ok(h.calls.some(x=>x.method==='PUT'));
 assert.ok(h.calls.some(x=>x.method==='DELETE'));
});
test('guest sees account-required state without invented points or modal spam',async()=>{
 const h=harness({guest:true});await h.tick();
 assert.equal(h.map.get('[data-swapp-rewards-points]').textContent,'—');
 h.listeners.click({target:{closest:q=>q==='[data-swapp-wishlist-game]'?h.button:null}});
 await h.tick();
 assert.equal(h.rows.length,0);
 assert.match(h.map.get('[data-swapp-loyalty-status]').textContent,/Connecte-toi au compte SWAPP/);
});
