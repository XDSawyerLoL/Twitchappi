'use strict';
// Run AFTER Hostinger has deployed the same checkout:
//   npm run verify:production
// It fails when the live service is an old release, a cached SPA or wrong host.
const {releaseInfo}=require('./swapp-release');
const BASE=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
function baseUrl(raw){
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')throw Error('SWAPP_VERIFY_URL must be an origin');
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(host))throw Error('HTTPS required');
 if(!['swapp.tv','www.swapp.tv','127.0.0.1','localhost'].includes(host))throw Error('Unapproved verification host');
 return url.origin;
}
async function request(origin,pathname){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(origin+pathname,{
   redirect:'follow',cache:'no-store',signal:controller.signal,
   headers:{'Accept':pathname==='/api/release'?'application/json':'*/*','Cache-Control':'no-cache'}
  });
  const body=await response.text();
  if(!response.ok)throw Error(pathname+': HTTP '+response.status+'; '+body.slice(0,100));
  return {response,body};
 }finally{clearTimeout(timeout)}
}
function check(test,reason){
 if(!test)throw Error(reason);
}
// Only cross-check public game hubs that the sitemap actually advertises.
// Strict paths prevent a production check from requesting arbitrary URLs.
function publicGamePaths(xml){
 const found=new Set(),result=[];
 for(const match of String(xml||'').matchAll(/<loc>https:\/\/swapp\.tv\/jeux\/([a-z0-9]+(?:-[a-z0-9]+)*)<\/loc>/g)){
  if(match[1].length>90)continue;
  const path='/jeux/'+match[1];
  if(found.has(path))continue;
  found.add(path);
  result.push(path);
  if(result.length===2)break; // Three extra requests maximum, no paid crawler.
 }
 return result;
}
async function verify(){
 const expected=releaseInfo();
 check(expected.complete,'The local checkout is missing release files: '+expected.missing.join(', '));
 const origin=baseUrl(BASE);
 const {response,body}=await request(origin,'/api/release');
 check((response.headers.get('content-type')||'').includes('application/json'),'/api/release returned HTML instead of JSON');
 let remote;
 try{remote=JSON.parse(body)}catch{throw Error('/api/release returned invalid JSON')}
 check(remote.service==='swapp','Wrong deployment: service identifier mismatch');
 check(remote.complete===true,'Live SWAPP release has missing tracked files');
 check(typeof remote.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(remote.fingerprint),'Release fingerprint invalid');
 check(remote.fingerprint===expected.fingerprint,
  'DEPLOYMENT DRIFT: production='+remote.fingerprint+' checkout='+expected.fingerprint+
  '. Deploy current GitHub version to Hostinger and restart Node. Do not mark the site verified.');
 process.stdout.write('PASS release fingerprint '+remote.fingerprint.slice(0,16)+'\n');
 const ads=await request(origin,'/ads.txt');
 check(ads.body.trim()==='google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0','AdSense ads.txt seller declaration differs');
 check((ads.response.headers.get('content-type')||'').startsWith('text/plain'),'AdSense ads.txt is not served as text/plain');
 process.stdout.write('PASS /ads.txt\n');
 const social=await request(origin,'/communaute');
 check(social.body.includes('class="swapp-social-sticky-stack"'),'SOCIAL HTML does not contain the unified sticky stack');
 check(social.body.includes('id="feed-tabs"'),'SOCIAL feed controls missing');
 check(social.body.includes('social-fixed-10'),'SOCIAL HTML uses an older CSS release');
 check(social.body.includes('social-fixed-js-10'),'SOCIAL HTML uses an older JS release');
 process.stdout.write('PASS /communaute HTML\n');
 const stylesheet=await request(origin,'/assets/swapp-social-native/social-swapp.css');
 check(stylesheet.body.includes('SOCIAL sticky stack v2'),'SOCIAL CSS is stale at the public asset path');
 process.stdout.write('PASS SOCIAL public stylesheet\n');
 // Public retail journey: commercial product navigation with no fake checkout.
 const store=await request(origin,'/boutique');
 for(const marker of ['swapp-store-topline','swapp-store-departments-grid',
   'id="swapp-store-products"','id="swapp-store-search"','id="swapp-store-sort"',
   'data-shop-filter="games"','data-shop-filter="caps"','data-shop-filter="pads"'])
  check(store.body.includes(marker),'Storefront missing shopping control: '+marker);
 check(store.body.includes('data-shop-product')&&store.body.includes('swapp-store-catalogue')&&
  store.body.includes('swapp-store-editorial-picks')&&
  store.body.indexOf('id="swapp-store-products"')<store.body.indexOf('swapp-store-editorial-picks'),
  'Managed products are not displayed before the optional Steam games list');
 check(store.body.includes('swapp-shop.css?v=20261017-stability-store-v14')&&
   store.body.includes('swapp-storefront.js?v=20261016-store-v5'),
   'Storefront still serves old editor-style CSS or missing interactive client');
 const shopStyle=await request(origin,'/assets/swapp-shop.css');
 check(shopStyle.body.includes('.swapp-store-products{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))')&&
   shopStyle.body.includes('.swapp-store-detail-grid{display:grid;grid-template-columns:'),
   'Retail grid and product gallery styles have not deployed');
 const storefront=await request(origin,'/assets/swapp-storefront.js');
 check(storefront.body.includes("data-shop-category-target")&&
  storefront.body.includes("data-shop-image")&&
  storefront.body.includes("shop-result-count"),
  'Storefront search, filters or product gallery are stale');
 const firstProduct=(store.body.match(/href="\/boutique\/produit\/([a-z0-9-]+)"/)||[])[1];
 if(firstProduct){
  const detail=await request(origin,'/boutique/produit/'+firstProduct);
  check(detail.body.includes('swapp-store-detail-grid')&&
   detail.body.includes('swapp-store-detail-gallery')&&
   detail.body.includes('swapp-store-detail-purchase'),
   'Public store product detail route is absent or outdated');
 }
 process.stdout.write('PASS SWAPP storefront catalogue, filters and product detail route\n');
 // Home markup is also inspected by the Boutique editor check below.
 const home=await request(origin,'/');
 const shopAdminScript=await request(origin,'/assets/swapp-shop-admin.js');
 check(shopAdminScript.body.includes("'/api/editor/boutique'")&&
   shopAdminScript.body.includes("options.headers['x-swapp-editor']='1'"),
   'Boutique admin UI asset is missing secure API persistence');
 check(home.body.includes('swapp-editor-nav.js?v=20261016-shop-admin-1'),
  'Homepage still uses the old account menu without Boutique administration');
 process.stdout.write('PASS Boutique showcase, editable catalogue assets and unified admin menu\n');

 const discovery=await request(origin,'/assets/swapp-media-live.js');
 check(discovery.body.includes('/api/discovery/game-lives?limit=6&game='),
  'Article live discovery client is outdated: targeted game lookup missing');
 check(discovery.body.includes("text(button,'Réessayer')")&&discovery.body.includes('requests.delete(key)'),
  'Article live discovery retry/recovery is outdated');
 check(discovery.body.includes('function message(shelf,notice,')&&
   !discovery.body.includes('signal:AbortSignal.timeout(')&&
   discovery.body.includes("message(shelf,'Nouvelle tentative…')"),
   'Live retry or older Safari compatibility fix has not deployed');
 check(discovery.body.includes('swapp-game-connection')&&
  discovery.body.includes('swapp-related-cover')&&
  discovery.body.includes('gameMatch(game,item.game_name||item.category||item.game)'),
  'Game bridge is missing exact-game creator and article presentation');
 const bridgeCss=await request(origin,'/assets/swapp-media.css');
 check(bridgeCss.body.includes('SWAPP GAME BRIDGE V12')&&bridgeCss.body.includes('.swapp-game-connection')&&bridgeCss.body.includes('.swapp-live-article-game'),
  'Game bridge CSS is stale or not served by Hostinger');
 const newsScript=await request(origin,'/assets/swapp-home-news.js');
 check(!newsScript.body.includes('signal:AbortSignal.timeout(')&&
   newsScript.body.includes('new AbortController()')&&
   home.body.includes('swapp-home-news.js?v=20261017-journey-v17'),
   'Homepage editorial script is stale or incompatible with older Safari');
 const readerApp=await request(origin,'/assets/swapp-actus-app.js');
 check(readerApp.body.includes('const sameGame=')&&
  readerApp.body.includes('/live/twitch/')&&
  !readerApp.body.includes('a.length>=7&&b.includes(a)'),
  'Actualité still matches sequels incorrectly or opens external lives');
 check(home.body.includes('/assets/swapp-media.css?v=20261017-channel-news-v13')&&
  home.body.includes('/assets/swapp-actus-app.js?v=20261017-journey-v17'),
  'Homepage is still using the old game bridge');
 // Native creator channel: same editorial game identity, no frozen status text.
 const nativeArticles=await request(origin,'/assets/swapp-live-articles.js');
 check(home.body.includes('/assets/swapp-live-articles.js?v=20261017-channel-news-v13')&&
  nativeArticles.body.includes('const statusLine=')&&
  nativeArticles.body.includes('const gameMatch=')&&
  nativeArticles.body.includes('gameAliases.some')&&
  !nativeArticles.body.includes('a.length>=7&&b.includes(a)'),
  'Native creator page still ships outdated game matching or broken news status');
 process.stdout.write('PASS game-specific article live discovery\n');
 const discover=await request(origin,'/decouvrir');
 check(discover.body.includes('swapp-discover-comfort.js?v=20261017-journey-v17'),
  'Discover has an old mobile UI release');
 check(discover.body.includes('index_script.js?v=20261016-discover-v4-39'),
  'Discover still references an old V4 player script');
 const comfort=await request(origin,'/assets/swapp-discover-comfort.js');
 check(comfort.body.includes('swapp-discover-no-image')&&comfort.body.includes('v4SwipeCard')
  &&comfort.body.includes('lastSavedImage')
  &&comfort.body.includes('grid-column:1/-1!important;grid-row:1!important'),
  'Discover mobile card, saved thumbnails or primary Watch action are outdated');
 const mainScript=await request(origin,'/index_script.js');
 check(mainScript.body.includes('already ranked these lives by mood, relevance and diversity'),
  'Discover V4 unexpectedly overrides API relevance ranking');
 process.stdout.write('PASS Discover mobile layout and relevance ordering\n');
 check(home.body.includes('SWAPP'),'Home returned an unexpected document');
 process.stdout.write('PASS / home\n');
 const news=await request(origin,'/actus');
 check(news.body.includes('SWAPP')||news.body.includes('Swapp'),'Actualité returned an unexpected document');
 // A successful GitHub commit is not proof the final visual layer reached Hostinger.
 const presentation='/assets/swapp-presentation-polish.css?v=20261017-visual-audit-v16';
 check(home.body.includes(presentation),'Home uses an outdated presentation stylesheet');
 check(news.body.includes(presentation),'Actualité uses an outdated presentation stylesheet');
 const finish=await request(origin,'/assets/swapp-presentation-polish.css');
 check(finish.body.includes('--swapp-finish-focus')&&finish.body.includes('.swapp-social-viewport .pulse-post-main')
  &&finish.body.includes('.swapp-editorial-route .article-body')
  &&finish.body.includes('SWAPP EDITORIAL FINISH V15')
  &&finish.body.includes('320px iPhone SE:')
  &&finish.body.includes('Portrait tablets are not small phones')&&finish.body.includes('.swapp-store-editorial-picks')&&finish.body.includes('#swappSocialNative .pulse-post')
  &&finish.body.includes('#home .swappHome1014 .swapp-home-hero-feature::after')
  &&finish.body.includes('.swapp-social-viewport .swapp-social-story-info strong'),
  'Shared presentation finish is stale or incomplete');
 const navScript='/assets/swapp-mobile-nav-follow.js?v=20261016-follow-v2';
 check(home.body.includes(navScript),'Home has outdated mobile navigation behavior');
 check(news.body.includes(navScript),'Actualité has outdated mobile navigation behavior');
 check(finish.body.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important')&&
  finish.body.includes('overflow-x:visible!important')&&
  finish.body.includes('.swapp-mobile-more[open]'),
  'Final mobile navigation layout still clips the Plus menu');
 check(finish.body.includes('iPhone layering fix: shared bottom navigation')&&
  finish.body.includes('z-index:210!important')&&
  finish.body.includes('-webkit-backdrop-filter:none!important'),
  'Safari iPhone menu is still below floating modules or blurred clipping');
 check(finish.body.includes('Mobile account popover: the avatar')&&
  finish.body.includes('header.top .userArea #userMenu.menu.open')&&
  finish.body.includes('z-index:8000!important')&&
  finish.body.includes('background:#111827!important'),
  'Account S popup is not on the foreground above the home hero');
 const navClient=await request(origin,'/assets/swapp-mobile-nav-follow.js');
 check(navClient.body.includes('The Plus menu must not cover the page after tapping outside it')&&
  navClient.body.includes("event.key!=='Escape'"),
  'Mobile navigation close controls are stale');
 process.stdout.write('PASS compact mobile tabs, Plus popup and dismissal behaviors\n');
 process.stdout.write('PASS shared navigation, news and SOCIAL presentation asset\n');
 process.stdout.write('PASS /actus\n');
 // Verify the actual mobile reading and video assets, not just HTML shell CSS.
 const articleClient='/assets/swapp-actus-app.js?v=20261016-ios-journey-1';
 const videoClient='/assets/swapp-video-player.js?v=20261016-ios-journey-1';
 const videoStyle='/assets/swapp-video-gallery.css?v=20261016-ios-journey-1';
 for(const name of [articleClient,videoClient,videoStyle])
  check(home.body.includes(name),'Home has an outdated mobile media asset: '+name);
 const newsClient=await request(origin,'/assets/swapp-actus-app.js');
 check(newsClient.body.includes('new AbortController()')&&newsClient.body.includes('Chargement trop long. Réessayez.')&&
  newsClient.body.includes('swapp-actus-recovery'),
  'Article reader lacks older-iPhone timeout compatibility or retry controls');
 const videoScript=await request(origin,'/assets/swapp-video-player.js');
 check(videoScript.body.includes('previousOverflow')&&videoScript.body.includes("window.addEventListener('popstate',close)")&&
  videoScript.body.includes("e.key!=='Tab'"),
  'Video player lacks focus, scroll-lock restoration or back-navigation cleanup');
 const videoCss=await request(origin,'/assets/swapp-video-gallery.css');
 check(videoCss.body.includes('iPhone cutouts and comfortable controls')&&videoCss.body.includes('safe-area-inset-bottom'),
  'Video player iOS safe-area stylesheet is outdated');
 process.stdout.write('PASS mobile article recovery and iOS video viewer\n');

 // Free, one-shot SEO checks. No scheduling or paid crawlers.
 const robots=await request(origin,'/robots.txt');
 check(robots.body.includes('Sitemap: https://swapp.tv/sitemap.xml'),'Robots sitemap declaration missing');
 check((robots.response.headers.get('content-type')||'').includes('text/plain'),'robots.txt is not plain text');
 const xml=await request(origin,'/sitemap.xml');
 check(xml.body.includes('<urlset')&&xml.body.includes('https://swapp.tv/plan-du-site'),'Sitemap XML missing canonical public sitemap page');
 const advertisedGames=publicGamePaths(xml.body);
 if(advertisedGames.length){
  check(xml.body.includes('<loc>https://swapp.tv/jeux</loc>'),'Indexed game hubs lack the /jeux parent');
  const gameIndex=await request(origin,'/jeux');
  check(gameIndex.body.includes('<h1>Jeux vidéo : actualités et créateurs</h1>'),
   'Game index is stale or does not contain its public editorial heading');
  for(const gamePath of advertisedGames){
   const game=await request(origin,gamePath);
   check(game.body.includes('<link rel="canonical" href="https://swapp.tv'+gamePath+'">'),
    gamePath+': missing canonical URL');
   const editorialCards=(game.body.match(/<a class="card" href="\/actus\/[a-z0-9-]+">/g)||[]).length;
   check(editorialCards>=2,gamePath+': indexed hub lacks two published article links');
  }
  process.stdout.write('PASS verified game index and '+advertisedGames.length+' linked editorial hubs\n');
 }
 const landing=await request(origin,'/plan-du-site');
 check(landing.body.includes('<h1>Plan du site</h1>'),'HTML sitemap route missing');
 check(landing.body.includes('<link rel="canonical" href="https://swapp.tv/plan-du-site">'),'HTML sitemap lacks self-canonical');
 const feed=await request(origin,'/feed.xml');
 check(feed.body.includes('<rss version="2.0">'),'Public editorial RSS unavailable');
 check(home.body.includes('href="/plan-du-site"'),'Homepage source lacks link to HTML sitemap');
 const seoMeta='<link rel="canonical" href="https://swapp.tv/';
 check(home.body.includes(seoMeta),'Homepage canonical unavailable');
 process.stdout.write('PASS robots.txt + sitemap.xml + feed.xml + /plan-du-site + home canonical\n');
 const freshNews=await request(origin,'/news-sitemap.xml');
 check(freshNews.body.includes('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"'),
  'Google News sitemap unavailable');
 const creators=await request(origin,'/creators-sitemap.xml');
 check(creators.body.includes('<urlset'),'Public creator sitemap unavailable');
 const {INDEXNOW_KEY,INDEXNOW_KEY_PATH}=require('../modules/swapp-seo');
 const proof=await request(origin,INDEXNOW_KEY_PATH);
 check(proof.body.trim()===INDEXNOW_KEY,'IndexNow proof key missing or stale');
 check(robots.body.includes('creators-sitemap.xml')&&robots.body.includes('news-sitemap.xml'),
  'robots.txt is missing editorial or creator sitemap declarations');
 process.stdout.write('PASS Google News, creator sitemap and IndexNow verification\n');
 return remote;
}
if(require.main===module){
 verify().catch(error=>{
  process.stderr.write('FAIL SWAPP PRODUCTION CHECK: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={baseUrl,verify,publicGamePaths};
