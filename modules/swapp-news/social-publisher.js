'use strict';
// SWAPP Social Publisher: safe, provider-independent preparation.
// Posting to X is deliberately NOT implemented without an authorized transport.
const {URL}=require('node:url');
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
function clean(s,n){return String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n)}
function preparePost(article,{baseUrl='https://swapp.tv',maxLength=280}={}){
 if(!article||article.status!=='published')throw Error('social_article_not_published');
 if(!SLUG.test(String(article.slug||'')))throw Error('social_invalid_slug');
 const base=new URL(baseUrl);
 if(base.protocol!=='https:'||base.hostname!=='swapp.tv'||base.username||base.password||base.search||base.hash)
  throw Error('social_invalid_origin');
 const url=base.origin+'/actus/'+encodeURIComponent(article.slug);
 const title=clean(article.title,240);
 if(!title)throw Error('social_missing_title');
 const summary=clean(article.summary,500);
 // X counts URLs with its own rules; conservative 23-character URL budget.
 const urlBudget=23,limit=Math.min(280,Math.max(80,Number(maxLength)||280));
 const titleBudget=limit-urlBudget-2;
 const headline=title.length>titleBudget?title.slice(0,titleBudget-1).trimEnd()+'…':title;
 const remaining=limit-urlBudget-headline.length-4;
 const excerpt=remaining>25&&summary?summary.slice(0,remaining).trimEnd():'';
 return {network:'x',articleSlug:article.slug,url,
  text:headline+(excerpt?'\n'+excerpt:'')+'\n'+url,
  media:null, // No image without independently verified permission.
  status:'prepared'};
}
function createSocialPublisher({firestore,baseUrl='https://swapp.tv'}={}){
 if(typeof firestore?.runTransaction!=='function'||typeof firestore?.collection!=='function')
  throw Error('social_storage_required');
 const outbox=firestore.collection('swapp_news_social_outbox');
 const articles=firestore.collection('swapp_news_articles');
 async function recordPublication(tx,article,createdAt){
  const ref=outbox.doc('x-'+article.slug);
  const existing=await tx.get(ref);
  if(existing.exists)return false;
  tx.create(ref,{type:'article.published.x',articleSlug:article.slug,
   status:'pending',createdAt,attempts:0,remotePostId:null,lastError:null});
  return true;
 }
 async function prepare(slug){
  if(!SLUG.test(String(slug||'')))throw Error('social_invalid_slug');
  const snapshot=await articles.doc(slug).get();
  if(!snapshot.exists)throw Error('social_article_missing');
  const article=snapshot.data();
  const post=preparePost(article,{baseUrl});
  const event=await outbox.doc('x-'+slug).get();
  // Never infer remote success from the existence of an outbox event.
  return {...post,queueStatus:event.exists?event.data().status:'not_queued'};
 }
 return {outbox,recordPublication,prepare};
}
module.exports={preparePost,createSocialPublisher};
