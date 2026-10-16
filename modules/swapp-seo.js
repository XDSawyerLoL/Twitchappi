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
const SPA_INFO=Object.freeze({
 '/':{title:'SWAPP — Découvre les jeux, les lives et leurs créateurs',description:'SWAPP réunit actualité du jeu vidéo, découverte de streamers en direct et communauté gaming.'},
 '/decouvrir':{title:'Découvrir les lives et les créateurs · SWAPP',description:'Trouve des créateurs en direct selon tes envies, les jeux et les communautés, sans te perdre dans les recommandations.'},
 '/categories':{title:'Catégories gaming et lives · SWAPP',description:'Explore les jeux et catégories en direct sur SWAPP.'},
 '/equipes':{title:'Équipes et créateurs · SWAPP',description:'Découvre les équipes et créateurs gaming sur SWAPP.'},
 '/actus':{title:'Actualité jeux vidéo et streaming · SWAPP',description:'Actualités jeux vidéo, annonces et bandes-annonces sélectionnées par SWAPP.'}
});
const NOINDEX_PATHS=new Set(['/compte','/connexion','/settings','/gestionnaire','/manager','/dashboard','/studio','/admin','/reset-password']);
function injectSpaMetadata(html,pathname='/'){
 const raw=String(html||'');
 if(!raw.includes('</head>'))return raw;
 const path=String(pathname||'/').split('?')[0];
 const info=SPA_INFO[path];
 const hidden=NOINDEX_PATHS.has(path)||path.startsWith('/reset-password/');
 if(!info&&!hidden)return raw;
 let result=raw;
 if(info){
  const tags='<meta name="description" content="'+encodeXml(info.description)+'">'+
   '<link rel="canonical" href="'+ORIGIN+path+'">'+
   '<meta property="og:type" content="website">'+
   '<meta property="og:site_name" content="SWAPP">'+
   '<meta property="og:title" content="'+encodeXml(info.title)+'">'+
   '<meta property="og:description" content="'+encodeXml(info.description)+'">'+
   '<meta property="og:url" content="'+ORIGIN+path+'">'+
   '<meta name="twitter:card" content="summary_large_image">';
  result=result.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+encodeXml(info.title)+'</title>');
  return result.replace('</head>',tags+'</head>');
 }
 return result.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
}
module.exports={ORIGIN,CORE_PATHS,sitemapEntries,sitemapXml,robotsText,registerSeoRoutes,injectSpaMetadata};
