'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {decodeEntities,contentToPlainText,recordsFromExport,prepareBatches,mergeMetadataAndContent}=require('../tools/justplayer-import-core');
const {parseFlags,sendBatches}=require('../tools/justplayer-import');
function post(i=1){return {title:`Article JustPlayer pour la migration numéro ${i}`,body:`Une analyse rédigée et conservée pour le texte original de cet article numéro ${i}.`,legacyUrl:`https://justplayer.fr/supporters/posts/${i}`,publishedAt:'2026-09-05',author:'JustPlayer'};}
test('décode les entités et garde les structures importantes',()=>{assert.match(contentToPlainText('<h2>Titre</h2><p>L&#39;avenir &amp; jeux</p><ul><li>Un</li><li>Deux</li></ul><script>secret</script>'),/## Titre/);assert.match(contentToPlainText('<h2>Titre</h2><p>L&#39;avenir &amp; jeux</p>'),/L'avenir & jeux/);assert.doesNotMatch(contentToPlainText('<p>ok</p><script>secret</script>'),/secret/);});
test('accepte objet export enveloppé et tableau brut',()=>{assert.deepEqual(recordsFromExport({data:{posts:[post()]}}),[post()]);assert.equal(recordsFromExport([post()]).length,1);});
test('prépare des brouillons avec dates et URL originales',()=>{const p=prepareBatches([post()]);assert.equal(p.accepted,1);assert.equal(p.rejected.length,0);assert.equal(p.batches[0].publish,false);assert.equal(p.batches[0].articles[0].originalPublishedAt,'2026-09-05T00:00:00.000Z');assert.equal(p.batches[0].articles[0].sources[0].url,post().legacyUrl);});
test('rejette les contenus vides plutôt que les inventer',()=>{const p=prepareBatches([{...post(),body:''}]);assert.equal(p.accepted,0);assert.equal(p.rejected.length,1);});
test('rejette des URL externes et conserve le reste',()=>{const p=prepareBatches([{...post(),legacyUrl:'https://evil.example/supporters/posts/1'},post(2)]);assert.equal(p.accepted,1);assert.equal(p.rejected.length,1);});
test('détecte les doublons de contenu dans les lots',()=>{const p=prepareBatches([post(),post()]);assert.equal(p.accepted,1);assert.equal(p.duplicates.length,1);});
test('sépare les lots en unités de vingt',()=>{const p=prepareBatches(Array.from({length:21},(_,i)=>post(i+1)));assert.equal(p.batches.length,2);assert.equal(p.batches[0].articles.length,20);});
test('un média sans crédit est exclu et signalé',()=>{const p=prepareBatches([{...post(),image:{url:'https://x.example/a.jpg'}}]);assert.equal(p.accepted,1);assert.equal(p.batches[0].articles[0].image,null);assert.equal(p.warnings.length,1);});
test('une vidéo Fourthwall reste marquée comme contenu manquant',()=>{const c={items:[{id:'1',type:'video_embed',url:'https://justplayer.fr/supporters/video_embeds/1'}]};const m=mergeMetadataAndContent(c,[]);assert.equal(m.missing[0].reason,'requires_video_import_adapter');});
test('identifie les publications de catalogue non encore exportées',()=>{const c={items:[{id:'1',type:'post',url:post().legacyUrl,publishedAt:'2026-09-05',title:'un titre'}]};const m=mergeMetadataAndContent(c,[]);assert.equal(m.missing.length,1);});
test('n’envoie aucun contenu sans HTTPS et clé d’admin',async()=>{await assert.rejects(()=>sendBatches([{articles:[post()]}],{baseUrl:'http://swapp.tv',key:'abc'}),/HTTPS/);});
test('envoie un dry-run au serveur par défaut',async()=>{let called;const result=await sendBatches([{articles:[post()],dryRun:true,publish:false}],{baseUrl:'https://swapp.tv',key:'secret',fetchImpl:async(u,init)=>{called={u,init};return {ok:true,status:200,json:async()=>({dryRun:true})};}});assert.equal(JSON.parse(called.init.body).dryRun,true);assert.equal(result.length,1);assert.equal(JSON.parse(called.init.body).publish,false);});
test('--commit exige une intention explicite et n’autorise pas la publication sociale',()=>{assert.equal(parseFlags(['--input','posts.json','--send','--commit']).commit,true);});
const {extractPublicPost,collectPublicCatalog}=require('../tools/justplayer-public-fetch');
test('extrait un article structuré public sans confondre navigation et texte',()=>{
  const html='<html><head><meta property="og:title" content="Article démonstration JustPlayer"></head><body><script type="application/ld+json">'+JSON.stringify({'@type':'BlogPosting',headline:'Article démonstration JustPlayer',articleBody:'Un long texte original consacré au secteur des jeux vidéo, avec plusieurs phrases vérifiables et une présentation détaillée.',datePublished:'2026-01-11'})+'</script></body></html>';
  const r=extractPublicPost(html,{url:'https://justplayer.fr/supporters/posts/197372',publishedAt:'2026-01-11'});
  assert.equal(r.ok,true);assert.match(r.article.body,/plusieurs phrases/);
});
test('une page sans article complet n’entre pas dans le CMS',()=>{
  const r=extractPublicPost('<html><h1>Connexion requise</h1><p>Connectez-vous</p></html>',{url:post().legacyUrl,title:'titre'});
  assert.equal(r.ok,false);assert.equal(r.reason,'full_article_body_not_detected');
});
test('une collecte publique ne devine pas les articles manquants',async()=>{
  const c={items:[{type:'post',url:post().legacyUrl,publishedAt:'2026-09-05'}, {type:'video_embed',url:'https://justplayer.fr/supporters/video_embeds/2'}]};
  const r=await collectPublicCatalog(c,{fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},text:async()=>'<h1>Login</h1>'})});
  assert.equal(r.postsChecked,1);assert.equal(r.articles.length,0);assert.equal(r.failures.length,1);assert.equal(r.excluded.length,1);
});
test('rattache les textes des URL Fourthwall à slug à leur publication de catalogue',()=>{
 const url='https://justplayer.fr/supporters/posts/planet-zoo-2-est-disponible-aquariums-volieres-et-reserves-naturelles';
 const cat={items:[{id:'planet-zoo-2-est-disponible-aquariums-volieres-et-reserves-naturelles',
 type:'post',url,title:'Planet Zoo 2',publishedAt:'2026-10-13'}]};
 const record={title:'Planet Zoo 2',body:'Voici le texte original publié avec plusieurs paragraphes et des sources vérifiées.',
 legacyUrl:url,originalPublishedAt:'2026-10-13'};
 const merged=mergeMetadataAndContent(cat,[record]);
 assert.equal(merged.combined.length,1);
 assert.equal(merged.missing.length,0);
 assert.equal(merged.combined[0].legacyUrl,url);
});
