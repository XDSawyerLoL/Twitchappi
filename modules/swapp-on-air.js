'use strict';
// SWAPP ON AIR — only real, reviewed, existing MP3s are publicly playable.
const fs=require('node:fs'),path=require('node:path');
const {layout}=require('./swapp-news/site-shell');
const root=path.resolve(__dirname,'..');
const manifest=path.join(root,'data/swapp-on-air/episodes.json');
const audioRoot=path.join(root,'assets/on-air');
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateOk=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
function validHttps(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
function mp3Exists(file){
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<30000||stat.size>75*1024*1024)return false;
  const fileHandle=fs.openSync(file,'r'),b=Buffer.alloc(3);
  try{fs.readSync(fileHandle,b,0,3,0)}finally{fs.closeSync(fileHandle)}
  return b.toString('ascii')==='ID3'||b[0]===255&&(b[1]&0xe0)===0xe0;
 }catch{return false}
}
function validateEpisode(e,{mediaDir=audioRoot}={}){
 if(!e||e.status!=='published'||e.editorialApproved!==true||e.audioReviewed!==true)return null;
 const slug=String(e.slug||'');
 if(!SLUG.test(slug)||slug.length<7||slug.length>85||e.audio!==slug+'.mp3')return null;
 if(!dateOk(e.publishedAt)||!dateOk(e.reviewedAt))return null;
 const title=String(e.title||'').trim(),description=String(e.description||'').trim(),durationSec=Number(e.durationSec);
 if(title.length<12||title.length>180||description.length<30||description.length>700||
   !Number.isInteger(durationSec)||durationSec<20||durationSec>7200)return null;
 if(!mp3Exists(path.join(mediaDir,slug+'.mp3')))return null;
 const sources=Array.isArray(e.sources)?e.sources.filter(s=>s&&validHttps(s.url)).slice(0,10)
  .map(s=>({url:validHttps(s.url),label:String(s.label||'Source').slice(0,120)})):[];
 const articles=Array.isArray(e.articles)?e.articles.filter(u=>typeof u==='string'&&
  /^\/actus\/[a-z0-9-]{4,115}$/.test(u)).slice(0,10):[];
 return {slug,title,description,durationSec,publishedAt:e.publishedAt,sources,articles,
  url:'/on-air/'+slug,audioUrl:'/assets/on-air/'+slug+'.mp3'};
}
function publicEpisodes({index=manifest,mediaDir=audioRoot}={}){
 try{
  const data=JSON.parse(fs.readFileSync(index,'utf8'));
  if(data.schema!==1||!Array.isArray(data.episodes))return [];
  const visited=new Set(),items=[];
  for(const row of data.episodes.slice(0,200)){
   const e=validateEpisode(row,{mediaDir});
   if(!e||visited.has(e.slug))continue;
   visited.add(e.slug);items.push(e);
  }
  return items.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,60);
 }catch{return []}
}
const stylesheet='<link rel="stylesheet" href="/assets/swapp-on-air.css?v=20261105-1">';
const niceDate=stamp=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(stamp));
const lengthText=sec=>Math.floor(sec/60)+' min '+String(sec%60).padStart(2,'0')+' s';
function play(e){
 return '<section class="oa-player"><div class="oa-player-top"><strong>Écouter l’épisode</strong><span>'+lengthText(e.durationSec)+'</span></div>'+
 '<audio controls preload="none" src="'+esc(e.audioUrl)+'" aria-label="Écouter '+esc(e.title)+'">'+
 'Lecture audio non disponible dans ce navigateur.</audio><a href="'+esc(e.audioUrl)+'" download>Télécharger le MP3</a></section>';
}
function schema(episodes){
 const data={'@context':'https://schema.org','@type':'PodcastSeries',name:'SWAPP ON AIR',inLanguage:'fr-FR',
  description:'Nova et Kern parlent des jeux vidéo sur SWAPP.',url:'https://swapp.tv/on-air',
  publisher:{'@type':'Organization',name:'SWAPP'},
  hasPart:episodes.map(e=>({'@type':'PodcastEpisode',name:e.title,url:'https://swapp.tv'+e.url,
    datePublished:e.publishedAt,associatedMedia:{'@type':'AudioObject',
    encodingFormat:'audio/mpeg',contentUrl:'https://swapp.tv'+e.audioUrl}}))};
 return '<script type="application/ld+json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>';
}
function intro(){
 return '<header class="oa-hero"><span class="oa-kicker">SWAPP / PODCAST</span>'+
  '<h1>SWAPP <em>ON AIR</em></h1><p class="oa-lead">Le jeu vidéo, ça se raconte.</p>'+
  '<p>Nova s’enthousiasme, Kern questionne. Des annonces vérifiées, deux regards et les jeux que tu peux retrouver sur SWAPP.</p>'+
  '<div class="oa-hosts"><div><span>N</span><strong>NOVA</strong><small>Curieuse et spontanée</small></div>'+
  '<div><span>K</span><strong>KERN</strong><small>Analytique et sceptique</small></div></div></header>';
}
function home(episodes=publicEpisodes()){
 const rows=episodes.length?'<section class="oa-episodes" aria-labelledby="oa-list-title">'+
  '<h2 id="oa-list-title">Les épisodes</h2><div class="oa-grid">'+episodes.map(e=>
   '<article class="oa-card"><span class="oa-kicker">'+esc(niceDate(e.publishedAt))+'</span>'+
   '<h3><a href="'+esc(e.url)+'">'+esc(e.title)+'</a></h3>'+
   '<p>'+esc(e.description)+'</p><div class="oa-footer-row"><span>'+lengthText(e.durationSec)+'</span>'+
   '<a href="'+esc(e.url)+'">Écouter →</a></div></article>').join('')+'</div></section>'
 :'<section class="oa-empty" aria-labelledby="oa-list-title"><span class="oa-kicker">PREMIER ÉPISODE EN PRÉPARATION</span>'+
  '<h2 id="oa-list-title">Pas encore d’enregistrement validé.</h2>'+
  '<p>Les voix Nova et Kern sont en cours de production. Aucun épisode n’a été approuvé pour diffusion : aucun bouton Lecture fictif n’est affiché.</p>'+
  '<a href="/actus">Lire les dernières actualités →</a></section>';
 return layout({title:'SWAPP ON AIR — podcast gaming',active:'actus',description:'L’émission gaming de SWAPP avec Nova et Kern.',
  metadata:'<link rel="canonical" href="https://swapp.tv/on-air">'+schema(episodes),
  content:'<main class="oa-page">'+intro()+rows+
  '<footer class="oa-end"><a href="/actus">Actualités</a><a href="/tv">SWAPP TV</a></footer></main>',
  scripts:stylesheet});
}
function episodePage(slug,episodes=publicEpisodes()){
 const e=episodes.find(v=>v.slug===slug);
 if(!e)return null;
 const sources=e.sources.length?'<section class="oa-info"><h2>Sources vérifiées</h2><ul>'+
  e.sources.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="nofollow noopener noreferrer">'+esc(s.label)+'</a></li>').join('')+'</ul></section>':'';
 const articles=e.articles.length?'<section class="oa-info"><h2>Lire aussi sur SWAPP</h2><ul>'+
  e.articles.map(u=>'<li><a href="'+esc(u)+'">'+esc(u.slice(7).replace(/-/g,' '))+'</a></li>').join('')+'</ul></section>':'';
 return layout({title:e.title+' | SWAPP ON AIR',active:'actus',description:e.description,
  metadata:'<link rel="canonical" href="https://swapp.tv'+esc(e.url)+'"><meta property="og:title" content="'+esc(e.title)+'">',
  content:'<main class="oa-page oa-single"><a class="oa-back" href="/on-air">← SWAPP ON AIR</a>'+
  '<header><span class="oa-kicker">'+esc(niceDate(e.publishedAt))+' · NOVA / KERN</span>'+
  '<h1>'+esc(e.title)+'</h1><p class="oa-lead">'+esc(e.description)+'</p></header>'+
  play(e)+sources+articles+'<a class="oa-back" href="/on-air">Tous les épisodes →</a></main>',
  scripts:stylesheet});
}
module.exports={SLUG,validateEpisode,publicEpisodes,home,episodePage,mp3Exists};
