'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {registerArticleScores}=require('../modules/swapp-news/article-scores');

function fixture(){
 const rows=new Map();
 const snap=key=>({exists:rows.has(key),data:()=>structuredClone(rows.get(key))});
 const ref=key=>({key,get:async()=>snap(key)});
 const firestore={
  collection:name=>({doc:id=>ref(name+'/'+id)}),
  async runTransaction(callback){
   const updates=[];
   const result=await callback({get:async doc=>snap(doc.key),set:(doc,data)=>updates.push([doc.key,structuredClone(data)])});
   for(const [key,value] of updates)rows.set(key,value);
   return result;
  }
 };
 const routes=[];
 const router={get:(name,...handlers)=>routes.push(['GET',name,handlers]),post:(name,...handlers)=>routes.push(['POST',name,handlers])};
 const available=(_req,_res,next)=>next();
 registerArticleScores({router,firestore,articles:firestore.collection('swapp_news_articles'),
  publicNews:{get:async()=>null},available,nativeSlug:({slug})=>slug.replace(/^justplayer-/,'')});
 rows.set('swapp_news_articles/a-good-review',{status:'published'});
 rows.set('swapp_news_articles/draft-review',{status:'draft'});
 async function request(method,slug,{body={},user=null,origin='https://swapp.tv'}={}){
  const matched=routes.find(r=>r[0]===method&&r[1]==='/api/actus/:slug/score');
  assert.ok(matched);
  const req={params:{slug},body,headers:origin?{origin}:{},session:user?{oryonUser:{id:user}}:{}};
  const res={statusCode:200,headers:{},body:null,
   set(k,v){this.headers[k]=v;return this},
   status(x){this.statusCode=x;return this},
   json(x){this.body=x;return this}};
  async function next(i){
   const fn=matched[2][i];if(!fn)return;
   let continued=false,error;
   await fn(req,res,e=>{continued=true;error=e});
   if(error)throw error;
   if(continued)await next(i+1);
  }
  await next(0);
  return res;
 }
 return {rows,request};
}

test('SWAPP Score: authenticated votes are persistent and changeable, not duplicated',async()=>{
 const {request}=fixture();
 const empty=await request('GET','a-good-review');
 assert.deepEqual(empty.body,{count:0,average:null,readerRecognition:false,reasons:{useful:0,sourced:0,engaging:0},myRating:null,myReasons:[],canRate:false});
 const denied=await request('POST','a-good-review',{body:{rating:5}});
 assert.equal(denied.statusCode,401);
 const first=await request('POST','a-good-review',{body:{rating:5},user:'alice'});
 assert.deepEqual(first.body,{count:1,average:5,readerRecognition:false,reasons:{useful:0,sourced:0,engaging:0},myRating:5,myReasons:[],canRate:true});
 const same=await request('POST','a-good-review',{body:{rating:5},user:'alice'});
 assert.equal(same.body.count,1);
 const edited=await request('POST','a-good-review',{body:{rating:3},user:'alice'});
 assert.equal(edited.body.count,1);assert.equal(edited.body.average,3);
 const another=await request('POST','a-good-review',{body:{rating:5},user:'bob'});
 assert.equal(another.body.count,2);assert.equal(another.body.average,4);
 const personal=await request('GET','a-good-review',{user:'alice'});
 assert.equal(personal.body.myRating,3);
 const publicScore=await request('GET','a-good-review');
 assert.equal(publicScore.body.myRating,null);assert.equal(publicScore.body.average,4);
});

test('SWAPP Score: validate CSRF origin, article publication and range',async()=>{
 const {request,rows}=fixture();
 assert.equal((await request('POST','a-good-review',{user:'alice',body:{rating:4},origin:'https://evil.example'})).statusCode,403);
 assert.equal((await request('POST','a-good-review',{user:'alice',body:{rating:4},origin:null})).statusCode,403);
 assert.equal((await request('POST','a-good-review',{user:'alice',body:{rating:0}})).statusCode,400);
 assert.equal((await request('POST','a-good-review',{user:'alice',body:{rating:2.5}})).statusCode,400);
 assert.equal((await request('POST','draft-review',{user:'alice',body:{rating:5}})).statusCode,404);
 assert.equal((await request('GET','missing-review')).statusCode,404);
 assert.equal([...rows.keys()].filter(k=>k.startsWith('swapp_article_votes/')).length,0);
});

