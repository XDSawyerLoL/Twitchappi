'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('homepage prioritizes the newest illustrated publication and refreshes an existing hero',()=>{
 const script=read('assets/swapp-home-news.js');
 const dateCode=script.slice(script.indexOf(' const articleDate=item=>'),script.indexOf('\n const cover=',script.indexOf(' const articleDate=item=>')));
 assert.ok(dateCode.includes('Date.parse'));
 const articleDate=vm.runInNewContext(dateCode+'\narticleDate',{Date});
 assert.ok(articleDate({publishedAt:'2026-10-22T09:00:00Z'})>articleDate({publishedAt:'2026-10-19T09:00:00Z'}));
 assert.match(script,/\.sort\(\(a,b\)=>articleDate\(b\)-articleDate\(a\)/);
 assert.match(script,/existing\.dataset\.articleSlug===feature\.slug/);
 assert.match(script,/existing\.remove\(\);hero\.querySelector/);
 assert.match(script,/existingSection\.dataset\.swappEditorialChecked/);
 assert.match(script,/setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'/);
 assert.match(read('modules/swapp-news/router.js'),/router\.get\('\/api\/actus'[\s\S]{0,90}Cache-Control','no-store'/);
});

test('SOCIAL quote composer keeps the original post and supports cancellation',()=>{
 const app=read('assets/swapp-social-native/app.js');
 const from=app.indexOf('function setReply(postId,handle)');
 const to=app.indexOf('function safeHttpsUrl(',from);
 assert.ok(from>0&&to>from);
 const state={feed:'news',replyTo:null,quotePostId:null};
 const context={hidden:true,textContent:''},cancel={hidden:true};
 let focused=false,scrolled=false,view='';
 const dom={textarea:{placeholder:'',focus(){focused=true}},composer:{scrollIntoView(){scrolled=true}}};
 const sandbox={state,dom,document:{getElementById(id){return id==='pulse-context'?context:cancel}},
  requireAuth:()=>true,setView(v){view=v}};
 vm.runInNewContext(app.slice(from,to)+'\nthis.setQuote=setQuote;this.clearReply=clearReply;',sandbox);
 sandbox.setQuote('p_original','membre','Contenu du message');
 assert.equal(state.quotePostId,'p_original');
 assert.equal(state.replyTo,null);
 assert.equal(state.feed,'discover');
 assert.equal(view,'home');
 assert.equal(context.hidden,false);
 assert.match(context.textContent,/membre/);
 assert.equal(cancel.hidden,false);
 assert.ok(focused&&scrolled);
 sandbox.clearReply();
 assert.equal(state.quotePostId,null);
 assert.equal(context.hidden,true);
 assert.equal(cancel.hidden,true);
});

test('quoting remains a real post linking to the original and does not leak restricted quotes',()=>{
 const app=read('assets/swapp-social-native/app.js');
 const render=read('assets/swapp-social-native/render.js');
 const views=read('assets/swapp-social-native/views.js');
 const backend=read('modules/swapp-social-native/pulse.mjs');
 assert.match(app,/quotePostId:state\.quotePostId/);
 assert.match(app,/data-action==='quote'/);
 assert.match(render,/data-action="quote"/);
 assert.match(views,/data-news-comment/);
 assert.match(app,/\[data-news-comment\]/);
 assert.match(backend,/quote:q&&visibleTo\(store,q,viewerId\)/);
 assert.match(backend,/if\(quotePostId&&!visibleTo\(store,store\.posts\[quotePostId\],user\.id\)\)/);
});
