'use strict';

const {assertArticle,isLegacyJustPlayerUrl} = require('../modules/swapp-news/article-core');

function decodeEntities(text) {
  return String(text || '').replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (whole, key) => {
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',eacute:'é',egrave:'è',agrave:'à',uuml:'ü'};
    if (key[0] === '#') {
      const num= key[1]?.toLowerCase()==='x' ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
      return Number.isInteger(num)&&num>0&&num<=0x10ffff ? String.fromCodePoint(num) : whole;
    }
    return named[key.toLowerCase()]??whole;
  });
}
function contentToPlainText(input) {
  let body = String(input || '');
  if (!/<[a-z][\s\S]*?>/i.test(body)) return body.trim();
  body = body.replace(/<(script|style|iframe|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  body = body.replace(/<\s*br\s*\/?\s*>/gi,'\n');
  body = body.replace(/<h([1-6])\b[^>]*>/gi, (_all,n) => n < 3 ? '\n\n## ' : '\n\n### ');
  body = body.replace(/<\/h[1-6]\s*>/gi,'\n\n');
  body = body.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li\s*>/gi, '\n');
  body = body.replace(/<\/(p|div|blockquote|section|article|ul|ol)\s*>/gi,'\n\n');
  body = body.replace(/<[^>]*>/g,'');
  return decodeEntities(body).replace(/\r/g,'').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function recordsFromExport(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') throw new Error('Export JSON invalide');
  for (const key of ['posts','articles','items','results','data']) {
    if (Array.isArray(data[key])) return data[key];
    if (data[key] && typeof data[key]==='object') {
      const nested=recordsFromExport(data[key]);
      if (Array.isArray(nested)) return nested;
    }
  }
  throw new Error('Aucun tableau de publications dans cet export');
}
function normalizeRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Publication invalide');
  const title=record.title || record.name || record.headline;
  const body=contentToPlainText(record.body || record.content || record.bodyHtml || record.html || record.text || record.description);
  const url=record.legacyUrl || record.url || record.originalUrl || record.permalink;
  if (!isLegacyJustPlayerUrl(url)) throw new Error('URL source numerique JustPlayer requise');
  const originalPublishedAt=record.originalPublishedAt || record.publishedAt || record.published_at || record.date || record.createdAt || record.created_at;
  if (!originalPublishedAt) throw new Error('Date de publication originale manquante');
  const imageData=record.image || record.cover || record.coverImage;
  let image=null;
  if (imageData && typeof imageData === 'object' && imageData.url && imageData.credit && imageData.rights) {
    image={url:imageData.url,credit:imageData.credit,rights:imageData.rights};
  }
  const sources=(Array.isArray(record.sources) ? record.sources : []).map(s=>typeof s==='string'?{url:s,label:s}:s);
  // Preserve provenance independently of any fact-checking sources.
  if (!sources.some(s=>s?.url===url)) sources.unshift({url,label:'Publication originale JustPlayer'});
  return assertArticle({
    title, body, legacyUrl:url, originalPublishedAt,
    slug: record.slug || title, summary:record.summary || body.slice(0,320),
    category:record.category || 'JustPlayer',game:record.game || '',
    author:record.author || 'Rédaction JustPlayer',sources,image
  },{legacyRequired:true});
}
function prepareBatches(raw, {batchSize=20}={}) {
  if (!Number.isInteger(batchSize)||batchSize<1||batchSize>20) throw new Error('Lot entre 1 et 20 requis');
  const rawRecords=recordsFromExport(raw), seen=new Set(),seenSlug=new Set();
  const articles=[], rejected=[], duplicates=[], warnings=[];
  rawRecords.forEach((record,index)=>{
    try {
      const article=normalizeRecord(record),legacyKey=new URL(article.legacyUrl).pathname;
      if (seen.has(legacyKey)||seenSlug.has(article.slug)) {duplicates.push({index,url:article.legacyUrl,slug:article.slug});return;}
      seen.add(legacyKey);seenSlug.add(article.slug);
      articles.push(article);
      const media=record.image||record.cover||record.coverImage;
      if(media && !article.image) warnings.push({index,code:'media_rights_unconfirmed',url:article.legacyUrl});
    } catch(e) {rejected.push({index,reason:e.message,url:record?.url || record?.legacyUrl || null});}
  });
  const batches=[];
  for(let i=0;i<articles.length;i+=batchSize) batches.push({articles:articles.slice(i,i+batchSize),dryRun:true,publish:false});
  return {total:rawRecords.length,accepted:articles.length,duplicates,rejected,warnings,batches};
}
function recordPostKey(record) {
  try {
    const source=record.legacyUrl || record.url || record.permalink;
    if(!isLegacyJustPlayerUrl(source))return '';
    return new URL(source).pathname.match(/\/supporters\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)?.[1] || '';
  }catch(_){return '';}
}
function mergeMetadataAndContent(catalog, exportData) {
  const records=recordsFromExport(exportData);
  const details=new Map(records.map(r=>[recordPostKey(r),r]).filter(([key])=>key));
  const combined=[],missing=[];
  for (const item of catalog.items || []) {
    if (item.type !== 'post') {missing.push({...item,reason:'requires_video_import_adapter'});continue;}
    const record=details.get(String(item.id));
    if (!record) {missing.push({...item,reason:'content_not_exported'});continue;}
    combined.push({...record,title:record.title || item.title,
      url:item.url,legacyUrl:item.url,
      originalPublishedAt:record.originalPublishedAt || record.publishedAt || item.publishedAt});
  }
  const knownIds=new Set((catalog.items || []).map(x=>String(x.id)));
  for (const record of records) {
    const id=recordPostKey(record);
    if (!knownIds.has(id)) combined.push(record);
  }
  return {combined,missing};
}
module.exports={decodeEntities,contentToPlainText,recordsFromExport,normalizeRecord,prepareBatches,mergeMetadataAndContent};