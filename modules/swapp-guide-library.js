'use strict';
// Editorial guides directory. It indexes ONLY actually published, sourced guides.
const {layout}=require('./swapp-news/site-shell');
const {gameSlug}=require('./swapp-game-pages');
const {cardImageSources}=require('../assets/swapp-article-extras');
const validSlug=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isGuide(a){
 return !!a&&a.status==='published'&&validSlug(a.slug)
  &&String(a.title||'').trim().length>=8
  &&String(a.summary||a.body||'').trim().length>=20
  &&(/guide/i.test(String(a.category||''))||Array.isArray(a.tags)&&a.tags.some(t=>/^guide(s)?$/i.test(String(t))))
  &&Array.isArray(a.sources)&&a.sources.some(s=>/^https?:\/\//.test(String(s?.url||'')));
}
function guideArticles(articles=[]){
 const seen=new Set();
 return (Array.isArray(articles)?articles:[]).filter(a=>{
  if(!isGuide(a)||seen.has(a.slug))return false;
  seen.add(a.slug);return true;
 }).sort((a,b)=>String(b.updatedAt||b.publishedAt||'').localeCompare(String(a.updatedAt||a.publishedAt||'')));
}
function guideLinksForGame(group){
 if(!group||!Array.isArray(group.articles))return '';
 const guides=guideArticles(group.articles);
 const isAion=group.slug==='aion-2';
 if(!isAion&&!guides.length)return '';
 const links=(isAion?'<a href="/guides/aion-2">Guide complet AION 2 — classes, progression et PvP</a>':'')
  +guides.slice(0,6).map(a=>'<a href="/actus/'+encodeURIComponent(a.slug)+'">'+esc(a.title)+'</a>').join('');
 return '<section class="game-guides" aria-label="Guides du jeu"><h2>Guides et stratégies</h2><div class="guide-links">'+links+'</div><p><a href="/guides">Tous les guides SWAPP →</a></p></section>';
}
const CSS=[
 '.guide-directory{max-width:1220px;margin:auto;padding:36px 22px 76px}',
 '.guide-hero{padding:clamp(26px,5vw,52px);border-radius:22px;background:linear-gradient(135deg,#192b42,#28213f);border:1px solid #ffffff21}',
 '.guide-hero h1{font-size:clamp(32px,5vw,64px);line-height:1.07;letter-spacing:-.055em;margin:12px 0}',
 '.guide-hero p{max-width:75ch;color:#d3deed}',
 '.guide-collection{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:17px;margin-top:25px}',
 '.guide-card{display:flex;flex-direction:column;padding:22px;border:1px solid #ffffff2c;border-radius:17px;background:#162239;min-height:180px}',
 '.guide-card h3{font-size:21px;line-height:1.2;margin:12px 0}',
 '.guide-card p{color:#b8cce2;font-size:14px}',
 '.guide-card a{color:#aff7ef;font-weight:700;text-decoration:underline;text-underline-offset:4px}',
 '.guide-card img{aspect-ratio:16/9;object-fit:cover;border-radius:9px;width:100%}',
 '.guide-card small,.guide-note{color:#b7c7da}',
 '.game-guides{margin:28px 0;padding:24px;border-radius:14px;border:1px solid #ffffff27;background:#162338}',
 '.game-guides h2{margin:0 0 15px!important}',
 '.game-guides .guide-links{display:grid;gap:10px}',
 '.game-guides .guide-links a{padding:13px 16px;background:#ffffff0a;border-radius:10px;color:#a4eeec;text-decoration:underline;text-underline-offset:3px}'
].join('');
function renderGuideIndex(articles=[]){
 const verified=guideArticles(articles).filter(a=>gameSlug(a.game));
 const cards=verified.map(a=>{
  const game=String(a.game||'').slice(0,100),image=cardImageSources(a)[0]||'';
  const date=String(a.updatedAt||a.publishedAt||'').slice(0,10);
  return '<article class="guide-card">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'')+
   '<small>'+esc(game)+(date?' · Vérifié '+esc(date):'')+'</small><h3>'+esc(a.title)+'</h3>'+
   '<p>'+esc(a.summary||'').slice(0,220)+'</p><a href="/actus/'+encodeURIComponent(a.slug)+'">Lire le guide →</a></article>';
 }).join('');
 const main='<main class="guide-directory"><p class="breadcrumb"><a href="/">SWAPP</a> / Guides</p>'+
  '<header class="guide-hero"><span class="eyebrow">SWAPP · GUIDES</span><h1>Comprendre, progresser, maîtriser.</h1>'+
  '<p>Des dossiers construits à partir de sources identifiées, mis à jour lorsque les jeux évoluent. Pas de classements ou de conseils présentés comme vérifiés sans preuve.</p></header>'+
  '<section aria-label="Guides disponibles"><h2>Guides à découvrir</h2><div class="guide-collection">'+
  '<article class="guide-card"><small>AION 2 · Guide approfondi SWAPP</small><h3>AION 2 — guide complet</h3>'+
  '<p>Classes, progression, JcJ et conseils de départ. Les changements de version doivent être revérifiés.</p>'+
  '<a href="/guides/aion-2">Explorer le guide AION 2 →</a></article>'+cards+
  '</div></section><p class="guide-note">Seuls les guides publiés et accompagnés de sources apparaissent ici. Les nouveautés sont ajoutées après vérification éditoriale.</p></main>';
 const metadata='<link rel="canonical" href="https://swapp.tv/guides">'+
  '<meta property="og:type" content="website"><meta property="og:title" content="Guides de jeux vidéo — SWAPP">'+
  '<meta property="og:url" content="https://swapp.tv/guides">';
 return layout({title:'Guides de jeux vidéo',description:'Guides vérifiés de jeux vidéo, stratégies et dossiers mis à jour sur SWAPP.',content:main,metadata,extraCss:CSS,active:'guides'});
}
module.exports={isGuide,guideArticles,guideLinksForGame,renderGuideIndex};