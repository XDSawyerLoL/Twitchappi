(function(){
 'use strict';
 function node(tag,className,text){
  var el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 function topic(article){
  var haystack=[article.category].concat(Array.isArray(article.tags)?article.tags:[]).join(' ').toLowerCase();
  if(/\brobot|robotique|automation|automatisation/.test(haystack))return 'ROBOTICS';
  if(/\bintelligence artificielle\b|\bia\b|\bai\b|machine learning/.test(haystack))return 'AI';
  if(/\bfuture\b|technolog|spatial|quantique|émergent/.test(haystack))return 'FUTURE';
  return 'GAMING';
 }
 function validDate(raw){
  var d=new Date(raw);
  return Number.isFinite(d.getTime())?d:null;
 }
 function card(a){
  var article=node('article','sh-feedarticle');
  var stamp=node('div','sh-meta',topic(a)+(validDate(a.publishedAt)?' · '+validDate(a.publishedAt).toLocaleDateString('fr-FR'):''));
  var heading=node('h3',null,a.title||'Publication SWAPP');
  var description=node('p',null,a.summary||'');
  var link=node('a',null,'Lire l’article sur SWAPP ↗');
  link.href='/actus/'+encodeURIComponent(String(a.slug));
  article.append(stamp,heading,description,link);
  return article;
 }
 async function load(){
  var target=document.getElementById('swapp-published-feed');
  if(!target)return;
  try{
   var response=await fetch('/api/actus',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
   if(!response.ok)throw new Error('HTTP '+response.status);
   var data=await response.json();
   if(!Array.isArray(data.articles))throw new Error('Format du catalogue inattendu');
   var unique=new Map();
   data.articles.forEach(function(a){
    if(!a||typeof a.slug!=='string'||!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(a.slug))return;
    if(a.status&&a.status!=='published')return;
    if(!unique.has(a.slug))unique.set(a.slug,a);
   });
   var articles=Array.from(unique.values()).sort(function(a,b){
    return (validDate(b.publishedAt)?.getTime()||0)-(validDate(a.publishedAt)?.getTime()||0);
   }).slice(0,24);
   target.replaceChildren();
   if(!articles.length){
    target.append(node('div','sh-empty','Aucun article confirmé en ligne. SWAPP ne fabrique pas de publications pour remplir le flux.'));
    return;
   }
   articles.forEach(function(a){target.append(card(a));});
  }catch(error){
   target.replaceChildren(node('div','sh-empty','Le flux d’articles est momentanément indisponible. Retrouvez les publications dans le magazine Gaming.'));
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});
 else load();
})();