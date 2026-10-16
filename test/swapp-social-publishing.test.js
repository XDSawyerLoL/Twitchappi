'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function publisherHarness({reject=false,pending=false}={}){
 const app=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/app.js'),'utf8');
 const begin=app.indexOf('async function publishPost(){');
 const end=app.indexOf('\nasync function toggleAction',begin);
 assert.ok(begin>=0&&end>begin,'publisher implementation is present');
 const source=app.slice(begin,end);
 const dom={
  textarea:{value:'Mon message gaming'},
  publish:{disabled:false},count:{textContent:''}
 };
 const state={feed:'discover',replyTo:null,attachment:null};
 const calls=[];
 let release=null;
 const request=pending?new Promise(resolve=>{release=resolve}):null;
 const context={dom,state,requireAuth:()=>true,
  api:async (...args)=>{calls.push(args);if(reject)throw Error('failed');if(request)await request;return {post:{id:'p1'}}},
  clearReply:()=>{},updateMediaPreview:()=>{},
  loadHome:async()=>{calls.push(['refresh']);return true},
  alert:message=>{calls.push(['error',message])},
  errorText:error=>error.message
 };
 vm.runInNewContext(source+'\nthis.publishPost=publishPost;',context);
 return {dom,state,calls,publishPost:context.publishPost,release};
}

test('publishing twice on the same page is possible and preserves chosen feed',async()=>{
 const h=publisherHarness();
 await h.publishPost();
 assert.equal(h.dom.publish.disabled,false);
 assert.equal(h.state.feed,'discover');
 assert.equal(h.dom.textarea.value,'');
 h.dom.textarea.value='Un deuxième message gaming';
 await h.publishPost();
 assert.equal(h.calls.filter(c=>c[0]==='/api/pulse/posts').length,2);
 assert.equal(h.dom.publish.disabled,false);
});

test('a failed publication preserves draft and re-enables the submit action',async()=>{
 const h=publisherHarness({reject:true});
 await h.publishPost();
 assert.equal(h.dom.textarea.value,'Mon message gaming');
 assert.equal(h.dom.publish.disabled,false);
 assert.equal(h.calls.filter(c=>c[0]==='/api/pulse/posts').length,1);
});

test('a second click cannot duplicate an in-flight publication',async()=>{
 const h=publisherHarness({pending:true});
 const first=h.publishPost();
 const second=h.publishPost();
 h.release();
 await Promise.all([first,second]);
 assert.equal(h.calls.filter(c=>c[0]==='/api/pulse/posts').length,1);
 assert.equal(h.dom.publish.disabled,false);
});

test('messenger also disables submit buttons during in-flight writes',()=>{
 const content=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/app.js'),'utf8');
 for(const name of ['new-message','conversation-form']){
  const from=content.indexOf("if(event.target.id==='"+name+"')");
  assert.ok(from>0);
  const code=content.slice(from,from+590);
  assert.ok(code.includes('if(submit?.disabled)return'),'guard '+name);
  assert.ok(code.includes('submit.disabled=true'),'disable '+name);
 }
 assert.ok((content.match(/finally\{if\(submit\)submit\.disabled=false\}/g)||[]).length>=2);
});
