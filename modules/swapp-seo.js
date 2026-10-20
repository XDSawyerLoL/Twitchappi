'use strict';
// Public SEO routes for SWAPP. No cron, no paid API, no user tracking.
// Only published Firestore articles may appear in the optional news section.
const ORIGIN='https://swapp.tv';
const {gameHubs,renderGameIndex,renderGamePage,renderMyGames}=require('./swapp-game-pages');
// IndexNow's public domain-ownership proof, not a secret credential.
const INDEXNOW_KEY='b700e3b876341559d245b13c5a25d369';
const INDEXNOW_KEY_PATH='/'+INDEXNOW_KEY+'.txt';
// The editor invalidates in-memory SEO lists immediately after a committed
// publication change. No cron, database poll or third-party service required.
let invalidateRegisteredSeoCache=()=>{};
let lookupRegisteredGameHub=()=>null;
let resolveIndexedGame=async()=>null;
function verifiedIndexedGame(slug){return resolveIndexedGame(slug)}
function invalidateSeoCache(){invalidateRegisteredSeoCache()}
function cachedGameHubForArticle(article){return lookupRegisteredGameHub(article)}
const CORE_PATHS=Object.freeze([
 '/', '/decouvrir', '/categories', '/equipes', '/actus',
 '/social', '/bandes-annonces', '/boutique', '/plan-du-site'
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
  if(entries.length>=CORE_PATHS.length+500)break;
 }
 const hubs=gameHubs(articles);
 if(hubs.length){
  entries.push({loc:ORIGIN+'/jeux',lastmod:''});
  for(const game of hubs)
   entries.push({loc:ORIGIN+'/jeux/'+encodeURIComponent(game.slug),lastmod:isoDate(game.lastmod)});
 }
 return entries;
}
function sitemapXml(articles=[]){
 const items=sitemapEntries(articles).map(({loc,lastmod})=>
  '  <url><loc>'+encodeXml(loc)+'</loc>'+(lastmod?'<lastmod>'+lastmod+'</lastmod>':'')+'</url>').join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+items+'\n</urlset>\n';
}

/**
 * Google News sitemap: only fresh, actually published editorial articles.
 * Original publication time wins for imported JustPlayer content so old
 * archives never masquerade as breaking news.
 * Pure function: no remote requests or database reads.
 */
function newsSitemapXml(articles=[],currentTime=Date.now()){
 const now=Number(currentTime);
 const cutoff=now-48*60*60*1000;
 const seen=new Set(),fresh=[],archive=[];
 for(const article of Array.isArray(articles)?articles:[]){
  const slug=String(article?.slug||'');
  if(article?.status!=='published'||!SLUG.test(slug))continue;
  if(article.contentType && article.contentType!=='article')continue;
  const title=String(article.title||'').trim();
  if(!title||seen.has(slug))continue;
  const dateSource=article.originalPublishedAt||article.publishedAt||'';
  const published=Date.parse(dateSource);
  // Never call an imported article "new" just because SWAPP imported it.
  // The only News entries must have a genuine publication date within 48h.
  if(Number.isFinite(published)&&published>now)continue;
  seen.add(slug);
  const item={slug,title,published};
  if(Number.isFinite(published)&&published>=cutoff)fresh.push(item);
  else archive.push(item);
 }
 fresh.sort((a,b)=>b.published-a.published);
 archive.sort((a,b)=>(Number.isFinite(b.published)?b.published:0)-(Number.isFinite(a.published)?a.published:0));
 // Google explicitly permits retaining old URLs without news:news metadata.
 // A few genuine archived editorials prevent missing <url> warnings when
 // no article was published in the last 48h. No invented publication dates.
 const rows=[...fresh.slice(0,500),...archive.slice(0,20)];
 const entries=rows.map(article=>{
  const url=ORIGIN+'/actus/'+encodeURIComponent(article.slug);
  const loc='  <url><loc>'+encodeXml(url)+'</loc>';
  if(!Number.isFinite(article.published)||article.published<cutoff)
   return loc+'</url>';
  return loc+'<news:news>'+
   '<news:publication><news:name>SWAPP</news:name><news:language>fr</news:language></news:publication>'+
   '<news:publication_date>'+new Date(article.published).toISOString()+'</news:publication_date>'+
   '<news:title>'+encodeXml(article.title)+'</news:title>'+
   '</news:news></url>';
 }).join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '+
  'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n'+entries+'\n</urlset>\n';
}


