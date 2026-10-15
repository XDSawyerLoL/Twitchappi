'use strict';
/*
 * Fourthwall content is a read-only external source. Nothing is published
 * as a native SWAPP article without confidently recovering the full body.
 */
const {collectPublicCatalog}=require('../../tools/justplayer-public-fetch');
const {slugify}=require('./article-core');
function makePublicCatalog({catalog,fetchImpl=globalThis.fetch,clock=Date.now,ttl=30*60*1000}={}){
 const refs=(catalog?.items||[]).filter(x=>x.type==='post'&&typeof x.url==='string').slice(0,65);
 const cache=new Map(),inflight=new Map();
 const bySlug=new Map(refs.map(item=>[slugify('justplayer-'+String(item.id||item.url.split('/').at(-1))),item]));
 function convert(item,article){
   if(!article||typeof article.body!=='string'||article.body.length<220||article.body.split(/\s+/).length<42)return null;
   const title=String(article.title||item.title||'').slice(0,180);
   const key=slugify('justplayer-'+String(item.id||item.url.split('/').at(-1)));
   const image=article.image?.url?{url:article.image.url,credit:article.image.credit||'',rights:article.image.rights||''}:null;
   return {
      slug:key,title,body:article.body,summary:article.summary||article.body.slice(0,300),
      author:/just\\s*player/i.test(String(article.author||''))?'Rédaction SWAPP':(article.author||'Rédaction SWAPP'),
      sourceAuthor:article.author||'Rédaction JustPlayer',category:'Actualités JV',
      game:article.game||item.game||'',image,sources:article.sources||[{url:item.url,label:'Publication d’origine'}],
      legacyUrl:item.url,canonicalSourceUrl:article.canonicalSourceUrl||item.url,
      publishedAt:item.publishedAt,originalPublishedAt:item.publishedAt,
      provenance:'justplayer-public-verified',status:'published',contentSource:'SWAPP'
   };
 }
 async function load(item){
   const key=String(item.id||item.url);
   const existing=cache.get(key);
   if(existing&&existing.expires>clock())return existing.article;
   if(inflight.has(key))return inflight.get(key);
   const promise=collectPublicCatalog({items:[item]},{fetchImpl,timeoutMs:6500,maxBytes:1500000})
     .then(result=>{
       const value=convert(item,result.articles?.[0]||null);
       cache.set(key,{expires:clock()+(value?ttl:2*60*1000),article:value,
         failure:result.failures?.[0]?.reason||null});
       return value;
     })
     .catch(e=>{cache.set(key,{expires:clock()+60000,article:null,failure:String(e.message).slice(0,120)});return null;})
     .finally(()=>inflight.delete(key));
   inflight.set(key,promise);
   return promise;
 }
 let scanInFlight=null;
 async function scanBatch(){
   // All known verified posts must settle before serving /api/actus.
   // Formerly only the first three were awaited, so initial requests
   // exposed 3 stories and later requests 13 despite identical URLs.
   // load() deduplicates in-flight fetches and caches successes/failures.
   if(!scanInFlight){
     scanInFlight=Promise.all(refs.map(load)).finally(()=>{scanInFlight=null;});
   }
   await scanInFlight;
   return articles();
 }
 function articles(){
   const values=refs.map(item=>cache.get(String(item.id||item.url))?.article).filter(Boolean);
   return values.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
 }
 async function get(slug){const item=bySlug.get(slug);if(!item)return null;return load(item);}
 function status(){return {checked:cache.size,verified:articles().length,remaining:refs.length-cache.size,
   errors:[...cache.entries()].filter(([,item])=>item.failure).slice(0,15).map(([key,item])=>({item:key,reason:item.failure}))};}
 return {get,articles,scanBatch,status,allKnown:refs.length};
}
module.exports={makePublicCatalog};
