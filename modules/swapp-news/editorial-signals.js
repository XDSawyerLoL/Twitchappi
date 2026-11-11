'use strict';
// Fast editorial signals inside /actus, separate from published articles.
// Only explicitly reviewed primary-source notes are labelled "sourcé".
const catalog=require('../../data/swapp-editorial-signals.json');
const TOPICS=new Set(['AI','ROBOTICS','FUTURE','GAMING']);
const PRIMARY_HOSTS=new Set([
 'deepmind.google','developer.nvidia.com','forums.developer.nvidia.com','blogs.nvidia.com',
 'news.panasonic.com','www.esa.int','esa.int','research.google',
 'mistral.ai','huggingface.co','www.nasa.gov','nasa.gov'
]);
const IMAGE_HOSTS=new Set(['lh3.googleusercontent.com','storage.googleapis.com','developer-blogs.nvidia.com','blogs.nvidia.com','news.panasonic.com','global.discourse-cdn.com']);
const HTTPS=url=>{
 try{
  const parsed=new URL(String(url||''));
  return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed:null;
 }catch(_){return null;}
};
const isoDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(new Date(x+'T12:00:00Z').getTime());
function validateEditorial(item){
 if(!/^[a-z][a-z0-9-]{9,109}$/.test(String(item?.id||'')))throw Error('invalid_signal_id');
 if(!Array.isArray(item.topics)||item.topics.length<1||item.topics.some(x=>!TOPICS.has(x)))throw Error('invalid_signal_topics');
 if(!['title','fact','impact','caveat'].every(k=>typeof item[k]==='string'&&item[k].trim().length>=8)||typeof item.sourceName!=='string'||item.sourceName.trim().length<3)throw Error('invalid_signal_content');
 if(item.title.length>200||item.fact.length>500||item.impact.length>350||item.caveat.length>350)throw Error('signal_too_long');
 const source=HTTPS(item.sourceUrl);
 if(!source||!PRIMARY_HOSTS.has(source.hostname.toLowerCase()))throw Error('signal_requires_primary_source');
 if(item.imageUrl!=null){
  const asset=HTTPS(item.imageUrl);
  if(!asset||!IMAGE_HOSTS.has(asset.hostname.toLowerCase()))throw Error('invalid_official_signal_image');
  if(typeof item.imageCredit!=='string'||item.imageCredit.trim().length<8)throw Error('missing_image_credit');
 }
 if(!isoDate(item.sourceDate)||!isoDate(item.reviewedAt))throw Error('invalid_signal_dates');
 if(item.articleSlug!=null&&!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(item.articleSlug))throw Error('invalid_article_slug');
 return true;
}
const dataset=(()=>{
 if(catalog.kind!=='swapp-editorial-signals'||!Array.isArray(catalog.items))throw Error('invalid_editorial_signals_catalog');
 const ids=new Set(),links=new Set();
 return Object.freeze(catalog.items.map(item=>{
  validateEditorial(item);
  if(ids.has(item.id)||links.has(item.sourceUrl))throw Error('duplicate_editorial_signal');
  ids.add(item.id);links.add(item.sourceUrl);
  return Object.freeze({...item,verification:'source_primaire_consultee'});
 }));
})();
function editorialSignals({now=new Date(),topic='',limit=24}={}){
 const clock=now.getTime(),min=clock-45*86400000;
 return dataset.filter(x=>(!topic||x.topics.includes(topic))&&
  new Date(x.sourceDate+'T12:00:00Z').getTime()>=min&&new Date(x.sourceDate+'T12:00:00Z').getTime()<=clock+86400000)
  .sort((a,b)=>b.sourceDate.localeCompare(a.sourceDate)||a.id.localeCompare(b.id))
  .slice(0,Math.min(40,Math.max(1,Number(limit)||24)));
}
// Candidate headlines are never treated as articles or verified briefs.
// They retain an explicit "pending_review" label and original source link.
async function watchCandidates({uri,now=new Date(),limit=18}={}){
 if(!uri)return {status:'unavailable',lastCollectionAt:null,items:[]};
 const mysql=require('mysql2/promise'),pool=mysql.createPool({uri,connectionLimit:1,connectTimeout:3500});
 try{
  const [rows]=await pool.execute(
   'SELECT id,section,source_name,title,source_url,source_published_at,last_seen_at FROM swapp_tech_watch_candidates WHERE source_published_at>=? ORDER BY source_published_at DESC LIMIT 80',
   [new Date(now.getTime()-4*86400000).toISOString().slice(0,19).replace('T',' ')]
  );
  const items=[],seen=new Set();
  let lastCollectionAt=null;
  for(const row of rows){
   if(row.last_seen_at){
    const checked=new Date(row.last_seen_at);
    if(Number.isFinite(checked.getTime())&&(!lastCollectionAt||checked.toISOString()>lastCollectionAt))lastCollectionAt=checked.toISOString();
   }
   const target=HTTPS(row.source_url);
   if(!target||seen.has(target.href)||!row.title||row.title.length>500)continue;
   seen.add(target.href);
   const topic=({IA:'AI',Robotique:'ROBOTICS',FUTURE:'FUTURE'})[row.section];
   if(!topic)continue;
   const published=new Date(row.source_published_at);
   if(!Number.isFinite(published.getTime())||published.getTime()>now.getTime()+86400000)continue;
   items.push({id:String(row.id),topics:[topic],title:String(row.title),sourceName:String(row.source_name||''),sourceUrl:target.href,
    sourceDate:published.toISOString().slice(0,10),verification:'pending_review'});
   if(items.length>=limit)break;
  }
  return {status:'ready',lastCollectionAt,items};
 }catch(e){
  if(e?.code==='ER_NO_SUCH_TABLE')return {status:'not_initialized',lastCollectionAt:null,items:[]};
  return {status:'unavailable',lastCollectionAt:null,items:[]};
 }finally{await pool.end();}
}
function buildSignalResponse(verified,watch){
 const urls=new Set(verified.map(x=>x.sourceUrl));
 return {schema:1,kind:'swapp-signals',updatedAt:catalog.updatedAt,editorial:verified,
  watch:{status:watch.status,lastCollectionAt:watch.lastCollectionAt,
   items:watch.items.filter(x=>!urls.has(x.sourceUrl))},disclaimer:
  'Les notes éditoriales attribuent les faits à leur source primaire. Les titres du radar sont non vérifiés et ne constituent pas des articles.'};
}
module.exports={PRIMARY_HOSTS,IMAGE_HOSTS,validateEditorial,editorialSignals,watchCandidates,buildSignalResponse};