const CREATOR_LOGIN=/^[a-z0-9_][a-z0-9_-]{1,31}$/;
const RESERVED_CREATOR_PATHS=new Set(['jeux','actus','api','assets','boutique','communaute','bandes-annonces','pricing','contact','confidentialite','mentions-legales','cgu','cookies','reset-password']);
function creatorSitemapXml(creators=[]){
 const seen=new Set(),rows=[];
 for(const creator of Array.isArray(creators)?creators:[]){
  const login=String(creator?.login||'').toLowerCase();
  if(!CREATOR_LOGIN.test(login)||RESERVED_CREATOR_PATHS.has(login)||creator?.channel_public===false||seen.has(login))continue;
  seen.add(login);
  rows.push({loc:ORIGIN+'/'+encodeURIComponent(login),
   lastmod:isoDate(creator.channel_updatedAt||creator.updatedAt)});
  if(rows.length>=5000)break;
 }
 const entries=rows.map(({loc,lastmod})=>
  '  <url><loc>'+encodeXml(loc)+'</loc>'+(lastmod?'<lastmod>'+lastmod+'</lastmod>':'')+'</url>').join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+entries+'\n</urlset>\n';
}
function injectCreatorMetadata(html,creator,login){
 let result=String(html||'');
 if(!result.includes('</head>'))return result;
 const slug=String(login||'').toLowerCase();
 if(!CREATOR_LOGIN.test(slug)||RESERVED_CREATOR_PATHS.has(slug)||!creator||creator.channel_public===false||
    String(creator.login||'').toLowerCase()!==slug)
  return result.replace('</head>','<meta name="robots" content="noindex,follow"></head>');
 const title=String(creator.display_name||slug).trim().slice(0,80)||slug;
 const about=String(creator.bio||'').trim().slice(0,180);
 const description=about||'Découvre la chaîne et les contenus du créateur '+title+' sur SWAPP.';
 const url=ORIGIN+'/'+encodeURIComponent(slug);
 let image='';
 try{
  const src=String(creator.avatar_url||'').trim();
  if(src.length<=2000){
   const u=new URL(src);
   if(u.protocol==='https:'&&!u.username&&!u.password)image=u.href;
  }
 }catch(_){}
 const mainEntity={'@type':'Person',name:title,alternateName:slug,url,...(about?{description:about}:{}),
  ...(image?{image}: {})};
 const schema={'@context':'https://schema.org','@type':'ProfilePage',url,mainEntity};
 const tags='<meta name="description" content="'+encodeXml(description)+'">'+
  '<link rel="canonical" href="'+url+'">'+
  '<meta property="og:type" content="profile">'+
  '<meta property="og:site_name" content="SWAPP">'+
  '<meta property="og:title" content="'+encodeXml(title+' · SWAPP')+'">'+
  '<meta property="og:description" content="'+encodeXml(description)+'">'+
  '<meta property="og:url" content="'+url+'">'+
  '<meta name="twitter:card" content="'+(image?'summary_large_image':'summary')+'">'+
  (image?'<meta property="og:image" content="'+encodeXml(image)+'">':'')+
  '<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>';
 result=result.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+encodeXml(title+' — Chaîne SWAPP')+'</title>');
 return result.replace('</head>',tags+'</head>');
}

