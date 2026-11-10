'use strict';
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml}=require('./swapp-news/article-core');
function renderTechWatch(items,{section=''}={}){
 const sections=['Tout','IA','Robotique'];
 const tabs=sections.map(s=>'<a href="/tech'+(s==='Tout'?'':'?rubrique='+encodeURIComponent(s))+'"'+((section||'Tout')===s?' aria-current="page"':'')+'>'+s+'</a>').join(' ');
 const cards=items.map(i=>'<article class="story-card" style="display:block;padding:20px"><span class="tag">'+escapeHtml(i.section)+'</span><h2 style="font-size:1.2rem;margin:12px 0">'+escapeHtml(i.title)+'</h2><p class="subtext">'+escapeHtml(i.source_name)+' · '+escapeHtml(String(i.source_published_at).slice(0,10))+'</p><p class="subtext">Source à consulter : information non encore vérifiée par la rédaction SWAPP.</p><a href="'+escapeHtml(i.source_url)+'" target="_blank" rel="noopener noreferrer nofollow">Consulter la source originale ↗</a></article>').join('');
 const content='<main class="container" style="padding-top:48px;padding-bottom:64px"><span class="eyebrow">SWAPP · TECHNOLOGIES</span><h1 class="headline">IA & Robotique</h1><p>Veille technologique issue de flux publics. Ces liens sont des pistes de lecture, pas des articles vérifiés ni des annonces validées par SWAPP.</p><nav class="category-list" aria-label="Rubriques">'+tabs+'</nav><section class="story-grid" style="margin-top:28px">'+(cards||'<p>Aucune source disponible pour le moment.</p>')+'</section></main>';
 return layout({title:'IA & Robotique · Veille technologique',description:'Sources et veille sur l’intelligence artificielle et la robotique.',content});
}
async function readTechItems({uri,section='',limit=40}={}){
 if(!uri)return [];
 const mysql=require('mysql2/promise');
 const pool=mysql.createPool({uri,connectionLimit:1,connectTimeout:5000});
 try{
  const allowed=['IA','Robotique'].includes(section)?section:null;
  const sql='SELECT section,source_name,title,source_url,source_published_at FROM swapp_tech_watch_candidates'+(allowed?' WHERE section=?':'')+' ORDER BY source_published_at DESC LIMIT ?';
  const [rows]=await pool.execute(sql,allowed?[allowed,limit]:[limit]);
  return rows;
 }catch(e){
  if(e?.code==='ER_NO_SUCH_TABLE')return [];
  throw e;
 }finally{await pool.end();}
}
module.exports={renderTechWatch,readTechItems};
