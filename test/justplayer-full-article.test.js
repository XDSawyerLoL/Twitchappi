'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {extractRichPostBlock}=require('../tools/justplayer-rich-extract');
const {extractPublicPost}=require('../tools/justplayer-public-fetch');
const {makePublicCatalog}=require('../modules/swapp-news/public-catalog');
const item={type:'post',id:'266628',title:'007 First Light : James Bond réussit son retour',
 url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
const paragraph='<p>IO Interactive propose un niveau généreux où chaque approche change la manière de jouer avec une tension cinématographique.</p>';
const html='<html><head><meta property="og:title" content="007 First Light : James Bond réussit son retour">'+
 '<meta property="og:image" content="https://cdn.fourthwall.com/media/007-first-light-cover.jpg"></head>'+
 '<body><nav><p>Accueil</p><p>Menu</p></nav><div class="post-content prose">'+
 '<h2>Un jeu à étudier</h2>'+paragraph.repeat(6)+
 '<h2>Verdict 8/10</h2><p>Une belle réussite pour retrouver James Bond.</p></div>'+
 '<footer><p>Join now</p></footer></body></html>';
test('extrait du texte original au lieu du menu ou des publicités',()=>{
 const body=extractRichPostBlock(html);
 assert.ok(body.includes('Un jeu à étudier'));
 assert.ok(!body.includes('<nav>'));
 assert.ok(!body.includes('Join now'));
 const result=extractPublicPost(html,item);
 assert.equal(result.ok,true);
 assert.match(result.article.body,/IO Interactive/);
 assert.match(result.article.body,/## Un jeu à étudier/);
 assert.equal(result.article.image.url,'https://cdn.fourthwall.com/media/007-first-light-cover.jpg');
 assert.match(result.article.image.rights,/vérifier/);
});
test('ne fabrique rien depuis une page de connexion ou une simple annonce',()=>{
 const failure=extractPublicPost('<html><h1>Connectez-vous</h1><p>Lire la suite</p></html>',item);
 assert.equal(failure.ok,false);
});
test('la source ne devient un article SWAPP que si elle contient un vrai corps de texte',async()=>{
 const fake=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>html});
 const source=makePublicCatalog({catalog:{items:[item]},fetchImpl:fake,limit:1});
 const articles=await source.scanBatch();
 assert.equal(articles.length,1);
 assert.equal(articles[0].slug,'justplayer-266628');
 assert.equal(articles[0].title,item.title);
 assert.equal(articles[0].image.url,'https://cdn.fourthwall.com/media/007-first-light-cover.jpg');
 assert.ok(articles[0].body.length>220);
 assert.equal((await source.get('justplayer-266628')).body,articles[0].body);
});
test('aucun article n’est publié si le corps original est absent',async()=>{
 const fake=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>'<h1>Unlock exclusive content</h1>'});
 const source=makePublicCatalog({catalog:{items:[item]},fetchImpl:fake,limit:1});
 assert.deepEqual(await source.scanBatch(),[]);
 assert.equal(await source.get('justplayer-266628'),null);
});