function robotsText(){
 return 'User-agent: *\nAllow: /\n'+
  // Account pages carry noindex metadata: crawlers must be allowed to read it.
  // Disallow only machine endpoints and editorial administration.
  'Disallow: /api/\nDisallow: /actus/studio\nDisallow: /boutique/admin\n'+
  'Sitemap: '+ORIGIN+'/sitemap.xml\n'+
  'Sitemap: '+ORIGIN+'/news-sitemap.xml\n'+
  'Sitemap: '+ORIGIN+'/creators-sitemap.xml\n';
}
function rssXml(articles=[]){
 const valid=(Array.isArray(articles)?articles:[]).filter(article=>
  article?.status==='published'&&SLUG.test(String(article.slug||'')));
 valid.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
 const items=valid.slice(0,50).map(article=>{
  const link=ORIGIN+'/actus/'+encodeURIComponent(article.slug);
  const title=encodeXml(String(article.title||'Actualité SWAPP').slice(0,180));
  const summary=encodeXml(String(article.summary||'').slice(0,420));
  const when=new Date(article.publishedAt||article.updatedAt||'');
  const pub=Number.isFinite(when.getTime())?'<pubDate>'+when.toUTCString()+'</pubDate>':'';
  return '  <item><title>'+title+'</title><link>'+encodeXml(link)+
   '</link><guid isPermaLink="true">'+encodeXml(link)+'</guid><description>'+
   summary+'</description>'+pub+'</item>';
 }).join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<rss version="2.0"><channel><title>SWAPP — Actualité jeux vidéo</title>'+
  '<link>'+ORIGIN+'/actus</link><description>Les articles gaming publiés sur SWAPP.</description>'+
  '<language>fr-FR</language>\n'+items+'\n</channel></rss>\n';
}
function sitemapHtml(articles=[]){
 const indexLinks=[
  ['/','Accueil'],['/actus','Actualité jeux vidéo'],['/decouvrir','Découvrir des streamers'],
  ['/categories','Jeux et catégories'],['/equipes','Équipes'],['/bandes-annonces','Bandes-annonces'],
  ['/social','Social'],['/boutique','Boutique']
 ];
 const hubs=gameHubs(articles);
 const index=indexLinks.map(([url,name])=>
  '<li><a href="'+url+'">'+encodeXml(name)+'</a></li>').join('');
 const valid=(Array.isArray(articles)?articles:[]).filter(a=>
  a?.status==='published'&&SLUG.test(String(a.slug||''))).sort((a,b)=>
  String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))).slice(0,500);
 const seen=new Set();
 const items=valid.filter(a=>{if(seen.has(a.slug))return false;seen.add(a.slug);return true})
  .map(a=>{
   const name=String(a.title||a.slug).trim().slice(0,180)||a.slug;
   const date=isoDate(a.publishedAt||a.updatedAt);
   return '<li><a href="/actus/'+encodeURIComponent(a.slug)+'">'+encodeXml(name)+'</a>'+
    (date?' <time datetime="'+date+'">'+date+'</time>':'')+'</li>';
  }).join('');
 return '<!doctype html><html lang="fr"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Plan du site — SWAPP</title>'+
  '<meta name="description" content="Les rubriques et articles publiés sur SWAPP : actualités jeux vidéo, lives, créateurs et communautés.">'+
  '<link rel="canonical" href="'+ORIGIN+'/plan-du-site">'+
  '<style>body{margin:0;background:#0b101b;color:#f7f8fe;font:16px/1.6 system-ui,sans-serif}'+
  'main{max-width:850px;margin:auto;padding:30px 22px 70px}header{border-bottom:1px solid #ffffff29;padding:18px 24px}'+
  'a{color:#a4e4f2}header a{font-weight:900;font-size:23px;text-decoration:none}'+
  'h1{font-size:clamp(32px,5vw,52px)}h2{margin-top:34px}li{margin:9px 0}time{color:#a6b5cd;font-size:13px}'+
  'p{color:#c3cee1}ul{padding-left:25px}</style></head><body>'+
  '<header><a href="/">SWAPP.</a></header><main><h1>Plan du site</h1>'+
  '<p>Accède aux principales rubriques de SWAPP et aux articles vérifiés publiés par la rédaction.</p>'+
  '<section><h2>Explorer SWAPP</h2><ul>'+index+'</ul></section>'+
  (hubs.length?'<section><h2>Jeux suivis</h2><p><a href="/jeux">Tous les jeux</a></p><ul>'+hubs.map(g=>'<li><a href="/jeux/'+encodeURIComponent(g.slug)+'">'+encodeXml(g.game)+'</a> ('+g.count+' publications)</li>').join('')+'</ul></section>':'')+
  '<section><h2>Articles publiés</h2>'+
  (items?'<ul>'+items+'</ul>':'<p>Les publications seront listées ici dès qu’elles seront accessibles.</p>')+
  '</section></main></body></html>';
}


