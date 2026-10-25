'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','assets/swapp-channel-follow.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const style=fs.readFileSync(path.join(__dirname,'..','assets/swapp-channel-polish.css'),'utf8');
test('server offers read-only follow state and idempotent unfollow without charging',()=>{
 assert.match(server,/app\.get\('\/api\/oryon\/follow\/:login'/);
 assert.match(server,/app\.post\('\/api\/oryon\/follow\/:login'/);
 assert.match(server,/app\.delete\('\/api\/oryon\/follow\/:login'/);
 assert.match(server,/authenticated:!!viewer,following:isFollowing/);
 assert.match(server,/viewer\.following=viewer\.following\.filter/);
 assert.match(server,/creator\.followers_count=Math\.max\(0,Number\(creator\.followers_count\|\|0\)-1\)/);
 assert.match(server,/Limite de 500 chaînes suivies atteinte/);
 assert.doesNotMatch(source,/stripe|checkout|subscription|PushManager/i);
});
test('the follow button is a single inline action; its state is server-provided',()=>{
 new Function(source);
 assert.match(source,/button\.removeAttribute\('onclick'\)/);
 assert.match(source,/request\(path\)/);
 assert.match(source,/request\(path,following\?'DELETE':'POST'\)/);
 assert.match(source,/aria-pressed/);
 assert.match(html,/swapp-channel-follow\.js\?v=20261025-follow-toggle-v1/);
 assert.match(style,/swapp-channel-follow-btn\[aria-pressed="true"\]/);
});
function harness(authenticated){
 const requests=[],handlers={},visited=[];
 const button={dataset:{},isConnected:true,disabled:false,style:{},
  classList:{add(){}},removeAttribute(){},setAttribute(){},
  addEventListener(type,handler){handlers[type]=handler},textContent:'Suivre'};
 const page={querySelector(selector){return selector.includes('button[onclick*')?button:null},dataset:{}};
 const root={classList:{contains:()=>true},querySelectorAll:()=>[page]};
 const state={channelProfile:{login:'creator-test'}};
 const context={
  state,console,location:{pathname:'/creator-test'},
  window:{setView:name=>visited.push(name),toast:()=>{}},
  document:{getElementById:()=>root},
  requestAnimationFrame:fn=>fn(),
  MutationObserver:class{observe(){}},
  fetch:async(url,options)=>{
   requests.push({url,method:options.method});
   const data=options.method==='GET'?{success:true,authenticated,following:false}:
     options.method==='POST'?{success:true,is_following:true,following:['creator-test']}:
     {success:true,following:false};
   return {ok:true,status:200,json:async()=>data};
  }
 };
 vm.runInNewContext(source,context);
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 return {requests,handlers,button,visited,flush};
}
test('free follow and unfollow use exactly one real HTTP action each',async()=>{
 const t=harness(true);
 await t.flush();
 assert.equal(t.button.disabled,false);
 assert.equal(t.button.textContent,'Suivre');
 await t.handlers.click();
 assert.equal(t.button.textContent,'✓ Suivi');
 await t.handlers.click();
 assert.equal(t.button.textContent,'Suivre');
 assert.deepEqual(t.requests.map(x=>x.method),['GET','POST','DELETE']);
});
test('an unauthenticated viewer goes to the existing SWAPP account route',async()=>{
 const t=harness(false);
 await t.flush();
 await t.handlers.click();
 assert.deepEqual(t.visited,['settings']);
 assert.deepEqual(t.requests.map(x=>x.method),['GET']);
});
