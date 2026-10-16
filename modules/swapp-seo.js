'use strict';
// Public SEO routes for SWAPP. No cron, no paid API, no user tracking.
// Only published Firestore articles may appear in the optional news section.
const ORIGIN='https://swapp.tv';
const CORE_PATHS=Object.freeze([
 '/', '/decouvrir', '/categories', '/equipes', '/actus',
 '/communaute', '/bandes-annonces', '/boutique'
]);
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
const XML_CHARS=/[&<>"']/g;
const encodeXml=s=>String(s).replace(XML_CHARS,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const isoDate=value=>{
 if(!value)return '';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';
};
function sitemapEntries(articles=[]){
 const entries=CORE_PATHS.map(path=>({loc:ORIGIN+path,lastmod:''}));
 const seen=new Set(CORE_PATHS);
 for(const article of Array.isArray(articles)?articles:[]){
  const rawSlug=article?.slug;
  if(article?.status!=='published'||!SLUG.test(String(rawSlug||'')))continue;
  // The canonical JustPlayer slugs are resolved by the live news router.
  // No account, draft, local previews, query strings or editor links.
  const slug=String(rawSlug);
  const path='/actus/'+encodeURIComponent(slug);
  if(seen.has(path))continue;seen.add(path);
  entries.push({loc:ORIGIN+path,lastmod:isoDate(article.updatedAt||article.publishedAt)});
  if(entries.length>=508)break;
 }
 return entries;
}
function sitemapXml(articles=[]){
 const items=sitemapEntries(articles).map(({loc,lastmod})=>
  '  <url><loc>'+encodeXml(loc)+'</loc>'+(lastmod?'<lastmod>'+lastmod+'</lastmod>':'')+'</url>').join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+items+'\n</urlset>\n';
}
function robotsText(){
 return 'User-agent: *\nAllow: /\n'+
  'Disallow: /api/\nDisallow: /actus/studio\nDisallow: /compte\n'+
  'Disallow: /connexion\nDisallow: /settings\nDisallow: /gestionnaire\n'+
  'Sitemap: '+ORIGIN+'/sitemap.xml\n';
}
function registerSeoRoutes(app,{getPublished=async()=>[],now=()=>Date.now()}={}){
 if(!app||typeof app.get!=='function')throw Error('Express app required');
 let cached=null,expires=0;
 const TTL=6*60*60*1000;
 app.get('/robots.txt',(_req,res)=>{
  res.set('Cache-Control','public, max-age=3600');
  res.type('text/plain; charset=utf-8').status(200).send(robotsText());
 });
 app.get('/sitemap.xml',async(_req,res)=>{
  res.set('Content-Type','application/xml; charset=utf-8');
  res.set('Cache-Control','public, max-age=900');
  if(cached&&now()<expires)return res.status(200).send(cached);
  try{
   const data=await getPublished();
   // Cache only confirmed data; transient Firestore errors must not wipe
   // previously known article URLs from the crawler response.
   cached=sitemapXml(data);
   expires=now()+TTL;
  }catch(err){
   console.warn('[SWAPP SEO] sitemap articles unavailable:',String(err?.message||err));
   if(!cached){cached=sitemapXml();expires=now()+60000}
   else expires=now()+60000;
  }
  return res.status(200).send(cached);
 });
}
module.exports={ORIGIN,CORE_PATHS,sitemapEntries,sitemapXml,robotsText,registerSeoRoutes};
