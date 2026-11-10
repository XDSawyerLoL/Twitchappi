'use strict';
const {escapeHtml}=require('./article-core');
const articleExtras=require('../../assets/swapp-article-extras');
const instantGaming=require('../../assets/swapp-instant-gaming');
const {layout}=require('./site-shell');
const {getPublicArchives}=require('./archive');
const {gameSlug}=require('../swapp-game-pages');
const {publicCommunityLinks}=require('../swapp-public-community-links');
const catalog=require('../../data/justplayer-public-catalog.json');
function dateLabel(input){
 if(!input)return '';
 const d=new Date(input);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d):'';
}
function plainSummary(a){return String(a.summary||a.body||'').slice(0,250);}
function editorialCover(a){return articleExtras.cardImageSources(a)[0]||null;}
function card(a){
 const url='/actus/'+encodeURIComponent(a.slug);
 const artwork=editorialCover(a);
 const media=artwork?`<img class="story-image" src="${escapeHtml(artwork)}" alt="${escapeHtml(a.thumbnail?.alt||a.title)}" loading="lazy" style="object-position:${escapeHtml(a.thumbnail?.position||'center')}">`:
  '<div class="story-fallback swapp-story-no-art" aria-hidden="true"><span class="swapp-story-no-art-mark">SWAPP</span><span class="swapp-story-no-art-icon">◈</span><small>LE MAGAZINE GAMING</small></div>';
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
 const featured=feature?`<div class="hero-side"><div><span class="eyebrow">À la une · ${escapeHtml(feature.category||'Actualités')}</span>${editorialCover(feature)?`<img src="${escapeHtml(editorialCover(feature))}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:14px;margin:16px 0 4px">`:'<div class="decor">✦</div>'}<h2 class="side-title">${escapeHtml(feature.title)}</h2><p class="subtext">${escapeHtml(plainSummary(feature))}</p></div><a class="button-link primary" href="/actus/${encodeURIComponent(feature.slug)}">Lire cet article ↗</a></div>`:`<div class="hero-side"><div><span class="eyebrow">SWAPP · Jeu vidéo</span><h2 class="side-title">Des articles complets, et les créateurs qui vivent ces jeux.</h2><p class="subtext">Les articles du magazine SWAPP, à lire ici avec leurs jeux et leurs créateurs.</p></div><a class="button-link primary" href="/decouvrir">Découvrir les lives →</a></div>`;
 const pills=['<a href="/actus"'+(!safeCategory?' aria-current="page"':'')+'>Tout voir</a>',...categories.map(c=>`<a href="/actus?categorie=${encodeURIComponent(c)}"${safeCategory===c?' aria-current="page"':''}>${escapeHtml(c)}</a>`)].join('');
 const empty=filtered.length===0?`<section class="empty-news"><span class="eyebrow">SWAPP · Magazine</span><h3>${safeCategory||safeQuery?'Aucun article pour cette recherche.':'Aucun article vérifié pour le moment.'}</h3><p>${safeCategory||safeQuery?'Change de catégorie ou reviens à toutes les publications.':'Seuls les articles intégralement récupérés ou publiés par la rédaction apparaissent ici.'}</p><div class="story-actions"><a class="button-link primary" href="/actus/studio">Accéder à la rédaction</a><a class="button-link" href="/decouvrir">Explorer les lives</a></div></section>`:'';

 const migrationSection=''; // Only full articles from Firestore or verified source appear.
 const tiles=latest.map(card).join('');
 const liveSection=`<section class="swapp-media-section" id="en-direct" data-swapp-live-shelf><div class="swapp-media-heading"><div><span class="swapp-media-kicker">SWAPP · EN DIRECT</span><h2>Regarde ceux qui jouent maintenant.</h2><p>Les lives SWAPP d’abord, puis les créateurs Twitch. Sans quitter le média.</p></div><a class="swapp-media-button" href="/decouvrir">Explorer tous les lives →</a></div>${spotlight}<div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives actuellement disponibles…</p></div></section>`;
 const content=`<main class="container"><section class="hero-layout"><div class="hero-main"><span class="eyebrow">SWAPP · Actualités</span><h1 class="headline">Lis l’actu.<br>Vis le jeu.</h1><p>SWAPP rassemble la découverte des lives et l’actualité des jeux vidéo. Chaque article peut faire découvrir les créateurs du jeu.</p><div class="story-actions"><a class="button-link primary" href="#publications">Explorer les articles ↓</a><a class="button-link" href="#en-direct">Voir les lives →</a><a class="button-link" href="/on-air">Découvrir ON AIR →</a></div></div>${featured}</section><section id="publications" class="swapp-media-section"><div class="section-title"><div><span class="eyebrow">Actualité · La rédaction</span><h2>L’actualité qui se regarde.</h2><p>Les articles complets, directement ici. Pas de site intermédiaire.</p></div></div><form class="searchbar" action="/actus" method="get" role="search"><input type="search" name="q" maxlength="100" placeholder="Rechercher un jeu, une actualité..." value="${escapeHtml(safeQuery)}" aria-label="Rechercher les actualités"><button class="btn" type="submit">Rechercher</button></form><div class="category-list">${pills}</div>${empty}${tiles?`<div class="story-grid">${tiles}</div>`:''}${feature&&filtered.length===1?`<p class="subtext">Retrouve l'article à la une ci-dessus.</p>`:''}${migrationSection}</section>${liveSection}</main>`;
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

const ARTICLE_ENGAGEMENT_CSS=[
 ".article-body .swapp-article-engagement{--sae-accent:var(--swapp-page-accent,var(--swapp-side-light,#9adfe0));position:relative;isolation:isolate;overflow:hidden;clear:both;margin:clamp(38px,5vw,64px) 0 24px;padding:0;border:1px solid rgba(204,223,235,.17);border-radius:12px;color:#f4f7fa;background:linear-gradient(125deg,rgba(31,43,52,.76),rgba(9,14,21,.96) 67%);box-shadow:0 14px 44px rgba(0,0,0,.13)}",
 ".article-body .swapp-article-engagement::before{content:'';position:absolute;z-index:0;top:0;left:0;width:min(45%,210px);height:2px;background:linear-gradient(90deg,var(--sae-accent),transparent);pointer-events:none}",
 ".article-body .swapp-article-engagement::after{content:'';position:absolute;z-index:0;top:-120px;right:-70px;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--sae-accent) 11%,transparent),transparent 70%);pointer-events:none}",
 ".article-body .swapp-article-engagement .sae-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(195px,245px);align-items:center;gap:clamp(20px,3vw,46px);padding:clamp(25px,3vw,38px);position:relative;z-index:1}",
 ".article-body .swapp-article-engagement .sae-overline{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:14px;color:var(--sae-accent);font:800 10px/1.45 Inter,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase}",
 ".article-body .swapp-article-engagement .sae-beacon{display:inline-block;width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:var(--sae-accent);box-shadow:0 0 12px color-mix(in srgb,var(--sae-accent) 45%,transparent)}",
 ".article-body .swapp-article-engagement .sae-game-context{color:#a4adb9;font-size:10px;letter-spacing:.09em;min-width:0;max-width:100%;overflow-wrap:anywhere}",
 ".article-body .swapp-article-engagement h2{margin:0 0 10px;max-width:540px;color:#f6f7fb;font:850 clamp(25px,3vw,35px)/1.12 Inter,system-ui,sans-serif;letter-spacing:-.055em;text-wrap:balance}",
 ".article-body .swapp-article-engagement h2 em{font-style:normal;color:var(--sae-accent)}",
 ".article-body .swapp-article-engagement .sae-deck{margin:0;max-width:470px;color:#aab6c4;font:400 13px/1.7 Inter,system-ui,sans-serif}",
 ".article-body .swapp-article-engagement .sae-controls{display:grid;gap:10px;align-content:center;min-width:0}",
 ".article-body .swapp-article-engagement .sae-controls button{width:100%;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:12px 15px;border:1px solid rgba(221,239,246,.24);border-radius:5px;background:#ffffff0b;color:#f3f5f8;text-align:center;font:800 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.005em;white-space:normal;cursor:pointer;transition:background-color .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}",
 ".article-body .swapp-article-engagement .sae-controls [data-swapp-follow-game]{background:#f3f6f7;color:#101820;border-color:#f3f6f7}",
 ".article-body .swapp-article-engagement .sae-controls [data-swapp-follow-game]:hover{background:var(--sae-accent);border-color:var(--sae-accent);transform:translateY(-1px)}",
 ".article-body .swapp-article-engagement .sae-controls [data-swapp-follow-game][aria-pressed='true']{background:color-mix(in srgb,var(--sae-accent) 16%,#17212b);border-color:var(--sae-accent);color:#f4faff}",
 ".article-body .swapp-article-engagement .sae-controls [data-swapp-wishlist-game]:hover{background:#ffffff1a;border-color:#d0dce2}",
 ".article-body .swapp-article-engagement .sae-controls [data-swapp-wishlist-game][aria-pressed='true']{color:var(--sae-accent);border-color:var(--sae-accent);background:#ffffff0b}",
 ".article-body .swapp-article-engagement .sae-controls button:disabled{opacity:.45;cursor:not-allowed}",
 ".article-body .swapp-article-engagement :is(button,a):focus-visible{outline:2px solid var(--sae-accent);outline-offset:4px}",
 "@media(prefers-reduced-motion:reduce){.article-body .swapp-article-engagement *{transition:none!important;animation:none!important}}"
 ".article-wrap > .swapp-article-share{--sash-accent:var(--swapp-page-accent,var(--swapp-side-light,#9adfe0));box-sizing:border-box;position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(250px,.9fr) minmax(0,1.45fr);align-items:center;gap:clamp(18px,3.2vw,46px);width:min(1040px,calc(100% - 34px));margin:clamp(16px,3vw,30px) auto clamp(24px,4vw,52px);padding:clamp(22px,3vw,34px);border:1px solid rgba(192,220,245,.20);border-radius:22px;background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--sash-accent) 15%,transparent),transparent 65%),linear-gradient(122deg,#1b2636,#0d1422 72%);box-shadow:0 22px 50px rgba(0,0,0,.18);color:#f6f8ff;scroll-margin-top:100px}",
 ".article-wrap > .swapp-article-share::before{content:'';position:absolute;inset:0 auto 0 0;width:3px;border-radius:22px 0 0 22px;background:linear-gradient(to bottom,var(--sash-accent),transparent 80%);pointer-events:none}",
 ".swapp-article-share .sash-copy{position:relative;z-index:1;min-width:0}",
 ".swapp-article-share .sash-eyebrow{display:inline-flex;align-items:center;gap:8px;margin-bottom:11px;font:800 10px/1.4 Inter,system-ui,sans-serif;letter-spacing:.17em;color:var(--sash-accent)}",
 ".swapp-article-share .sash-eyebrow span{font-size:16px}",
 ".swapp-article-share h2{margin:0 0 11px;font:850 clamp(23px,2.9vw,32px)/1.13 Inter,system-ui,sans-serif;letter-spacing:-.045em;color:#f6f9fd;text-wrap:balance}",
 ".swapp-article-share h2 em{font-style:normal;color:var(--sash-accent)}",
 ".swapp-article-share .sash-copy p{margin:0;color:#aebdd0;font:400 13px/1.65 Inter,system-ui,sans-serif}",
 ".swapp-article-share .sash-interact{position:relative;z-index:1;min-width:0}",
 ".swapp-article-share .sash-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
 ".swapp-article-share .sash-action{box-sizing:border-box;min-width:0;min-height:55px;display:flex;align-items:center;gap:9px;margin:0;padding:12px 14px;border:1px solid rgba(201,223,243,.19);border-radius:13px;background:rgba(255,255,255,.055);color:#e4ecf6;text-decoration:none;text-align:left;font:750 12px/1.35 Inter,system-ui,sans-serif;cursor:pointer;transition:background .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease}",
 ".swapp-article-share .sash-action:hover{background:rgba(255,255,255,.11);border-color:color-mix(in srgb,var(--sash-accent) 65%,white);transform:translateY(-2px);box-shadow:0 8px 18px rgba(0,0,0,.14)}",
 ".swapp-article-share .sash-action.sash-primary{border-color:color-mix(in srgb,var(--sash-accent) 48%,transparent);background:color-mix(in srgb,var(--sash-accent) 20%,#172334);color:#fff}",
 ".swapp-article-share .sash-logo{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:8px;background:#ffffff14;color:#f4f8fa;font-size:18px;font-weight:900}",
 ".swapp-article-share .sash-primary .sash-logo{background:color-mix(in srgb,var(--sash-accent) 32%,transparent);color:var(--sash-accent)}",
 ".swapp-article-share .sash-blue{color:#72b7ff}",
 ".swapp-article-share .sash-arrow{margin-left:auto;color:#90a6ba;font-size:13px}",
 ".swapp-article-share .sash-after{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 15px;min-height:28px;margin-top:13px}",
 ".swapp-article-share .sash-discord{display:inline-flex;align-items:center;gap:7px;font:750 12px/1.4 Inter,system-ui,sans-serif;color:#b6a6ff;text-decoration:none}",
 ".swapp-article-share .sash-discord:hover{text-decoration:underline;color:#ded5ff}",
 ".swapp-article-share .sash-discord-mark{font-size:16px}",
 ".swapp-article-share .sash-notice{font:650 11px/1.35 Inter,system-ui,sans-serif;color:var(--sash-accent);overflow-wrap:anywhere}",
 ".swapp-article-share :is(a,button):focus-visible{outline:2px solid var(--sash-accent);outline-offset:3px}",
 ".article-body .swapp-article-engagement .sae-invite{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;padding:15px clamp(25px,3vw,38px);border-top:1px solid rgba(207,225,235,.13);background:rgba(0,0,0,.15);color:#b7c4d3;font:600 12px/1.5 Inter,system-ui,sans-serif}",
 ".article-body .swapp-article-engagement .sae-invite a{color:var(--sae-accent);text-decoration:none;font-weight:800}",
 ".article-body .swapp-article-engagement .sae-invite a:hover{text-decoration:underline}",
 "@media(max-width:860px){.article-wrap > .swapp-article-share{grid-template-columns:minmax(0,1fr);gap:19px}.swapp-article-share .sash-copy p{max-width:570px}}",
 "@media(max-width:560px){.article-wrap > .swapp-article-share{width:calc(100% - 24px);padding:20px 16px;border-radius:16px}.swapp-article-share .sash-actions{gap:8px}.swapp-article-share .sash-action{min-height:55px;padding:9px;gap:6px;font-size:11px;border-radius:10px}.swapp-article-share .sash-logo{flex-basis:25px;width:25px;height:25px;font-size:16px}.swapp-article-share .sash-arrow{display:none}}",
 "@media(max-width:360px){.swapp-article-share .sash-actions{grid-template-columns:minmax(0,1fr)}.swapp-article-share .sash-action{min-height:45px}}",
 "@media(prefers-reduced-motion:reduce){.swapp-article-share *{transition:none!important;animation:none!important}}",
].join('');
function renderArticleShare(article,baseUrl='https://swapp.tv'){
 const slug=String(article?.slug||'');
 if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return '';
 const articleUrl=baseUrl.replace(/\/$/,'')+'/actus/'+encodeURIComponent(slug);
 const headline=String(article.title||'Une actualité à découvrir sur SWAPP').trim().slice(0,130);
 const game=String(article.game||'').trim();
 const shareX='https://x.com/intent/tweet?'+new URLSearchParams({text:headline,url:articleUrl}).toString();
 const shareBlue='https://bsky.app/intent/compose?text='+encodeURIComponent(headline+'\n'+articleUrl);
 const social='/social?'+new URLSearchParams(game?{game,share:'news',title:headline,url:articleUrl}:{share:'news',title:headline,url:articleUrl}).toString();
 const discord=publicCommunityLinks().discordInvite;
 return '<section id="swapp-article-share" class="swapp-article-share" aria-labelledby="swapp-share-title" data-swapp-article-share>'+
  '<div class="sash-copy">'+
   '<span class="sash-eyebrow"><span aria-hidden="true">✦</span> FAIS CIRCULER L’INFO</span>'+
   '<h2 id="swapp-share-title">Cette actu mérite <em>d’être partagée.</em></h2>'+
   '<p>Tu connais un joueur que ça intéresse ? Envoie-lui l’article ou lance la discussion.</p>'+
  '</div>'+
  '<div class="sash-interact"><nav class="sash-actions" aria-label="Partager cet article">'+
   '<a class="sash-action sash-primary" href="'+escapeHtml(social)+'" aria-label="Discuter de cet article sur SWAPP Social"><span class="sash-logo" aria-hidden="true">⌗</span><span>En parler sur SWAPP</span><span class="sash-arrow" aria-hidden="true">↗</span></a>'+
   '<a class="sash-action" href="'+escapeHtml(shareX)+'" target="_blank" rel="noopener noreferrer" aria-label="Partager cet article sur X"><span class="sash-logo" aria-hidden="true">𝕏</span><span>Partager sur X</span><span class="sash-arrow" aria-hidden="true">↗</span></a>'+
   '<a class="sash-action" href="'+escapeHtml(shareBlue)+'" target="_blank" rel="noopener noreferrer" aria-label="Partager cet article sur Bluesky"><span class="sash-logo sash-blue" aria-hidden="true">✦</span><span>Bluesky</span><span class="sash-arrow" aria-hidden="true">↗</span></a>'+
   '<button class="sash-action" type="button" data-swapp-share-copy data-article-url="'+escapeHtml(articleUrl)+'" aria-label="Copier le lien de cet article"><span class="sash-logo" aria-hidden="true">↗</span><span data-swapp-share-copy-label>Copier le lien</span><span class="sash-arrow" aria-hidden="true">+</span></button>'+
  '</nav><div class="sash-after">'+
   (discord?'<a class="sash-discord" href="'+escapeHtml(discord)+'" target="_blank" rel="noopener noreferrer"><span class="sash-discord-mark" aria-hidden="true">◈</span> Rejoins les échanges sur Discord <span aria-hidden="true">↗</span></a>':'<span>Partage la découverte avec tes amis.</span>')+
   '<span class="sash-notice" data-swapp-share-notice role="status" aria-live="polite"></span>'+
  '</div></div></section>';
}
function renderArticleEngagement(article,baseUrl='https://swapp.tv'){
 const slug=String(article?.slug||'');
 if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return '';
 const game=String(article.game||'').trim(),key=game?gameSlug(game):'';
 const controls=key?
  '<div class="sae-controls" aria-label="Tes actions sur ce jeu">'+
   '<button type="button" data-swapp-follow-game data-game-slug="'+escapeHtml(key)+'" data-game-name="'+escapeHtml(game)+'" aria-pressed="false">＋ Suivre ce jeu</button>'+
   '<button type="button" data-swapp-wishlist-game data-game-slug="'+escapeHtml(key)+'" data-game-name="'+escapeHtml(game)+'" aria-pressed="false">♡ Mes envies</button>'+
  '</div>':'';
 return '<section class="swapp-article-engagement" aria-labelledby="swapp-article-community-title">'+
  '<div class="sae-main"><div class="sae-copy">'+
   '<span class="sae-overline"><span class="sae-beacon" aria-hidden="true"></span> SWAPP / APRÈS L’ARTICLE'+(game?'<span class="sae-game-context">— '+escapeHtml(game)+'</span>':'')+'</span>'+
   '<h2 id="swapp-article-community-title">'+(game?'Le jeu continue. <em>Avec toi.</em>':'La conversation <em>continue.</em>')+'</h2>'+
   '<p class="sae-deck">'+(game?'Suis le jeu, garde-le dans tes envies et retrouve ceux qui y jouent.':'Retrouve d’autres joueurs et participe aux échanges autour des prochaines actualités.')+'</p>'+
  '</div>'+controls+'</div>'+
  '<div class="sae-invite">Une info utile à partager ? <a href="#swapp-article-share">Fais-la découvrir à tes amis <span aria-hidden="true">↗</span></a></div>'+
 '</section>';
}

function renderNewsStory(originalArticle,{baseUrl='https://swapp.tv',relatedArticles=[],gameHubUrl=null}={}){
 // Interpret an explicit remaster headline using the Twitch edition identity
 // without mutating persistent article metadata in the database.
 const corrected=require('./editorial-corrections').correctWoWForever(originalArticle);
 const article={...corrected,game:require('./game-identity').editorialGame(corrected)};
 const url=baseUrl+'/actus/'+encodeURIComponent(article.slug);
 const summary=plainSummary(article);
 const published=article.originalPublishedAt||article.publishedAt;
 const seoTitle=String(article.seo?.title||article.title).slice(0,70);
 const seoDescription=String(article.seo?.description||summary).slice(0,160);
 const tags=Array.isArray(article.tags)?article.tags.filter(v=>typeof v==='string').slice(0,12):[];
 const isVideo=['video','trailer'].includes(article.contentType);
 const videoId=isVideo?articleExtras.trailerId(article.trailerUrl):null;
 const heroVideoId=articleExtras.heroTrailerId(article);
 const shareImage=editorialCover(article);
 // Google's video rich results require uploadDate, name and thumbnailUrl.
 // Keep actual origin dates on imported editorials; never invent publish times.
 const author={'@type':'Person',name:article.author||'Rédaction SWAPP'};
 const publisher={'@type':'Organization',name:'SWAPP',url:'https://swapp.tv'};
 const schema={'@context':'https://schema.org','@type':isVideo?'VideoObject':'NewsArticle',
   name:seoTitle,headline:seoTitle,description:seoDescription,
   ...(published?{datePublished:published}:{}),
   ...(article.updatedAt?{dateModified:article.updatedAt}:{}),
   mainEntityOfPage:url,author,publisher,keywords:tags.join(', '),
   ...(shareImage?{image:[shareImage]}:{}),
   ...(videoId?{embedUrl:'https://www.youtube-nocookie.com/embed/'+videoId,
      thumbnailUrl:shareImage||'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg',
      ...((article.trailerPublishedAt||published)?{uploadDate:article.trailerPublishedAt||published}:{})}:{})};
 const jsonLd=JSON.stringify(schema).replace(/</g,'\\u003c');
 const metadata=`<link rel="canonical" href="${escapeHtml(url)}"><meta name="keywords" content="${escapeHtml(tags.join(', '))}"><meta property="og:type" content="${isVideo?'video.other':'article'}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(seoTitle)}"><meta property="og:description" content="${escapeHtml(seoDescription)}">${shareImage?`<meta property="og:image" content="${escapeHtml(shareImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(shareImage)}">`:''}<script type="application/ld+json">${jsonLd}</script>`;
 const coverUrl=immersiveCoverUrl(article);
 const poster=heroVideoId?coverUrl||'https://i.ytimg.com/vi/'+heroVideoId+'/hqdefault.jpg':'';
 const hasGame=articleExtras.isGameArticle(article);
 const scene='<div class="swapp-article-scene'+(coverUrl||poster?' has-art':'')+
  (hasGame?' has-game':'')+(heroVideoId?' has-trailer':'')+'" aria-hidden="true"'+
  (heroVideoId?' data-swapp-trailer-id="'+heroVideoId+'" data-swapp-trailer-title="'+escapeHtml(String(article.game||article.title||'Jeu vidéo').slice(0,140))+'"':'')+'>'+
  (heroVideoId?'<img class="swapp-article-trailer-poster" src="'+escapeHtml(poster)+'" alt="" decoding="async" fetchpriority="high">':
   coverUrl?'<img src="'+escapeHtml(coverUrl)+'" alt="" decoding="async" fetchpriority="high">':'')+
  '</div>';
 const heroCredit=coverUrl&&article.image?.credit?`<p class="swapp-immersive-credit">${escapeHtml(article.image.credit)}</p>`:'';
 const discussUrl='/communaute?share=news&title='+encodeURIComponent(article.game?article.game+' — '+article.title:article.title)+'&url='+encodeURIComponent(baseUrl.replace(/\/$/,'')+'/actus/'+article.slug);
 const flashAction=article.status==='published'&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(article.slug||''))&&String(article.summary||'').trim().length>=40
  ?'<a class="button-link" href="/flash/'+encodeURIComponent(article.slug)+'">Découvrir en FLASH →</a>':'';
 const heroActions=`<div class="story-actions swapp-article-hero-actions swapp-game-journey-actions" aria-label="Explorer ce jeu sur SWAPP"><a class="button-link primary" href="#article-content">Lire l’article ↓</a>${flashAction}<a class="button-link" href="${article.game?'#swapp-article-lives':'/decouvrir'}">Voir les lives →</a><a class="button-link" href="${escapeHtml(discussUrl)}">En discuter →</a></div>`;
 const hero=`<header id="swapp-article-hero" class="swapp-native-immersive-hero swapp-immersive-hero"><div class="swapp-immersive-content"><span class="eyebrow">${escapeHtml(article.category||'Actualités')} ${article.game?'· '+escapeHtml(article.game):''}</span><h1 class="article-title">${escapeHtml(article.title)}</h1><p class="article-deck">${escapeHtml(summary)}</p><div class="article-byline"><span>Par <strong>${escapeHtml(article.author||'Rédaction SWAPP')}</strong></span><span>·</span><time datetime="${escapeHtml(published||'')}">${escapeHtml(dateLabel(published))}</time></div>${heroActions}${heroCredit}</div></header>`;
 const sources=(article.sources||[]).map(s=>`<li><a href="${escapeHtml(s.url)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(s.label||s.url)}</a></li>`).join('');
 const toc=articleContents(article,articleHeadings(article.body),Boolean(sources));
 const related=(Array.isArray(relatedArticles)?relatedArticles:[]).filter(x=>
  x&&x.slug!==article.slug&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(x.slug||''))).slice(0,3);
 const nextLinks=related.map(x=>{
  const art=editorialCover(x);
  return `<a class="swapp-reader-next-item" href="/actus/${encodeURIComponent(x.slug)}">${art?`<img class="swapp-reader-next-thumb" src="${escapeHtml(art)}" alt="" loading="lazy">`:''}<span class="swapp-reader-next-copy"><small>${escapeHtml(x.game||x.category||'Actualité')}</small><strong>${escapeHtml(x.title||'Article SWAPP')}</strong></span></a>`;
 }).join('');
 const manualPartner=articleExtras.partnerOffersHtml(article);
 const sponsor=manualPartner?null:instantGaming.forArticle(article);
 const sponsorHtml=sponsor?
  `<aside class="swapp-affiliate-offer" aria-label="Offre partenaire Instant Gaming · lien affilié"><span class="swapp-affiliate-kicker">OFFRE INSTANT GAMING · LIEN AFFILIÉ</span><strong class="swapp-affiliate-game">${escapeHtml(sponsor.game)}</strong><span class="swapp-affiliate-platform">${escapeHtml(sponsor.platform)}</span><a class="swapp-affiliate-link" href="${escapeHtml(sponsor.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Voir l’offre ↗</a></aside>`:'';
 const partnerFooter=manualPartner?`<section class="swapp-article-partners" aria-label="Pour aller plus loin"><h2>Pour aller plus loin</h2>${manualPartner}<p class="swapp-article-partner-disclosure"><strong>Lien affilié · commission possible.</strong> Un achat via ce lien peut rémunérer SWAPP. Les liens rémunérés n’influencent ni le choix des sujets ni notre indépendance éditoriale.</p></section>`:'';
 const nextReading=`<details class="swapp-reader-next" open><summary>À découvrir ensuite</summary><div class="swapp-reader-next-list">${nextLinks||'<a class="swapp-reader-next-all" href="/actus">Explorer toute l’actualité →</a>'}</div>${sponsorHtml}</details>`;
 const spotlight=article.game?'<div class="swapp-spotlight-public" data-spotlight-game="'+escapeHtml(article.game)+'" aria-label="Créateurs Spotlight"></div>':'';
 const liveSection=`<aside id="swapp-article-lives" class="swapp-article-related swapp-media-section" data-swapp-live-shelf data-game="${escapeHtml(article.game||'')}"><div class="swapp-media-heading"><div><span class="swapp-media-kicker">Actualités & lives</span><h2>${article.game?'En direct sur '+escapeHtml(article.game):'Les créateurs en direct'}</h2><p>Un article peut mener à un live. Les suggestions suivent le jeu de l’article lorsqu’il est renseigné.</p></div><a class="swapp-media-button" href="/decouvrir">Tous les lives →</a></div><div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives…</p></div></aside>`;
 const content=`<main class="article-wrap" data-swapp-article-slug="${escapeHtml(article.slug)}">${scene}<p class="breadcrumb"><a href="/actus">SWAPP · Actualité</a> / ${escapeHtml(article.category||'Actualités')}</p>${hero}${renderArticleShare(article,baseUrl)}<div class="swapp-article-reading">${toc}<div id="article-content" class="article-body">${markdown(article.body)}${partnerFooter}${renderArticleEngagement(article,baseUrl)}</div>${nextReading}</div>${articleExtras.renderServer(article)}${liveSection}<nav class="swapp-article-end-nav" aria-label="Retour après lecture"><a href="/actus">← Revenir à l’actualité</a></nav></main>`;
 return layout({title:seoTitle,description:seoDescription,metadata,content,extraCss:ARTICLE_ENGAGEMENT_CSS,scripts:'<script src="/assets/swapp-article-share.js?v=20261110-share-v1" defer></script>'});
}

