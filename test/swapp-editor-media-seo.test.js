'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {detectGames,recommend,cleanTags}=require('../modules/swapp-news/content-metadata');
const {renderStudio,js}=require('../modules/swapp-news/editor-ui');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const {trailers}=require('../modules/swapp-hubs');
const root=path.resolve(__dirname,'..');
const input={
 title:'Nouveau trailer pour GTA 6',
 summary:'Une bande-annonce du jeu Grand Theft Auto VI présentée par Rockstar.',
 body:'Découvrez les nouvelles images officielles de Grand Theft Auto VI.',
 contentType:'trailer',trailerUrl:'https://www.youtube.com/watch?v=VQRLujxTm3c',
 author:'Sansahd'
};
test('editor can create posts, videos and trailers without allowing arbitrary iframe HTML',()=>{
 for(const type of ['article','post','video','trailer']){
  const data=assertArticle({...input,contentType:type,body:input.body+' Texte de démonstration supplémentaire.'},{publish:true});
  assert.equal(data.contentType,type);
  assert.equal(data.author,'Sansahd');
 }
 assert.throws(()=>assertArticle({...input,contentType:'iframe',body:'Texte long pour test'}),/Type de publication/);
 assert.throws(()=>assertArticle({...input,trailerUrl:'https://evil.example/embed/abc'}),/YouTube/);
 assert.throws(()=>assertArticle({...input,trailerUrl:null},{publish:true}),/vidéo YouTube/);
});

test('server recognizes precise game names without inferring games from generic language',()=>{
 assert.deepEqual(detectGames('Bande-annonce officielle de GTA 6 et de BioShock'),['BioShock','Grand Theft Auto VI']);
 assert.deepEqual(detectGames('Venez découvrir notre nouveau jeu vidéo de l’année'),[]);
 assert.deepEqual(detectGames('Rapture des spectateurs devant le film'),[]);
 const suggested=recommend({title:'Trailer Solasta 2',body:'Gameplay sur Crimson Desert'});
 assert.deepEqual(suggested.games,['Crimson Desert','Solasta II']);
 assert.ok(suggested.tags.includes('jeu vidéo'));
 assert.ok(cleanTags(['RPG','rpg','fantasy']).length===2);
});

test('SEO metadata and game tags persist through validation and HTML output',()=>{
 const article=assertArticle({...input,tags:['trailer','GTA 6'],seo:{title:'GTA 6 : vidéo officielle',description:'Nouvelle bande-annonce de GTA 6.'}},{publish:true});
 assert.equal(article.game,'Grand Theft Auto VI');
 assert.ok(article.games.includes('Grand Theft Auto VI'));
 assert.ok(article.tags.includes('gta 6'));
 assert.equal(article.seo.title,'GTA 6 : vidéo officielle');
 const html=renderNewsStory({...article,status:'published',publishedAt:'2026-10-15T10:00:00.000Z'});
 assert.match(html,/<meta name="keywords"/);
 assert.match(html,/GTA 6 : vidéo officielle/);
 assert.match(html,/"@type":"VideoObject"/);
 assert.match(html,/youtube-nocookie.com/);
 assert.match(html,/og:description/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});

test('full editor has create edit publish actions and the new SEO / game controls',()=>{
 const html=renderStudio();
 for(const term of ['contentType','seoTitle','seoDescription','tags','games','trailerUrl','ed-detect-games','ed-create','ed-save','ed-publish','ed-unpublish']){
  assert.ok(html.includes('id="'+term+'"'),term);
 }
 assert.match(html,/Rédaction|Studio éditorial/);
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/\/api\/editor\/actus\/suggest/);
 assert.match(js,/games:\$\('games'\)\.value\.split/);
});

test('published video appears in gallery without requiring a manually hosted image',()=>{
 const video={...assertArticle(input,{publish:true}),status:'published',publishedAt:'2026-10-15T10:00:00.000Z'};
 const html=trailers([video]);
 assert.match(html,/Nouveau trailer pour GTA 6/);
 assert.match(html,/youtu\.com|youtube|data-video-youtube/);
 assert.match(html,/https:\/\/i\.ytimg\.com\/vi\/VQRLujxTm3c\/hqdefault\.jpg/);
 assert.match(html,/\/actus\/nouveau-trailer-pour-gta-6/);
 assert.doesNotMatch(html,/<iframe/);
});

test('media persistence is protected by the same existing admin account guard',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.match(server,/ORYON_ADMIN_LOGINS/);
 assert.match(server,/isOryonAdmin/);
 assert.match(server,/app\.use\(createNewsRouter/);
 assert.match(server,/app\.get\('\/bandes-annonces',async/);
 const router=fs.readFileSync(path.join(root,'modules/swapp-news/router.js'),'utf8');
 assert.match(router,/router\.post\('\/api\/editor\/actus',\.\.\.editor/);
 assert.match(router,/router\.patch\('\/api\/editor\/actus\/:slug',\.\.\.editor/);
 assert.match(router,/router\.post\('\/api\/editor\/actus\/:slug\/publish',\.\.\.editor/);
 assert.match(router,/router\.post\('\/api\/editor\/actus\/suggest',\.\.\.editor/);
 const guard=fs.readFileSync(path.join(root,'modules/swapp-news/editor-auth.js'),'utf8');
 assert.match(guard,/editor_csrf_header_required/);
});
