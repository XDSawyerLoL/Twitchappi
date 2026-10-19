'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {detectGames,recommend,cleanTags}=require('../modules/swapp-news/content-metadata');
const {renderStudio,js}=require('../modules/swapp-news/editor-ui');
const {renderNewsStory,renderNewsHome}=require('../modules/swapp-news/native-pages');
const {trailers}=require('../modules/swapp-hubs');
const root=path.resolve(__dirname,'..');
const input={
 title:'Nouveau trailer pour GTA 6',
 summary:'Une bande-annonce du jeu Grand Theft Auto VI présentée par Rockstar.',
 body:'Découvrez les nouvelles images officielles de Grand Theft Auto VI.',
 contentType:'trailer',trailerUrl:'https://www.youtube.com/watch?v=VQRLujxTm3c',
 author:'Sansahd',sources:[{url:'https://www.youtube.com/watch?v=VQRLujxTm3c',label:'Trailer officiel'}]
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
 assert.match(html,/SWAPP Studio/);
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

test('video articles without manually uploaded covers get playable YouTube poster and sharing image',()=>{
 const article={...assertArticle(input,{publish:true}),status:'published',publishedAt:'2026-10-15T10:00:00.000Z'};
 const page=renderNewsStory(article);
 const thumbnail='https://i.ytimg.com/vi/VQRLujxTm3c/hqdefault.jpg';
 assert.ok(page.includes('<meta property="og:image" content="'+thumbnail+'">'));
 assert.ok(page.includes('<meta name="twitter:card" content="summary_large_image">'));
 assert.doesNotMatch(page,/swapp-hero-video-links|swapp-trailer-stage/);
 assert.doesNotMatch(page,/swapp-trailer-stage|swapp-trailer-thumb/);
 assert.ok(page.includes('data-swapp-trailer-id="VQRLujxTm3c"'));
 assert.ok(page.includes('https://www.youtube.com/watch?v=VQRLujxTm3c'));
 assert.doesNotMatch(page,/<iframe/);
 const featured=renderNewsHome([article]);
 assert.ok(featured.includes('<img src="'+thumbnail+'"'));
 const listing=renderNewsHome([{...article,slug:'another-video',title:'Une autre vidéo',image:{url:'https://example.org/other.jpg',credit:'Test',rights:'Test'}},article]);
 assert.ok(listing.includes('<img class="story-image" src="'+thumbnail+'"'));
});
test('an uploaded licensed cover takes priority over the official YouTube thumbnail for sharing',()=>{
 const article={...assertArticle({...input,image:{url:'https://example.org/licensed-wow.jpg',credit:'Éditeur',rights:'Autorisé'}},{publish:true}),
 status:'published',publishedAt:'2026-10-15T10:00:00.000Z'};
 const page=renderNewsStory(article);
 assert.match(page,/<meta property="og:image" content="https:\/\/example.org\/licensed-wow.jpg">/);
 assert.doesNotMatch(page,/swapp-hero-video-links|swapp-trailer-stage/);
 assert.match(page,/data-swapp-trailer-id="VQRLujxTm3c"/);
 assert.doesNotMatch(page,/swapp-trailer-stage|swapp-trailer-thumb/);
});
test('an article without a verified video URL never invents a video player',()=>{
 const article={...assertArticle({...input,contentType:'article',trailerUrl:null},{publish:true}),
 status:'published',publishedAt:'2026-10-15T10:00:00.000Z'};
 const page=renderNewsStory(article);
 assert.doesNotMatch(page,/swapp-trailer-stage|swapp-trailer-thumb/);
 assert.doesNotMatch(page,/i\.ytimg\.com/);
});

test('Google-compatible video and article JSON-LD use real publication dates and images',()=>{
 const base=assertArticle({...input,image:{url:'https://example.org/actual-cover.jpg',credit:'Éditeur',rights:'Autorisé'}},{publish:true});
 const publishedAt='2026-10-15T10:00:00.000Z';
 const extract=html=>{
  const match=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(match,'structured data script missing');
  return JSON.parse(match[1]);
 };
 const video=extract(renderNewsStory({...base,status:'published',publishedAt,originalPublishedAt:'2026-10-14T09:00:00.000Z'}));
 assert.equal(video['@type'],'VideoObject');
 assert.equal(video.uploadDate,'2026-10-14T09:00:00.000Z');
 assert.equal(video.thumbnailUrl,'https://example.org/actual-cover.jpg');
 assert.equal(video.publisher.name,'SWAPP');
 assert.ok(video.embedUrl.includes('youtube-nocookie.com'));
 const plain=assertArticle({...input,contentType:'article',trailerUrl:null},{publish:true});
 const article=extract(renderNewsStory({...plain,status:'published',publishedAt,image:{url:'https://example.org/actual-cover.jpg'}}));
 assert.equal(article['@type'],'NewsArticle');
 assert.equal(article.datePublished,publishedAt);
 assert.deepEqual(article.image,['https://example.org/actual-cover.jpg']);
 assert.equal(article.publisher.name,'SWAPP');
});

test('article sharing uses canonical SWAPP URL without a paid SDK or user tracking',()=>{
 const article={...assertArticle(input,{publish:true}),status:'published',publishedAt:'2026-10-15T10:00:00.000Z'};
 const page=renderNewsStory(article);
 const client=fs.readFileSync(path.join(root,'assets/swapp-article-extras.js'),'utf8');
 assert.match(page,/data-swapp-article-share/);
 assert.match(client,/navigator\.share/);
 assert.match(client,/navigator\.clipboard\?\.writeText/);
 assert.match(client,/https:\/\/swapp\.tv\/actus\//);
 assert.match(client,/data-swapp-article-slug/);
 assert.doesNotMatch(client,/google-analytics|gtag\(|trackEvent\(|sendBeacon\(/);
 assert.doesNotThrow(()=>new Function(client));
});

test('vignette distincte survives article validation, protects rights and controls listing/SEO only',()=>{
 const {cardImageSources}=require('../assets/swapp-article-extras');
 const body='Un article consacré au jeu vidéo et à ses mécaniques, avec plusieurs observations utiles.';
 const input={title:'Test des vignettes gaming SWAPP',body,summary:'Un test des visuels du jeu',
  game:'Test de jeu',sources:[{url:'https://example.org/test'}],
  image:{url:'https://example.org/hero.jpg',credit:'Studio',rights:'Licence vérifiée'},
  trailerUrl:'https://www.youtube.com/watch?v=uQuKE0KDgiM'};
 const custom={url:'https://example.org/card.jpg',credit:'Éditeur',rights:'Licence vérifiée',
  alt:'Artwork du jeu',position:'right'};
 const a=assertArticle({...input,thumbnail:custom},{publish:true});
 assert.deepEqual(a.thumbnail,custom);
 assert.equal(a.image.url,'https://example.org/hero.jpg');
 assert.deepEqual(cardImageSources(a),[
  'https://example.org/card.jpg','https://example.org/hero.jpg',
  'https://i.ytimg.com/vi/uQuKE0KDgiM/hqdefault.jpg']);
 const html=renderNewsStory({...a,status:'published',publishedAt:'2026-10-19T00:00:00.000Z'});
 const cards=renderNewsHome([a]);
 assert.match(cards,/src="https:\/\/example.org\/card\.jpg"/);
 assert.match(html,/src="https:\/\/example.org\/hero\.jpg"/);
 assert.match(html,/<meta property="og:image" content="https:\/\/example.org\/card\.jpg"/);
 assert.throws(()=>assertArticle({...input,thumbnail:{url:'http://example.org/a.jpg'}},{publish:true}),/vignette/);
 assert.throws(()=>assertArticle({...input,thumbnail:{url:'https://example.org/card.jpg'}},{publish:true}),/droits vérifiés requis pour la vignette/);
 assert.doesNotThrow(()=>assertArticle({...input,thumbnail:null},{publish:true}));
 const noImage=assertArticle({...input,image:null,thumbnail:null},{publish:true});
 assert.equal(cardImageSources(noImage)[0],'https://i.ytimg.com/vi/uQuKE0KDgiM/hqdefault.jpg');
});