function renderJustPlayerPreview(item, article=null) {
 const title=String(item.title||'Publication archivée').slice(0,180);
 const url=String(item.url||'');
 const date=dateLabel(item.publishedAt);
 const full=Boolean(article?.body && String(article.body).length>=80);
 const content='<main class="article-wrap"><p class="breadcrumb"><a href="/actus">SWAPP · Actualités</a> / Archives</p>'+
   '<span class="eyebrow">Archives de la rédaction SWAPP</span><h1 class="article-title">'+escapeHtml(title)+'</h1>'+
   '<div class="article-byline">'+escapeHtml(date)+'</div>'+
   (full ? '<p class="article-deck">Publication historique récupérée ; la mise en forme et les médias doivent encore être vérifiés.</p><article class="article-body">'+markdown(article.body)+'</article>' :
     '<div class="empty-news"><h2>Texte complet en cours d’intégration</h2><p>La publication est bien répertoriée. Son contenu intégral n’a pas pu être récupéré de façon fiable. Aucun article n’est inventé.</p></div>')+
   '<div class="story-actions"><a class="button-link primary" href="/actus">← Retour à SWAPP Actualités</a>'+
   '<a class="button-link" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(url)+'">Consulter la publication d’origine ↗</a></div></main>';
 return layout({title,description:'Publication historique en cours de reprise dans SWAPP',metadata:'<meta name="robots" content="noindex,follow">',content});
}

module.exports={renderNewsHome,renderNewsStory,renderJustPlayerPreview,renderArticleEngagement,markdown,dateLabel};