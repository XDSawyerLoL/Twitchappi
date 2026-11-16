'use strict';
// SWAPP's own minimum editorial review bar. These are not Google AdSense
// word-count requirements and never certify originality or accuracy.
const QUALITY_START='2026-11-17T00:00:00.000Z';
const QUALITY_START_MS=Date.parse(QUALITY_START);
function reviewPublication(article){
 const kind=String(article?.contentType||'article').toLowerCase();
 const examined=['article','video','trailer'].includes(kind);
 if(!examined)return {ready:true,issues:[],scope:'other_post'};
 const body=String(article?.body||'').replace(/<[^>]*>/g,' ').replace(/[#*_>\[\]()]/g,' ').replace(/\s+/g,' ').trim();
 const summary=String(article?.summary||'').trim();
 const references=Array.isArray(article?.sources)?article.sources.filter(s=>{
  try{const url=new URL(String(s?.url||''));return url.protocol==='https:'&&!url.username&&!url.password}
  catch{return false}
 }):[];
 const issues=[];
 if(body.length<(kind==='article'?950:400))issues.push('texte_trop_court');
 if(summary.length<80)issues.push('resume_insuffisant');
 if(references.length<1)issues.push('source_https_absente');
 // Automation must not pretend a short teaser with no actual commentary is a
 // substantial page just because it contains a video embed or a brand name.
 return {ready:issues.length===0,issues,scope:kind};
}
function needsQualityGate(article,{production=false}={}){
 if(!production)return false;
 const timestamp=Date.parse(article?.createdAt||article?.publishedAt||'');
 return Number.isFinite(timestamp)&&timestamp>=QUALITY_START_MS;
}
function requirePublicationReview(article,options={}){
 const review=reviewPublication(article);
 if(needsQualityGate(article,options)&&!review.ready){
  const description={'texte_trop_court':'développer l’analyse ou le contexte pratique',
   'resume_insuffisant':'rédiger un résumé informatif',
   'source_https_absente':'citer au moins une source vérifiable HTTPS'};
  throw Error('Article : contrôle éditorial requis avant publication ('+
   review.issues.map(k=>description[k]||k).join('; ')+').');
 }
 return review;
}
module.exports={QUALITY_START,reviewPublication,needsQualityGate,requirePublicationReview};
