'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Exercise the actual click controller used by the native SOCIAL client.
// ESM dependencies are not needed to test feed-tab click handling.
function harness(){
 const app=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/app.js'),'utf8');
 const from=app.indexOf("  const feedTabs=document.getElementById('feed-tabs');");
 const until=app.indexOf("\n  document.querySelectorAll('[data-view]').forEach",from);
 assert.ok(from>=0&&until>from,'feed switch controller exists');
 const controller=app.slice(from,until);
 const buttons=['following','discover','news'].map(feed=>({
  dataset:{feed},active:false,attributes:{},
  classList:{toggle(_className,active){this.button.active=active}},
  setAttribute(name,value){this.attributes[name]=value}
 }));
 buttons.forEach(button=>{button.classList.button=button});
 let click;
 const tabs={contains:b=>buttons.includes(b),addEventListener:(event,handler)=>{
  assert.equal(event,'click');click=handler;
 }};
 const doc={
  getElementById:id=>id==='feed-tabs'?tabs:null,
  querySelectorAll:selector=>selector==='.pulse-tab'?buttons:[]
 };
 const state={view:'home',feed:'discover'};
 const operations=[];
 let releaseNews;
 const delayedNews=new Promise(resolve=>{releaseNews=resolve});
 vm.runInNewContext(controller,{
  document:doc,state,
  setView:(view,title)=>{state.view=view;operations.push(['view',title])},
  loadHome:()=>{operations.push(['home']);return Promise.resolve()},
  loadNewsRss:()=>{operations.push(['news']);return delayedNews},
  revealSocialContent:()=>{},
  console:{warn:()=>{}},
  Promise
 });
 function clickFeed(feed){
  const button=buttons.find(x=>x.dataset.feed===feed);
  let prevented=false;
  click({target:{closest:()=>button},preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  assert.equal(state.feed,feed);
  assert.deepEqual(buttons.filter(b=>b.active).map(b=>b.dataset.feed),[feed]);
  assert.equal(button.attributes['aria-pressed'],'true');
 }
 return {clickFeed,state,operations,releaseNews};
}

test('SOCIAL RSS can be exited through both other tabs while news request is pending',async()=>{
 const app=harness();
 app.clickFeed('news');
 app.clickFeed('discover');
 app.clickFeed('following');
 app.clickFeed('news');
 app.clickFeed('discover');
 app.releaseNews();
 await Promise.resolve();
 assert.equal(app.state.feed,'discover');
 assert.deepEqual(app.operations.filter(x=>x[0]==='news').length,2);
 assert.deepEqual(app.operations.filter(x=>x[0]==='home').length,3);
});
