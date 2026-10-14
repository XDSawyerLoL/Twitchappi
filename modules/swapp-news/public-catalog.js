'use strict';
/*
 * Fourthwall content is a read-only external source. Nothing is published
 * as a native SWAPP article without confidently recovering the full body.
 */
const {collectPublicCatalog}=require('../../tools/justplayer-public-fetch');
const {slugify}=require('./article-core');
function makePublicCatalog({catalog,fetchImpl=global.fetch,clock=Date.now,ttl=30*60*1000,limit=3}={}){
 const refs=(catalog?.items||[]).filter(x=>x.type==='post'&&typeof x.url==='string').slice(0,65);
 const cache=new Map(),inflight=new Map();
 const bySlug=new Map(refs.map(item=>['justplayer-'+String(item.id||item.url.split('/').at(-1)),item]));
 function convert(item,article){
   if(!article||typeof article.body!=='string'||article.body.length<220||article.body.split(/\s+/).length<42)return null;
   const title=String(article.title||item.title||'').slice(0,180);
   const key='justplayer-'+String(item.id||item.url.split('/').at(-1));
   const image=article.image?.url?{url:article.image.url,credit:article.image.credit||'',rights:article.image.rights||''}:null;
   return {
      slug:key,title,body:article.body,summary:article.summary||article.body.slice(0,300),
      author:article.author||'Rédaction JustPlayer',category:'JustPlayer',
      game:article.game||'',image,sources:article.sources||[{url:item.url,label:'JustPlayer'}],
      legacyUrl:item.url,canonicalSourceUrl:article.canonicalSourceUrl||item.url,
      publishedAt:item.publishedAt,originalPublishedAt:item.publishedAt,
      provenance:'justplayer-public-verified',status:'published',contentSource:'JustPlayer'
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
 let background=null;
 async function scanBatch(){
   const first=refs.slice(0,limit);
   await Promise.all(first.map(load));
   if(!background){
     background=(async()=>{for(let i=limit;i<refs.length;i+=2){
       await Promise.all(refs.slice(i,i+2).map(load));
     }})().catch(()=>{}).finally(()=>{background=null;});
   }
   return articles();
 }
 function articles(){
   const values=refs.map(item=>cache.get(String(item.id||item.url))?.article).filter(Boolean);
   return values.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
 }
 async function get(slug){const item=bySlug.get(slug);if(!item)return null;return load(item);}
 function status(){return {checked:cache.size,verified:articles().length,remaining:refs.length-cache.size};}
 return {get,articles,scanBatch,status,allKnown:refs.length};
}
module.exports={makePublicCatalog};
