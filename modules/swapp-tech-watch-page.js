'use strict';
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml}=require('./swapp-news/article-core');
const radar=require('../data/swapp-game-radar-20261111.json');

const HUBS=Object.freeze([
 {id:'gaming',label:'GAMING',description:'Jeux, guides et lives',href:'/gaming',section:null},
 {id:'ai',label:'AI',description:'Intelligence artificielle',href:'/ai',section:'IA'},
 {id:'robotics',label:'ROBOTICS',description:'Robots et automatisation',href:'/robotics',section:'Robotique'},
 {id:'future',label:'FUTURE',description:'Technologies émergentes',href:'/future',section:'FUTURE'},
 {id:'live-news',label:'SWAPP LIVE NEWS',description:'Le flux transversal',href:'/live-news',section:null}
]);
const VALID_PATHS=new Map([['/tech','tech'],['/technologies','tech'],['/gaming','gaming'],['/ai','ai'],['/robotics','robotics'],['/future','future'],['/live-news','live-news'],['/tech/gaming','gaming'],['/tech/ai','ai'],['/tech/robotique','robotics'],['/tech/futur','future'],['/tech/live','live-news']]);

function rawStyle(){
 return [
 '.swapp-hub{max-width:1450px;margin:0 auto;padding:36px clamp(16px,4vw,52px) 100px;color:#edf2ff}',
 '.swapp-hub *{box-sizing:border-box}',
 '.sh-eyebrow{font-weight:800;letter-spacing:.17em;font-size:12px;color:#8ce8e9}',
 '.sh-hero{border:1px solid #343a54;border-radius:24px;padding:clamp(24px,4vw,54px);background:radial-gradient(ellipse at 82% 14%,#48347588,transparent 50%),linear-gradient(130deg,#101a2b,#090d18);margin-bottom:25px}',
 '.sh-hero h1{font-size:clamp(36px,5.4vw,76px);letter-spacing:-.055em;line-height:1.08;margin:12px 0 18px}',
 '.sh-hero p{max-width:760px;color:#bdc8dd;font-size:clamp(15px,1.7vw,19px)}',
 '.sh-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:20px 0 36px}',
 '.sh-nav a{min-height:115px;display:flex;flex-direction:column;justify-content:center;gap:7px;border:1px solid #343a53;border-radius:17px;padding:18px;background:#131b2b;transition:border-color .16s,transform .16s}',
 '.sh-nav a:hover{border-color:#67dce6;transform:translateY(-2px)}',
 '.sh-nav a[aria-current=page]{background:linear-gradient(140deg,#1a3946,#26254b);border-color:#68d6e0}',
 '.sh-nav strong{font-size:15px;line-height:1.2}.sh-nav small{font-size:12px;color:#acbacf;line-height:1.4}',
 '.sh-toprow{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin:38px 0 17px}',
 '.sh-toprow h2{font-size:clamp(23px,2.8vw,34px);margin:0;letter-spacing:-.035em}',
 '.sh-toprow p{color:#a9bad0;margin:5px 0 0}',
 '.sh-link{border:1px solid #425574;border-radius:12px;padding:10px 16px;font-weight:700;font-size:14px;display:inline-block}',
 '.sh-link:hover{border-color:#78e2e6;color:#a8ffff}',
 '.sh-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}',
 '.sh-card{border:1px solid #323e56;border-radius:18px;background:#121b2c;min-width:0;overflow:hidden}',
 '.sh-card picture,.sh-visual{aspect-ratio:16/8.5;background:linear-gradient(138deg,#34466f,#29203f 65%,#101a27);display:flex;align-items:center;justify-content:center;overflow:hidden}',
 '.sh-card img{width:100%;height:100%;object-fit:cover;display:block}',
 '.sh-visual span{font-weight:900;letter-spacing:-.045em;font-size:clamp(23px,2vw,34px);text-align:center;max-width:90%;line-height:1.12}',
 '.sh-cardbody{padding:19px}.sh-cardbody h3{font-size:20px;line-height:1.25;margin:8px 0}',
 '.sh-cardbody p{font-size:14px;line-height:1.62;color:#c2cedc;margin:11px 0}',
 '.sh-meta{color:#86dfe4;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}',
 '.sh-cardfoot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:9px;margin-top:18px}',
 '.sh-cardfoot a{text-decoration:underline;text-underline-offset:3px;font-size:13px}',
 '.sh-note{border-left:3px solid #7687a5;padding:11px 16px;background:#172237;color:#b8c9de;border-radius:0 10px 10px 0;margin:18px 0}',
 '.sh-empty{border:1px solid #33405a;border-radius:17px;padding:24px;color:#cad2e0;background:#111928}',
 '.sh-sourcegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}',
 '.sh-source{padding:18px;border:1px solid #33405b;border-radius:14px;background:#121a28}',
 '.sh-source h3{font-size:17px;line-height:1.35;margin:9px 0}.sh-source p{margin:7px 0;color:#abbad0;font-size:13px}',
 '.sh-source a{display:inline-block;margin-top:12px;text-decoration:underline;text-underline-offset:3px;font-size:13px}',
 '.sh-focus-links{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}',
 '.sh-focus-links a{border:1px solid #46536b;border-radius:11px;padding:12px 18px;background:#172337}',
 '.sh-feed{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
 '.sh-feedarticle{border:1px solid #33415c;background:#121c2d;border-radius:16px;padding:20px}',
 '.sh-feedarticle h3{line-height:1.3;font-size:19px;margin:9px 0}.sh-feedarticle p{color:#b6c8db;font-size:14px}',
 '.sh-feedarticle a{font-size:13px;text-decoration:underline;text-underline-offset:3px}',
 '@media(max-width:1000px){.sh-nav{grid-template-columns:repeat(3,minmax(0,1fr))}.sh-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:620px){.swapp-hub{padding-top:15px}.sh-nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sh-nav a{min-height:91px;padding:12px}.sh-nav strong{font-size:12px}.sh-nav small{font-size:11px}.sh-cards,.sh-sourcegrid,.sh-feed{grid-template-columns:1fr}.sh-hero{border-radius:18px}}'
 ].join('\n');
}

