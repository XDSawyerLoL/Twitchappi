'use strict';
// SWAPP FLASH: short interactive story generated from approved, published news.
// No generative voice, AI API, external tracking, or fact invention.
const {layout}=require('./swapp-news/site-shell');
const {gameSlug}=require('./swapp-game-pages');
const {cardImageSources}=require('../assets/swapp-article-extras');
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/, VIDEO=/^[A-Za-z0-9_-]{11}$/;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=(s,n=400)=>{s=String(s||'').replace(/\s+/g,' ').trim();if(s.length<=n)return s;
 const cut=s.slice(0,n),i=cut.lastIndexOf(' ');return cut.slice(0,i>n*.7?i:n)+'…';};
function https(raw){try{const u=new URL(String(raw||''));return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
function youtube(raw){
 const link=https(raw);if(!link)return '';
 const u=new URL(link);let id='';
 if(u.hostname==='youtu.be')id=u.pathname.split('/')[1]||'';
 else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)){
  if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
  else if(/^\/(embed|shorts)\//.test(u.pathname))id=u.pathname.split('/')[2]||'';
 }
 return VIDEO.test(id)?id:'';
}
function plain(s){
 return String(s||'').replace(/!\[([^\]]*)\]\([^)]+\)/g,'$1')
 .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/<[^>]+>/g,'')
 .replace(/[\u0060*_~]/g,'').replace(/^\s*>\s?/gm,'').replace(/\s+/g,' ').trim();
}
function excerpts(article,limit=3){
 const out=[],seen=new Set(),summary=plain(article?.summary).toLocaleLowerCase('fr');
 for(const paragraph of String(article?.body||'').split(/\n\s*\n/)){
  if(out.length>=limit)break;
  const raw=paragraph.trim();
  if(!raw||/^(#{1,6}\s|!\[|---|<|[-*]\s)/.test(raw))continue;
  const value=plain(raw),key=value.toLocaleLowerCase('fr');
  // Complete, readable excerpts only. Never trim a fact into a misleading claim.
  if(value.length<65||value.length>340||/https?:\/\//.test(value)||seen.has(key)||summary.includes(key))continue;
  seen.add(key);out.push(value);
 }
 return out;
}
function model(article){
 if(!article||article.status!=='published'||article.legacySuppressRecovery===true||!SLUG.test(String(article.slug||'')))return null;
 const title=String(article.title||'').trim(),summary=plain(article.summary||'');
 if(title.length<8||summary.length<40)return null;
 const game=String(article.game||'').trim().slice(0,100);
 let cover='';
 try{cover=(cardImageSources(article)||[]).map(https).find(Boolean)||''}catch{}
 const date=String(article.originalPublishedAt||article.publishedAt||'');
 const publishedAt=Number.isFinite(Date.parse(date))?new Date(date).toISOString():'';
 const sources=(Array.isArray(article.sources)?article.sources:[]).filter(x=>x&&https(x.url)).slice(0,3)
 .map(x=>({url:https(x.url),label:short(x.label||'Source de la rédaction',90)}));
 return {slug:article.slug,title:short(title,190),summary:short(summary,540),game,
  gameSlug:gameSlug(game),cover,publishedAt,sources,videoId:youtube(article.trailerUrl),
  excerpts:excerpts(article),category:short(article.category||'Actualités',45),author:short(article.author||'Rédaction SWAPP',90)};
}
function renderFlash(article,{baseUrl='https://swapp.tv'}={}){
 const data=model(article);if(!data)return null;
 const articleUrl='/actus/'+encodeURIComponent(data.slug),flashUrl='/flash/'+encodeURIComponent(data.slug);
 const gameUrl=data.gameSlug?'/jeux/'+encodeURIComponent(data.gameSlug):'';
 const socialUrl='/social'+(data.game?'?game='+encodeURIComponent(data.game):'');
 const date=data.publishedAt?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(data.publishedAt)):'';
 const slides=[];
 function add(kicker,heading,content,type='fact'){
  slides.push('<section class="sf-slide sf-'+type+'" data-sf-slide tabindex="-1" role="group" aria-label="Séquence '+(slides.length+1)+'">'+
  '<div class="sf-slide-content"><p class="sf-kicker">'+esc(kicker)+'</p><h2>'+esc(heading)+'</h2>'+content+'</div></section>');
 }
 add('SWAPP FLASH · '+data.category,data.title,
  '<p class="sf-lead">'+esc(data.summary)+'</p><p class="sf-byline">'+esc(data.author)+(date?' · '+esc(date):'')+'</p>','intro');
 data.excerpts.forEach((paragraph,index)=>add('EXTRAIT DE L’ARTICLE · '+(index+1),'Ce qu’en dit la rédaction',
  '<p class="sf-fact">'+esc(paragraph)+'</p><p class="sf-context">Extrait fidèle de la publication. L’article complet apporte le contexte.</p>'));
 if(data.videoId)add('VIDÉO LIÉE À L’ARTICLE','Découvrir les images',
  '<p class="sf-lead">Lance la vidéo si tu le souhaites. Aucun lecteur tiers n’est chargé avant ton clic.</p>'+
  '<div class="sf-trailer" data-sf-video="'+esc(data.videoId)+'"><button type="button" data-sf-video-play>Lire la vidéo</button></div>','video');
 const follow=data.gameSlug?'<div class="sf-actions">'+
  '<button type="button" data-swapp-follow-game data-game-slug="'+esc(data.gameSlug)+'" data-game-name="'+esc(data.game)+'" aria-pressed="false">＋ Suivre ce jeu</button>'+
  '<button type="button" data-swapp-wishlist-game data-game-slug="'+esc(data.gameSlug)+'" data-game-name="'+esc(data.game)+'" aria-pressed="false">♡ Mes envies</button></div>':'';
 const live=data.game?'<section class="sf-live swapp-media-section" data-swapp-live-shelf data-game="'+esc(data.game)+'">'+
  '<h3>En direct sur '+esc(data.game)+'</h3><div class="swapp-live-grid" data-live-results>'+
  '<p class="swapp-live-notice">Recherche des vrais directs en cours…</p></div></section>':'';
 const sources=data.sources.length?'<details class="sf-sources"><summary>Sources de l’article</summary><ul>'+
  data.sources.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="nofollow noopener noreferrer">'+esc(s.label)+'</a></li>').join('')+
  '</ul></details>':'';
 add('POURSUIVRE L’EXPÉRIENCE','Et maintenant, on joue ?',
  '<p class="sf-lead">Suis le jeu, découvre ceux qui le diffusent et rejoins la conversation.</p>'+follow+
  '<nav class="sf-actions" aria-label="Aller plus loin">'+
  '<a class="sf-primary" href="'+esc(articleUrl)+'">Lire l’article complet</a>'+
  (gameUrl?'<a href="'+esc(gameUrl)+'">Explorer l’univers du jeu</a>':'')+
  '<a href="'+esc(socialUrl)+'">SWAPP SOCIAL</a></nav>'+live+sources,'outro');
 const image=data.cover?'<img src="'+esc(data.cover)+'" alt="" class="sf-bg-image" loading="eager">':'';
 const content='<main class="sf-page" data-sf-root><div class="sf-background" aria-hidden="true">'+image+'</div>'+
  '<header class="sf-top"><a href="'+esc(articleUrl)+'">← Article</a><strong>SWAPP <span>FLASH</span></strong>'+
  '<button type="button" data-sf-share>Partager</button></header>'+
  '<div class="sf-container"><div class="sf-progress" data-sf-progress aria-label="Progression">'+
  slides.map((_,i)=>'<span class="sf-track" data-sf-track aria-label="Séquence '+(i+1)+'"></span>').join('')+
  '</div><div data-sf-slides class="sf-slides">'+slides.join('')+'</div>'+
  '<nav class="sf-nav" aria-label="Navigation dans le flash"><button data-sf-prev type="button">← Précédent</button>'+
  '<span data-sf-count class="sf-counter" role="status" aria-live="polite"></span>'+
  '<button data-sf-next type="button">Suivant →</button></nav>'+
  '<p class="sf-help">Clavier : flèches gauche et droite. Mobile : glisser. Aucune lecture automatique.</p>'+
  '<p data-sf-share-status class="sf-share-status" role="status" aria-live="polite"></p></div></main>';
 const canonical=baseUrl.replace(/\/$/,'')+flashUrl;
 const metadata='<meta name="robots" content="noindex,follow"><link rel="canonical" href="'+esc(canonical)+'">'+
  '<meta property="og:title" content="'+esc('SWAPP FLASH · '+data.title)+'">'+
  '<meta property="og:description" content="'+esc(short(data.summary,150))+'">'+
  (data.cover?'<meta property="og:image" content="'+esc(data.cover)+'">':'');
 return layout({title:'FLASH · '+data.title,description:short(data.summary,150),content,metadata,active:'actus',
 scripts:'<link rel="stylesheet" href="/assets/swapp-flash.css?v=20261104-pilot">'+
 '<script src="/assets/swapp-flash.js?v=20261104-pilot" defer></script>'});
}
module.exports={model,excerpts,youtube,https,renderFlash};