'use strict';
// Studio-only summary from aggregate documents. Never reads individual vote records.
const CODES=Object.freeze(['useful','sourced','engaging']);
const valid=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
const positive=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const zero=()=>({useful:0,sourced:0,engaging:0});

function summarizeArticleInsights({published=[],scores=[],limit=500}={}){
 const known=new Map();
 for(const item of published){
  if(!valid(item?.slug)||known.has(item.slug))continue;
  known.set(item.slug,{
   slug:item.slug,title:String(item.title||'Article SWAPP').slice(0,180),
   game:String(item.game||'').slice(0,100)
  });
 }
 const totals=zero(),rows=[];
 let votes=0,weightedSum=0,rated=0;
 const bySlug=new Map();
 for(const item of scores){
  if(!valid(item?.slug)||!known.has(item.slug)||bySlug.has(item.slug))continue;
  bySlug.set(item.slug,item);
 }
 for(const [slug,item] of known){
  const data=bySlug.get(slug)||{};
  const count=positive(data.count),sum=positive(data.sum);
  const validCount=count>0 && sum>=count && sum<=count*5;
  const used=validCount?count:0,scoreSum=validCount?sum:0;
  const reasons=zero();
  if(used)for(const code of CODES)reasons[code]=Math.min(used,positive(data.reasons?.[code]));
  const average=used?Math.round(scoreSum/used*10)/10:null;
  if(used){votes+=used;weightedSum+=scoreSum;rated++}
  for(const code of CODES)totals[code]+=reasons[code];
  rows.push({...item,count:used,average,reasons});
 }
 rows.sort((a,b)=>b.count-a.count||(b.average||0)-(a.average||0)||a.title.localeCompare(b.title,'fr'));
 return {
  totalVotes:votes,ratedArticles:rated,publishedArticles:known.size,
  average:votes?Math.round(weightedSum/votes*10)/10:null,reasons:totals,
  articles:rows.slice(0,limit)
 };
}

function registerEditorInsights({router,firestore,articles,editor}){
 if(!Array.isArray(editor)||!editor.length)throw Error('Editor guard required');
 const LIMIT=500;
 router.get('/api/editor/actus/insights',...editor,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   // The displayed titles come only from published articles or already recovered public articles.
   // Never scan external publishers or return a withdrawn/draft article.
   const [publicSnap,scoreSnap]=await Promise.all([
    articles.where('status','==','published').limit(LIMIT).get(),
    firestore.collection('swapp_article_scores').limit(LIMIT).get()
   ]);
   const published=publicSnap.docs.map(d=>d.data());
   // Native published catalogue only; recovered legacy articles are excluded until migrated.
   const summary=summarizeArticleInsights({
    published,
    scores:scoreSnap.docs.map(d=>({slug:d.id,...d.data()})),
    limit:LIMIT
   });
   return res.json({...summary,partial:publicSnap.docs.length>=LIMIT||scoreSnap.docs.length>=LIMIT,
    scope:'published-native'});
  }catch(error){next(error)}
 });
}
module.exports={summarizeArticleInsights,registerEditorInsights};