function safeLink(url){
 const s=String(url||'');
 try{const parsed=new URL(s);return parsed.protocol==='https:'?escapeHtml(parsed.href):'';}catch(_){return '';}
}
function compactDate(value){
 if(!value)return '';
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleDateString('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}):'';
}
function renderRadar(items){
 return '<div class="sh-cards">'+items.map(g=>{
  const video=/^[a-zA-Z0-9_-]{11}$/.test(String(g.videoId||''))?g.videoId:null;
  const visual=video?'<picture><img loading="lazy" alt="Miniature officielle : '+escapeHtml(g.game)+'" src="https://i.ytimg.com/vi/'+video+'/hqdefault.jpg"></picture>'
   :'<div class="sh-visual"><span>'+escapeHtml(g.game)+'</span></div>';
  const url=safeLink(g.sourceUrl);
  return '<article class="sh-card">'+visual+'<div class="sh-cardbody"><div class="sh-meta">'+escapeHtml(g.game)+'</div>'+
   '<h3>'+escapeHtml(g.headline)+'</h3><p>'+escapeHtml(g.summary)+'</p><p>Sortie annoncée : <strong>'+escapeHtml(compactDate(g.releaseDate))+'</strong><br>Plateformes : '+escapeHtml(g.platforms)+'</p>'+
   '<div class="sh-cardfoot"><span class="sh-meta">Source officielle</span><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(g.sourceName)+' ↗</a></div></div></article>';
 }).join('')+'</div>';
}
function candidateCards(items,section){
 const filtered=items.filter(i=>!section||i.section===section).slice(0,18);
 if(!filtered.length)return '<div class="sh-empty">Aucune source collectée pour cette rubrique. La page reste disponible ; aucun article ou fait nouveau n’est inventé.</div>';
 return '<div class="sh-sourcegrid">'+filtered.map(i=>{
  const url=safeLink(i.source_url);
  return '<article class="sh-source"><span class="sh-meta">'+escapeHtml(i.section||'Veille')+' · Source à vérifier</span>'+
   '<h3>'+escapeHtml(i.title||'Annonce')+'</h3><p>'+escapeHtml(i.source_name||'Source primaire')+
   (i.source_published_at?' · '+escapeHtml(compactDate(i.source_published_at)):'')+'</p>'+
   '<p>Information non encore vérifiée par la rédaction SWAPP. Ce lien ne constitue pas un article publié.</p>'+
   (url?'<a href="'+url+'" target="_blank" rel="noopener noreferrer nofollow">Lire la source d’origine ↗</a>':'')+'</article>';
 }).join('')+'</div>';
}
function nav(id){
 return '<nav class="sh-nav" aria-label="Rubriques du média SWAPP">'+HUBS.map(h=>
  '<a href="'+h.href+'"'+(h.id===id?' aria-current="page"':'')+'><strong>'+h.label+'</strong><small>'+h.description+'</small></a>'
 ).join('')+'</nav>';
}
function topRow(title,description,linkHref,linkLabel){
 return '<div class="sh-toprow"><div><h2>'+escapeHtml(title)+'</h2>'+(description?'<p>'+escapeHtml(description)+'</p>':'')+'</div>'+
 (linkHref?'<a class="sh-link" href="'+linkHref+'">'+escapeHtml(linkLabel||'Découvrir')+'</a>':'')+'</div>';
}
function publishedFeed(){
 return '<section aria-label="Flux des articles SWAPP" id="flux-swapp">'+
  topRow('SWAPP LIVE NEWS','Les publications vérifiées du CMS SWAPP, sans ressusciter les articles retirés.','/actus','Magazine Gaming')+
  '<div id="swapp-published-feed" class="sh-feed" aria-live="polite"><div class="sh-empty">Chargement des articles publiés…</div></div></section>';
}
function feedScript(){
 return '<script defer src="/assets/swapp-editorial-feed.js?v=20261111-newsroom-1"></script>';
}
function renderTechWatch(items,{section='',path='/tech',feedError=false}={}){
 const id=VALID_PATHS.get(path)||({IA:'ai',Robotique:'robotics',FUTURE:'future'}[section]||'tech');
 const hub=HUBS.find(h=>h.id===id);
 const title=hub?hub.label:'SWAPP TECH';
 const sub=hub?hub.description:'L’actualité des jeux vidéo, de l’intelligence artificielle, des robots et des technologies de demain.';
 const h1=id==='tech'?'Le média qui explore le jeu et la technologie.':title;
 const all=Array.isArray(items)?items:[];
 let body='<main class="swapp-hub"><section class="sh-hero"><div class="sh-eyebrow">SWAPP · MÉDIA INDÉPENDANT</div>'+
  '<h1>'+escapeHtml(h1)+'</h1><p>'+escapeHtml(sub)+'</p></section>'+nav(id==='tech'?'':id);
 if(id==='tech'||id==='gaming'){
  body+=topRow('GAMING · Les jeux à suivre','Six dossiers préparatoires fondés sur les fiches et annonces des éditeurs. Les prix de la capture ne sont pas repris sans vérification.','/actus','Tous les articles');
  body+='<p class="sh-note">Ces fiches de suivi ne sont pas des nouvelles annonces du jour. Elles servent de points de départ aux prochains articles complets, datés et sourcés.</p>';
  body+=renderRadar(radar.items);
  body+='<div class="sh-focus-links"><a href="/actus">Actualités Gaming</a><a href="/guides/aion-2">Guides</a><a href="/decouvrir">Lives et créateurs</a><a href="/categories">Jeux et catégories</a></div>';
 }
 if(id==='tech'||id==='ai'||id==='robotics'||id==='future'){
  const select=hub?.section||(['IA','Robotique','FUTURE'].includes(section)?section:null);
  body+=topRow(id==='tech'?'IA, ROBOTICS & FUTURE · Sources surveillées':title+' · Veille des sources officielles',
   'Sources primaires collectées, séparées des publications éditoriales validées.',null,null);
  if(feedError)body+='<p class="sh-note" role="status">La base de veille est momentanément indisponible. Les rubriques du média restent accessibles.</p>';
  body+=candidateCards(all,select);
 }
 if(id==='tech'||id==='live-news'||id==='gaming'||id==='ai'||id==='robotics'||id==='future')body+=publishedFeed();
 body+='<p class="sh-note">Règle éditoriale : aucune information non vérifiée n’est présentée comme une publication SWAPP. Les contenus du flux proviennent du catalogue public du CMS.</p></main>';
 const canonical=VALID_PATHS.has(path)&&path!='/technologies'?path:'/tech';
 return layout({title:title+' · Média SWAPP',description:sub,content:body,extraCss:rawStyle(),
  scripts:feedScript(),active:'media',metadata:'<link rel="canonical" href="https://swapp.tv'+canonical+'"><meta property="og:type" content="website">'});
}
async function readTechItems({uri,section='',limit=40}={}){
 if(!uri)return [];
 const mysql=require('mysql2/promise');
 const pool=mysql.createPool({uri,connectionLimit:1,connectTimeout:5000});
 try{
  const allowed=['IA','Robotique','FUTURE'].includes(section)?section:null;
  const safeLimit=Math.max(1,Math.min(100,Math.trunc(Number(limit)||40)));
  const sql='SELECT section,source_name,title,source_url,source_published_at FROM swapp_tech_watch_candidates'+(allowed?' WHERE section=?':'')+' ORDER BY source_published_at DESC LIMIT ?';
  const [rows]=await pool.execute(sql,allowed?[allowed,safeLimit]:[safeLimit]);
  return rows;
 }catch(e){
  if(e?.code==='ER_NO_SUCH_TABLE')return [];
  throw e;
 }finally{await pool.end();}
}
module.exports={renderTechWatch,readTechItems,HUBS,VALID_PATHS};
