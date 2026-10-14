'use strict';
const {contentToPlainText,decodeEntities}=require('./justplayer-import-core');
const {extractRichPostBlock}=require('./justplayer-rich-extract');

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
  const rawBody=fromLd?.body || (contentToPlainText(articleBlock).length>220?articleBlock:'') || extractRichPostBlock(html);
  const body=contentToPlainText(rawBody);
  if(body.length<220 || body.split(/\s+/).length<42) return {ok:false,reason:'full_article_body_not_detected',url:item.url};
  const title=decodeEntities(String(fromLd?.title||header||item.title||'').replace(/<[^>]*>/g,'')).trim();
  const publishedAt=fromLd?.publishedAt || attr(html,'property','article:published_time')||item.publishedAt;
  const imageRaw=attr(html,'property','og:image')||attr(html,'name','twitter:image')||'';
  const imageUrl=(()=>{try{
    const u=new URL(imageRaw);
    if(u.protocol!=='https:'||u.username||u.password||/favicon|\/logo[-_.]/i.test(u.pathname))return null;
    return u.href;
  }catch(_){return null;}})();
  return {ok:true,article:{title,body,legacyUrl:item.url,originalPublishedAt:publishedAt,
    author:fromLd?.author||'Rédaction JustPlayer',category:'JustPlayer',
    summary:body.split('\n').find(p=>p.trim().length>85)?.slice(0,320)||body.slice(0,320),
    imageUrl,image:imageUrl?{url:imageUrl,credit:'JustPlayer (image de la publication originale)',rights:'À vérifier avant réutilisation ou copie'}:null,
    sources:[{url:item.url,label:'Article original JustPlayer'}]}};
}
function publicPostUrl(input) {
  try {
    const url=new URL(input);
    if(url.protocol!=='https:' || url.hostname!=='justplayer.fr' || url.port ||
       url.username || url.password || url.search || url.hash ||
       !/^\/supporters\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname))return null;
    return url.href;
  }catch(_){return null;}
}
async function fetchPublicPost(start,{fetchImpl,timeoutMs,maxBytes}) {
  let current=publicPostUrl(start);
  if(!current)throw Error('unexpected_url');
  const visited=new Set();
  for(let hop=0;hop<=3;hop++){
    if(visited.has(current))throw Error('redirect_loop');
    visited.add(current);
    const res=await fetchImpl(current,{method:'GET',redirect:'manual',
      signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'text/html'}});
    if([301,302,303,307,308].includes(res.status)){
      const raw=res.headers?.get('location');
      if(!raw)throw Error('redirect_without_location');
      let next=null;
      try{next=publicPostUrl(new URL(raw,current).href);}catch(_){}
      if(!next)throw Error('redirect_outside_justplayer_posts');
      current=next;
      continue;
    }
    if(!res.ok)throw Error('HTTP '+res.status);
    if(!String(res.headers?.get('content-type')||'text/html').includes('html'))throw Error('unexpected_content_type');
    const html=await res.text();
    if(html.length>maxBytes)throw Error('page_too_large');
    return {html,canonicalUrl:current};
  }
  throw Error('too_many_redirects');
}
async function collectPublicCatalog(catalog,{fetchImpl=global.fetch,timeoutMs=9000,maxBytes=2000000}={}){
  const articles=[],failures=[],excluded=[];
  for(const item of (catalog.items||[])){
    if(item.type!=='post'){excluded.push({url:item.url,reason:'video_requires_separate_adapter'});continue;}
    if(!publicPostUrl(item.url)){
      failures.push({url:item.url,reason:'unexpected_url'});continue;
    }
    try{
      const {html,canonicalUrl}=await fetchPublicPost(item.url,{fetchImpl,timeoutMs,maxBytes});
      const converted=extractPublicPost(html,item);
      if(converted.ok)converted.article.canonicalSourceUrl=canonicalUrl;
      if(converted.ok) articles.push(converted.article);
      else failures.push({url:item.url,reason:converted.reason});
    }catch(e){failures.push({url:item.url,reason:String(e.message||e).slice(0,120)});}
  }
  return {postsChecked:(catalog.items||[]).filter(x=>x.type==='post').length,articles,failures,excluded,complete:false};
}
module.exports={attr,structuredArticle,extractPublicPost,collectPublicCatalog,publicPostUrl,fetchPublicPost};