'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectPublicCatalog,fetchPublicPost,publicPostUrl}=require('../tools/justplayer-public-fetch');

const old='https://justplayer.fr/supporters/posts/266628';
const canon='https://justplayer.fr/supporters/posts/007-first-light-james-bond-reussit-son-retour';
const html='<html><head><meta property="og:title" content="007 First Light : James Bond réussit son retour"></head>'+
 '<article><h2>Un espion dans un monde ouvert</h2><p>Une exploration détaillée du jeu, des environnements, des armes et des mécaniques d’infiltration.</p>'+
 '<p>L’expérience du studio nous permet de comprendre ce qui fonctionne et ce qui mérite une analyse approfondie.</p></article></html>';
function response(status,{location,body=html}={}){
 return {status,ok:status===200,headers:{get:key=>key==='location'?location:null},text:async()=>body};
}
test('URL originales et canoniques sur JustPlayer uniquement',()=>{
 assert.equal(publicPostUrl(old),old);assert.equal(publicPostUrl(canon),canon);
 assert.equal(publicPostUrl('https://evil.example/supporters/posts/266628'),null);
 assert.equal(publicPostUrl('https://justplayer.fr.evil.example/supporters/posts/266628'),null);
 assert.equal(publicPostUrl('https://justplayer.fr/supporters/private/266628'),null);
 assert.equal(publicPostUrl('http://justplayer.fr/supporters/posts/266628'),null);
});
test('suit un 302 vers le vrai slug Fourthwall puis récupère le texte',async()=>{
 const calls=[];
 const mock=async (url,options)=>{
  calls.push({url,redirect:options.redirect});
  if(url===old)return response(302,{location:'/supporters/posts/007-first-light-james-bond-reussit-son-retour'});
  if(url===canon)return response(200);
  throw Error('Unexpected '+url);
 };
 const r=await collectPublicCatalog({items:[{type:'post',url:old,title:'007 First Light',publishedAt:'2026-09-05'}]},{fetchImpl:mock});
 assert.equal(r.articles.length,1);
 assert.equal(r.articles[0].legacyUrl,old);
 assert.equal(r.articles[0].canonicalSourceUrl,canon);
 assert.equal(r.failures.length,0);
 assert.deepEqual(calls.map(c=>c.redirect),['manual','manual']);
});
test('n’accède jamais à un domaine extérieur après redirection',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return response(302,{location:'https://attacker.example/private'});};
 await assert.rejects(()=>fetchPublicPost(old,{fetchImpl,timeoutMs:2000,maxBytes:100000}),/redirect_outside_justplayer_posts/);
 assert.equal(calls,1);
});
test('refuse aussi les redirections vers la connexion Fourthwall',async()=>{
 const fetchImpl=async()=>response(301,{location:'https://justplayer.fr/login'});
 await assert.rejects(()=>fetchPublicPost(old,{fetchImpl,timeoutMs:2000,maxBytes:100000}),/redirect_outside_justplayer_posts/);
});
test('ne traite pas une boucle de redirection comme un article',async()=>{
 const f=async(url)=>response(302,{location:url});
 await assert.rejects(()=>fetchPublicPost(old,{fetchImpl:f,timeoutMs:2000,maxBytes:100000}),/redirect_loop/);
});
test('une page sans corps original reste exclue',async()=>{
 const r=await collectPublicCatalog({items:[{type:'post',url:old,publishedAt:'2026-09-05'}]},
 {fetchImpl:async()=>response(200,{body:'<h1>Connectez-vous</h1>'})});
 assert.equal(r.articles.length,0);
 assert.equal(r.failures.length,1);
});
