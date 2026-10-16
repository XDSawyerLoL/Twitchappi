'use strict';
// Publish a game page only if at least two different, real published articles exist.
// The page only aggregates first-party editorial content and the existing live shelf.
const {layout}=require('./swapp-news/site-shell');
const {searchNames}=require('./swapp-news/game-identity');
const ORIGIN='https://swapp.tv';
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
const GAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function canonicalGame(value){
 const raw=String(value||'').trim().slice(0,100);
 if(!raw)return '';
 // Reuse the editorial whitelist of established aliases; never infer a
 // different game from an article headline or a broad keyword match.
 const aliases=searchNames(raw);
 return aliases.length>1?aliases[0]:raw;
}
function gameSlug(value){
 const slug=canonicalGame(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'');
 return slug.length>=3&&GAME.test(slug)?slug:'';
}
function gameHubUrl(game){
 const slug=gameSlug(game);return slug?'/jeux/'+slug:'';
}
function gameHubs(articles=[],{minArticles=2,maxGames=40}={}){
 const groups=new Map();
 for(const a of Array.isArray(articles)?articles:[]){
  if(a?.status!=='published'||!SLUG.test(String(a.slug||'')))continue;
  if(!String(a.title||'').trim()||!String(a.summary||a.body||'').trim())continue;
  const game=canonicalGame(a.game),slug=gameSlug(game);
  if(!slug)continue;
  if(!groups.has(slug))groups.set(slug,{slug,game,articles:[],slugs:new Set(),titles:new Set()});
  const group=groups.get(slug),titleKey=String(a.title).trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
  if(group.slugs.has(a.slug)||group.titles.has(titleKey))continue;
  group.slugs.add(a.slug);group.titles.add(titleKey);group.articles.push(a);
 }
 const eligible=[];
 for(const g of groups.values()){
  if(g.articles.length<minArticles)continue;
  g.articles.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
  let lastmod='';
  for(const a of g.articles){const date=String(a.updatedAt||a.publishedAt||'');if(Number.isFinite(Date.parse(date))&&date>lastmod)lastmod=date}
  eligible.push({slug:g.slug,game:g.game,articles:g.articles.slice(0,40),count:g.articles.length,lastmod});
 }
 eligible.sort((a,b)=>b.count-a.count||a.game.localeCompare(b.game,'fr'));
 return eligible.slice(0,maxGames);
}
const CSS=[
 '.game-portal{max-width:1250px;margin:0 auto;padding:38px 24px 65px}',
 '.game-portal .hero{padding:38px clamp(23px,4vw,55px);background:linear-gradient(125deg,#1b2944,#241833);border:1px solid #ffffff25;border-radius:27px}',
 '.game-portal h1{font-size:clamp(32px,5vw,60px);letter-spacing:-.06em;line-height:1.1;margin:10px 0}',
 '.game-portal h2{font-size:clamp(24px,3vw,32px);margin:34px 0 16px}',
 '.game-portal p{color:#c9d4e5}.game-portal a:hover{text-decoration:underline}',
 '.game-portal .breadcrumb{font-size:13px;margin-bottom:15px;color:#bac8dc}.game-portal .breadcrumb a{color:#9be7f3}',
 '.game-portal .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}',
 '.game-portal .card{display:block;border:1px solid #ffffff25;border-radius:19px;overflow:hidden;background:#17243b;text-decoration:none}',
 '.game-portal .card img{width:100%;height:177px;object-fit:cover}.game-portal .card div{padding:22px}',
 '.game-portal .card h3{font-size:21px;line-height:1.2;margin:8px 0}.game-portal .card p{font-size:14px}',
 '.game-portal .card small{color:#8ce5f0}.game-portal .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}',
 '.game-portal .actions a{padding:10px 17px;border-radius:12px;border:1px solid #ffffff38;background:#ffffff15;color:white;text-decoration:none;font-weight:700}',
 '.game-portal .index a{display:flex;justify-content:space-between;gap:12px}.game-portal .index span{color:#acbdd2;font-size:14px}',
 '@media(max-width:640px){.game-portal{padding:20px 14px}.game-portal .hero{padding:23px 19px}}'
].join('');
function safeCover(a){
 try{const source=String(a?.image?.url||'').slice(0,2000),u=new URL(source);
  return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}
}
function renderGameIndex(groups){
 const url=ORIGIN+'/jeux',title='Jeux vidéo : articles et lives';
 const meta='<link rel="canonical" href="'+url+'"><meta property="og:type" content="website"><meta property="og:url" content="'+url+'">';
 const links=groups.map(g=>'<a class="card" href="/jeux/'+encodeURIComponent(g.slug)+'"><div><h3>'+html(g.game)+'</h3><span>'+g.count+' publications</span></div></a>').join('');
 const body='<main class="game-portal"><p class="breadcrumb"><a href="/">SWAPP</a> / Jeux</p><header class="hero"><h1>Jeux vidéo : actualités et créateurs</h1><p>Retrouve les jeux couverts par SWAPP, leurs articles et les créateurs en direct.</p></header><section><h2>Explorer les jeux</h2><div class="cards index">'+links+'</div></section></main>';
 return layout({title,description:'Articles et créateurs autour des jeux vidéo couverts par SWAPP.',content:body,metadata:meta,extraCss:CSS,active:'actus'});
}
function renderGamePage(group){
 const url=ORIGIN+'/jeux/'+encodeURIComponent(group.slug);
 const title=group.game+' : actualités et lives',description='Les '+group.count+' publications SWAPP autour de '+group.game+', et les créateurs en direct.';
 const meta='<link rel="canonical" href="'+url+'"><meta property="og:type" content="website"><meta property="og:url" content="'+url+'"><meta property="og:title" content="'+html(title)+'"><meta property="og:description" content="'+html(description)+'">';
 const cards=group.articles.map(a=>{
  const cover=safeCover(a),excerpt=String(a.summary||a.body||'').replace(/\s+/g,' ').slice(0,180);
  return '<a class="card" href="/actus/'+encodeURIComponent(a.slug)+'">'+
   (cover?'<img src="'+html(cover)+'" alt="" loading="lazy">':'')+
   '<div><small>'+html(a.category||'Actualité')+'</small><h3>'+html(a.title)+'</h3><p>'+html(excerpt)+'</p></div></a>';
 }).join('');
 const body='<main class="game-portal"><p class="breadcrumb"><a href="/">SWAPP</a> / <a href="/jeux">Jeux</a> / '+html(group.game)+'</p>'+
  '<header class="hero"><h1>'+html(group.game)+' : actualités et lives</h1><p>'+html(description)+'</p><div class="actions"><a href="/actus">Toutes les actualités</a><a href="/decouvrir">Explorer les créateurs</a></div></header>'+
  '<section><h2>Articles sur '+html(group.game)+'</h2><div class="cards">'+cards+'</div></section>'+
  '<section class="swapp-media-section" data-swapp-live-shelf data-game="'+html(group.game)+'"><div class="swapp-media-heading"><h2>En direct sur '+html(group.game)+'</h2></div>'+
  '<div class="swapp-live-grid" data-live-results><p class="swapp-live-notice">Recherche des lives actuellement disponibles…</p></div></section></main>';
 return layout({title,description,content:body,metadata:meta,extraCss:CSS,active:'actus'});
}
module.exports={canonicalGame,gameSlug,gameHubUrl,gameHubs,renderGameIndex,renderGamePage};