async function notifyIndexNow(slugs=[],{fetchImpl=globalThis.fetch,enabled=process.env.NODE_ENV==='production'&&process.env.SWAPP_INDEXNOW_ENABLED!=='false'}={}){
 // Only published editorials are passed by the trusted editor router.
 // One free outbound request per batch, no recurring service or crawler.
 if(!enabled)return {attempted:false,reason:'disabled'};
 const unique=[...new Set((Array.isArray(slugs)?slugs:[]).map(String).filter(s=>SLUG.test(s)))].slice(0,50);
 if(!unique.length||typeof fetchImpl!=='function')return {attempted:false,reason:'no_valid_urls'};
 const payload={host:'swapp.tv',key:INDEXNOW_KEY,keyLocation:ORIGIN+INDEXNOW_KEY_PATH,
  urlList:unique.map(slug=>ORIGIN+'/actus/'+encodeURIComponent(slug))};
 try{
  const response=await fetchImpl('https://api.indexnow.org/indexnow',{
   method:'POST',signal:AbortSignal.timeout(4000),
   headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(payload)
  });
  return {attempted:true,accepted:response.status===200||response.status===202,status:response.status,count:unique.length};
 }catch(error){
  return {attempted:true,accepted:false,reason:String(error?.name||'network_error').slice(0,40)};
 }
}

