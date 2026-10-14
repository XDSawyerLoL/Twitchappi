'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makePublicCatalog}=require('../modules/swapp-news/public-catalog');
const body='<h2>Analyse de la nouvelle annonce</h2>'+
 '<p>Cette actualité contient une présentation complète et précise des mécaniques de jeu, des personnages et des évolutions annoncées pour la communauté.</p>'.repeat(8);
test('un premier scan attend les 13 articles vérifiables au lieu de renvoyer seulement 3 articles',async()=>{
 let requests=0;
 const items=Array.from({length:13},(_,i)=>({type:'post',id:'post-'+i,title:'Actualité du jeu '+i,
  url:'https://justplayer.fr/supporters/posts/post-'+i,publishedAt:'2026-10-'+String(1+i).padStart(2,'0')}));
 const fetchImpl=async()=>{requests++;return {ok:true,status:200,headers:{get:()=>null},text:async()=>'<html><head><meta property="og:title" content="Actualité gaming"></head><body><div class="post-content prose">'+body+'</div></body></html>'}};
 const publicNews=makePublicCatalog({catalog:{items},fetchImpl,limit:3});
 const results=await Promise.all([publicNews.scanBatch(),publicNews.scanBatch()]);
 assert.equal(results[0].length,13);
 assert.equal(results[1].length,13);
 assert.equal(publicNews.status().remaining,0);
 assert.equal(requests,13,'une seule requête externe par article malgré deux visites simultanées');
 assert.equal((await publicNews.scanBatch()).length,13);
 assert.equal(requests,13,'la visite suivante utilise le cache');
});
