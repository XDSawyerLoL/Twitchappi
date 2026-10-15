'use strict';
const {escapeHtml}=require('./article-core');
const articleExtras=require('../../assets/swapp-article-extras');
const {layout}=require('./site-shell');
const {getPublicArchives}=require('./archive');
const catalog=require('../../data/justplayer-public-catalog.json');
function dateLabel(input){
 if(!input)return '';
 const d=new Date(input);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d):'';
}
function plainSummary(a){return String(a.summary||a.body||'').slice(0,250);}
function editorialCover(a){
 const youtubeId=articleExtras.trailerId(a?.trailerUrl);
 return a?.image?.url||(youtubeId?'https://i.ytimg.com/vi/'+youtubeId+'/hqdefault.jpg':null);
}
function card(a){
 const url='/actus/'+encodeURIComponent(a.slug);
 const media=editorialCover(a)?`<img class="story-image" src="${escapeHtml(editorialCover(a))}" alt="${escapeHtml(a.title)}" loading="lazy">`:'<div class="story-fallback" aria-hidden="true">✦</div>';
 return `<a class="story-card" href="${url}">${media}<div class="story-info"><span class="tag">${escapeHtml(a.category||'Actualité')}</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(plainSummary(a))}</p><div class="story-meta"><span>${escapeHtml(dateLabel(a.publishedAt||a.originalPublishedAt))}</span><span>Lire l’article →</span></div></div></a>`;
}
function renderNewsHome(articles,{baseUrl='https://swapp.tv',category='',query=''}={}){
 const safeCategory=String(category).slice(0,60),safeQuery=String(query).slice(0,100);
 const categories=[...new Set(articles.map(x=>x.category).filter(Boolean))].slice(0,12);
 const filtered=articles.filter(a=>(!safeCategory||a.category===safeCategory)&&(!safeQuery||[a.title,a.summary,a.game].join(' ').toLocaleLowerCase('fr').includes(safeQuery.toLocaleLowerCase('fr'))));
 const previews=[]; // Historical metadata alone must never be presented as a published article.
 const topPreview=null,topKey='';
 const feature=filtered[0];
 const latest=filtered.slice(1);
 const meta=`<link rel="canonical" href="${escapeHtml(baseUrl)}/actus"><meta property="og:type" content="website"><meta property="og:title" content="SWAPP · Actualité · Le média gaming"><meta property="og:description" content="Actus jeux vidéo, analyses et culture streaming. Toute la rédaction SWAPP.">`;
 const featured=feature?`<div class="hero-side"><div><span class="eyebrow">À la une · ${escapeHtml(feature.category||'Actualités')}</span>${editorialCover(feature)?`<img src="${escapeHtml(editorialCover(feature))}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:14px;margin:16px 0 4px">`:'<div class="decor">✦</div>'}<h2 class="side-title">${escapeHtml(feature.title)}</h2><p class="subtext">${escapeHtml(plainSummary(feature))}</p></div><a class="button-link primary" href="/actus/${encodeURIComponent(feature.slug)}">Lire cet article ↗</a></div>`:`<div class="hero-side"><div><span class="eyebrow">SWAPP · Jeu vidéo</span><h2 class="side-title">Des articles complets, et les créateurs qui vivent ces jeux.</h2><p class="subtext">Retrouve ici les publications intégrales de JustPlayer dès que leur texte et leurs visuels sont récupérés.</p></div><a class="button-link primary" href="/decouvrir">Découvrir les lives →</a></div>`;
 const pills=['<a href="/actus"'+(!safeCategory?' aria-current="page"':'')+'>Tout voir</a>',...categories.map(c=>`<a href="/actus?categorie=${encodeURIComponent(c)}"${safeCategory===c?' aria-current="page"':''}>${escapeHtml(c)}</a>`)].join('');
 const empty=filtered.length===0?`<section class="empty-news"><span class="eyebrow">SWAPP · Magazine</span><h3>${safeCategory||safeQuery?'Aucun article pour cette recherche.':'Aucun article vérifié pour le moment.'}</h3><p>${safeCategory||safeQuery?'Change de catégorie ou reviens à toutes les publications.':'Seuls les articles intégralement récupérés ou publiés par la rédaction apparaissent ici.'}</p><div class="story-actions"><a class="button-link primary" href="/actus/studio">Accéder à la rédaction</a><a class="button-link" href="/decouvrir">Explorer les lives</a></div></section>`:'';

 const migrationSection=''; // Only full articles from Firestore or verified source appear.
 const tiles=latest.map(card).join('');
 const liveSection=`<section class="swapp-media-section" id="en-direct" data-swapp-live-shelf><div class="swapp-media-heading"><div><span class="swapp-media-kicker">SWAPP · EN DIRECT</span><h2>Regarde ceux qui jouent maintenant.</h2><p>Les lives SWAPP d’abord, puis les créateurs Twitch. Sans quitter le média.</p></div><a class="swapp-media-button" href="/decouvrir">Explorer tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives actuellement disponibles…</p></div></section>`;
 const content=`<main class="container"><section class="hero-layout"><div class="hero-main"><span class="eyebrow">SWAPP · Actualités</span><h1 class="headline">Lis l’actu.<br>Vis le jeu.</h1><p>SWAPP rassemble la découverte des lives et l’actualité des jeux vidéo. Chaque article peut faire découvrir les créateurs du jeu.</p><div class="story-actions"><a class="button-link primary" href="#publications">Explorer les articles ↓</a><a class="button-link" href="#en-direct">Voir les lives →</a></div></div>${featured}</section><section id="publications" class="swapp-media-section"><div class="section-title"><div><span class="eyebrow">Actualité · La rédaction</span><h2>L’actualité qui se regarde.</h2><p>Les articles complets, directement ici. Pas de site intermédiaire.</p></div></div><form class="searchbar" action="/actus" method="get" role="search"><input type="search" name="q" maxlength="100" placeholder="Rechercher un jeu, une actualité..." value="${escapeHtml(safeQuery)}" aria-label="Rechercher les actualités"><button class="btn" type="submit">Rechercher</button></form><div class="category-list">${pills}</div>${empty}${tiles?`<div class="story-grid">${tiles}</div>`:''}${feature&&filtered.length===1?`<p class="subtext">Retrouve l'article à la une ci-dessus.</p>`:''}${migrationSection}</section>${liveSection}</main>`;
 return layout({title:'Actualité · Le média gaming',description:'Actualités jeux vidéo, analyses, découvertes et streaming sur SWAPP',content,metadata:meta});
}
function articleHeadings(body){
 const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');
 const headings=[];
 for(const raw of lines){
  const match=raw.trim().match(/^(#{2,3})\s+(.+)$/);
  if(!match)continue;
  headings.push({id:'section-'+(headings.length+1),level:match[1].length,title:match[2].replace(/\*{1,2}/g,'').trim()});
 }
 return headings;
}
function articleContents(article,headings,sourcesAvailable){
 const link=(title,id,subsection=false)=>`<a href="#${escapeHtml(id)}"${subsection?' class="subsection"':''}>${escapeHtml(title)}</a>`;
 const links=[];
 if(headings.length<2)links.push(link('Introduction','article-content'));
 for(const h of headings)links.push(link(h.title,h.id,h.level===3));
 if(!headings.length){
  if(sourcesAvailable)links.push(link('Sources et références','swapp-article-sources'));
  if(article.game)links.push(link('Créateurs en direct','swapp-article-lives'));
 }
 return `<nav class="swapp-reader-toc" aria-label="Sommaire de l’article"><strong>Dans cet article</strong>${links.join('')}</nav>`;
}
function markdown(body){
 // Simple editorial Markdown, always HTML-escaped first. No raw HTML, script or unsafe URLs.
 const escape=s=>escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
 const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');
 let chunks=[],para=[],list=[],headingIndex=0;
 const flushPara=()=>{if(para.length){chunks.push('<p>'+escape(para.join(' '))+'</p>');para=[];}};
 const flushList=()=>{if(list.length){chunks.push('<ul>'+list.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>');list=[];}};
 for(const raw of lines){const line=raw.trim();if(!line){flushPara();flushList();continue;}
  let m;if((m=line.match(/^(#{2,3})\s+(.+)$/))){flushPara();flushList();chunks.push('<h'+m[1].length+' id="section-'+(++headingIndex)+'">'+escape(m[2])+'</h'+m[1].length+'>');}
  else if((m=line.match(/^[-*]\s+(.+)$/))){flushPara();list.push(m[1]);}
  else if((m=line.match(/^>\s?(.+)$/))){flushPara();flushList();chunks.push('<blockquote>'+escape(m[1])+'</blockquote>');}
  else{flushList();para.push(line);}
 }
 flushPara();flushList();return chunks.join('\n');
}
function immersiveCoverUrl(article){
 const source=String(article?.image?.url||'').trim();
 try{
  const u=new URL(source);
  return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';
 }catch{return ''}
}
function renderNewsStory(article,{baseUrl='https://swapp.tv'}={}){
 const url=baseUrl+'/actus/'+encodeURIComponent(article.slug);
 const summary=plainSummary(article);
 const published=article.publishedAt||article.originalPublishedAt;
 const seoTitle=String(article.seo?.title||article.title).slice(0,70);
 const seoDescription=String(article.seo?.description||summary).slice(0,160);
 const tags=Array.isArray(article.tags)?article.tags.filter(v=>typeof v==='string').slice(0,12):[];
 const isVideo=['video','trailer'].includes(article.contentType);
 const videoId=isVideo?require('../../assets/swapp-article-extras').trailerId(article.trailerUrl):null;
 const schema={'@context':'https://schema.org','@type':isVideo?'VideoObject':'NewsArticle',
   name:seoTitle,headline:seoTitle,description:seoDescription,
   datePublished:published,dateModified:article.updatedAt,mainEntityOfPage:url,
   author:{'@type':'Person',name:article.author||'Rédaction SWAPP'},
   keywords:tags.join(', '),...(videoId?{embedUrl:'https://www.youtube-nocookie.com/embed/'+videoId,
      thumbnailUrl:article.image?.url||'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg'}:{})};
 const jsonLd=JSON.stringify(schema).replace(/</g,'\\u003c');
 const shareImage=editorialCover(article);
 const metadata=`<link rel="canonical" href="${escapeHtml(url)}"><meta name="keywords" content="${escapeHtml(tags.join(', '))}"><meta property="og:type" content="${isVideo?'video.other':'article'}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(seoTitle)}"><meta property="og:description" content="${escapeHtml(seoDescription)}">${shareImage?`<meta property="og:image" content="${escapeHtml(shareImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(shareImage)}">`:''}<script type="application/ld+json">${jsonLd}</script>`;
 const coverUrl=immersiveCoverUrl(article);
 const scene=`<div class="swapp-article-scene${coverUrl?' has-art':''}" aria-hidden="true">${coverUrl?`<img src="${escapeHtml(coverUrl)}" alt="" decoding="async" fetchpriority="high">`:''}</div>`;
 const heroCredit=coverUrl&&article.image?.credit?`<p class="swapp-immersive-credit">${escapeHtml(article.image.credit)}</p>`:'';
 const heroActions=`<div class="story-actions swapp-article-hero-actions"><a class="button-link" href="#article-content">Lire l'article ↓</a>${article.game?'<a class="button-link" href="#swapp-article-lives">Voir les lives du jeu ↓</a>':''}</div>`;
 const hero=`<header class="swapp-native-immersive-hero swapp-immersive-hero"><div class="swapp-immersive-content"><span class="eyebrow">${escapeHtml(article.category||'Actualités')} ${article.game?'· '+escapeHtml(article.game):''}</span><h1 class="article-title">${escapeHtml(article.title)}</h1><p class="article-deck">${escapeHtml(summary)}</p><div class="article-byline"><span>Par <strong>${escapeHtml(article.author||'Rédaction SWAPP')}</strong></span><span>·</span><time datetime="${escapeHtml(published||'')}">${escapeHtml(dateLabel(published))}</time></div>${heroActions}${heroCredit}</div></header>`;
 const sources=(article.sources||[]).map(s=>`<li><a href="${escapeHtml(s.url)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(s.label||s.url)}</a></li>`).join('');
 const toc=articleContents(article,articleHeadings(article.body),Boolean(sources));
 const liveSection=`<aside id="swapp-article-lives" class="swapp-article-related swapp-media-section" data-swapp-live-shelf data-game="${escapeHtml(article.game||'')}"><div class="swapp-media-heading"><div><span class="swapp-media-kicker">Actualités & lives</span><h2>${article.game?'En direct sur '+escapeHtml(article.game):'Les créateurs en direct'}</h2><p>Un article peut mener à un live. Les suggestions suivent le jeu de l’article lorsqu’il est renseigné.</p></div><a class="swapp-media-button" href="/decouvrir">Tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives…</p></div></aside>`;
 const content=`<main class="article-wrap">${scene}<p class="breadcrumb"><a href="/actus">SWAPP · Actualité</a> / ${escapeHtml(article.category||'Actualités')}</p>${hero}<div class="swapp-article-reading">${toc}<div id="article-content" class="article-body">${markdown(article.body)}</div></div>${articleExtras.renderServer(article)}${sources?`<aside id="swapp-article-sources" class="sources-panel"><h2>Sources et références</h2><ul>${sources}</ul></aside>`:''}<div class="story-actions"><a class="button-link primary" href="/actus">← Toutes les actualités</a><a class="button-link" href="/decouvrir">Découvrir les lives</a></div>${liveSection}</main>`;
 return layout({title:seoTitle,description:seoDescription,metadata,content});
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