function registerSeoRoutes(app,{getPublished=async()=>[],getCreators=async()=>[],now=()=>Date.now()}={}){
 if(!app||typeof app.get!=='function')throw Error('Express app required');
 let cached=null,articles=[],expires=0,inflight=null,revision=0,loadedRevision=-1,gameHubLinks=new Map(),hasVerifiedArticles=false,lastReadSuccessful=false;
 const TTL=6*60*60*1000;
 invalidateRegisteredSeoCache=()=>{revision++;expires=0};
 // Only serve links to pages actually present in the cached sitemap. Direct
 // visits before the first cache load simply show no optional hub link.
 lookupRegisteredGameHub=article=>{
  if(!cached||loadedRevision!==revision||now()>=expires)return null;
  const slug=String(article?.slug||'');
  return SLUG.test(slug)?gameHubLinks.get(slug)||null:null;
 };
 // Only a genuinely indexed, published editorial game can award discovery XP.
 // This resolver shares the sitemap's six-hour content cache and its invalidation.
 resolveIndexedGame=async slug=>{
  if(typeof slug!=='string'||!SLUG.test(slug))return null;
  await ensureCache();
  if(!hasVerifiedArticles)return null;
  const found=gameHubs(articles).find(g=>g.slug===slug);
  return found?{slug:found.slug,game:found.game}:null;
 };
 async function ensureCache(){
  if(cached&&now()<expires&&loadedRevision===revision)return;
  // All SEO endpoints share a single lookup; a mid-flight editorial update
  // invalidates its result rather than leaking stale news after publication.
  if(inflight){
   await inflight;
   if(loadedRevision!==revision)return ensureCache();
   return;
  }
  const fetchRevision=revision;
  inflight=(async()=>{
   try{
    const data=await getPublished();
    if(fetchRevision!==revision)return;
    const current=(Array.isArray(data)?data:[]).filter(x=>
     x?.status==='published'&&SLUG.test(String(x.slug||'')));
    const hubs=gameHubs(current);
    const nextLinks=new Map();
    for(const hub of hubs)
     for(const item of hub.articles)
      nextLinks.set(String(item.slug),'/jeux/'+encodeURIComponent(hub.slug));
    articles=current;
    cached=sitemapXml(current);
    hasVerifiedArticles=true;
    lastReadSuccessful=true;
    gameHubLinks=nextLinks;
    loadedRevision=fetchRevision;
    expires=now()+TTL;
   }catch(err){
    if(fetchRevision!==revision)return;
    console.warn('[SWAPP SEO] published articles unavailable:',String(err?.message||err));
    lastReadSuccessful=false;
    if(!cached){cached=sitemapXml();articles=[]}
    loadedRevision=fetchRevision;
    // Retry soon. Do not replace previously confirmed published URLs.
    expires=now()+60000;
   }
  })();
  try{await inflight}finally{inflight=null}
  if(loadedRevision!==revision)return ensureCache();
 }
 app.get(INDEXNOW_KEY_PATH,(_req,res)=>{
  res.set('Cache-Control','public, max-age=3600');
  return res.status(200).type('text/plain; charset=utf-8').send(INDEXNOW_KEY+'\n');
 });
 app.get('/robots.txt',(_req,res)=>{
  res.set('Cache-Control','public, max-age=3600');
  res.type('text/plain; charset=utf-8').status(200).send(robotsText());
 });
 app.get('/api/seo/status',async(_req,res)=>{
  res.set('Cache-Control','no-store');
  await ensureCache();
  const source=!hasVerifiedArticles?'unavailable':(lastReadSuccessful?'ready':'stale');
  const newsHasUrls=hasVerifiedArticles&&newsSitemapXml(articles,now()).includes('<url>');
  return res.status(200).json({
   service:'swapp-seo',articleSource:source,publishedCount:articles.length,
   sitemapReady:true,newsSitemapStatus:source==='unavailable'?'source_unavailable':
    (newsHasUrls?'ready':'no_published_articles')
  });
 });
 app.get('/sitemap.xml',async(_req,res)=>{
  res.set('Content-Type','application/xml; charset=utf-8');
  res.set('Cache-Control','public, max-age=900');
  await ensureCache();
  return res.status(200).send(cached);
 });
 app.get('/plan-du-site',async(_req,res)=>{
  res.set('Cache-Control','public, max-age=900');
  res.type('text/html; charset=utf-8');
  await ensureCache();
  return res.status(200).send(sitemapHtml(articles));
 });
 // Game hubs only exist for topics with at least two distinct published
 // editorials. Share the existing six-hour cache and immediate invalidation.
 app.get('/jeux',async(_req,res)=>{
  await ensureCache();
  const games=gameHubs(articles);
  if(!games.length)return res.status(404).send('Aucun dossier jeu publié pour le moment.');
  res.set('Cache-Control','no-store');
  return res.status(200).type('html').send(renderGameIndex(games));
 });
 // Opt-in personal space. Intentionally excluded from XML sitemaps and indexing.
 // Uses the same published-article cache as /jeux; never queries a private profile.
 app.get('/mes-jeux',async(_req,res)=>{
  await ensureCache();
  res.set('Cache-Control','private, no-store');
  return res.status(200).type('html').send(renderMyGames(gameHubs(articles)));
 });
 app.get('/jeux/:slug',async(req,res)=>{
  const slug=String(req.params.slug||'');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>90)
   return res.status(404).send('Jeu introuvable.');
  await ensureCache();
  const game=gameHubs(articles).find(x=>x.slug===slug);
  if(!game)return res.status(404).send('Jeu introuvable.');
  res.set('Cache-Control','no-store');
  return res.status(200).type('html').send(renderGamePage(game));
 });
 app.get('/creators-sitemap.xml',async(_req,res)=>{
  res.set('Content-Type','application/xml; charset=utf-8');
  res.set('Cache-Control','public, max-age=900');
  try{
   const creators=await getCreators();
   return res.status(200).send(creatorSitemapXml(creators));
  }catch(error){
   console.warn('[SWAPP SEO] Creator sitemap temporarily unavailable:',error?.message);
   return res.status(200).send(creatorSitemapXml());
  }
 });
 app.get('/news-sitemap.xml',async(_req,res)=>{
  await ensureCache();
  // Never describe an unavailable database as an empty, successfully read
  // news sitemap. Google may otherwise report a missing required <url> tag.
  // No fictitious articles or publication dates are introduced.
  if(!hasVerifiedArticles){
   res.set('Cache-Control','no-store');
   res.set('Retry-After','60');
   return res.status(503).type('text/plain; charset=utf-8').send('Sitemap Actualités temporairement indisponible');
  }
  const newsXml=newsSitemapXml(articles,now());
  if(!newsXml.includes('<url>')){
   res.set('Cache-Control','no-store');
   res.set('Retry-After','3600');
   return res.status(503).type('text/plain; charset=utf-8').send('Aucun article publié disponible pour le sitemap Actualités.');
  }
  res.set('Content-Type','application/xml; charset=utf-8');
  res.set('Cache-Control','public, max-age=900');
  return res.status(200).send(newsXml);
 });
 app.get('/feed.xml',async(_req,res)=>{
  res.set('Cache-Control','public, max-age=900');
  res.type('application/rss+xml; charset=utf-8');
  await ensureCache();
  return res.status(200).send(rssXml(articles));
 });
}
const SPA_INFO=Object.freeze({
 '/':{title:'SWAPP — Découvre les jeux, les lives et leurs créateurs',description:'SWAPP réunit actualité du jeu vidéo, découverte de streamers en direct et communauté gaming.'},
 '/decouvrir':{title:'Découvrir les lives et les créateurs · SWAPP',description:'Trouve des créateurs en direct selon tes envies, les jeux et les communautés, sans te perdre dans les recommandations.'},
 '/categories':{title:'Catégories gaming et lives · SWAPP',description:'Explore les jeux et catégories en direct sur SWAPP.'},
 '/equipes':{title:'Équipes et créateurs · SWAPP',description:'Découvre les équipes et créateurs gaming sur SWAPP.'},
 '/actus':{title:'Actualité jeux vidéo et streaming · SWAPP',description:'Actualités jeux vidéo, annonces et bandes-annonces sélectionnées par SWAPP.'}
});

