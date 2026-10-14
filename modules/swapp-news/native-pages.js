'use strict';
const {escapeHtml}=require('./article-core');
const {layout}=require('./site-shell');
const {getPublicArchives}=require('./archive');
const catalog=require('../../data/justplayer-public-catalog.json');
function dateLabel(input){
 if(!input)return '';
 const d=new Date(input);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d):'';
}
function plainSummary(a){return String(a.summary||a.body||'').slice(0,250);}
function card(a){
 const url='/actus/'+encodeURIComponent(a.slug);
 const media=a.image?.url?`<img class="story-image" src="${escapeHtml(a.image.url)}" alt="${escapeHtml(a.title)}" loading="lazy">`:'<div class="story-fallback" aria-hidden="true">✦</div>';
 return `<a class="story-card" href="${url}">${media}<div class="story-info"><span class="tag">${escapeHtml(a.category||'ACTUS')}</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(plainSummary(a))}</p><div class="story-meta"><span>${escapeHtml(dateLabel(a.publishedAt||a.originalPublishedAt))}</span><span>Lire l’article →</span></div></div></a>`;
}
function renderNewsHome(articles,{baseUrl='https://swapp.tv',category='',query=''}={}){
 const safeCategory=String(category).slice(0,60),safeQuery=String(query).slice(0,100);
 const categories=[...new Set(articles.map(x=>x.category).filter(Boolean))].slice(0,12);
 const filtered=articles.filter(a=>(!safeCategory||a.category===safeCategory)&&(!safeQuery||[a.title,a.summary,a.game].join(' ').toLocaleLowerCase('fr').includes(safeQuery.toLocaleLowerCase('fr'))));
 const feature=filtered[0];
 const latest=filtered.slice(1);
 const meta=`<link rel="canonical" href="${escapeHtml(baseUrl)}/actus"><meta property="og:type" content="website"><meta property="og:title" content="SWAPP ACTUS · Le média gaming"><meta property="og:description" content="Actus jeux vidéo, analyses et culture streaming. Toute la rédaction SWAPP.">`;
 const featured=feature?`<div class="hero-side"><div><span class="eyebrow">À la une · ${escapeHtml(feature.category||'Actualités')}</span>${feature.image?.url?`<img src="${escapeHtml(feature.image.url)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:14px;margin:16px 0 4px">`:'<div class="decor">✦</div>'}<h2 class="side-title">${escapeHtml(feature.title)}</h2><p class="subtext">${escapeHtml(plainSummary(feature))}</p></div><a class="button-link primary" href="/actus/${encodeURIComponent(feature.slug)}">Lire cet article ↗</a></div>`:`<div class="hero-side"><div><span class="eyebrow">L’univers SWAPP</span><div class="decor">✦</div><h2 class="side-title">Le gaming, ses histoires et ceux qui le font vivre.</h2><p class="subtext">Un même endroit pour l’actualité, les jeux et les créateurs.</p></div><a class="button-link primary" href="/decouvrir">Découvrir les lives →</a></div>`;
 const pills=['<a href="/actus"'+(!safeCategory?' aria-current="page"':'')+'>Tout voir</a>',...categories.map(c=>`<a href="/actus?categorie=${encodeURIComponent(c)}"${safeCategory===c?' aria-current="page"':''}>${escapeHtml(c)}</a>`)].join('');
 const empty=filtered.length===0?`<section class="empty-news"><span class="eyebrow">SWAPP · Magazine</span><h3>${safeCategory||safeQuery?'Aucun article pour cette recherche.':'La rédaction prend forme.'}</h3><p>${safeCategory||safeQuery?'Change de catégorie ou reviens à toutes les publications.':'La rubrique est désormais native à SWAPP. Les articles validés paraîtront ici, avec leurs images et leurs textes complets.'}</p><div class="story-actions"><a class="button-link primary" href="/actus/studio">Accéder à la rédaction</a><a class="button-link" href="/decouvrir">Explorer les lives</a></div></section>`:'';
 const previews=getPublicArchives(catalog,articles).filter(a=>!safeQuery||a.title.toLocaleLowerCase('fr').includes(safeQuery.toLocaleLowerCase('fr'))).slice(0,24);
 const previewCards=previews.map(a=>{
   const id=String(a.url||'').split('/').filter(Boolean).at(-1);
   const isVideo=a.type==='video_embed';
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))return '';
   return '<a class="story-card" href="/actus/justplayer/'+encodeURIComponent(id)+'">'+
     '<div class="story-fallback" aria-hidden="true">'+(isVideo?'▶':'JP')+'</div>'+
     '<div class="story-info"><span class="tag">'+(isVideo?'Vidéo JustPlayer':'JustPlayer · En cours d’intégration')+'</span>'+
     '<h3>'+escapeHtml(a.title)+'</h3><p>'+escapeHtml(dateLabel(a.publishedAt))+
     ' · Découvrir cette publication dans SWAPP.</p>'+
     '<div class="story-meta"><span>JustPlayer</span><span>Voir la fiche →</span></div></div></a>';
 }).join('');
 const migrationSection=previewCards?
   '<section class="swapp-media-section" id="justplayer"><div class="section-title"><div>'+
     '<span class="eyebrow">JustPlayer rejoint SWAPP</span><h2>Les publications JustPlayer</h2>'+
     '<p>Ces titres restent disponibles ici pendant la récupération de leurs contenus complets. Les fiches s’ouvrent dans SWAPP, sans redirection imposée.</p>'+
     '</div></div><div class="story-grid">'+previewCards+'</div></section>':'';
 const tiles=latest.map(card).join('');
 const liveSection=`<section class="swapp-media-section" id="en-direct" data-swapp-live-shelf><div class="swapp-media-heading"><div><span class="swapp-media-kicker">SWAPP · EN DIRECT</span><h2>Regarde ceux qui jouent maintenant.</h2><p>Les lives SWAPP d’abord, puis les créateurs Twitch. Sans quitter le média.</p></div><a class="swapp-media-button" href="/decouvrir">Explorer tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives actuellement disponibles…</p></div></section>`;
 const content=`<main class="container"><section class="hero-layout"><div class="hero-main"><span class="eyebrow">SWAPP · Actualités</span><h1 class="headline">Lis l’actu.<br>Vis le jeu.</h1><p>SWAPP rassemble la découverte des lives et l’actualité des jeux vidéo. Chaque article peut faire découvrir les créateurs du jeu.</p><div class="story-actions"><a class="button-link primary" href="#publications">Explorer les articles ↓</a><a class="button-link" href="#en-direct">Voir les lives →</a></div></div>${featured}</section>${liveSection}<section id="publications" class="swapp-media-section"><div class="section-title"><div><span class="eyebrow">ACTUS · La rédaction</span><h2>L’actualité qui se regarde.</h2><p>Les articles complets, directement ici. Pas de site intermédiaire.</p></div></div><form class="searchbar" action="/actus" method="get" role="search"><input type="search" name="q" maxlength="100" placeholder="Rechercher un jeu, une actualité..." value="${escapeHtml(safeQuery)}" aria-label="Rechercher les actualités"><button class="btn" type="submit">Rechercher</button></form><div class="category-list">${pills}</div>${empty}${tiles?`<div class="story-grid">${tiles}</div>`:''}${feature&&filtered.length===1?`<p class="subtext">Retrouve l'article à la une ci-dessus.</p>`:''}</section>${migrationSection}</main>`;
 return layout({title:'ACTUS · Le média gaming',description:'Actualités jeux vidéo, analyses, découvertes et streaming sur SWAPP',content,metadata:meta});
}
function markdown(body){
 // Simple editorial Markdown, always HTML-escaped first. No raw HTML, script or unsafe URLs.
 const escape=s=>escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
 const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');
 let chunks=[],para=[],list=[];
 const flushPara=()=>{if(para.length){chunks.push('<p>'+escape(para.join(' '))+'</p>');para=[];}};
 const flushList=()=>{if(list.length){chunks.push('<ul>'+list.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>');list=[];}};
 for(const raw of lines){const line=raw.trim();if(!line){flushPara();flushList();continue;}
  let m;if((m=line.match(/^(#{2,3})\s+(.+)$/))){flushPara();flushList();chunks.push('<h'+m[1].length+'>'+escape(m[2])+'</h'+m[1].length+'>');}
  else if((m=line.match(/^[-*]\s+(.+)$/))){flushPara();list.push(m[1]);}
  else if((m=line.match(/^>\s?(.+)$/))){flushPara();flushList();chunks.push('<blockquote>'+escape(m[1])+'</blockquote>');}
  else{flushList();para.push(line);}
 }
 flushPara();flushList();return chunks.join('\n');
}
function renderNewsStory(article,{baseUrl='https://swapp.tv'}={}){
 const url=baseUrl+'/actus/'+encodeURIComponent(article.slug);
 const summary=plainSummary(article);
 const published=article.publishedAt||article.originalPublishedAt;
 const jsonLd=JSON.stringify({'@context':'https://schema.org','@type':'NewsArticle',headline:article.title,description:summary,datePublished:published,dateModified:article.updatedAt,mainEntityOfPage:url,author:{'@type':'Person',name:article.author||'Rédaction SWAPP'}}).replace(/</g,'\\u003c');
 const metadata=`<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:type" content="article"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(article.title)}"><meta property="og:description" content="${escapeHtml(summary)}">${article.image?.url?`<meta property="og:image" content="${escapeHtml(article.image.url)}">`:''}<script type="application/ld+json">${jsonLd}</script>`;
 const cover=article.image?.url?`<figure><img class="cover-img" src="${escapeHtml(article.image.url)}" alt="${escapeHtml(article.title)}"><figcaption class="image-credit">${escapeHtml(article.image.credit||'')}</figcaption></figure>`:'';
 const sources=(article.sources||[]).map(s=>`<li><a href="${escapeHtml(s.url)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(s.label||s.url)}</a></li>`).join('');
 const liveSection=`<aside class="swapp-article-related swapp-media-section" data-swapp-live-shelf data-game="${escapeHtml(article.game||'')}"><div class="swapp-media-heading"><div><span class="swapp-media-kicker">Actualités & lives</span><h2>${article.game?'En direct sur '+escapeHtml(article.game):'Les créateurs en direct'}</h2><p>Un article peut mener à un live. Les suggestions suivent le jeu de l’article lorsqu’il est renseigné.</p></div><a class="swapp-media-button" href="/decouvrir">Tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives…</p></div></aside>`;
 const content=`<main class="article-wrap"><p class="breadcrumb"><a href="/actus">SWAPP ACTUS</a> / ${escapeHtml(article.category||'Actualités')}</p><span class="eyebrow">${escapeHtml(article.category||'Actualités')} ${article.game?'· '+escapeHtml(article.game):''}</span><h1 class="article-title">${escapeHtml(article.title)}</h1><p class="article-deck">${escapeHtml(summary)}</p><div class="article-byline"><span>Par <strong>${escapeHtml(article.author||'Rédaction SWAPP')}</strong></span><span>·</span><time datetime="${escapeHtml(published||'')}">${escapeHtml(dateLabel(published))}</time></div>${cover}<div class="article-body">${markdown(article.body)}</div>${sources?`<aside class="sources-panel"><h2>Sources et références</h2><ul>${sources}</ul></aside>`:''}<div class="story-actions"><a class="button-link primary" href="/actus">← Toutes les actualités</a><a class="button-link" href="/decouvrir">Découvrir les lives</a></div>${liveSection}</main>`;
 return layout({title:article.title,description:summary,metadata,content});
}

function renderJustPlayerPreview(item, article=null) {
 const title=String(item.title||'Publication JustPlayer').slice(0,180);
 const url=String(item.url||'');
 const date=dateLabel(item.publishedAt);
 const full=Boolean(article?.body && String(article.body).length>=80);
 const content='<main class="article-wrap"><p class="breadcrumb"><a href="/actus">SWAPP · Actualités</a> / JustPlayer</p>'+
   '<span class="eyebrow">JustPlayer rejoint SWAPP</span><h1 class="article-title">'+escapeHtml(title)+'</h1>'+
   '<div class="article-byline">'+escapeHtml(date)+'</div>'+
   (full ? '<p class="article-deck">Publication d’origine récupérée depuis JustPlayer ; la mise en forme et les médias sont en cours de vérification.</p><article class="article-body">'+markdown(article.body)+'</article>' :
     '<div class="empty-news"><h2>Texte complet en cours d’intégration</h2><p>La publication est bien répertoriée. Son contenu intégral n’a pas pu être récupéré de façon fiable. Aucun article n’est inventé.</p></div>')+
   '<div class="story-actions"><a class="button-link primary" href="/actus">← Retour à SWAPP Actualités</a>'+
   '<a class="button-link" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(url)+'">Source originale JustPlayer ↗</a></div></main>';
 return layout({title,description:'Publication JustPlayer en cours d’intégration dans SWAPP',metadata:'<meta name="robots" content="noindex,follow">',content});
}

module.exports={renderNewsHome,renderNewsStory,renderJustPlayerPreview,markdown,dateLabel};