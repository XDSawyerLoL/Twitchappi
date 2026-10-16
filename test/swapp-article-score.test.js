'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
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
 assert.deepEqual(empty.body,{count:0,average:null,myRating:null,canRate:false});
 const denied=await request('POST','a-good-review',{body:{rating:5}});
 assert.equal(denied.statusCode,401);
 const first=await request('POST','a-good-review',{body:{rating:5},user:'alice'});
 assert.deepEqual(first.body,{count:1,average:5,myRating:5,canRate:true});
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

test('SWAPP Score and favorites load in native and SPA article layouts',()=>{
 const root=path.join(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('index.html'),/swapp-article-feedback\.js\?v=20261016-score-v1/);
 assert.match(read('modules/swapp-news/site-shell.js'),/swapp-article-feedback\.js\?v=20261016-score-v1/);
 assert.match(read('modules/swapp-news/native-pages.js'),/data-swapp-article-slug/);
 assert.match(read('assets/swapp-actus-app.js'),/SwappArticleFeedback\?\.mountArticle/);
 assert.match(read('assets/swapp-actus-app.js'),/SwappArticleFeedback\?\.mountList/);
});
