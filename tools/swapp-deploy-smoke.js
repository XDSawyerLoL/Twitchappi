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
 // Public Game Store intentionally contains only the dated Steam France top ten.
 // Protected administration and saved product records must remain untouched.
 const store=await request(origin,'/boutique');
 for(const marker of ['SWAPP / GAME STORE · FRANCE','LES 10 JEUX',
  'DU MOMENT.','16 octobre 2026','swapp-editorial-top-grid',
  'swapp-store-steam-only'])
  check(store.body.includes(marker),'Game Store missing headline or ranking: '+marker);
 check((store.body.match(/class="swapp-editorial-game" aria-label="Rang /g)||[]).length===10,
   'Game Store must contain exactly ten Steam games');
 for(const forbidden of ['swapp-store-departments-grid','id="swapp-store-products"',
   'id="swapp-store-search"','swapp-store-campaign',
   'swapp-store-footer','La Boutique prend forme','Casquettes','Tapis de souris'])
  check(!store.body.includes(forbidden),'Old retail product section reappeared: '+forbidden);
 check(store.body.includes('swapp-editorial-top.css?v=20261017-top10-only-v20')&&
  !store.body.includes('swapp-storefront.js'),
  'Store must serve dedicated ten-game stylesheet with no unused retail client');
 const steamStyle=await request(origin,'/assets/swapp-editorial-top.css');
 check(steamStyle.body.includes('SWAPP GAME STORE V20')&&
   steamStyle.body.includes('.swapp-store-steam-only .swapp-editorial-top-grid'),
   'New Steam-only layout stylesheet has not deployed');
 process.stdout.write('PASS SWAPP Boutique ten Steam games only; catalog drafts remain private to editor\n');
 // Home markup is also inspected by the Boutique editor check below.
 const home=await request(origin,'/');
 // The SEO headline used to flash through the banner during F5.
 check(!home.body.includes('Actualité jeux vidéo, lives et streamers sur SWAPP')&&
  !home.body.includes('SWAPP rassemble des actualités gaming')&&
  !home.body.includes('swappSeoIntro')&&
  home.body.includes('rel="canonical" href="https://swapp.tv/"'),
  'Server SEO splash still appears behind the homepage video');
 const shopAdminScript=await request(origin,'/assets/swapp-shop-admin.js');
 check(shopAdminScript.body.includes("'/api/editor/boutique'")&&
   shopAdminScript.body.includes("options.headers['x-swapp-editor']='1'"),
   'Boutique admin UI asset is missing secure API persistence');
 check(home.body.includes('swapp-editor-nav.js?v=20261016-shop-admin-1'),
  'Homepage still uses the old account menu without Boutique administration');
 process.stdout.write('PASS Boutique showcase, editable catalogue assets and unified admin menu\n');

 const playerPage=await request(origin,'/mes-jeux');
 check(playerPage.body.includes('data-my-games-live')&&playerPage.body.includes('En direct sur tes jeux')&&
  playerPage.body.includes('swapp-my-games-live.js?v=20261019-witcher-twitch-v1'),
  'The SWAPP/Twitch personal live desk is missing or an old page is deployed');
 const nativePlayer=await request(origin,'/assets/swapp-my-games-live.js');
 check(nativePlayer.body.includes('/api/discovery/game-lives?limit=8&game=')&&
  nativePlayer.body.includes("native(item)?'DIRECT SWAPP':'DIRECT TWITCH'")&&
  nativePlayer.body.includes("'/live/twitch/'")&&
  nativePlayer.body.includes("'/communaute?game='"),
  'The SWAPP native-first live client is missing or stale');
 process.stdout.write('PASS personal SWAPP/Twitch live discovery\n');
 const wishlistFix=await request(origin,'/assets/swapp-wishlist-rewards.js');
 check(wishlistFix.body.includes("const hasPublishedHub=$$('[data-swapp-game-card]').some("),
  'Old wishlist JavaScript still throws null.some on /mes-jeux');
 const personalUI=await request(origin,'/assets/swapp-social-interactions.js');
 check(personalUI.body.includes("rooms/personal")&&personalUI.body.includes("rooms/join")&&
  personalUI.body.includes("data-ssi-copy-invite")&&personalUI.body.includes("data-ssi-rotate-invite"),
  'Personal SOCIAL invite and room joining controls are not deployed');
 const socialRelease=await request(origin,'/api/swapp/social/release');
 let personalRelease={};
 try{personalRelease=JSON.parse(socialRelease.body)}catch{}
 check(personalRelease.release==='social-personal-channels-20261019'&&personalRelease.features?.personalInviteChannels===true,
  'Personal invitation channel Node server has not deployed');
 process.stdout.write('PASS wishlist repair and private SOCIAL channel frontend/server\n');
 const accountCss=await request(origin,'/assets/swapp-creator-workspace.css');
 check(home.body.includes('/assets/swapp-creator-workspace.css?v=20261019-creator-workspace-v1')&&
   accountCss.body.includes('.swapp-account-workspace')&&
   accountCss.body.includes('.swapp-dash-columns')&&
   accountCss.body.includes('border-radius:0!important'),
   'Old bubble-like account and creator dashboard still deployed');
 const browserIdentity=await request(origin,'/assets/swapp-game-identity.js');
 check(browserIdentity.body.includes('The Witcher 3: Wild Hunt Remastered')&&
   browserIdentity.body.includes('The Witcher 3: Wild Hunt'),
   'Verified edition-aware game matching is missing');
 const liveAsset=await request(origin,'/assets/swapp-media-live.js');
 check(liveAsset.body.includes('coverage')&&liveAsset.body.includes("requests.delete(normal(game))"),
   'Live search cannot distinguish Twitch outage or retry empty results');
 process.stdout.write('PASS creator workspace and edition-aware live discovery\n');
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
 const mainBundle=await request(origin,'/index_script.js');
 check(mainBundle.body.includes('homeFollowedRail1014')&&
  mainBundle.body.includes('class="homeFollowedSection1014" hidden')&&
  mainBundle.body.includes('section.hidden=false;')&&
  !mainBundle.body.includes('Connecte Twitch pour retrouver tes chaînes suivies.')&&
  mainBundle.body.includes('items.slice(0,8).map(card)')&&
  !mainBundle.body.includes('id="homeLiveMore1014"'),
  'Old multi-row live widget still present in homepage bundle');

 check(!mainBundle.body.includes('window.renderHome = async function renderHomeFinal')&&
  !mainBundle.body.includes('window.renderHome = async function renderHomeRestored')&&
  !mainBundle.body.includes('window.renderHome = async function renderHome1013'),
  'Obsolete home renderer still shipped to production');
 check(!mainBundle.body.includes('<h1>Les bons lives se trouvent ici.</h1>')&&
  mainBundle.body.includes('homeHeroInner1014 swapp-hero-pending')&&
  mainBundle.body.includes('swapp-home-hero-placeholder'),
  'Old transient homepage headline or missing reserved banner from first render');
 const newsScript=await request(origin,'/assets/swapp-home-news.js');
 check(!newsScript.body.includes('signal:AbortSignal.timeout(')&&
   newsScript.body.includes('new AbortController()')&&
   home.body.includes('swapp-home-news.js?v=20261019-witcher-twitch-v1'),
   'Homepage editorial script is stale or incompatible with older Safari');
 const motionPath='/assets/swapp-home-motion.js?v=20261018-followed-session-v27';
 check(home.body.includes(motionPath)&&
   home.body.indexOf(motionPath)<home.body.indexOf('swapp-home-news.js?v=20261019-witcher-twitch-v1'),
   'No cinematic hero helper before the editorial client');
 const motion=await request(origin,'/assets/swapp-home-motion.js');
 check(motion.body.includes('window.SwappHomeMotion')&&
   motion.body.includes('SwappArticleExtras?.trailerId')&&
   motion.body.includes('https://www.youtube-nocookie.com')&&
   motion.body.includes('prefers-reduced-motion: reduce')&&
   motion.body.includes('saveData')&&
   motion.body.includes('swapp-home-motion-playing')&&
   motion.body.includes('swapp-home-motion-loading')&&
   motion.body.includes('delay=setTimeout(begin,0)')&&
   motion.body.includes('start:TRAILER_START_SECONDS')&&
   motion.body.includes('seekTo(TRAILER_START_SECONDS,true)'),
   'Hero trailer validation, quiet playback or fallback has not deployed');
 check(newsScript.body.includes('window.SwappHomeMotion?.attach?.(tile,feature)'),
   'Featured story is not linked to its own trailer');
 check(newsScript.body.includes('swapp-home-feature-bridge')&&
  newsScript.body.includes("action('Lire l’article'")&&
  newsScript.body.includes("action('Voir les lives'")&&
  newsScript.body.includes("action('En discuter'")&&
  newsScript.body.includes('swapp-home-feature-creators')&&
  newsScript.body.includes('data?.success!==true'),
  'V17 home game journey or verified-live identity is missing');
 const readerApp=await request(origin,'/assets/swapp-actus-app.js');
 check(readerApp.body.includes('const sameGame=')&&
  readerApp.body.includes('/live/twitch/')&&
  !readerApp.body.includes('a.length>=7&&b.includes(a)'),
  'Actualité still matches sequels incorrectly or opens external lives');
 check(home.body.includes('/assets/swapp-media.css?v=20261017-channel-news-v13')&&
  home.body.includes('/assets/swapp-actus-app.js?v=20261019-witcher-twitch-v1'),
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
 check(discover.body.includes('swapp-discover-comfort.js?v=20261018-discover-flat-v26'),
  'Discover has an old mobile UI release');
 check(discover.body.includes('index_script.js?v=20261019-creator-workspace-v1'),
  'Discover still references an old V4 player script');
 const comfort=await request(origin,'/assets/swapp-discover-comfort.js');
 check(comfort.body.includes('swapp-discover-no-image')&&comfort.body.includes('v4SwipeCard')&&
  comfort.body.includes('border-radius:0!important')
  &&comfort.body.includes('lastSavedImage')
  &&comfort.body.includes('grid-column:1/-1!important;grid-row:1!important'),
  'Discover mobile card, saved thumbnails or primary Watch action are outdated');
 check(comfort.body.includes('SWAPP V17 DISCOVER')&&
  comfort.body.includes('swapp-mood-saved-toggle')&&
  comfort.body.includes('swapp-mood-reason')&&
  comfort.body.includes("?'Passer'")&&comfort.body.includes("?'Regarder'"),
  'V17 Discover does not provide creator-first mood, real actions and saved-live drawer');
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
 const journey='/assets/swapp-game-journey.css?v=20261018-followed-session-v27';
 check(home.body.includes(journey)&&news.body.includes(journey),
  'V17 cinematic journey is missing from homepage or native articles');
 const journeyStyles=await request(origin,'/assets/swapp-game-journey.css');
 check(journeyStyles.body.includes('SWAPP GAME JOURNEY V17')&&
  journeyStyles.body.includes('SWAPP FULL-BLEED HOME V18')&&
  journeyStyles.body.includes('SWAPP EDGELESS HERO V19')&&
  journeyStyles.body.includes('SWAPP HOME NO-FLASH V21')&&
  journeyStyles.body.includes('SWAPP V22 — cinematic trailer overlay')&&
  journeyStyles.body.includes('SWAPP V26 HOME EDITORIAL FIRST')&&
  journeyStyles.body.includes('.homeFollowedRail1014')&&
  journeyStyles.body.includes('width:max(100cqw,177.778cqh)')&&
  journeyStyles.body.includes('height:max(100cqh,56.25cqw)')&&
  journeyStyles.body.includes('.swapp-home-motion-playing')&&
  journeyStyles.body.includes('.homeHeroCopy1014')&&
  journeyStyles.body.includes('.swapp-hero-pending')&&
  journeyStyles.body.includes('grid-template-columns:minmax(0,1fr)!important')&&
  journeyStyles.body.includes('transform:translateX(-50%)!important')&&
  journeyStyles.body.includes('mask-image:none!important')&&
  journeyStyles.body.includes('visibility:hidden!important')&&
  journeyStyles.body.includes('.swapp-home-motion-loading > img')&&
  !journeyStyles.body.includes('opacity:.88!important')&&
  journeyStyles.body.includes('.swapp-home-creator-name')&&
  journeyStyles.body.includes('width:100dvw!important')&&
  journeyStyles.body.includes('margin-top:-197px!important')&&
  journeyStyles.body.includes('.swapp-home-feature-bridge')&&
  journeyStyles.body.includes('.swapp-game-journey-actions')&&
  journeyStyles.body.includes('prefers-reduced-motion:reduce'),
  'V17 styles are missing game actions or motion accessibility');
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
