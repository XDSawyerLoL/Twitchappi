'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const {loadEditorialReleases}=require('../modules/swapp-news/editorial-release-sync');
const {CORE_PATHS,sitemapEntries,registerSeoRoutes}=require('../modules/swapp-seo');
const ARTICLE_SLUG='goty-2017-2025-18-jeux-incontournables-notes-conseils';
const OLD_PATH='/guides/game-awards-2017-2025';
const root=path.resolve(__dirname,'..');
const read=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const article=JSON.parse(read('data/swapp-veille-native-20261112-goty-18-jeux-dossier.json')).articles[0];
test('GOTY dossier is exactly one validated standard ACTUS article in the release manifest',()=>{
 const all=loadEditorialReleases();
 const matches=all.filter(a=>a.slug===ARTICLE_SLUG);
 assert.equal(matches.length,1,'exactly one dossier');
 assert.equal(article.category,'Dossiers');
 assert.equal(article.status,'published');
 assert.equal(article.contentType,'article');
 assert.equal(article.image,null,'do not invent or reuse a copyrighted image');
 assert.ok(article.body.trim().split(/\s+/).length>=5000,'substantial long-form article');
 assert.equal(assertArticle(article,{publish:true}).slug,ARTICLE_SLUG);
 assert.equal(article.sources.length>=3,true);
 assert.ok(Date.parse(article.publishedAt)<=Date.parse('2026-11-12T10:48:00Z'));
});
test('all nine years and eighteen games are included in a single article, with honest GOTY labels',()=>{
 const required=[
  'The Legend of Zelda: Breath of the Wild','Horizon Zero Dawn',
  'God of War (2018)','Red Dead Redemption 2',
  'Sekiro: Shadows Die Twice','Control',
  'The Last of Us Part II','Ghost of Tsushima',
  'It Takes Two','Resident Evil Village',
  'Elden Ring','God of War Ragnarök',
  "Baldur's Gate 3",'The Legend of Zelda: Tears of the Kingdom',
  'Astro Bot','Final Fantasy VII Rebirth',
  'Clair Obscur: Expedition 33','Death Stranding 2: On the Beach'
 ];
 for(const name of required) assert.ok(article.body.includes(name),name);
 for(let y=2017;y<=2025;y++)assert.match(article.body,new RegExp('## '+y+' : '));
 assert.equal((article.body.match(/### .* — \d{2}\/100/g)||[]).length,18);
 assert.equal((article.body.match(/\*\*GOTY officiel\*\*/g)||[]).length,9);
 assert.equal((article.body.match(/\*\*Challenger de notre sélection\*\*/g)||[]).length,9);
 assert.match(article.body,/ne décernent aucune deuxième place officielle/);
});
test('the published page keeps the existing SWAPP immersive article reader and source panel',()=>{
 const html=renderNewsStory(article);
 assert.match(html,/class="swapp-article-reading"/);
 assert.match(html,/class="swapp-native-immersive-hero swapp-immersive-hero"/);
 assert.ok(html.includes('rel="canonical" href="https://swapp.tv/actus/'+ARTICLE_SLUG+'"'));
 assert.match(html,/"@type":"Article"/);
 assert.match(html,/id="swapp-article-sources"/);
 assert.match(html,/thegameawards\.com\/rewind/);
 assert.match(html,/Dans cet article/);
 const toc=html.match(/<nav class="swapp-reader-toc"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.ok(toc.length>250);
 assert.doesNotMatch(toc,/class="subsection"/,'very long dossier should show year-level headings only');
 assert.doesNotMatch(html,/swapp-goty\.css|sg-card|sg-hero/,'no standalone UI survives');
});
test('old GOTY guide URLs redirect to the ACTUS article and are not in the sitemap',()=>{
 assert.ok(!CORE_PATHS.some(x=>x.startsWith(OLD_PATH)));
 const published={slug:ARTICLE_SLUG,status:'published',publishedAt:article.publishedAt};
 const entries=sitemapEntries([published]).map(x=>x.loc);
 assert.ok(entries.includes('https://swapp.tv/actus/'+ARTICLE_SLUG));
 assert.ok(!entries.some(x=>x.includes(OLD_PATH)));
 const handlers=[];
 registerSeoRoutes({get(path,handler){handlers.push({path,handler})}},{getPublished:async()=>[published]});
 const legacy=handlers.find(x=>x.path instanceof RegExp&&x.path.test(OLD_PATH));
 assert.ok(legacy,'redirect route exists');
 assert.ok(legacy.path.test(OLD_PATH+'/sekiro-shadows-die-twice'));
 let redirect;
 legacy.handler({path:OLD_PATH},{redirect(status,destination){redirect={status,destination}}});
 assert.deepEqual(redirect,{status:301,destination:'/actus/'+ARTICLE_SLUG});
});
test('ACTUS provides Dossiers as the existing magazine filter, not as a separate section',()=>{
 const nav=read('assets/swapp-navigation.js'),app=read('assets/swapp-actus-app.js'),seo=read('modules/swapp-seo.js');
 assert.doesNotMatch(nav,/href="\/actus\?tag=DOSSIERS">Dossiers<\/a>/);
 assert.match(app,/id:'DOSSIERS',label:'Dossiers'/);
 assert.match(app,/return 'DOSSIERS'/);
 assert.doesNotMatch(nav,/href="\/guides\/game-awards-2017-2025"/);
 assert.doesNotMatch(seo,/swapp-goty-guides/);
 for(const old of ['modules/swapp-goty-guides.js','modules/swapp-goty-data.js','assets/swapp-goty.css']){
  assert.equal(fs.existsSync(path.join(root,old)),false,old);
 }
});
