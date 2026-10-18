'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const client=fs.readFileSync(path.join(__dirname,'../assets/swapp-my-games.js'),'utf8');
function harness(){
 const store=new Map(),listeners=new Map(),handlers=new Map(),calls=[];
 let actor='user1';
 const remote=new Map([['user1',[]],['user2',[]]]);
 const elements=new Map();
 const element=(id)=>{if(!elements.has(id))elements.set(id,{
  hidden:false,disabled:false,textContent:'',dataset:{},value:'',
  replaceChildren(){},addEventListener(type,fn){handlers.set(id+':'+type,fn)},
  setAttribute(){},removeAttribute(){},append(){},remove(){}
 });return elements.get(id)};
 const root={
  querySelector(sel){return element(sel)},
  querySelectorAll(){return[]}
 };
 const doc={
  querySelector(q){if(q==='[data-swapp-library-root]')return root;
   if(q==='[data-my-games-enable-sync]'||q==='[data-my-games-disable-sync]'||q==='[data-my-games-sync-status]'||q==='[data-my-games-status]')return element(q);
   return null;
  },
  querySelectorAll(){return[]},
  addEventListener(type,handler){listeners.set(type,handler)}
 };
 const win={addEventListener(type,fn){listeners.set('window:'+type,fn)},confirm:()=>true};
 const fetch=async(url,opts={})=>{
  const pathname=String(url).split('/api/swapp/interactions/library')[1]||'';
  calls.push({url,method:opts.method||'GET',actor});
  let games=remote.get(actor)||[];
  let result,code=200;
  if(pathname==='/games'&&(!opts.method||opts.method==='GET')){
   result={userId:actor,games};
  }else if(pathname==='/import'&&opts.method==='POST'){
   for(const row of JSON.parse(opts.body).games)if(!games.some(x=>x.slug===row.slug))games.push({
    ...row,followedAt:'2026-10-18T20:00:00.000Z',seenAt:''
   });
   result={userId:actor,games};
  }else if(pathname.startsWith('/games/')){
   const slug=pathname.split('/')[2];
   if(opts.method==='PUT'&&pathname.endsWith('/seen')){
    games=games.map(x=>x.slug===slug?{...x,seenAt:'2026-10-18T21:00:00.000Z'}:x);
   }else if(opts.method==='PUT'){
    if(!games.some(x=>x.slug===slug))games.push({
     slug,game:JSON.parse(opts.body).game,followedAt:'2026-10-18T20:00:00.000Z',seenAt:''
    });
   }else if(opts.method==='DELETE'){
    games=games.filter(x=>x.slug!==slug);
   }else code=405;
   result={games};
  }else if(pathname==='/games'&&opts.method==='DELETE'){
   games=[];result={games};
  }else{code=404;result={error:'not_found'}}
  remote.set(actor,games);
  return {ok:code===200,status:code,json:async()=>result};
 };
 const env={window:win,document:doc,localStorage:{
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)
 },fetch,Date,Math,Map,Set,JSON,String,Number,Array,URL,Blob,setTimeout};
 vm.runInNewContext(client,env,{timeout:1000});
 const click=async(button)=>listeners.get('click')({target:{closest:selector=>
  selector==='[data-swapp-follow-game]'?button:null}});
 return {store,handlers,calls,remote,elements,click,actor:id=>actor=id};
}

test('no cloud calls before voluntary synchronization; preserved local data',async()=>{
 const h=harness();assert.equal(h.calls.length,0);
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 assert.equal(h.calls.length,0);
 assert.equal(JSON.parse(h.store.get('swapp:followed-games:v1')).games.length,1);
});

test('explicit activation merges local follows into the authenticated SWAPP account',async()=>{
 const h=harness();
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 h.handlers.get('[data-my-games-enable-sync]:click')();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(h.remote.get('user1')[0].slug,'minecraft');
 assert.equal(JSON.parse(h.store.get('swapp:follow-sync-account:v1')).id,'user1');
 assert.ok(h.calls.some(x=>x.method==='POST'));
});

test('synchronized follow and removal remain bound to the chosen account',async()=>{
 const h=harness();
 h.handlers.get('[data-my-games-enable-sync]:click')();
 await new Promise(resolve=>setTimeout(resolve,0));
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 assert.equal(h.remote.get('user1').length,1);
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 assert.equal(h.remote.get('user1').length,0);
 h.actor('user2');
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 assert.equal(h.remote.get('user2').length,0,'account switch must not mutate a different account');
});

test('consent can be withdrawn on this device without deleting server follows',async()=>{
 const h=harness();
 await h.click({dataset:{gameSlug:'minecraft',gameName:'Minecraft'}});
 h.handlers.get('[data-my-games-enable-sync]:click')();
 await new Promise(resolve=>setTimeout(resolve,0));
 h.handlers.get('[data-my-games-disable-sync]:click')();
 assert.equal(h.store.has('swapp:follow-sync-account:v1'),false);
 assert.equal(h.remote.get('user1').length,1,'disable must not erase account data');
});
