'use strict';

const {trailerId,commercialLinks}=require('../../assets/swapp-article-extras');
const {serverHeader,serverMobile}=require('../../assets/swapp-navigation');
const {recommend,cleanTags,cleanSEO,contentType,detectGames}=require('./content-metadata');

const MAX_TITLE = 180;
const MAX_BODY = 120000;
const MAX_SUMMARY = 420;

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110).replace(/-$/,'');
}
function isHttpUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return false;
  try {
    const u = new URL(input);
    return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname) && !u.username && !u.password;
  } catch (_) {return false;}
}
function isLegacyJustPlayerUrl(value) {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  return ['justplayer.fr', 'www.justplayer.fr'].includes(url.hostname.toLowerCase())
    && /^\/supporters\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname);
}
function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Date de publication invalide');
  return date.toISOString();
}
function assertArticle(value, {publish = false, legacyRequired = false} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Article invalide');
  const title = String(value.title || '').trim();
  const body = String(value.body || '').trim();
  const kind=contentType(value.contentType);
  const summary = String(value.summary || '').trim();
  const slug = slugify(value.slug || title);
  if (title.length < 8 || title.length > MAX_TITLE) throw new Error('Titre entre 8 et 180 caractères requis');
  if (slug.length < 4) throw new Error('Slug invalide');
  if (body.length < (kind==='post'?8:kind==='trailer'||kind==='video'?15:40) || body.length > MAX_BODY) throw new Error('Contenu trop court ou trop long');
  if (summary.length > MAX_SUMMARY) throw new Error('Résumé trop long');
  const sources = Array.isArray(value.sources) ? value.sources : [];
  if (sources.length > 20 || (publish && sources.length === 0 && !(kind==='trailer'||kind==='video'))) throw new Error('Au moins une source requise pour publier (20 max)');
  for (const source of sources) {
    if (!source || !isHttpUrl(source.url)) throw new Error('URL de source invalide');
  }
  const image = value.image && typeof value.image === 'object' ? value.image : null;
  if (image && !isHttpUrl(image.url)) throw new Error('URL image invalide');
  if (publish && image && (!String(image.credit || '').trim() || !String(image.rights || '').trim() || /(?:à|a)\s*vérifier/i.test(String(image.rights)))) throw new Error('Crédit et droits vérifiés requis pour l’image');
  if (legacyRequired && !isLegacyJustPlayerUrl(value.legacyUrl)) throw new Error('URL JustPlayer requise');
  if (value.legacyUrl && !isHttpUrl(value.legacyUrl)) throw new Error('URL ancienne invalide');
  const trailerUrl=String(value.trailerUrl||'').trim();
  if(trailerUrl&&!trailerId(trailerUrl))throw new Error('URL bande-annonce YouTube HTTPS invalide');
  if(publish&&(kind==='trailer'||kind==='video')&&!trailerUrl)throw new Error('Une vidéo YouTube officielle est requise pour publier une vidéo intégrée');
  const links=commercialLinks(value.commercialLinks,true);
  const editorial=recommend({title,summary,body,game:value.game,tags:value.tags});
  const requestedGames=Array.isArray(value.games)?value.games:[];
  const games=[...new Set([String(value.game||'').trim(),...requestedGames,...editorial.games]
    .map(x=>String(x).trim().slice(0,120)).filter(Boolean))].slice(0,8);
  const tags=cleanTags(value.tags && (Array.isArray(value.tags)?value.tags.length:String(value.tags).trim()) ? value.tags : editorial.tags);
  const seo=cleanSEO(value.seo,{title,summary});

  return {
    title, slug, body, summary, contentType:kind,
    games,tags,seo,
    category: String(value.category || 'actualites').trim().slice(0, 60),
    game: String(value.game || editorial.primaryGame || '').trim().slice(0, 120),
    author: String(value.author || 'Rédaction SWAPP').trim().slice(0, 120),
    sources: sources.map(s => ({url:s.url, label:String(s.label || '').trim().slice(0, 180)})),
    image: image ? {url:image.url,credit:String(image.credit||'').trim().slice(0,180),rights:String(image.rights||'').trim().slice(0,180)} : null,
    trailerUrl:trailerUrl||null,
    commercialLinks:links,
    legacyUrl: value.legacyUrl || null,
    originalPublishedAt: toIsoDate(value.originalPublishedAt || null)
  };
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
}
function newsLayout(title, description, inner, metadata = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080b12"><title>${escapeHtml(title)} | SWAPP</title><meta name="description" content="${escapeHtml(description)}">${metadata}<link rel="stylesheet" href="/assets/swapp-media.css?v=20261017-channel-news-v13"><style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#151d2c;--line:#303a50;--muted:#aab4c6;--text:#f5f7ff;--violet:#a78bfa}
  *{box-sizing:border-box}body{margin:0;color:var(--text);background:radial-gradient(ellipse at 5% 0%,#271a47 0%,transparent 45%),var(--bg);font-family:Inter,system-ui,Segoe UI,sans-serif;line-height:1.65}a{color:#c4b5fd}header{padding:18px max(20px,calc((100vw - 1100px)/2));min-width:0;border-bottom:1px solid var(--line);background:#080b12dd;display:flex;justify-content:space-between;gap:16px;align-items:center;position:sticky;top:0;backdrop-filter:blur(14px)}header a{text-decoration:none;font-weight:700}header strong{font-size:23px;color:#fff;letter-spacing:-.05em}nav{display:flex;flex-wrap:wrap;gap:18px}nav a{font-size:14px;color:#cbd5e1}main{max-width:1100px;margin:0 auto;padding:44px 20px 80px}h1{font-size:clamp(2.2rem,4vw,3.8rem);letter-spacing:-.065em;line-height:1.08;margin:18px 0}h2{line-height:1.25}.lead{font-size:clamp(1.1rem,2vw,1.35rem);color:#d4d8e5;max-width:780px}.eyebrow{color:#c4b5fd;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:34px}.card{display:flex;flex-direction:column;text-decoration:none;border:1px solid var(--line);border-radius:21px;overflow:hidden;background:#151d2ca9;transition:transform .15s,border-color .15s}.card:hover{transform:translateY(-3px);border-color:var(--violet)}.card img{width:100%;height:190px;object-fit:cover}.card-content{padding:22px}.card h2{font-size:22px;color:white;margin:8px 0}.card p{color:#cad1df;margin:0 0 10px}.pill{border:1px solid #7c64a8;border-radius:999px;color:#d9c9ff;padding:3px 9px;font-size:12px;display:inline-block}.article{max-width:760px;margin:auto}.article p{font-size:18px;white-space:pre-line;overflow-wrap:anywhere}.article figure{margin:30px 0}.article img{width:100%;border-radius:20px}.article figcaption{font-size:13px;color:var(--muted)}.article footer{border-top:1px solid var(--line);margin-top:50px;padding-top:28px}.article ul{padding-left:20px}footer a{overflow-wrap:anywhere}@media(max-width:600px){header{padding:14px 18px}main{padding:30px 18px 80px}nav{gap:10px}nav a{font-size:12px}}
  </style><link rel="stylesheet" href="/assets/swapp-unified-nav.css?v=20261016-account-dedupe-2"><link rel="stylesheet" href="/assets/swapp-visual-polish.css?v=20261016-mobile-swipe-40"><link rel="stylesheet" href="/assets/swapp-mobile-comfort.css?v=20261016-mobile-readable-3"><link rel="stylesheet" href="/assets/swapp-presentation-polish.css?v=20261017-visual-audit-v16"><link rel="stylesheet" href="/assets/swapp-game-journey.css?v=20261017-home-no-flash-v21"><style>header.top{padding:0!important}header.top #nav.mainNav{flex-wrap:nowrap!important}</style></head><body class="swapp-editorial-route swapp-legacy-news-route">${serverHeader('actus')}${inner}${serverMobile('actus')}<script src="/assets/swapp-media-live.js?v=20261017-stability-store-v14" defer></script><script src="/assets/swapp-nav-session.js" defer></script><script src="/assets/swapp-mobile-nav-follow.js?v=20261016-follow-v2" defer></script></body></html>`;
}
function renderArticle(article, {baseUrl = 'https://swapp.tv'} = {}) {
  const canonical = `${baseUrl}/actus/${encodeURIComponent(article.slug)}`;
  const desc = article.summary || article.body.slice(0, 220);
  const jsonLd = JSON.stringify({'@context':'https://schema.org','@type':'NewsArticle',headline:article.title,description:desc,
    datePublished:article.originalPublishedAt || article.publishedAt,dateModified:article.updatedAt,
    author:{'@type':'Organization',name:article.author},mainEntityOfPage:canonical
  }).replace(/</g,'\\u003c');
  const meta = `<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(article.title)}"><meta property="og:description" content="${escapeHtml(desc)}"><meta property="og:url" content="${escapeHtml(canonical)}">${article.image ? `<meta property="og:image" content="${escapeHtml(article.image.url)}">` : ''}<script type="application/ld+json">${jsonLd}</script>`;
  const paras = article.body.split(/\n\s*\n/).filter(Boolean).map(x=>`<p>${escapeHtml(x)}</p>`).join('');
  const sources=(article.sources||[]).map(s=>`<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(s.label||s.url)}</a></li>`).join('');
  const image=article.image ? `<figure><img src="${escapeHtml(article.image.url)}" alt="" loading="lazy"><figcaption>${escapeHtml(article.image.credit)}</figcaption></figure>` : '';
  const legacy=article.legacyUrl ? `<p class="muted">Publié initialement sur <a href="${escapeHtml(article.legacyUrl)}" rel="noopener noreferrer">JustPlayer</a>.</p>` : '';
  return newsLayout(article.title,desc,`<main><div class="article"><span class="eyebrow">${escapeHtml(article.category)} · JustPlayer × SWAPP</span><h1>${escapeHtml(article.title)}</h1><p class="lead">${escapeHtml(desc)}</p><p class="muted">${escapeHtml(article.author)} · ${escapeHtml((article.originalPublishedAt||article.publishedAt||'').slice(0,10))}</p>${image}<article>${paras}</article><footer>${legacy}<h2>Sources</h2><ul>${sources}</ul><a href="/actus">← Toutes les actualités</a></footer><aside class="swapp-article-related" data-swapp-live-shelf data-game="${escapeHtml(article.game||'')}"><div class="swapp-media-heading"><div><span class="swapp-media-kicker">SWAPP · En direct</span><h2>${article.game ? `Qui joue à ${escapeHtml(article.game)} en direct ?` : 'Les créateurs en direct'}</h2></div><a class="swapp-media-button" href="/decouvrir">Tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives en cours…</p></div></aside></div></main>`,meta);
}
function renderListing(articles, {baseUrl='https://swapp.tv'} = {}) {
  const [featured,...latest]=articles;
  function item(a) {
    const picture=a.image?.url ? '<img src="'+escapeHtml(a.image.url)+'" alt="" loading="lazy">' : '';
    return '<a class="card" href="/actus/'+encodeURIComponent(a.slug)+'">'+picture+
      '<div class="card-content"><span class="pill">'+escapeHtml(a.category||'ACTUS')+'</span><h2>'+escapeHtml(a.title)+
      '</h2><p>'+escapeHtml(a.summary||a.body?.slice(0,160)||'')+'</p><small class="muted">'+
      escapeHtml((a.originalPublishedAt||a.publishedAt||'').slice(0,10))+' · Lire sur SWAPP →</small></div></a>';
  }
  const heroFeature=featured?
    '<span class="swapp-media-kicker">À la une · '+escapeHtml(featured.category||'ACTUS')+'</span>'+
    (featured.image?.url?'<img src="'+escapeHtml(featured.image.url)+'" alt="" loading="lazy">':'')+
    '<h2>'+escapeHtml(featured.title)+'</h2><p>'+escapeHtml(featured.summary||'')+'</p>'+
    '<a class="swapp-media-button primary" href="/actus/'+encodeURIComponent(featured.slug)+'">Lire cet article →</a>':
    '<span class="swapp-media-kicker">La rédaction prend forme</span><h2>Le gaming, ses histoires et ceux qui les vivent.</h2>'+
    '<p>Les prochains articles seront disponibles ici, directement sur SWAPP, avec les lives des créateurs.</p>'+
    '<a class="swapp-media-button" href="/actus/studio">Espace rédaction →</a>';
  const articlesHtml=articles.length?
    '<div class="swapp-media-stories">'+(featured?item(featured):'')+latest.map(item).join('')+'</div>':
    '<div class="swapp-media-empty">Les premiers articles natifs seront publiés ici. En attendant, découvre les créateurs en direct ci-dessus.</div>';
  const content='<main class="swapp-media-main">'+
    '<div class="swapp-media-hero">'+
    '<section class="swapp-media-stage"><span class="swapp-media-kicker">SWAPP · Actualité et lives</span>'+
    '<h1>Lis l’actu.<br>Vis le jeu.</h1>'+
    '<p class="lead">Une information, un jeu, des créateurs : lis ce qui se passe, puis retrouve ceux qui le vivent en direct. Tout dans SWAPP.</p>'+
    '<div class="swapp-media-buttons"><a class="swapp-media-button primary" href="#articles">Explorer les actualités ↓</a>'+
    '<a class="swapp-media-button" href="#en-direct">Regarder les lives →</a></div></section>'+
    '<aside class="swapp-media-feature">'+heroFeature+'</aside></div>'+
    '<section class="swapp-media-section" id="en-direct" data-swapp-live-shelf>'+
    '<div class="swapp-media-heading"><div><span class="swapp-media-kicker">Les créateurs · Maintenant</span>'+
    '<h2>Ça se joue en direct.</h2><p>Lives SWAPP prioritaires, puis découverte Twitch : regarde directement ici.</p></div>'+
    '<a class="swapp-media-button" href="/decouvrir">Tous les lives →</a></div>'+
    '<div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives en cours…</p></div></section>'+
    '<section class="swapp-media-section" id="articles"><div class="swapp-media-heading"><div>'+
    '<span class="swapp-media-kicker">La rédaction · ACTUS</span><h2>À lire. À découvrir. À vivre.</h2>'+
    '<p>Des articles complets publiés sur SWAPP — sans renvoi vers un autre site.</p></div>'+
    '<a class="swapp-media-button" href="/actus/studio">Espace rédaction →</a></div>'+
    articlesHtml+'</section></main>';
  return newsLayout('Actualité — Le média gaming','Toute l’actualité des jeux vidéo et les créateurs en direct, au même endroit : SWAPP.',content,
    '<link rel="canonical" href="'+escapeHtml(baseUrl)+'/actus"><meta property="og:title" content="SWAPP · Actualité et lives">');
}
module.exports={slugify,isHttpUrl,isLegacyJustPlayerUrl,assertArticle,escapeHtml,renderArticle,renderListing};