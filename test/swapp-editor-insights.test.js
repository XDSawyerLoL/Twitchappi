'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarizeArticleInsights,registerEditorInsights}=require('../modules/swapp-news/editor-insights');

test('Studio insights: only published native articles, with weighted aggregates',()=>{
 const result=summarizeArticleInsights({
  published:[{slug:'first-story',title:'Premier article',game:'Jeu X'},
   {slug:'second-story',title:'Deuxième article'},{slug:'third-story',title:'Sans note'}],
  scores:[
   {slug:'first-story',count:2,sum:9,reasons:{useful:2,sourced:1,engaging:1}},
   {slug:'second-story',count:1,sum:3,reasons:{useful:1,sourced:0,engaging:0}},
   {slug:'unpublished-story',count:99,sum:495,reasons:{useful:99}}
  ]
 });
 assert.equal(result.totalVotes,3);
 assert.equal(result.ratedArticles,2);
 assert.equal(result.publishedArticles,3);
 assert.equal(result.average,4);
 assert.deepEqual(result.reasons,{useful:3,sourced:1,engaging:1});
 assert.deepEqual(result.articles.map(a=>a.slug),['first-story','second-story','third-story']);
 assert.equal(result.articles[2].average,null);
 assert.equal(result.articles.some(a=>a.slug==='unpublished-story'),false);
});

test('Studio insights: corrupted counters are ignored and feedback totals bounded',()=>{
 const r=summarizeArticleInsights({published:[{slug:'valid-story',title:'Article'}],
  scores:[{slug:'valid-story',count:1,sum:500,reasons:{useful:100,sourced:-1,engaging:3}}]});
 assert.equal(r.totalVotes,0);
 assert.equal(r.articles[0].average,null);
 const safe=summarizeArticleInsights({published:[{slug:'valid-story',title:'Article'}],
  scores:[{slug:'valid-story',count:2,sum:8,reasons:{useful:100,sourced:-1,engaging:1}}]});
 assert.deepEqual(safe.reasons,{useful:2,sourced:0,engaging:1});
});

test('Studio insights API: admin only; never reads or returns individual voter records',async()=>{
 let voterReads=0;
 const published=[
  {slug:'first-story',title:'Article publié',status:'published',game:'Jeu X'},
  {slug:'unpublished-story',title:'Brouillon',status:'draft'}
 ];
 const scoreDocs=[
  {id:'first-story',data:()=>({count:2,sum:9,reasons:{useful:2}})},
  {id:'unpublished-story',data:()=>({count:4,sum:20,reasons:{sourced:4}})}
 ];
 const firestore={collection:name=>{
  if(name==='swapp_article_votes'){voterReads++;throw Error('Sensitive votes must not be read')}
  if(name==='swapp_article_scores')return {limit:()=>({get:async()=>({docs:scoreDocs})})};
  throw Error('Unexpected collection '+name);
 }};
 const articles={where:(field,op,value)=>{
  assert.equal(field,'status');assert.equal(op,'==');assert.equal(value,'published');
  return {limit:()=>({get:async()=>({docs:published.filter(x=>x.status==='published').map(x=>({data:()=>x}))})})};
 }};
 const routes=[];
 const router={get:(name,...middleware)=>routes.push({name,middleware})};
 const editor=[(req,res,next)=>req.authorized?next():res.status(403).json({error:'forbidden'})];
 registerEditorInsights({router,firestore,articles,editor});
 const route=routes.find(r=>r.name==='/api/editor/actus/insights');
 assert.ok(route);
 async function invoke(authorized){
  const req={authorized},res={statusCode:200,headers:{},payload:null,
   set(name,value){this.headers[name]=value;return this},
   status(value){this.statusCode=value;return this},
   json(value){this.payload=value;return this}};
  async function nextAt(i){
   const fn=route.middleware[i];if(!fn)return;
   let called=false,error;
   await fn(req,res,e=>{called=true;error=e});
   if(error)throw error;
   if(called)await nextAt(i+1);
  }
  await nextAt(0);
  return res;
 }
 const denied=await invoke(false);
 assert.equal(denied.statusCode,403);
 const allowed=await invoke(true);
 assert.equal(allowed.statusCode,200);
 assert.equal(allowed.headers['Cache-Control'],'private, no-store');
 assert.equal(allowed.payload.totalVotes,2);
 assert.equal(allowed.payload.articles.length,1);
 assert.equal(allowed.payload.articles[0].slug,'first-story');
 assert.equal(allowed.payload.scope,'published-native');
 assert.equal(voterReads,0);
 assert.doesNotMatch(JSON.stringify(allowed.payload),/voter|userId|identity|ipAddress/i);
});

test('Studio contains responsive insights view and deferred script',()=>{
 const root=path.join(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const ui=read('modules/swapp-news/editor-ui.js');
 assert.match(ui,/data-go="insights"/);
 assert.match(ui,/data-view="insights"/);
 assert.match(ui,/swapp-studio-insights\.js\?v=20261016-insights-1/);
 assert.match(ui,/swapp-studio-insights\.css\?v=20261016-insights-1/);
 const js=read('assets/swapp-studio-insights.js');
 assert.match(js,/api\/editor\/actus\/insights/);
 assert.match(js,/textContent/);
});
