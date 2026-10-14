'use strict';
const {contentToPlainText,decodeEntities}=require('./justplayer-import-core');

function attr(html, selector, value) {
  const elements=String(html).match(/<meta\b[^>]*>/gi)||[];
  for(const tag of elements){
    const fields=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
    if(fields[selector]===value)return decodeEntities(fields.content||'');
  }
  return null;
}
function structuredArticle(html){
  const scripts=[...String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for(const match of scripts){try{
    const root=JSON.parse(match[1].replace(/&quot;/g,'"'));
    const items=Array.isArray(root)?root:(root['@graph']||[root]);
    for(const item of items)if(/Article|Posting/i.test(String(item?.['@type']||'')) && String(item.articleBody||'').length>40)return {title:item.headline,body:String(item.articleBody),publishedAt:item.datePublished,author:typeof item.author==='string'?item.author:item.author?.name};
  }catch(_){}}
  return null;
}
function extractPublicPost(html,item) {
  const fromLd=structuredArticle(html);
  const header=attr(html,'property','og:title')||String(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').replace(/<[^>]*>/g,'');
  // A confident article/container is required: do not silently ingest the whole page, login prompts or menus.
  const articleBlock=String(html).match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || '';
  const rawBody=fromLd?.body || articleBlock;
  const body=contentToPlainText(rawBody);
  if(body.length<80) return {ok:false,reason:'full_article_body_not_detected',url:item.url};
  const title=decodeEntities(String(fromLd?.title||header||item.title||'').replace(/<[^>]*>/g,'')).trim();
  const publishedAt=fromLd?.publishedAt || attr(html,'property','article:published_time')||item.publishedAt;
  return {ok:true,article:{title,body,legacyUrl:item.url,originalPublishedAt:publishedAt,
    author:fromLd?.author||'Rédaction JustPlayer',category:'JustPlayer',
    summary:body.slice(0,320),sources:[{url:item.url,label:'Article original JustPlayer'}]}};
}
async function collectPublicCatalog(catalog,{fetchImpl=global.fetch,timeoutMs=9000,maxBytes=2000000}={}){
  const articles=[],failures=[],excluded=[];
  for(const item of (catalog.items||[])){
    if(item.type!=='post'){excluded.push({url:item.url,reason:'video_requires_separate_adapter'});continue;}
    if(!/^https:\/\/justplayer\.fr\/supporters\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.url)){
      failures.push({url:item.url,reason:'unexpected_url'});continue;
    }
    try{
      const res=await fetchImpl(item.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Accept':'text/html'}});
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      if(!String(res.headers?.get('content-type')||'text/html').includes('html'))throw Error('unexpected_content_type');
      const html=await res.text();
      if(html.length>maxBytes)throw Error('page_too_large');
      const converted=extractPublicPost(html,item);
      if(converted.ok) articles.push(converted.article);
      else failures.push({url:item.url,reason:converted.reason});
    }catch(e){failures.push({url:item.url,reason:String(e.message||e).slice(0,120)});}
  }
  return {postsChecked:(catalog.items||[]).filter(x=>x.type==='post').length,articles,failures,excluded,complete:false};
}
module.exports={attr,structuredArticle,extractPublicPost,collectPublicCatalog};