const LANDING_CONTENT=Object.freeze({
 '/decouvrir':{heading:'Découvrir des streamers et des lives gaming',intro:'Explore des diffusions en direct, découvre de nouveaux créateurs et retrouve les jeux qui t’intéressent sur SWAPP.',detail:'La découverte privilégie les jeux, les créateurs et les communautés, sans imposer un compte pour commencer à explorer.'},
 '/categories':{heading:'Jeux vidéo et catégories en direct',intro:'Retrouve les catégories de jeux vidéo et passe des actualités aux lives des créateurs qui y jouent.',detail:'Explore les univers gaming et découvre des streamers par jeu ou par catégorie.'},
 '/equipes':{heading:'Équipes de streamers et communautés gaming',intro:'Parcours les équipes et découvre les créateurs réunis autour des mêmes jeux et centres d’intérêt.',detail:'SWAPP relie la découverte des créateurs à celle des communautés.'},
 '/actus':{heading:'Actualité du jeu vidéo et du streaming',intro:'Lis les dernières informations sur les jeux vidéo, les annonces, les sorties et les bandes-annonces publiées sur SWAPP.',detail:'Chaque article disponible possède son adresse dédiée, pour retrouver les informations et découvrir les créateurs en direct.'}
});
const LANDING_LINKS=Object.freeze([['/actus','Actualité'],['/decouvrir','Lives et créateurs'],['/categories','Jeux et catégories'],['/equipes','Équipes'],['/bandes-annonces','Bandes-annonces'],['/social','Social'],['/plan-du-site','Plan du site']]);
function landingMarkup(path){
 const item=LANDING_CONTENT[path];
 if(!item)return '';
 const links=LANDING_LINKS.filter(([href])=>href!==path).map(([href,label])=>
  '<a href="'+href+'">'+encodeXml(label)+'</a>').join(' ');
 return '<div class="swappSeoIntro"><h1>'+encodeXml(item.heading)+'</h1><p>'+
  encodeXml(item.intro)+'</p><p class="swappSeoDetail">'+encodeXml(item.detail)+
  '</p><nav aria-label="Explorer SWAPP">'+links+'</nav></div>';
}
function enhanceLandingHtml(html,path){
 const content=landingMarkup(path);
 if(!content)return html;
 const styles='<style>.swappSeoIntro{box-sizing:border-box;max-width:820px;margin:40px auto;padding:24px;color:#f3f6ff;text-align:center;font:500 16px/1.55 system-ui,sans-serif}.swappSeoIntro h1{font-size:clamp(28px,4vw,46px);line-height:1.12;letter-spacing:-.04em;margin:0 0 18px}.swappSeoIntro p{color:#cdd6e7;font-size:17px;margin:10px auto;max-width:720px}.swappSeoIntro .swappSeoDetail{font-size:14px;color:#aebbd0}.swappSeoIntro nav{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:22px}.swappSeoIntro nav a{display:inline-block;color:#f6f8ff;text-decoration:none;border:1px solid #ffffff37;background:#ffffff11;border-radius:24px;padding:7px 12px;font-weight:700;font-size:13px}@media(max-width:600px){.swappSeoIntro{margin:16px auto;padding:20px 14px}.swappSeoIntro p{font-size:15px}}</style>';
 let result=html.replace('</head>',styles+'</head>');
 const ids={'/decouvrir':'discover','/categories':'categories','/equipes':'teams','/actus':'actus'};
 const id=ids[path];
 const opening='<section id="'+id+'" class="view"';
 const start=result.indexOf(opening);
 if(start<0)return result;
 const end=result.indexOf('</section>',start);
 if(end<0)return result;
 return result.slice(0,end)+content+result.slice(end);
}