test('SWAPP Score: qualitative choices are optional, replaceable and counted once',async()=>{
 const {request,rows}=fixture();
 const initial=await request('POST','a-good-review',{body:{rating:5,reasons:['useful','sourced']},user:'alice'});
 assert.deepEqual(initial.body.myReasons,['useful','sourced']);
 assert.deepEqual(initial.body.reasons,{useful:1,sourced:1,engaging:0});
 const repeated=await request('POST','a-good-review',{body:{rating:5,reasons:['sourced','useful']},user:'alice'});
 assert.equal(repeated.body.count,1);
 assert.deepEqual(repeated.body.reasons,{useful:1,sourced:1,engaging:0});
 const second=await request('POST','a-good-review',{body:{rating:4,reasons:['useful','engaging']},user:'bob'});
 assert.deepEqual(second.body.reasons,{useful:2,sourced:1,engaging:1});
 const changed=await request('POST','a-good-review',{body:{rating:5,reasons:['sourced']},user:'alice'});
 assert.equal(changed.body.count,2);
 assert.deepEqual(changed.body.reasons,{useful:1,sourced:1,engaging:1});
 assert.deepEqual(changed.body.myReasons,['sourced']);
 const ratingOnly=await request('POST','a-good-review',{body:{rating:3},user:'alice'});
 assert.deepEqual(ratingOnly.body.myReasons,['sourced']);
 assert.equal(ratingOnly.body.average,3.5);
 const cleared=await request('POST','a-good-review',{body:{rating:3,reasons:[]},user:'alice'});
 assert.deepEqual(cleared.body.myReasons,[]);
 assert.deepEqual(cleared.body.reasons,{useful:1,sourced:0,engaging:1});
 const publicResponse=await request('GET','a-good-review');
 assert.deepEqual(publicResponse.body.myReasons,[]);
 assert.deepEqual(publicResponse.body.reasons,{useful:1,sourced:0,engaging:1});
 assert.equal([...rows.keys()].filter(k=>k.startsWith('swapp_article_votes/')).length,2);
});

test('SWAPP Score: malformed or unknown feedback reasons are rejected without writes',async()=>{
 const {request,rows}=fixture();
 const invalid=[null,'useful',['unknown'],['useful','useful'],['useful',1],['useful','sourced','engaging','extra']];
 for(const reasons of invalid){
  const response=await request('POST','a-good-review',{body:{rating:5,reasons},user:'alice'});
  assert.equal(response.statusCode,400);
 }
 assert.equal([...rows.keys()].filter(k=>k.startsWith('swapp_article_votes/')).length,0);
});

test('SWAPP Score and favorites load in native and SPA article layouts',()=>{
 const root=path.join(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('index.html'),/swapp-article-feedback\.js\?v=20261016-score-header-4/);
 assert.match(read('modules/swapp-news/site-shell.js'),/swapp-article-feedback\.js\?v=20261016-score-header-4/);
 assert.match(read('modules/swapp-news/native-pages.js'),/data-swapp-article-slug/);
 assert.match(read('assets/swapp-actus-app.js'),/SwappArticleFeedback\?\.mountArticle/);
 assert.match(read('assets/swapp-actus-app.js'),/SwappArticleFeedback\?\.mountList/);
});

test('reader recognition uses exact totals, not rounded public average',async()=>{
 const high=fixture();
 let result;
 for(let i=0;i<10;i++){
  result=await high.request('POST','a-good-review',{
   body:{rating:i<5?5:4},user:'high-'+i
  });
 }
 assert.equal(result.count,10);
 assert.equal(result.average,4.5);
 assert.equal(result.readerRecognition,true);
 const rounded=fixture();
 for(let i=0;i<11;i++){
  result=await rounded.request('POST','a-good-review',{
   body:{rating:i<5?5:4},user:'rounded-'+i
  });
 }
 assert.equal(result.count,11);
 assert.equal(result.average,4.5); // 49 / 11 is only 4.4545...
 assert.equal(result.readerRecognition,false);
 const few=fixture();
 for(let i=0;i<9;i++){
  result=await few.request('POST','a-good-review',{
   body:{rating:5},user:'few-'+i
  });
 }
 assert.equal(result.readerRecognition,false);
});

test('article score teaser is shared, linked to real votes and fails closed',()=>{
 const root=path.join(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const src=read('assets/swapp-article-feedback.js');
 const context={
  window:{},document:{readyState:'loading',addEventListener(){}}
 };
 vm.runInNewContext(src,context);
 const featured=context.window.SwappArticleFeedback.featuredScore;
 assert.equal(featured({count:10,average:4.5,readerRecognition:true}),true);
 assert.equal(featured({count:11,average:4.5,readerRecognition:false}),false);
 assert.equal(featured({count:9,average:5,readerRecognition:true}),false);
 assert.equal(featured({count:10,average:4.5}),false);
 assert.equal(featured({count:10,average:null,readerRecognition:true}),false);
 assert.match(src,/id='swapp-article-score'/);
 assert.match(src,/aria-label/);
 assert.match(src,/scoreLink\.textContent/);
 assert.match(src,/recognition\.hidden=!featuredScore\(current\)/);
 const css=read('assets/swapp-article-feedback.css');
 assert.match(css,/scroll-margin-top/);
 assert.match(css,/max-width:620px/);
});
