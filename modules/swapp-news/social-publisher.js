'use strict';
/* SWAPP Social Publisher: safe preparation. No scraping or X sessions. */
const {URL}=require('node:url');
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
const X_POST=/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/swappstreaming\/status\/([0-9]{8,25})(?:\/?(?:\?.*)?)?$/i;
function clean(s,n){return String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n)}
function articleLink(slug,baseUrl){
 if(!SLUG.test(String(slug||'')))throw Error('social_invalid_slug');
 let base;try{base=new URL(baseUrl)}catch{throw Error('social_invalid_origin')}
 if(base.protocol!=='https:'||base.hostname!=='swapp.tv'||base.port||base.username||base.password||base.search||base.hash)throw Error('social_invalid_origin');
 return base.origin+'/actus/'+slug;
}
function preparePost(article,{baseUrl='https://swapp.tv'}={}){
 if(!article||article.status!=='published')throw Error('social_article_not_published');
 const url=articleLink(article.slug,baseUrl);
 const title=clean(article.title,240),summary=clean(article.summary,500);
 if(!title)throw Error('social_missing_title');
 // Reserve 23 weighted characters for the X t.co URL and extra Unicode slack.
 const budget=245;
 const headline=title.length>budget?title.slice(0,budget-1).trimEnd()+'…':title;
 const rest=budget-headline.length-2;
 let excerpt=rest>35?summary.slice(0,rest).trimEnd():'';
 if(excerpt&&excerpt.length<summary.length)excerpt=excerpt.replace(/[.,;: ]+$/,'')+'…';
 const prefix=headline+(excerpt?'\n'+excerpt:'');
 const intent=new URL('https://x.com/intent/tweet');
 intent.searchParams.set('text',prefix);intent.searchParams.set('url',url);
 return {network:'x',articleSlug:article.slug,url,text:prefix+'\n'+url,
  intentUrl:intent.href,media:null,status:'prepared',automatic:false};
}
function validatePostUrl(raw){
 const value=String(raw||'').trim();
 if(value.length>250||!X_POST.test(value))throw Error('social_invalid_x_post_url');
 const u=new URL(value);u.search='';u.hash='';
 u.hostname='x.com';u.pathname='/swappstreaming/status/'+X_POST.exec(value)[1];
 return u.href;
}
function createSocialPublisher({firestore,baseUrl='https://swapp.tv',clock=()=>new Date().toISOString()}={}){
 if(typeof firestore?.runTransaction!=='function'||typeof firestore?.collection!=='function')throw Error('social_storage_required');
 const outbox=firestore.collection('swapp_news_social_outbox');
 const articles=firestore.collection('swapp_news_articles');
 const eventRef=slug=>outbox.doc('x-'+slug);
 async function recordPublication(tx,article,createdAt){
  const ref=eventRef(article.slug),existing=await tx.get(ref);
  if(existing.exists)return false;
  tx.create(ref,{type:'article.published.x',articleSlug:article.slug,status:'pending',
   createdAt,attempts:0,remotePostId:null,lastError:null});
  return true;
 }
 async function prepare(slug){
  if(!SLUG.test(String(slug||'')))throw Error('social_invalid_slug');
  const snapshot=await articles.doc(slug).get();
  if(!snapshot.exists)throw Error('social_article_missing');
  const article=snapshot.data();
  const post=preparePost(article,{baseUrl});
  const event=await eventRef(slug).get();
  return {...post,title:clean(article.title,240),publishedAt:article.publishedAt||null,
   queueStatus:event.exists?event.data().status:'not_queued',
   reportedPostUrl:event.exists?event.data().reportedPostUrl||null:null};
 }
 async function queue(){
  const [entries,articleSnaps]=await Promise.all([outbox.limit(200).get(),articles.limit(500).get()]);
  const bySlug=new Map(articleSnaps.docs.map(doc=>[doc.id,doc.data()]));
  const result=[];
  for(const doc of entries.docs){
   const e=doc.data(),slug=e.articleSlug;
   if(!SLUG.test(String(slug||'')))continue;
   const article=bySlug.get(slug);
   if(!article||article.status!=='published')continue;
   result.push({slug,title:clean(article.title,180),publishedAt:article.publishedAt||null,
    status:e.status,reportedPostUrl:e.reportedPostUrl||null,createdAt:e.createdAt||null});
  }
  return result.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 }
 async function reportManuallyPublished(slug,rawUrl){
  if(!SLUG.test(String(slug||'')))throw Error('social_invalid_slug');
  const reportedPostUrl=validatePostUrl(rawUrl);
  return firestore.runTransaction(async tx=>{
   const article=await tx.get(articles.doc(slug));
   if(!article.exists||article.data().status!=='published')throw Error('social_article_not_published');
   const ref=eventRef(slug),event=await tx.get(ref);
   if(!event.exists)throw Error('social_event_missing');
   const old=event.data();
   if(old.status==='sent')throw Error('social_already_sent');
   if(old.status==='reported'){
    if(old.reportedPostUrl!==reportedPostUrl)throw Error('social_already_reported');
    return {status:'reported',reportedPostUrl};
   }
   tx.update(ref,{status:'reported',reportedPostUrl,reportedAt:clock(),
    confirmationMethod:'editor_supplied_url_unverified'});
   return {status:'reported',reportedPostUrl};
  });
 }
 return {outbox,recordPublication,prepare,queue,reportManuallyPublished,
  status:()=>({network:'x',handle:'@swappstreaming',automaticPublishing:false,mode:'web_intent',provider:'X',cost:'free_manual'})};
}
module.exports={preparePost,validatePostUrl,createSocialPublisher};