const NOINDEX_PATHS=new Set(['/compte','/connexion','/settings','/gestionnaire','/manager','/dashboard','/studio','/admin','/boutique/admin','/reset-password']);
// Search Console HTML-tag ownership is checked on the public homepage's
// server-rendered <head>. Some hosts override index.html via UI_FILE.
// Keep the existing owner tags, and avoid duplicates when index.html carries it.
const SEARCH_CONSOLE_TOKEN='G7mGoV76GdKsvAMEGkyKILyzsiW4U-GXIfuWza9G4N4';
function ensureSearchConsoleMeta(html){
 const raw=String(html||'');
 if(!/<head(?:\s[^>]*)?>/i.test(raw)||!/<\/head\s*>/i.test(raw))return raw;
 const tag='<meta name="google-site-verification" content="'+SEARCH_CONSOLE_TOKEN+'">';
 if(raw.includes(SEARCH_CONSOLE_TOKEN))return raw;
 return raw.replace(/<head(?:\s[^>]*)?>/i,head=>head+'\n'+tag);
}
function injectSpaMetadata(html,pathname='/'){
 const urlPath=String(pathname||'/').split('?')[0];
 const raw=urlPath==='/'?ensureSearchConsoleMeta(html):String(html||'');
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
   '<meta property="og:locale" content="fr_FR">'+
   '<meta name="twitter:card" content="summary">'+
   '<meta name="twitter:title" content="'+encodeXml(info.title)+'">'+
   '<meta name="twitter:description" content="'+encodeXml(info.description)+'">'+
   '<link rel="alternate" type="application/rss+xml" title="Actualité SWAPP" href="'+ORIGIN+'/feed.xml">'+
   (path==='/'?'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'SWAPP',url:ORIGIN+'/',inLanguage:'fr-FR',description:info.description}).replace(/</g,'\\u003c')+'</script>':'');
  result=result.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+encodeXml(info.title)+'</title>');
  return enhanceLandingHtml(result.replace('</head>',tags+'</head>'),path);
 }
 return result.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
}
module.exports={ORIGIN,CORE_PATHS,INDEXNOW_KEY,INDEXNOW_KEY_PATH,sitemapEntries,sitemapXml,newsSitemapXml,creatorSitemapXml,sitemapHtml,rssXml,robotsText,registerSeoRoutes,invalidateSeoCache,cachedGameHubForArticle,verifiedIndexedGame,notifyIndexNow,ensureSearchConsoleMeta,injectSpaMetadata,injectCreatorMetadata};
