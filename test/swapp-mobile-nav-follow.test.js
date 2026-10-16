'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');

function fixture(options={}){
 const callbacks={};
 const context={
  window:{
   innerWidth:options.width??390,
   location:{origin:'https://swapp.tv',pathname:options.path??'/actus'},
   matchMedia:query=>({matches:query.includes('1080px')?(options.mobile!==false):Boolean(options.reduced)}),
   addEventListener(name,fn){callbacks[name]=fn},
   requestAnimationFrame:callback=>{callback();return 0}
  },
  document:{readyState:'loading',addEventListener(name,fn){callbacks[name]=fn}},
  URL
 };
 vm.runInNewContext(load('assets/swapp-mobile-nav-follow.js'),context);
 const api=context.window.SwappMobileNavFollow;
 const bounds=(left,right)=>({left,right,width:right-left});
 function tab({left,right,href='/actus',active=false}={}){
  return {
   classList:{contains:key=>key==='active'&&active},
   getAttribute:key=>key==='href'?href:key==='aria-current'&&active?'page':null,
   matches:selector=>selector.includes('a')||selector==='a,button',
   getBoundingClientRect:()=>bounds(left,right)
  };
 }
 function nav(tabs,{left=0,right=340}={}){
  const state={children:tabs,scrollLeft:0,scrollCalls:[],
   getBoundingClientRect:()=>bounds(left,right),
   scrollTo(argument){this.scrollLeft=argument.left;this.scrollCalls.push(argument)}
  };
  return state;
 }
 return {api,tab,nav,callbacks,context};
}

test('active tab outside the right edge scrolls into view',()=>{
 const f=fixture();
 const first=f.tab({left:8,right:110,href:'/'});
 const selected=f.tab({left:370,right:474,active:true});
 const n=f.nav([first,selected]);
 assert.equal(f.api.current(n),selected);
 assert.equal(f.api.displacement(n,selected),146);
 assert.equal(f.api.follow(n),true);
 assert.equal(n.scrollLeft,146);
 assert.equal(n.scrollCalls[0].behavior,'smooth');
});

test('already visible tab does not trigger a scroll',()=>{
 const f=fixture();
 const selected=f.tab({left:130,right:240,active:true});
 const n=f.nav([selected]);
 assert.equal(f.api.follow(n),true);
 assert.equal(n.scrollCalls.length,0);
});

test('respects reduced motion and does nothing on desktop',()=>{
 const f=fixture({reduced:true});
 const selected=f.tab({left:355,right:455,active:true});
 const n=f.nav([selected]);
 f.api.follow(n);
 assert.equal(n.scrollCalls[0].behavior,'auto');
 const desktop=fixture({mobile:false});
 assert.equal(desktop.api.follow(desktop.nav([selected])),false);
});

test('falls back to current native page when SPA active class is unavailable',()=>{
 const f=fixture({path:'/actus'});
 const home=f.tab({left:8,right:108,href:'/'});
 const news=f.tab({left:220,right:330,href:'/actus'});
 const n=f.nav([home,news]);
 assert.equal(f.api.current(n),news);
});

test('the mobile follower is included in both navigation shells',()=>{
 const script='/assets/swapp-mobile-nav-follow.js?v=20261016-follow-v1';
 assert.ok(load('index.html').includes(script));
 assert.ok(load('modules/swapp-news/site-shell.js').includes(script));
 const css=load('assets/swapp-mobile-comfort.css');
 assert.match(css,/overflow-x:auto!important/);
});
